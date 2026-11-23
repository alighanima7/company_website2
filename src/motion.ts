/**
 * Shared motion math for the 3D showcases and the camera rig — the pure
 * helpers that survived the scroll-film era (scroll.ts is gone; pages
 * scroll natively now and the scenes run on the clock instead of a scrub).
 */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Normalized progress of p through [a, b], smoothstepped. */
export function phase(p: number, a: number, b: number): number {
  const t = clamp01((p - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate-independent damping factor: the remaining fraction after
 *  exactly one second is `base`, whatever the display's refresh rate.
 *  (Same convergence law the scroll rig used — now easing the camera
 *  between route poses.) */
export function dampK(base: number, dt: number): number {
  return 1 - Math.pow(base, Math.min(dt, 0.05));
}

/** One shared reduced-motion flag, read once per frame by the 3D side
 *  (matchMedia on the hot path is a no-go). Live: an OS toggle flips it
 *  without a reload. */
export const motionState = { reduced: false };

if (typeof window !== "undefined") {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  motionState.reduced = query.matches;
  query.addEventListener("change", () => {
    motionState.reduced = query.matches;
  });
}
