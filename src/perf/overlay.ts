import { activeSwitches, bumpDiag, diag, FLAGS, setSink } from "./probe";
import type { ProbeSink } from "./probe";

/**
 * The measurement harness — overlay UI, frame/longtask/renderer sampling,
 * the automated scroll sweep, and the CSS A/B overrides.
 *
 * Dynamically imported from main.tsx only when ?perf=1 is present, so this
 * whole module (and its CSS) is a separate Rollup chunk that a normal
 * visitor never requests.
 *
 * Deliberately plain DOM, not React: the overlay must never enter the
 * app's reconciliation, never trigger an app re-render, and never show up
 * in a React profile of the thing it is measuring. For the same reason the
 * panel carries no backdrop-filter, no blur and no transition — the HUD
 * must not be a term in its own measurement — and its text is rewritten
 * as one string at 4Hz rather than per field per frame.
 *
 * Honest limits, stated here because they bound what the numbers mean:
 *  · The sweep drives scroll with scrollTo() inside rAF. That is exactly
 *    ONE scroll event per frame. Real wheel/trackpad input is coalesced by
 *    the compositor and can dispatch more than one scroll event per frame,
 *    so the sweep UNDERSTATES any cost that scales with event count — the
 *    scroll-handler suspects. That is what Record mode is for: scroll by
 *    hand, capture the same statistics, and compare the two.
 *  · The panel occupies real viewport area, which marginally reduces what
 *    the compositor has to paint. Press "p" to hide it; sampling continues
 *    while hidden, so a hidden pass is the clean one.
 */

/* ── Statistics ────────────────────────────────────────────────────────── */

interface JsSpan {
  calls: number;
  total: number;
  max: number;
}

interface GlCounters {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  samples: number;
}

interface Bucket {
  label: string;
  pass: number;
  /** Every frame time in this bucket, ms. */
  times: number[];
  max: number;
  longTasks: number;
  longTaskMs: number;
  js: Map<string, JsSpan>;
  gl: GlCounters;
}

function newBucket(label: string, pass: number): Bucket {
  return {
    label,
    pass,
    times: [],
    max: 0,
    longTasks: 0,
    longTaskMs: 0,
    js: new Map(),
    gl: { calls: 0, triangles: 0, geometries: 0, textures: 0, samples: 0 },
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

function round(v: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

interface Summary {
  label: string;
  pass: number;
  frames: number;
  fps: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  pctOver16: number;
  pctOver33: number;
  pctOver50: number;
  longTasks: number;
  longTaskMs: number;
  gl: Record<string, number>;
  js: Record<string, { msPerFrame: number; callsPerFrame: number; max: number }>;
}

function summarize(b: Bucket): Summary {
  const n = b.times.length;
  const sorted = [...b.times].sort((x, y) => x - y);
  const total = b.times.reduce((a, v) => a + v, 0);
  const mean = n === 0 ? 0 : total / n;
  const over = (ms: number): number =>
    n === 0 ? 0 : round((b.times.filter((t) => t > ms).length / n) * 100, 1);

  const js: Summary["js"] = {};
  b.js.forEach((span, label) => {
    js[label] = {
      msPerFrame: round(n === 0 ? 0 : span.total / n, 3),
      callsPerFrame: round(n === 0 ? 0 : span.calls / n, 2),
      max: round(span.max, 3),
    };
  });

  const s = b.gl.samples;
  return {
    label: b.label,
    pass: b.pass,
    frames: n,
    fps: round(mean === 0 ? 0 : 1000 / mean, 1),
    mean: round(mean),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(b.max),
    pctOver16: over(16.7),
    pctOver33: over(33.4),
    pctOver50: over(50),
    longTasks: b.longTasks,
    longTaskMs: round(b.longTaskMs),
    gl:
      s === 0
        ? {}
        : {
            drawCalls: Math.round(b.gl.calls / s),
            triangles: Math.round(b.gl.triangles / s),
            geometries: Math.round(b.gl.geometries / s),
            textures: Math.round(b.gl.textures / s),
          },
    js,
  };
}

/* ── State ─────────────────────────────────────────────────────────────── */

/** Rolling window for the on-screen readout (not part of the report). */
const LIVE_FRAMES = 120;
const live = newBucket("live", 0);

/** Buckets being recorded for the report; null = not recording. */
let recording: Bucket[] | null = null;
let current: Bucket | null = null;

const env: Record<string, string | number> = {};
let panelVisible = true;
let sweeping = false;
let lastReport: string | null = null;
/** Segment count of the last completed capture, for the HUD. */
let reportSegments = 0;

function feedJs(label: string, ms: number): void {
  for (const bucket of [live, current]) {
    if (bucket === null) continue;
    const span = bucket.js.get(label);
    if (span === undefined) bucket.js.set(label, { calls: 1, total: ms, max: ms });
    else {
      span.calls += 1;
      span.total += ms;
      if (ms > span.max) span.max = ms;
    }
  }
}

const sink: ProbeSink = {
  js: feedJs,
  gl(calls, triangles, geometries, textures) {
    for (const bucket of [live, current]) {
      if (bucket === null) continue;
      bucket.gl.calls += calls;
      bucket.gl.triangles += triangles;
      bucket.gl.geometries += geometries;
      bucket.gl.textures += textures;
      bucket.gl.samples += 1;
    }
  },
  env(info) {
    Object.assign(env, info);
  },
};

/* ── Sampling ──────────────────────────────────────────────────────────── */

/** Frame-time glyphs for the inline stutter strip. */
function glyph(ms: number): string {
  if (ms <= 16.7) return ".";
  if (ms <= 25) return ":";
  if (ms <= 33.4) return "|";
  if (ms <= 50) return "#";
  return "█";
}

const strip: string[] = [];

/** Frames accumulated into the live window's JS/GL sums since their last
 *  clear. The frame-time array rolls via shift(), so its length pins at
 *  LIVE_FRAMES and cannot be used as the divisor — doing that made the
 *  readout's ms/frame climb forever, because the sums kept accumulating
 *  while the divisor stayed at 120. */
let liveFrames = 0;

function recordFrame(ms: number): void {
  live.times.push(ms);
  if (live.times.length > LIVE_FRAMES) live.times.shift();

  liveFrames += 1;
  if (liveFrames > LIVE_FRAMES) {
    // Roll the window: JS spans, renderer counters and the peak all
    // describe "the last couple of seconds", not "since page load".
    live.js.clear();
    live.gl = { calls: 0, triangles: 0, geometries: 0, textures: 0, samples: 0 };
    live.max = 0;
    liveFrames = 1;
  }
  if (ms > live.max) live.max = ms;

  strip.push(glyph(ms));
  if (strip.length > 60) strip.shift();

  if (current !== null) {
    current.times.push(ms);
    if (ms > current.max) current.max = ms;
  }
}

function observeLongTasks(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        for (const bucket of [live, current]) {
          if (bucket === null) continue;
          bucket.longTasks += 1;
          bucket.longTaskMs += entry.duration;
        }
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    /* longtask unsupported — the rest of the harness still works */
  }
}

/* ── Segments ──────────────────────────────────────────────────────────── */

interface Segment {
  label: string;
  top: number;
  bottom: number;
}

/** Browse pages segment by product track; everything else by tenths. */
function segments(): readonly Segment[] {
  const tracks = [...document.querySelectorAll<HTMLElement>(".browse-seg")];
  if (tracks.length > 0) {
    return tracks.map((el, i) => ({
      label: el.getAttribute("data-product") ?? `track-${String(i + 1)}`,
      top: el.offsetTop,
      bottom: el.offsetTop + el.offsetHeight,
    }));
  }
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const step = max / 10;
  return Array.from({ length: 10 }, (_, i) => ({
    label: `${String(i * 10)}-${String((i + 1) * 10)}%`,
    top: i * step,
    bottom: (i + 1) * step,
  }));
}

function labelFor(y: number, segs: readonly Segment[]): string {
  for (const s of segs) {
    if (y >= s.top && y < s.bottom) return s.label;
  }
  // Outside every track: the browse page has an intro above the first one
  // and a footer below the last. These MUST get their own labels — folding
  // them into the nearest track would blame a product for frames it never
  // rendered (the intro is ~70svh, which is a lot of frames at the top).
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (first !== undefined && y < first.top) return "intro";
  if (last !== undefined && y >= last.bottom) return "tail";
  return "page";
}

/* ── The loop (sampling + sweep in ONE rAF, so bucket switches and frame
      times can never land on different frames) ───────────────────────── */

interface SweepState {
  segs: readonly Segment[];
  pass: number;
  y: number;
  maxY: number;
  /** Frames to idle before the next pass starts measuring. */
  settle: number;
}

let sweep: SweepState | null = null;
let last = 0;

function switchBucket(label: string, pass: number): void {
  if (recording === null) return;
  if (current !== null && current.label === label && current.pass === pass) return;
  if (current !== null && current.times.length > 0) recording.push(current);
  current = newBucket(label, pass);
}

function tick(now: number): void {
  const dt = last === 0 ? 0 : now - last;
  last = now;
  // Skip the first frame and any tab-switch gap, which are not stutter.
  if (dt > 0 && dt < 2000) recordFrame(dt);

  if (sweep !== null) {
    if (sweep.settle > 0) {
      sweep.settle -= 1;
      if (sweep.settle === 0) switchBucket(labelFor(0, sweep.segs), sweep.pass);
    } else {
      sweep.y = Math.min(sweep.maxY, sweep.y + (FLAGS.speed * dt) / 1000);
      window.scrollTo(0, sweep.y);
      switchBucket(labelFor(sweep.y, sweep.segs), sweep.pass);
      if (sweep.y >= sweep.maxY) {
        if (sweep.pass >= FLAGS.passes) {
          finishSweep();
        } else {
          sweep.pass += 1;
          sweep.y = 0;
          sweep.settle = 30;
          window.scrollTo(0, 0);
          // Re-measure at the boundary only: a pass may have changed layout
          // (lazy images decoding, one-shot reveals firing). Deliberately
          // NOT per frame - reading scrollHeight/offsetTop every frame
          // would add the exact forced layout this harness is looking for.
          sweep.segs = segments();
          sweep.maxY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          if (current !== null && current.times.length > 0) recording?.push(current);
          current = null;
        }
      }
    }
  }

  requestAnimationFrame(tick);
}

function startSweep(): void {
  if (sweeping) return;
  sweeping = true;
  recording = [];
  current = null;
  window.scrollTo(0, 0);
  sweep = {
    segs: segments(),
    pass: 1,
    y: 0,
    maxY: Math.max(1, document.documentElement.scrollHeight - window.innerHeight),
    settle: 30,
  };
}

function finishSweep(): void {
  if (current !== null && current.times.length > 0) recording?.push(current);
  current = null;
  sweep = null;
  sweeping = false;
  lastReport = buildReport("sweep");
  reportSegments = recording?.length ?? 0;
  recording = null;
  void copyReport();
}

function startRecord(): void {
  if (sweeping) return;
  recording = [];
  current = newBucket(`manual ${location.hash || "#/"}`, 1);
}

function stopRecord(): void {
  if (recording === null) return;
  if (current !== null && current.times.length > 0) recording.push(current);
  current = null;
  lastReport = buildReport("record");
  reportSegments = recording.length;
  recording = null;
  void copyReport();
}

/* ── Report ────────────────────────────────────────────────────────────── */

function buildReport(mode: "sweep" | "record"): string {
  const buckets = recording ?? [];
  const everything = newBucket("ALL", 0);
  for (const b of buckets) {
    everything.times.push(...b.times);
    everything.max = Math.max(everything.max, b.max);
    everything.longTasks += b.longTasks;
    everything.longTaskMs += b.longTaskMs;
    everything.gl.calls += b.gl.calls;
    everything.gl.triangles += b.gl.triangles;
    everything.gl.geometries += b.gl.geometries;
    everything.gl.textures += b.gl.textures;
    everything.gl.samples += b.gl.samples;
    b.js.forEach((span, label) => {
      const into = everything.js.get(label);
      if (into === undefined) everything.js.set(label, { ...span });
      else {
        into.calls += span.calls;
        into.total += span.total;
        into.max = Math.max(into.max, span.max);
      }
    });
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      mode,
      url: location.href,
      route: location.hash || "#/",
      theme: document.documentElement.dataset["theme"] ?? "light",
      locale: document.documentElement.lang,
      buildMode: import.meta.env.MODE,
      switches: activeSwitches(),
      sweep: mode === "sweep" ? { speedPxPerSec: FLAGS.speed, passes: FLAGS.passes } : null,
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      },
      env: {
        ...env,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGb: nav.deviceMemory ?? "unavailable",
      },
      diag: { ...diag },
      totals: summarize(everything),
      segments: buckets.map(summarize),
    },
    null,
    2,
  );
}

async function copyReport(): Promise<void> {
  if (lastReport === null) return;
  try {
    await navigator.clipboard.writeText(lastReport);
    flash("report copied to clipboard");
  } catch {
    // Clipboard blocked (no gesture / insecure origin): fall back to a
    // console dump the user can right-click → "Copy object" instead.
    console.log("[perf] report (clipboard blocked):\n" + lastReport);
    flash("clipboard blocked — report logged to console");
  }
}

/* ── UI ────────────────────────────────────────────────────────────────── */

let readout: HTMLPreElement | null = null;
let notice: HTMLSpanElement | null = null;

function flash(message: string): void {
  if (notice === null) return;
  notice.textContent = message;
  window.setTimeout(() => {
    if (notice !== null) notice.textContent = "";
  }, 4000);
}

const CSS = `
.perf-hud {
  position: fixed; z-index: 2147483647; bottom: 12px; inset-inline-start: 12px;
  width: 310px; max-height: calc(100vh - 24px); overflow: auto;
  background: #0a0f12; color: #d7e6e2; border: 1px solid #2c4a52;
  border-radius: 8px; padding: 9px 11px;
  font: 11px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  direction: ltr; text-align: left; white-space: pre;
  contain: layout style paint;
}
.perf-hud[hidden] { display: none; }
.perf-hud pre { margin: 0; font: inherit; white-space: pre-wrap; }
.perf-hud-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.perf-hud button {
  flex: 1 1 auto; font: inherit; cursor: pointer; padding: 4px 6px;
  background: #16333c; color: #d7e6e2; border: 1px solid #2c4a52; border-radius: 5px;
}
.perf-hud button:hover { background: #1e4450; }
.perf-hud-note { display: block; margin-top: 6px; color: #7fe3ac; min-height: 1.45em; }
`;

/** A/B overrides. Injected here so the production stylesheet carries none
 *  of this: the switches cost a normal visitor nothing at all. */
function overrideCss(): string {
  let css = "";
  if (FLAGS.nobackdrop) {
    // 11 of the 12 backdrop-filter rules read these two custom properties;
    // .eyebrow is the one literal and needs naming.
    css += `:root, :root[data-theme="dark"] {
      --tile-backdrop: none !important; --panel-backdrop: none !important; }
      .eyebrow { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }\n`;
  }
  if (FLAGS.noblend) {
    css += `:root, :root[data-theme="dark"] { --scan-blend: normal !important; }\n`;
  }
  if (FLAGS.nodom) {
    // visibility, NOT display: the page must keep its height so the scroll
    // track is identical and the sweep stays comparable.
    css += `main, .hud, .site-nav, .hud-brand, .theme-toggle, .lang-toggle {
      visibility: hidden !important; }\n`;
  }
  return css;
}

function render(): void {
  if (readout === null || !panelVisible) return;
  const n = live.times.length;
  const sorted = [...live.times].sort((a, b) => a - b);
  const mean = n === 0 ? 0 : live.times.reduce((a, v) => a + v, 0) / n;
  const s = live.gl.samples;

  const windowFrames = Math.max(1, liveFrames);
  const jsLines = [...live.js.entries()]
    .map(([label, span]) => ({
      label,
      ms: span.total / windowFrames,
      per: span.calls / windowFrames,
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 9)
    .map((x) => `  ${x.label.padEnd(17)}${x.ms.toFixed(3)}ms  x${x.per.toFixed(1)}`)
    .join("\n");

  const switches = activeSwitches();
  const status = sweeping
    ? `SWEEP pass ${String(sweep?.pass ?? 0)}/${String(FLAGS.passes)}  ${String(current?.label ?? "")}`
    : recording !== null
      ? `RECORDING  ${String(recording.length)} seg  ${String(current?.times.length ?? 0)} frames`
      : lastReport !== null
        ? `DONE  ${String(reportSegments)} segments  -  Copy JSON ready`
        : "idle";

  readout.textContent = [
    `PERF  ${location.hash || "#/"}  ${document.documentElement.dataset["theme"] ?? "light"}  ${import.meta.env.MODE}`,
    `${status}`,
    ``,
    `fps ${(mean === 0 ? 0 : 1000 / mean).toFixed(1).padStart(5)}   frame ${mean.toFixed(1)}ms`,
    `p50 ${percentile(sorted, 50).toFixed(1)}  p95 ${percentile(sorted, 95).toFixed(1)}  max ${live.max.toFixed(1)}`,
    `>16.7 ${n === 0 ? "0" : String(Math.round((live.times.filter((t) => t > 16.7).length / n) * 100))}%` +
      `  >33 ${n === 0 ? "0" : String(Math.round((live.times.filter((t) => t > 33.4).length / n) * 100))}%` +
      `  >50 ${n === 0 ? "0" : String(Math.round((live.times.filter((t) => t > 50).length / n) * 100))}%`,
    `longtask ${String(live.longTasks)} (${live.longTaskMs.toFixed(0)}ms) since load`,
    strip.join(""),
    ``,
    `-- renderer (per frame) --`,
    s === 0
      ? `  no canvas`
      : `  calls ${String(Math.round(live.gl.calls / s))}  tris ${String(Math.round(live.gl.triangles / s))}` +
        `\n  geo ${String(Math.round(live.gl.geometries / s))}  tex ${String(Math.round(live.gl.textures / s))}`,
    `  ${String(env["backingStore"] ?? "?")} @ dpr ${String(env["rendererDpr"] ?? "?")} = ${String(env["megapixelsPerFrame"] ?? "?")} Mpx`,
    `  aa=${String(env["contextAntialias"] ?? "?")} shadows=${String(env["shadowMapEnabled"] ?? "?")}`,
    `  ${String(env["gpu"] ?? "gpu: pending")}`.slice(0, 70),
    ``,
    `-- js per frame (top 9) --`,
    jsLines === "" ? "  nothing instrumented yet" : jsLines,
    ``,
    ``,
    `-- diag (blank-canvas watch) --`,
    `  ctx lost/restored ${String(diag.ctxLost)}/${String(diag.ctxRestored)}` +
      `   canvasSwap ${String(diag.canvasSwaps)}`,
    `  frames NOT redrawn ${String(diag.framesSkipped)} (run ${String(diag.longestSkipRun)})`,
    `  long frames ${String(diag.longFrames)} max ${String(diag.maxFrameMs)}ms`,
    `  meshes ${String(diag.meshes)}  suspenseDrops ${String(diag.suspenseDrops)}`,
    `  resize buf/css ${String(diag.bufferResizes)}/${String(diag.cssResizes)}  ${diag.lastBuffer}`,
    `  glb load/clear ${String(diag.glbLoads)}/${String(diag.glbClears)}` +
      `${diag.lastClear === "" ? "" : ` (${diag.lastClear})`}`,
    `  envRegens ${String(diag.envRegens)}`,
    ``,
    `switches: ${switches.length === 0 ? "none (baseline)" : switches.join(", ")}`,
    `[p] hide panel`,
  ].join("\n");
}

function mountUi(): void {
  const style = document.createElement("style");
  style.textContent = CSS + overrideCss();
  document.head.appendChild(style);

  const hud = document.createElement("div");
  hud.className = "perf-hud";

  readout = document.createElement("pre");
  hud.appendChild(readout);

  const row = document.createElement("div");
  row.className = "perf-hud-row";

  const sweepButton = document.createElement("button");
  sweepButton.type = "button";
  sweepButton.textContent = "Sweep";
  sweepButton.addEventListener("click", startSweep);

  const recordButton = document.createElement("button");
  recordButton.type = "button";
  recordButton.textContent = "Record";
  recordButton.addEventListener("click", () => {
    if (sweeping) {
      flash("sweep in progress - wait for it to finish");
      return;
    }
    if (recording === null) {
      startRecord();
      recordButton.textContent = "Stop";
    } else {
      stopRecord();
      recordButton.textContent = "Record";
    }
  });

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy JSON";
  copyButton.addEventListener("click", () => {
    if (lastReport === null) flash("nothing captured yet — Sweep or Record first");
    else void copyReport();
  });

  row.append(sweepButton, recordButton, copyButton);
  hud.appendChild(row);

  notice = document.createElement("span");
  notice.className = "perf-hud-note";
  hud.appendChild(notice);

  document.body.appendChild(hud);

  window.addEventListener("keydown", (e) => {
    if (e.key !== "p" || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    // Never swallow the key while the visitor is typing in a form.
    if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    panelVisible = !panelVisible;
    hud.hidden = !panelVisible;
  });
}

/* ── DOM-side diagnostics ──────────────────────────────────────────────
   The canvas-side counters live in GlProbe; these are the ones only the
   DOM can see — the <canvas> element being replaced, its CSS box being
   resized, and the context lifecycle as the element reports it. */

function observeCanvas(): void {
  const stage = document.querySelector(".stage");
  if (stage === null) {
    // The stage mounts with React; retry until it exists.
    window.setTimeout(observeCanvas, 400);
    return;
  }
  let canvas = stage.querySelector("canvas");
  let cssBox = "";

  // NOTE: the context lifecycle is counted by ContextLossGuard inside the
  // canvas, not here — it is present whether or not this chunk loaded, and
  // counting in both places double-reported every event.
  new MutationObserver(() => {
    const now = stage.querySelector("canvas");
    if (now !== canvas) {
      canvas = now;
      bumpDiag("canvasSwaps");
    }
  }).observe(stage, { childList: true, subtree: true });

  new ResizeObserver((entries) => {
    const e = entries[0];
    if (e === undefined) return;
    const box = `${String(Math.round(e.contentRect.width))}x${String(Math.round(e.contentRect.height))}`;
    if (cssBox !== "" && box !== cssBox) bumpDiag("cssResizes");
    cssBox = box;
  }).observe(stage);
}

/* ── Entry ─────────────────────────────────────────────────────────────── */

let mounted = false;

export function mount(): void {
  if (mounted || !FLAGS.on) return;
  mounted = true;

  setSink(sink);
  observeLongTasks();
  observeCanvas();
  mountUi();
  requestAnimationFrame(tick);
  window.setInterval(render, 250);

  if (FLAGS.sweep) {
    // Let fonts, the first GLB and the idle-deferred terrain build land
    // before measuring, or pass 1 just measures page startup.
    window.setTimeout(startSweep, 2500);
  }
}
