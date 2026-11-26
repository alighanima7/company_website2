/**
 * Opt-in performance harness — flags, the measurement sink, and the timing
 * wrappers. This is the ONLY harness module that ships in the main bundle;
 * everything with weight (the overlay UI, the ring buffers, the scroll
 * sweep, the CSS overrides) lives in `./overlay`, which is dynamically
 * imported from main.tsx and therefore never fetched by a normal visitor.
 *
 * Cost when off, by construction:
 *  · startup — one `String.includes` on location.search; the
 *    URLSearchParams parse happens only if "perf" is actually present.
 *  · hot paths — `timedFrame`/`timedCall` return the SAME function object
 *    they were handed, so instrumented useFrame bodies and scroll handlers
 *    run completely unwrapped. No closure, no timestamp, no branch inside
 *    the loop.
 *  · switches — each A/B flag is read as one boolean property off a frozen
 *    all-false object, at the same places the real values are read anyway.
 *
 * NOTE ON URLS: the app is a HASH router, so the query string must come
 * BEFORE the hash — `/?perf=1&nofx=1#/products`, never `/#/products?perf=1`.
 */

/* ── Flags ─────────────────────────────────────────────────────────────── */

export interface PerfFlags {
  /** Master gate: every other field is false/default unless this is true. */
  readonly on: boolean;
  /** Run the automated top-to-bottom scroll sweep on load. */
  readonly sweep: boolean;
  /** Sweep speed, CSS px per second. */
  readonly speed: number;
  /** How many sweep passes to average over. */
  readonly passes: number;

  /* A/B switches — each isolates one audited suspect. */
  /** Drop the 3D canvas entirely: does the DOCUMENT scroll smoothly? */
  readonly nocanvas: boolean;
  /** Hide the page DOM and the HUD: does the CANVAS alone run smoothly? */
  readonly nodom: boolean;
  /** Drop the post stack (EffectComposer: 4x MSAA, half-float, bloom). */
  readonly nofx: boolean;
  /** antialias: false on the WebGL context. */
  readonly noaa: boolean;
  /** Pin the render resolution to 1x regardless of the display. */
  readonly dpr1: boolean;
  /** frameloop="demand" instead of the default "always". */
  readonly demand: boolean;
  /** Neutralize every backdrop-filter to `none`. */
  readonly nobackdrop: boolean;
  /** Force the full-viewport scanline layer to `mix-blend-mode: normal`. */
  readonly noblend: boolean;
  /** Turn shadow casting off (the light theme's per-frame shadow map). */
  readonly noshadows: boolean;
  /** scene.fog = null — isolates transparent overdraw. */
  readonly nofog: boolean;
  /** Suppress the drei <Html> portals (per-frame DOM transform writes). */
  readonly nohtml: boolean;
  /** Attach no scroll driver; the scenes hold a static pose. */
  readonly noscroll: boolean;
  /** Skip the per-frame back-face colour writes. */
  readonly nodim: boolean;
  /** Leave the logo materials opaque instead of forcing transparency. */
  readonly opaque: boolean;
}

const OFF: PerfFlags = Object.freeze({
  on: false,
  sweep: false,
  speed: 1200,
  passes: 3,
  nocanvas: false,
  nodom: false,
  nofx: false,
  noaa: false,
  dpr1: false,
  demand: false,
  nobackdrop: false,
  noblend: false,
  noshadows: false,
  nofog: false,
  nohtml: false,
  noscroll: false,
  nodim: false,
  opaque: false,
});

function parse(): PerfFlags {
  if (typeof window === "undefined") return OFF;
  // Cheap guard first: a normal visitor pays one substring scan and stops.
  if (!window.location.search.includes("perf")) return OFF;

  const q = new URLSearchParams(window.location.search);
  if (!q.has("perf")) return OFF;

  /** Present and not explicitly "0". `?nofx` and `?nofx=1` both count. */
  const on = (key: string): boolean => {
    const v = q.get(key);
    return v !== null && v !== "0" && v !== "false";
  };
  const num = (key: string, fallback: number): number => {
    const v = Number(q.get(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };

  return Object.freeze({
    on: true,
    sweep: on("sweep"),
    speed: num("speed", 1200),
    passes: Math.min(10, Math.round(num("passes", 3))),
    nocanvas: on("nocanvas"),
    nodom: on("nodom"),
    nofx: on("nofx"),
    noaa: on("noaa"),
    dpr1: q.get("dpr") === "1",
    demand: q.get("frameloop") === "demand",
    nobackdrop: on("nobackdrop"),
    noblend: on("noblend"),
    noshadows: on("noshadows"),
    nofog: on("nofog"),
    nohtml: on("nohtml"),
    noscroll: on("noscroll"),
    nodim: on("nodim"),
    opaque: on("opaque"),
  });
}

export const FLAGS: PerfFlags = parse();

/** Master gate. Hoisted to its own const so hot paths read a plain boolean. */
export const PERF: boolean = FLAGS.on;

/* ── Diagnostics counters ──────────────────────────────────────────────
   The blank-canvas investigation's instrumentation, kept in the app so it
   can be read on a real phone through the ?perf=1 overlay. Plain mutable
   counters: writers guard every call with `if (PERF)`, so a normal
   visitor pays nothing, and the overlay just reads the object. */

export interface Diag {
  /** WebGL context lifecycle (a GPU-process restart shows up here). */
  ctxLost: number;
  ctxRestored: number;
  /** The <canvas> element itself being replaced (React remount). */
  canvasSwaps: number;
  /** Drawing-buffer and CSS-box resizes — the iOS toolbar used to drive
   *  a stream of these, each one reallocating every render target. */
  bufferResizes: number;
  cssResizes: number;
  lastBuffer: string;
  /** rAF ticks where three did NOT draw. A canvas with
   *  preserveDrawingBuffer:false that the compositor presents on such a
   *  tick is exactly what a periodic "blank" looks like. */
  framesSkipped: number;
  longestSkipRun: number;
  longFrames: number;
  maxFrameMs: number;
  /** Solid meshes currently in the scene — 0 means the Suspense fallback
   *  is showing (a GLB cache eviction or a re-suspend). */
  meshes: number;
  suspenseDrops: number;
  /** GLB loader-cache traffic: a clear of the ACTIVE model is a bug. */
  glbLoads: number;
  glbClears: number;
  lastClear: string;
  /** IBL regenerated after a context restore. */
  envRegens: number;
  /** Poster <-> live-model crossfades on the showroom. */
  posterToggles: number;
}

export const diag: Diag = {
  ctxLost: 0,
  ctxRestored: 0,
  canvasSwaps: 0,
  bufferResizes: 0,
  cssResizes: 0,
  lastBuffer: "",
  framesSkipped: 0,
  longestSkipRun: 0,
  longFrames: 0,
  maxFrameMs: 0,
  meshes: 0,
  suspenseDrops: 0,
  glbLoads: 0,
  glbClears: 0,
  lastClear: "",
  envRegens: 0,
  posterToggles: 0,
};

/** Count one diagnostic event. No-op unless the harness is on. */
export function bumpDiag<K extends keyof Diag>(key: K, by = 1): void {
  if (!PERF) return;
  const v = diag[key];
  if (typeof v === "number") (diag[key] as number) = v + by;
}

/** Record a diagnostic string (last GLB cleared, last buffer size). */
export function noteDiag(key: "lastBuffer" | "lastClear", value: string): void {
  if (!PERF) return;
  diag[key] = value;
}

/* ── Sink ──────────────────────────────────────────────────────────────── */

/** What the overlay installs to receive measurements. */
export interface ProbeSink {
  /** A timed JS span, keyed by label (scroll handler / useFrame body). */
  js(label: string, ms: number): void;
  /** Last frame's renderer counters, read once per frame. */
  gl(calls: number, triangles: number, geometries: number, textures: number): void;
  /** One-shot environment report from inside the canvas. */
  env(info: Readonly<Record<string, string | number>>): void;
}

let sink: ProbeSink | null = null;

export function setSink(next: ProbeSink | null): void {
  sink = next;
}

/* ── Timing wrappers ───────────────────────────────────────────────────── */

/**
 * Wrap a useFrame callback for per-frame JS attribution. When the harness
 * is off this returns `fn` ITSELF — the instrumented scenes are then
 * byte-for-byte as hot as before.
 *
 * Generic over the state type so this module stays free of any
 * @react-three/fiber import.
 */
export function timedFrame<S>(
  label: string,
  fn: (state: S, dt: number) => void,
): (state: S, dt: number) => void {
  if (!PERF) return fn;
  return (state, dt) => {
    const t0 = performance.now();
    fn(state, dt);
    sink?.js(label, performance.now() - t0);
  };
}

/** Same contract for a plain zero-argument handler (the scroll listeners). */
export function timedCall(label: string, fn: () => void): () => void {
  if (!PERF) return fn;
  return () => {
    const t0 = performance.now();
    fn();
    sink?.js(label, performance.now() - t0);
  };
}

/** Report the renderer's per-frame counters (called only from GlProbe). */
export function reportGl(
  calls: number,
  triangles: number,
  geometries: number,
  textures: number,
): void {
  sink?.gl(calls, triangles, geometries, textures);
}

/** Report the GPU/context environment once (called only from GlProbe). */
export function reportEnv(info: Readonly<Record<string, string | number>>): void {
  sink?.env(info);
}

/** Which switches are active — for the pasted report's header. */
export function activeSwitches(): readonly string[] {
  if (!PERF) return [];
  const skip = new Set(["on", "sweep", "speed", "passes"]);
  return Object.entries(FLAGS)
    .filter(([key, value]) => !skip.has(key) && value === true)
    .map(([key]) => key);
}
