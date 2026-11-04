import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { PHASES } from "./content";

/**
 * Scroll plumbing — one place, three jobs:
 *
 *  1. Lenis virtualizes the wheel for the buttery inertial feel the genre
 *     demands, and feeds GSAP's ticker so there is exactly ONE rAF loop
 *     driving scroll, ScrollTrigger and the DOM tweens.
 *  2. A master ScrollTrigger maps the whole document to `scrollState.target`
 *     in [0..1]. The 3D side never touches ScrollTrigger: each R3F frame
 *     critically damps `current` toward `target`, which is what makes the
 *     camera feel directed rather than dragged.
 *  3. `prefers-reduced-motion` short-circuits all of it: no Lenis, no scrub —
 *     the scene renders in its assembled resting state and the page scrolls
 *     natively. Choreography is an enhancement, never a requirement.
 */

gsap.registerPlugin(ScrollTrigger);

// Resize handling is OURS (see initScroll): the default auto-refresh-on-resize
// restores a stale scroll position when a smooth-scroll lib owns the window
// (reproduced with the mobile URL bar and browser toolbars), so we take
// 'resize' out of the auto list and refresh deterministically ourselves.
ScrollTrigger.config({
  ignoreMobileResize: true,
  autoRefreshEvents: "visibilitychange,DOMContentLoaded,load",
});
ScrollTrigger.clearScrollMemory("manual");

export const scrollState = {
  /** Raw ScrollTrigger progress, 0..1 across the whole page. */
  target: 0,
  /** Frame-damped copy, what the 3D rig actually reads. */
  current: 0,
  reduced: false,
};

/** Critical damping toward the target; called from useFrame. */
export function dampScroll(dt: number): number {
  const k = 1 - Math.pow(0.0001, dt); // ~0 at dt=0, →1 fast but frame-rate independent
  scrollState.current += (scrollState.target - scrollState.current) * k;
  return scrollState.current;
}

/**
 * Re-derive the phase boundaries from where the narrative sections actually
 * sit, so the 3D beats play exactly while their copy is pinned — regardless
 * of viewport height, font metrics or late image layout.
 */
export function syncPhases(): void {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return;
  const at = (selector: string): number | null => {
    const el = document.querySelector<HTMLElement>(selector);
    return el === null ? null : el.offsetTop / max;
  };
  PHASES.heroEnd = at(".section-teardown") ?? PHASES.heroEnd;
  PHASES.teardownEnd = at(".section-collar") ?? PHASES.teardownEnd;
  PHASES.collarEnd = at(".section-city") ?? PHASES.collarEnd;
  PHASES.cityEnd = at(".section-network") ?? PHASES.cityEnd;
  PHASES.networkEnd = at(".section-ai") ?? PHASES.networkEnd;
  PHASES.aiEnd = at(".section-outro") ?? PHASES.aiEnd;
}

export function initScroll(): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollState.reduced = reduced;
  syncPhases();

  if (reduced) {
    // Resting pose mid-experience so the hero copy AND the map both read.
    scrollState.target = 0;
    scrollState.current = 0;
    // Locale switches still re-measure the phase boundaries.
    window.addEventListener("nns:refresh", syncPhases);
    return () => {
      window.removeEventListener("nns:refresh", syncPhases);
    };
  }

  // Touch stays NATIVE (syncTouch off): the OS keeps its own momentum and
  // edge behavior, so a finger on the full-viewport canvas scrolls the page
  // exactly like a finger anywhere else — Lenis only virtualizes the WHEEL.
  // The master trigger below still scrubs from whatever scroll position the
  // browser lands on, so the 3D film follows touch flicks 1:1.
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true, syncTouch: false });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number): void => {
    lenis.raf(time * 1000);
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  const master = ScrollTrigger.create({
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      scrollState.target = self.progress;
    },
  });

  // Refresh = re-measure phases + triggers, then put the scroll back EXACTLY
  // where it was. Never trust the built-in restore while Lenis owns the window.
  const hardRefresh = (): void => {
    const y = window.scrollY;
    syncPhases();
    ScrollTrigger.refresh();
    lenis.scrollTo(y, { immediate: true, force: true });
  };

  const onLoad = (): void => {
    hardRefresh();
  };
  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });
  void document.fonts.ready.then(hardRefresh);

  let resizeTimer: number | undefined;
  const scheduleRefresh = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(hardRefresh, 200);
  };
  // Phone URL-bar show/hide fires HEIGHT-only resizes mid-flick; the layout
  // is vh/svh-stable there, so re-measuring would only stutter the scrub.
  // A width change (rotation, split-screen) is a real re-layout.
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  let lastWidth = window.innerWidth;
  const onResize = (): void => {
    if (coarse && window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    scheduleRefresh();
  };
  window.addEventListener("resize", onResize);
  // Locale switches change text metrics (and therefore section heights)
  // WITHOUT changing the viewport — they ask for a refresh explicitly.
  window.addEventListener("nns:refresh", scheduleRefresh);

  // Expose for automated verification (scroll-to-fraction in tests).
  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("nns:refresh", scheduleRefresh);
    window.removeEventListener("load", onLoad);
    window.clearTimeout(resizeTimer);
    master.kill();
    gsap.ticker.remove(tick);
    lenis.destroy();
  };
}

/* ── Phase math helpers (shared by rig + scene) ─────────────────────────── */

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
