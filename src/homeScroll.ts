import { clamp01, dampK, motionState } from "./motion";
import { viewport } from "./responsive";

/**
 * Home-route scroll progress — the Z-axis depth film's one input.
 *
 * Deliberately NOT a global scroll system: HomePage attaches the listener
 * on mount and detaches on unmount, and the only consumers (Logo3D,
 * KsaMap3D, the camera rig's home branch) are mounted on the home route
 * alone — the other pages stay plain documents with zero scroll coupling.
 *
 *  · `target` is the raw progress (0..1) across the home depth track
 *    (document top → bottom edge of the map section).
 *  · `current` is the frame-damped copy the 3D side reads; the rig damps
 *    it once per frame with the same dt-normalized convergence law the
 *    old scroll film used (touch gets the tighter constant — the OS
 *    momentum curve has already smoothed the signal there).
 *  · Reduced motion maps scroll directly: current = target, no easing —
 *    the acts still respond to the user's own scrolling, but nothing
 *    glides on its own.
 */

export const homeScroll = { target: 0, current: 0 };

const DAMP_BASE_POINTER = 0.0001; // remaining fraction after exactly 1s
const DAMP_BASE_TOUCH = 0.000001;

/** Damp `current` toward `target`; called once per frame by the camera
 *  rig while the home route is live (dt is clamped inside dampK, so a
 *  tab-switch hitch converges over a few frames instead of teleporting). */
export function dampHomeScroll(dt: number): number {
  if (motionState.reduced) {
    homeScroll.current = homeScroll.target;
    return homeScroll.current;
  }
  const k = dampK(viewport.coarse ? DAMP_BASE_TOUCH : DAMP_BASE_POINTER, dt);
  homeScroll.current += (homeScroll.target - homeScroll.current) * k;
  return homeScroll.current;
}

/**
 * Start tracking: progress runs 0→1 from the document top to the moment
 * `endEl`'s bottom edge reaches the viewport bottom (the map section —
 * everything below it scrolls over a finished, fully-staged film).
 * Returns the detach function; detaching also resets the state so no
 * scroll value leaks into other routes or a later Home visit.
 */
export function attachHomeScroll(
  endEl: HTMLElement,
  onUpdate?: (t: number) => void,
): () => void {
  const onScroll = (): void => {
    const end = Math.max(1, endEl.offsetTop + endEl.offsetHeight - window.innerHeight);
    homeScroll.target = clamp01(window.scrollY / end);
    onUpdate?.(homeScroll.target);
  };
  onScroll();
  // A restored scroll position (reload mid-page) starts the film ON its
  // beat instead of flying there from zero.
  homeScroll.current = homeScroll.target;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    homeScroll.target = 0;
    homeScroll.current = 0;
  };
}
