import { clamp01, dampK, motionState, phase } from "./motion";
import { viewport } from "./responsive";

/**
 * Products-route scroll progress — the exploded-view's one input.
 *
 * Same route-scoped contract as homeScroll (deliberately NOT a global
 * scroll system): ProductsPage attaches the listener only while an FMC
 * product is active and detaches on switch/unmount, and the only consumer
 * (FmcDevice) is mounted for exactly those products — every other page
 * stays a plain document with zero scroll coupling.
 *
 *  · `target` is the raw progress (0..1) across the explode track (the
 *    page top → the moment the runway's bottom reaches the viewport
 *    bottom). 0 = assembled, 1 = fully exploded.
 *  · `current` is the frame-damped copy the 3D side reads; FmcDevice
 *    damps it once per frame with the shared dt-normalized convergence
 *    law, so scrolling back re-assembles along the exact same curve.
 *  · Reduced motion never reaches here — the page renders no runway and
 *    attaches no listener; the scene pins itself to the assembled pose.
 */

/** Explode-track travel: the runway section's height in svh (the sticky
 *  stage adds one more viewport on top). More svh = a slower, more
 *  cinematic scrub per scroll tick; less = snappier. Tune it here —
 *  ProductsPage sizes the runway from this single constant. */
export const RUNWAY_SVH = 300;

/**
 * Browse-mode track height per product, in svh. Each browse segment is a
 * track this tall with a sticky stage inside it, so the card stays put
 * while the model animates across `track − 100svh` of scroll.
 *
 * TUNE HERE. Total page length is intro(70) + Σ tracks + footer(~18):
 * the values below give 1198svh ≈ 12 viewports. Shorter tracks scrub
 * faster; anything under ~140 leaves too little travel for a teardown to
 * read. Products not listed fall back to BROWSE_TRACK_DEFAULT_SVH.
 */
export const BROWSE_TRACK_SVH: Readonly<Record<string, number>> = {
  tracker: 170,
  city: 190,
  fmc130: 200,
  fmc920: 200,
  galileosky: 200,
  galileosky10: 150,
};
export const BROWSE_TRACK_DEFAULT_SVH = 180;

/** Browse peaks at a fraction of the full animation: detail mode stays
 *  the only place the teardown opens all the way, so the two modes don't
 *  read as the same effect twice. */
export const BROWSE_PEAK = 0.7;

/** Fraction of a segment after which the NEXT product's assets are warmed,
 *  so the swap at the segment boundary doesn't stall on a decode. */
export const BROWSE_WARM_AT = 0.6;

/**
 * The scrub every mounted showcase reads.
 *
 *  · `target` / `current` — raw progress and its frame-damped copy.
 *  · `driven` — whether a scroll driver is currently attached. Scenes that
 *    also have a clock-based idle (tracker, city, galileosky10) use it to
 *    decide which they are on: scroll-driven inside a browse track, their
 *    own clock in detail mode, where those products have no runway.
 */
export const productScroll = { target: 0, current: 0, driven: false };

/**
 * Browse curve: 0 at the track's start, 1 at its middle, 0 again at its
 * end. The model is therefore ASSEMBLED whenever a segment boundary — and
 * so the scene swap — happens, and the whole thing is a pure function of
 * scroll position, so it reverses exactly.
 */
export function browseCurve(p: number): number {
  return phase(p, 0.12, 0.5) * (1 - phase(p, 0.5, 0.88));
}

const DAMP_BASE_POINTER = 0.0001; // remaining fraction after exactly 1s
const DAMP_BASE_TOUCH = 0.000001;

/** Damp `current` toward `target`; called once per frame by the mounted
 *  FMC showcase (dt is clamped inside dampK, so a tab-switch hitch
 *  converges over a few frames instead of teleporting). */
export function dampProductScroll(dt: number): number {
  if (motionState.reduced) {
    productScroll.current = productScroll.target;
    return productScroll.current;
  }
  const k = dampK(viewport.coarse ? DAMP_BASE_TOUCH : DAMP_BASE_POINTER, dt);
  productScroll.current += (productScroll.target - productScroll.current) * k;
  return productScroll.current;
}

/**
 * Start tracking: progress runs 0→1 from the document top to the moment
 * `trackEl`'s bottom edge reaches the viewport bottom (the products page
 * root, whose runway section sizes the travel). Returns the detach
 * function; detaching also resets the state so no explode value leaks
 * into other products or a later visit.
 */
export function attachProductScroll(
  trackEl: HTMLElement,
  onUpdate?: (t: number) => void,
): () => void {
  const onScroll = (): void => {
    const end = Math.max(1, trackEl.offsetTop + trackEl.offsetHeight - window.innerHeight);
    productScroll.target = clamp01(window.scrollY / end);
    onUpdate?.(productScroll.target);
  };
  onScroll();
  // A restored scroll position (reload mid-track) starts the teardown ON
  // its beat instead of flying there from zero.
  productScroll.current = productScroll.target;
  productScroll.driven = true;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    productScroll.target = 0;
    productScroll.current = 0;
    productScroll.driven = false;
  };
}

/**
 * Browse-mode driver: the same scrub store, fed per SEGMENT instead of
 * per page.
 *
 * Progress runs 0→1 across one track's pinned travel — 0 the moment the
 * track's top reaches the viewport top (card in place, model assembled),
 * 1 when its bottom reaches the viewport bottom — then `browseCurve`
 * turns that into the out-and-back the scenes actually play. Over exactly
 * that span the viewport midline sits inside the same track, so this
 * agrees with ProductsBrowse's IntersectionObserver by construction and
 * the two can never disagree about which product is live.
 *
 * `onSegment` reports (id, p) so the page can warm the next product's
 * assets partway through. Reduced motion never attaches this at all.
 */
export function attachBrowseScroll(
  root: HTMLElement,
  onSegment?: (id: string, p: number) => void,
): () => void {
  const onScroll = (): void => {
    const segments = root.querySelectorAll<HTMLElement>(".browse-seg");
    const y = window.scrollY;
    const mid = y + window.innerHeight / 2;
    let live: HTMLElement | null = null;
    for (const el of segments) {
      if (mid >= el.offsetTop && mid < el.offsetTop + el.offsetHeight) {
        live = el;
        break;
      }
    }
    if (live === null) {
      // Between the intro and the first track, or past the last one.
      productScroll.target = 0;
      return;
    }
    const travel = Math.max(1, live.offsetHeight - window.innerHeight);
    const p = clamp01((y - live.offsetTop) / travel);
    productScroll.target = BROWSE_PEAK * browseCurve(p);
    const id = live.getAttribute("data-product");
    if (id !== null) onSegment?.(id, p);
  };

  onScroll();
  productScroll.current = productScroll.target;
  productScroll.driven = true;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    productScroll.target = 0;
    productScroll.current = 0;
    productScroll.driven = false;
  };
}
