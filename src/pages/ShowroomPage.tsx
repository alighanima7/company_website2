import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX, PointerEvent as ReactPointerEvent } from "react";

import { COPY, productFeatures, PRODUCTS_PAGE, VISIBLE_PRODUCTS } from "../content";
import type { Product } from "../content";
import { useLocale } from "../locale";
import { motionState } from "../motion";
import { setProduct } from "../productState";
import type { ProductId } from "../productState";
import { hrefFor, hrefForProduct, setShowroomProduct, useShowroomProduct } from "../router";
import {
  IDLE_RETURN_AFTER_S,
  MAX_YAW,
  resetShowroomView,
  setShowroomExplode,
  showroomState,
  useModelReady,
  useShowroomExplode,
  useShowroomLabels,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../showroom";
import { clearFmc, preloadFmc } from "../three/FmcDevice";
import type { FmcId } from "../three/FmcDevice";
import { useSceneFailed } from "../three/SceneBoundary";
import { clearSimple, preloadSimple } from "../three/SimpleDevice";
import { clearTracker, preloadTracker } from "../three/Tracker";
import { useTheme } from "../theme";

/**
 * The products SHOWROOM — `#/products` as a single, non-scrolling screen.
 * The dark-or-paper 3D stage IS the design: no cards, no panels, no glass,
 * no borders. Text floats in a reserved zone beside the model, the lineup
 * is a plain-text strip over one hairline at the bottom, and the only
 * decorations are the in-canvas floor ring, the faint index numeral behind
 * the model, and that hairline.
 *
 *  · Selection lives in the URL (`?p=` inside the hash) via replaceState —
 *    shareable, Back-friendly, and the detail pages' way home.
 *  · The stage handles ROTATE (drag) and ZOOM (wheel/pinch) only; product
 *    switching is the strip, arrow keys, wheel over the strip, and a
 *    horizontal flick on the strip or the text zone.
 *  · One GLB in memory at a time; prev/next warm at idle; far entries are
 *    evicted. A theme-aware poster covers every load and stays as the
 *    whole experience when WebGL is unavailable.
 */

/* ── Cross-view handoff (same contract the old browse used) ───────────── */

/** Focus choreography between showroom and detail: who sent the visitor. */
export const showroomHandoff = { toDetail: false, toShowroom: false };

/** Session-scoped: the rotate hint shows once per visit, not per product. */
let hintDismissed = false;

/** Set by the double-tap reset so the very next pointerup does not stamp
 *  lastInteract and cancel the backdated idle clock the reset relies on. */
let suppressNextUpTouch = false;

/* ── Per-product wiring ───────────────────────────────────────────────── */

function isExplodable(id: ProductId): id is FmcId {
  return id === "fmc130" || id === "fmc920" || id === "galileosky";
}

const GLB_PRELOAD: Partial<Record<ProductId, () => void>> = {
  tracker: preloadTracker,
  fmc130: () => {
    preloadFmc("fmc130");
  },
  fmc920: () => {
    preloadFmc("fmc920");
  },
  galileosky: () => {
    preloadFmc("galileosky");
  },
  galileosky10: () => {
    preloadSimple("galileosky10");
  },
  // city / collar are procedural — nothing to fetch.
};

const GLB_CLEAR: Partial<Record<ProductId, () => void>> = {
  tracker: clearTracker,
  fmc130: () => {
    clearFmc("fmc130");
  },
  fmc920: () => {
    clearFmc("fmc920");
  },
  galileosky: () => {
    clearFmc("galileosky");
  },
  galileosky10: () => {
    clearSimple("galileosky10");
  },
};

function posterSrc(id: ProductId, mode: "light" | "dark"): string {
  return `/posters/${id}-${mode}.webp`;
}

/** Gesture tuning — centralized, per the plan's feel-risk note. */
const ROT_PER_PX = 0.0075; // rad of yaw per CSS px of drag
const PITCH_PER_PX = 0.006;
const WHEEL_ZOOM_K = 0.0012;
const FLICK_MAX_MS = 300;
const FLICK_MIN_PX = 60;
const DOUBLE_TAP_MS = 320;

function touchInteract(): void {
  showroomState.lastInteract = performance.now();
}

/** Ease the view home now (double-tap / double-click reset): zero the
 *  velocities and backdate the idle clock so the rig's damped return —
 *  already reduced-motion-aware — takes over on the next frame. */
function resetViewSoon(): void {
  showroomState.yawV = 0;
  showroomState.pitchV = 0;
  showroomState.zoomTarget = 1;
  showroomState.lastInteract = performance.now() - (IDLE_RETURN_AFTER_S + 1) * 1000;
}

export function ShowroomPage(): JSX.Element {
  const l = useLocale();
  const isRTL = l === "ar";
  const mode = useTheme();
  const glFailed = useSceneFailed();
  const modelReady = useModelReady();
  const exploded = useShowroomExplode();
  const partLabels = useShowroomLabels();

  const param = useShowroomProduct();
  const selected: ProductId = param ?? VISIBLE_PRODUCTS[0]?.id ?? "tracker";
  const index = Math.max(
    0,
    VISIBLE_PRODUCTS.findIndex((p) => p.id === selected),
  );
  const product: Product | undefined = VISIBLE_PRODUCTS[index];

  const rootRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hintGone, setHintGone] = useState(hintDismissed);

  /* ── Lifecycle: the no-scroll contract ──────────────────────────────── */
  // body[data-showroom] scopes overflow:hidden, the hidden footer/veil and
  // the stage's touch-action — and MUST come off on any route change,
  // including back/forward and direct loads of other routes. The cleanup
  // runs on unmount, which React guarantees for every one of those paths.
  useEffect(() => {
    document.body.setAttribute("data-showroom", "");
    showroomState.active = true;
    return () => {
      document.body.removeAttribute("data-showroom");
      showroomState.active = false;
      resetShowroomView();
    };
  }, []);

  // Selection → canvas scene + fresh view; the strip keeps the active
  // name in sight on narrow widths.
  useEffect(() => {
    setProduct(selected);
    resetShowroomView();
    showroomState.maxYaw = MAX_YAW[selected] ?? null;
    tabRefs.current[index]?.scrollIntoView({
      behavior: motionState.reduced ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selected, index]);

  // Safe rects for the label projector — published OUTSIDE the frame
  // loop (the projector must never read DOM layout per frame). Refreshed
  // on selection/locale (text zone resizes with copy), resize, and after
  // the text crossfade settles.
  useEffect(() => {
    const publish = (): void => {
      const text = document.querySelector(".sr-text:not(.sr-text-out)");
      const strip = stripRef.current;
      const tr = text?.getBoundingClientRect();
      const sr = strip?.getBoundingClientRect();
      let ceiling = sr !== undefined && sr !== null ? sr.top : window.innerHeight - 70;
      // The hint / explode-toggle row is a control band too — labels stop
      // above whichever element sits highest.
      for (const sel of [".sr-hint", ".sr-explode"]) {
        const el = document.querySelector(sel);
        const r = el?.getBoundingClientRect();
        if (r !== undefined && r.height > 0 && r.top < ceiling) ceiling = r.top;
      }
      showroomState.safe = {
        text: tr !== undefined ? { x: tr.left, y: tr.top, w: tr.width, h: tr.height } : null,
        stripTop: ceiling,
        topInset: 70,
      };
    };
    publish();
    const late = window.setTimeout(publish, 450); // post-crossfade metrics
    // Font swaps change the zone's measured box by a few px — republish
    // once the faces are in so the projector's keep-outs match reality.
    void document.fonts.ready.then(publish);
    window.addEventListener("resize", publish);
    return () => {
      window.clearTimeout(late);
      window.removeEventListener("resize", publish);
      showroomState.safe = null;
    };
  }, [selected, l]);

  // Back from a detail page: hand focus to the active strip tab.
  useEffect(() => {
    if (!showroomHandoff.toShowroom) return;
    showroomHandoff.toShowroom = false;
    tabRefs.current[index]?.focus({ preventScroll: true });
    // Mount-time focus handoff only — not a selection effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving for a detail view may take focus there.
  useEffect(
    () => () => {
      showroomHandoff.toDetail = true;
    },
    [],
  );

  /* ── Switching ──────────────────────────────────────────────────────── */

  const switchTo = useCallback((id: ProductId) => {
    setShowroomProduct(id);
  }, []);

  const step = useCallback(
    (delta: 1 | -1) => {
      const n = VISIBLE_PRODUCTS.length;
      const next = VISIBLE_PRODUCTS[(index + delta + n) % n];
      if (next !== undefined) switchTo(next.id);
    },
    [index, switchTo],
  );

  // Arrow keys, APG tabs pattern, mirrored for RTL: the key pointing
  // toward inline-end advances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // e.target can be window/document (programmatic dispatch, blurred
      // frames) — only Element targets carry tagName/closest.
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target !== null && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const next = isRTL ? e.key === "ArrowLeft" : e.key === "ArrowRight";
      step(next ? 1 : -1);
      e.preventDefault();
      // Keep roving focus on the active tab when the strip owns focus.
      if (target !== null && target.closest(".sr-strip") !== null) {
        window.setTimeout(() => {
          const active = document.querySelector<HTMLButtonElement>(
            '.sr-strip [aria-selected="true"]',
          );
          active?.focus({ preventScroll: true });
        }, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [isRTL, step]);

  // Wheel over the strip pages through the lineup (debounced).
  useEffect(() => {
    const el = stripRef.current;
    if (el === null) return undefined;
    let last = 0;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const now = performance.now();
      if (now - last < 350) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(d) < 8) return;
      last = now;
      step(d > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [step]);

  /* Horizontal flick on the text zone / strip switches product. The strip
     only takes flicks while it has no overflow of its own — once it
     scrolls (narrow widths), panning IS browsing and taps select. */
  const flick = useRef<{ x: number; y: number; t: number } | null>(null);
  const onFlickDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    flick.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, []);
  const onFlickUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>, allowWhileScrollable: boolean) => {
      const start = flick.current;
      flick.current = null;
      if (start === null) return;
      if (!allowWhileScrollable) {
        const el = stripRef.current;
        if (el !== null && el.scrollWidth > el.clientWidth + 1) return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = performance.now() - start.t;
      if (dt > FLICK_MAX_MS || Math.abs(dx) < FLICK_MIN_PX || Math.abs(dx) < Math.abs(dy) * 2) {
        return;
      }
      // Dragging toward inline-start reveals the next item (carousel
      // convention), so in RTL a rightward flick advances.
      step((isRTL ? dx > 0 : dx < 0) ? 1 : -1);
    },
    [isRTL, step],
  );

  /* ── Stage gestures: rotate + zoom only ─────────────────────────────── */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const velocity = useRef({ x: 0, t: 0 });
  const pinchDist = useRef(0);
  const lastTap = useRef(0);

  const onStageDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already lifted (or synthetic) — rotation still works, the
         capture only guards against losing moves outside the layer */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touchInteract();
    if (pointers.current.size === 1) {
      showroomState.dragging = true;
      showroomState.yawV = 0;
      showroomState.pitchV = 0;
      velocity.current = { x: 0, t: performance.now() };
      if (!hintDismissed) {
        hintDismissed = true;
        setHintGone(true);
      }
      // Double-tap (touch) / double-click resets the view.
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        resetViewSoon();
        suppressNextUpTouch = true;
      }
      lastTap.current = now;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a !== undefined && b !== undefined) pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }, []);

  const onStageMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev === undefined) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touchInteract();

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a !== undefined && b !== undefined) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist.current > 0) {
          showroomState.zoomTarget = Math.min(
            ZOOM_MAX,
            Math.max(ZOOM_MIN, showroomState.zoomTarget * (d / pinchDist.current)),
          );
        }
        pinchDist.current = d;
      }
      return;
    }

    showroomState.yaw += dx * ROT_PER_PX;
    showroomState.pitch += dy * PITCH_PER_PX;
    const now = performance.now();
    const dt = Math.max(1, now - velocity.current.t);
    // Exponential smoothing keeps one jittery event from launching the model.
    const instant = ((dx * ROT_PER_PX) / dt) * 1000;
    velocity.current = { x: velocity.current.x * 0.7 + instant * 0.3, t: now };
  }, []);

  const onStageUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      showroomState.dragging = false;
      showroomState.yawV = velocity.current.x;
      if (suppressNextUpTouch) suppressNextUpTouch = false;
      else touchInteract();
    }
    pinchDist.current = 0;
  }, []);

  // Wheel over the stage zooms (non-passive so the page never scrolls —
  // there is nothing to scroll, but Safari still rubber-bands otherwise).
  const gestureRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gestureRef.current;
    if (el === null) return undefined;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      touchInteract();
      showroomState.zoomTarget = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, showroomState.zoomTarget * Math.exp(-e.deltaY * WHEEL_ZOOM_K)),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [glFailed]);

  /* ── Loading: neighbors warm at idle, far entries evicted ───────────── */

  // GLB warm/evict waits for the ACTIVE scene to report ready — on an idle
  // main thread requestIdleCallback fires within ~200ms, which raced the
  // neighbor's multi-megabyte fetch AHEAD of the hero model (measured).
  // "Idle" here therefore means "the model on stage is in"; without WebGL
  // there is nothing to warm at all.
  useEffect(() => {
    if (!modelReady || glFailed) return undefined;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const warm = (): void => {
      const n = VISIBLE_PRODUCTS.length;
      const keep = new Set<ProductId>();
      for (const delta of [0, 1, -1]) {
        const p = VISIBLE_PRODUCTS[(index + delta + n) % n];
        if (p !== undefined) keep.add(p.id);
      }
      for (const p of VISIBLE_PRODUCTS) {
        if (keep.has(p.id)) {
          if (p.id !== selected) GLB_PRELOAD[p.id]?.();
        } else {
          GLB_CLEAR[p.id]?.();
        }
      }
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(warm, { timeout: 2500 });
      return () => {
        w.cancelIdleCallback?.(id);
      };
    }
    const id = window.setTimeout(warm, 800);
    return () => {
      window.clearTimeout(id);
    };
  }, [selected, index, modelReady, glFailed]);

  // Posters are tiny — warm the neighbors and the active product's OTHER
  // theme at idle regardless of WebGL, so switches and the theme toggle
  // never flash.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const warm = (): void => {
      const n = VISIBLE_PRODUCTS.length;
      for (const delta of [1, -1]) {
        const p = VISIBLE_PRODUCTS[(index + delta + n) % n];
        if (p !== undefined) new Image().src = posterSrc(p.id, mode);
      }
      new Image().src = posterSrc(selected, mode === "dark" ? "light" : "dark");
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(warm, { timeout: 1500 });
      return () => {
        w.cancelIdleCallback?.(id);
      };
    }
    const id = window.setTimeout(warm, 600);
    return () => {
      window.clearTimeout(id);
    };
  }, [selected, index, mode]);

  /* ── Text crossfade: keep the outgoing copy for one beat ────────────── */

  const [prevShown, setPrevShown] = useState<ProductId | null>(null);
  const lastSelected = useRef(selected);
  useEffect(() => {
    if (lastSelected.current === selected) return;
    const leaving = lastSelected.current;
    lastSelected.current = selected;
    if (motionState.reduced) return;
    setPrevShown(leaving);
    const t = window.setTimeout(() => {
      setPrevShown(null);
    }, 380);
    return () => {
      window.clearTimeout(t);
    };
  }, [selected]);

  if (product === undefined) return <div className="page" />;

  const total = VISIBLE_PRODUCTS.length;
  const num = (i: number): string => String(i + 1).padStart(2, "0");

  const textZone = (p: Product, i: number, leaving: boolean): JSX.Element => (
    <section
      key={p.id}
      className={`sr-text${leaving ? " sr-text-out" : " sr-text-in"}`}
      role="tabpanel"
      id="sr-panel"
      aria-labelledby={`sr-tab-${p.id}`}
      onPointerDown={onFlickDown}
      onPointerUp={(e) => {
        onFlickUp(e, true);
      }}
    >
      <p className="sr-index mono" dir="ltr">
        {num(i)} / {num(total - 1)}
      </p>
      <h1 className="sr-name">{p.name[l]}</h1>
      <p className="sr-tag mono" dir="ltr">
        {p.tag}
      </p>
      <ul className="sr-features">
        {productFeatures(p).map((f) => (
          <li key={f.en}>
            <span className="sr-feature-text">{f[l]}</span>
          </li>
        ))}
      </ul>
      <div className="sr-ctas">
        <a className="sr-link sr-link-primary" href={hrefForProduct(p.id)}>
          {PRODUCTS_PAGE.detailsCta[l]}{" "}
          <span aria-hidden="true">{isRTL ? "←" : "→"}</span>
        </a>
        <a className="sr-link" href={`${hrefFor("requests")}?product=${p.id}`}>
          {COPY.showroom.quoteCta[l]}
        </a>
      </div>
    </section>
  );

  return (
    <div className="page page-products sr-root" ref={rootRef}>
      {/* Huge faint index numeral — behind the MODEL side only. */}
      <div className="sr-numeral mono" aria-hidden="true" dir="ltr">
        {num(index)}
      </div>

      {/* Poster: covers every load, stays forever if WebGL is gone. */}
      <img
        className="sr-poster"
        src={posterSrc(selected, mode)}
        alt=""
        width={1200}
        height={900}
        decoding="async"
        fetchPriority="high"
        data-ready={modelReady && !glFailed ? "" : undefined}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
        onLoad={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "";
        }}
      />

      {/* Stage gesture surface: rotate + zoom only, over the model half. */}
      {!glFailed && (
        <div
          ref={gestureRef}
          className="sr-gesture"
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={onStageUp}
          onPointerCancel={onStageUp}
          aria-hidden="true"
        />
      )}

      {!glFailed && !hintGone && <p className="sr-hint">{COPY.showroom.rotateHint[l]}</p>}

      {!glFailed && isExplodable(selected) && (
        <button
          type="button"
          className="sr-link sr-explode"
          aria-pressed={exploded}
          onClick={() => {
            setShowroomExplode(!exploded);
            touchInteract();
          }}
        >
          {exploded ? COPY.showroom.assemble[l] : COPY.showroom.explode[l]}
        </button>
      )}

      {/* Text zone — the outgoing product's copy fades under the incoming. */}
      {prevShown !== null &&
        prevShown !== selected &&
        (() => {
          const pi = VISIBLE_PRODUCTS.findIndex((p) => p.id === prevShown);
          const pp = VISIBLE_PRODUCTS[pi];
          return pp === undefined ? null : textZone(pp, pi, true);
        })()}
      {textZone(product, index, false)}

      {/* Exploded-part labels — dot + thin leader + plain text, placed
          per frame by the rig's projector (ShowroomRig). Content changes
          only with the product; everything spatial is imperative. */}
      {partLabels.map((L) => (
        <div
          key={L.id}
          className="srx"
          aria-hidden="true"
          ref={(el) => {
            L.els.root = el;
          }}
        >
          <span
            className="srx-line"
            ref={(el) => {
              L.els.line = el;
            }}
          />
          <span className="srx-dot" />
          <span
            className="srx-text"
            dir={isRTL ? "rtl" : "ltr"}
            ref={(el) => {
              L.els.text = el;
            }}
          >
            <span className="srx-tag mono" dir="ltr">
              {L.tag}
            </span>
            <span className="srx-desc">{L.desc[l]}</span>
          </span>
        </div>
      ))}

      {/* Switch announcement for screen readers. */}
      <span className="sr-only" aria-live="polite">
        {product.name[l]}
      </span>

      {/* Bottom strip: the lineup as plain text over one hairline. */}
      <div
        className="sr-strip"
        role="tablist"
        aria-label={COPY.showroom.stripLabel[l]}
        ref={stripRef}
        onPointerDown={onFlickDown}
        onPointerUp={(e) => {
          onFlickUp(e, false);
        }}
      >
        {VISIBLE_PRODUCTS.map((p, i) => (
          <button
            key={p.id}
            id={`sr-tab-${p.id}`}
            type="button"
            role="tab"
            aria-selected={p.id === selected}
            aria-controls="sr-panel"
            tabIndex={p.id === selected ? 0 : -1}
            className={`sr-tab${p.id === selected ? " is-active" : ""}`}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            onClick={() => {
              switchTo(p.id);
            }}
          >
            {p.name[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
