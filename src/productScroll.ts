import { clamp01, dampK, motionState } from "./motion";
import { FLAGS, timedCall } from "./perf/probe";
import { viewport } from "./responsive";

/**
 * Products DETAIL-route scroll progress — the exploded-view's one input.
 *
 * Same route-scoped contract as homeScroll (deliberately NOT a global
 * scroll system): ProductDetail attaches the listener only while an FMC
 * product's detail view is open and detaches on switch/unmount, and the
 * only consumer (FmcDevice) is mounted for exactly those products — every
 * other page stays a plain document with zero scroll coupling. The
 * showroom (`#/products`) does not scroll at all and never attaches this.
 *
 *  · `target` is the raw progress (0..1) across the explode track (the
 *    page top → the moment the runway's bottom reaches the viewport
 *    bottom). 0 = assembled, 1 = fully exploded.
 *  · `current` is the frame-damped copy the 3D side reads; FmcDevice
 *    damps it once per frame with the shared dt-normalized convergence
 *    law, so scrolling back re-assembles along the exact same curve.
 *  · Reduced motion never reaches here — the page renders no runway and
 *    attaches no listener; the scene pins itself to the assembled pose.
 *  · `driven` — whether the detail scroll driver is attached. FmcDevice
 *    uses it to damp its idle float while the teardown is scrubbed.
 */

/** Explode-track travel: the runway section's height in svh (the sticky
 *  stage adds one more viewport on top). More svh = a slower, more
 *  cinematic scrub per scroll tick; less = snappier. Tune it here —
 *  ProductsPage sizes the runway from this single constant. */
export const RUNWAY_SVH = 300;

/** The scrub the mounted FMC showcase reads. */
export const productScroll = { target: 0, current: 0, driven: false };

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
  const onScroll = timedCall("scroll:detail", (): void => {
    const end = Math.max(1, trackEl.offsetTop + trackEl.offsetHeight - window.innerHeight);
    productScroll.target = clamp01(window.scrollY / end);
    onUpdate?.(productScroll.target);
  });
  onScroll();
  // A restored scroll position (reload mid-track) starts the teardown ON
  // its beat instead of flying there from zero.
  productScroll.current = productScroll.target;
  productScroll.driven = true;
  // ?noscroll=1 - bind no listener, but leave `driven` set, so the scene
  // stays on exactly the branch it normally takes and only the per-event
  // handler cost disappears.
  if (FLAGS.noscroll) {
    return () => {
      productScroll.target = 0;
      productScroll.current = 0;
      productScroll.driven = false;
    };
  }
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
