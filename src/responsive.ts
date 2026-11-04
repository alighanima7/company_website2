import { useSyncExternalStore } from "react";

/**
 * Viewport breakpoints — ONE source of truth shared by the DOM and the 3D
 * rig. The media queries in styles.css mirror these exact widths (the
 * classic Tailwind cuts: <768 phone, 768–1023 tablet), so the camera, the
 * canvas resolution and the stylesheet always agree on what "mobile" means.
 *
 *  · `viewport` is a plain mutable snapshot for per-frame readers — useFrame
 *    code must never touch matchMedia on the hot path.
 *  · `useViewportTier` / `useIsMobile` re-render React components when the
 *    tier flips (rotation, split-screen, window resize).
 *  · `coarse` tracks the INPUT, not the width: a touch tablet in landscape
 *    is still a touch device, which is what perf- and gesture-gated code
 *    (terrain density, pointer parallax) actually cares about.
 */

export type ViewportTier = "mobile" | "tablet" | "desktop";

export const MOBILE_MAX_PX = 767;
export const TABLET_MAX_PX = 1023;

const canQuery = typeof window !== "undefined";
const mobileQuery = canQuery ? window.matchMedia(`(max-width: ${String(MOBILE_MAX_PX)}px)`) : null;
const tabletQuery = canQuery ? window.matchMedia(`(max-width: ${String(TABLET_MAX_PX)}px)`) : null;
const coarseQuery = canQuery ? window.matchMedia("(pointer: coarse)") : null;

function currentTier(): ViewportTier {
  if (mobileQuery?.matches === true) return "mobile";
  if (tabletQuery?.matches === true) return "tablet";
  return "desktop";
}

export const viewport: { tier: ViewportTier; isMobile: boolean; coarse: boolean } = {
  tier: currentTier(),
  isMobile: mobileQuery?.matches ?? false,
  coarse: coarseQuery?.matches ?? false,
};

const listeners = new Set<() => void>();

function refresh(): void {
  viewport.tier = currentTier();
  viewport.isMobile = viewport.tier === "mobile";
  viewport.coarse = coarseQuery?.matches ?? false;
  listeners.forEach((listener) => {
    listener();
  });
}

mobileQuery?.addEventListener("change", refresh);
tabletQuery?.addEventListener("change", refresh);
coarseQuery?.addEventListener("change", refresh);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getTier(): ViewportTier {
  return viewport.tier;
}

export function useViewportTier(): ViewportTier {
  return useSyncExternalStore(subscribe, getTier);
}

export function useIsMobile(): boolean {
  return useViewportTier() === "mobile";
}
