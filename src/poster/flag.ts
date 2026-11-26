/**
 * Poster-capture boot flag — the `?poster=<id>&theme=light|dark` query
 * (BEFORE the hash, like ?perf=1). Same zero-cost contract as perf/probe:
 * a normal visitor pays one substring scan; everything with weight lives
 * in ./boot, dynamically imported from main.tsx only when the flag is on.
 *
 * In poster mode the Stage renders with a TRANSPARENT clear and without
 * the post stack, the showroom chrome is hidden, and motion is frozen —
 * scripts/render-posters.mjs screenshots the canvas per product per theme.
 */

export interface PosterFlags {
  readonly on: boolean;
  /** Product id to stage (validated by boot against VISIBLE_PRODUCTS). */
  readonly id: string;
  readonly theme: "light" | "dark";
}

const OFF: PosterFlags = Object.freeze({ on: false, id: "", theme: "light" });

function parse(): PosterFlags {
  if (typeof window === "undefined") return OFF;
  if (!window.location.search.includes("poster")) return OFF;
  const q = new URLSearchParams(window.location.search);
  const id = q.get("poster");
  if (id === null || id === "") return OFF;
  return Object.freeze({
    on: true,
    id,
    theme: q.get("theme") === "dark" ? ("dark" as const) : ("light" as const),
  });
}

export const POSTER: PosterFlags = parse();
