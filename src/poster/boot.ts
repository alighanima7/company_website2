import { isVisibleProductId, VISIBLE_PRODUCTS } from "../content";
import { motionState } from "../motion";
import { showroomHref } from "../router";
import { getModelReady, subscribeModelReady } from "../showroom";
import { setTheme } from "../theme";

/**
 * Poster-capture boot — the lazy half of `?poster=<id>&theme=…`.
 * scripts/render-posters.mjs drives Chrome here, waits for
 * `window.__posterReady`, and screenshots the (transparent) canvas.
 *
 * What it arranges, in order:
 *  · publishes the visible lineup on `window.__posterIds`, so the script
 *    never hardcodes product ids (the hidden flag stays authoritative);
 *  · applies the requested theme BEFORE the canvas mounts (setTheme stamps
 *    the html attribute; Stage reads the store on creation);
 *  · freezes all motion (motionState.reduced = true): every scene inits
 *    its entrance at 1 and holds its rest pose — deterministic pixels;
 *  · routes to the showroom parked on the product (before React mounts,
 *    so the router parses it as the initial location — no transition);
 *  · hides every DOM layer so only the canvas renders;
 *  · once the scene reports ready (the same markStageReady signal the
 *    poster crossfade uses), lets a 12-frame settle pass run, then flags
 *    `window.__posterReady`.
 *
 * The transparent clear, the skipped post stack and the gl alpha flag live
 * in Stage.tsx behind the same POSTER flag. Honest caveat: bloom/vignette
 * are skipped in capture (they write background-wide pixels that would
 * bake a dark fringe into the alpha), so posters are the LIT model, not
 * the post-processed frame — at crossfade the difference is the
 * background, which the live page provides anyway.
 */

declare global {
  interface Window {
    __posterReady?: boolean;
    __posterIds?: readonly string[];
  }
}

export function boot(id: string, theme: "light" | "dark"): void {
  window.__posterIds = VISIBLE_PRODUCTS.map((p) => p.id);

  setTheme(theme);
  motionState.reduced = true;

  const style = document.createElement("style");
  style.textContent = `
    .sr-root, .hud, .site-nav, .hud-brand, .theme-toggle, .lang-toggle,
    .site-footer, .perf-hud { display: none !important; }
    body { background: transparent !important; }
  `;
  document.head.appendChild(style);

  if (id === "__list") {
    // The bake script's lineup probe — ids published above, nothing to stage.
    window.__posterReady = false;
    return;
  }
  if (!isVisibleProductId(id)) {
    // Fail loudly rather than hang the script's timeout.
    console.error(`[poster] unknown or hidden product id: ${id}`);
    window.__posterReady = false;
    return;
  }
  window.location.hash = showroomHref(id);

  let settled = false;
  const settleThenFlag = (): void => {
    if (settled) return;
    settled = true;
    let frames = 0;
    const settle = (): void => {
      frames += 1;
      if (frames >= 12) {
        window.__posterReady = true;
        return;
      }
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  };

  if (getModelReady()) {
    settleThenFlag();
    return;
  }
  const unsubscribe = subscribeModelReady(() => {
    if (!getModelReady()) return;
    unsubscribe();
    settleThenFlag();
  });
  window.setTimeout(() => {
    if (!settled && window.__posterReady === undefined) {
      console.error("[poster] timed out waiting for the scene");
      window.__posterReady = false;
    }
  }, 45000);
}
