import type { Bi } from "./locale";
import type { ProductId } from "./productState";

/**
 * PHASE B DATA MODEL — borderless hotspots (NOT implemented in Phase A).
 *
 * Small dots anchored to 3D points on the model, projected to screen each
 * frame; selecting one shows a single plain-text line with a thin leader —
 * no box. This file fixes the data contract now so Phase A's architecture
 * (ShowroomRig exposes `rigGroup`, the world transform projections must
 * compose with; perf/measure.ts already proves the Vector3.project math)
 * cannot block it.
 *
 * Authoring space: the scene's NORMALIZED space — after the Box3 re-pivot
 * and span scale every viewer applies — i.e. exactly the space the chips'
 * `labelAt` anchors already use, so existing tuning workflows carry over.
 *
 * Runtime rules (Phase B):
 *  · hidden while `backface`: dot(world-space `normal`, toCamera) < 0.15,
 *    fading in/out smoothly rather than popping;
 *  · hidden while the explode animation is in motion (damped value not at
 *    rest) so leaders never swim;
 *  · with `partKey` set, the anchor rides that part's explode offset —
 *    home + offset·k along the explode axis, as the chips do today;
 *  · selecting a dot gently nudges the camera toward that part.
 */

export interface Hotspot {
  readonly id: string;
  /** Anchor in the scene's normalized space. */
  readonly anchor: readonly [number, number, number];
  /** Outward facing direction (normalized space). Omitted = always faces. */
  readonly normal?: readonly [number, number, number];
  /** Sanitized node name (FmcDevice's partKey convention) — the anchor
   *  follows that part when exploded. */
  readonly partKey?: string;
  /** When the hotspot is offered. Default: "always". */
  readonly show?: "assembled" | "exploded" | "always";
  readonly text: Bi;
}

/** Per-product hotspot sets. All text is [TODO] until real copy lands —
 *  never invent specs or claims. Anchors are placeholders to be tuned
 *  against renders in Phase B. */
export const HOTSPOTS: Partial<Record<ProductId, readonly Hotspot[]>> = {
  fmc130: [
    {
      id: "f130-hs-front",
      anchor: [0, 0.2, 0.5],
      normal: [0, 0, 1],
      partKey: "root1",
      show: "always",
      text: { ar: "[TODO] نص نقطة الواجهة", en: "[TODO] Front label point" },
    },
    {
      id: "f130-hs-port",
      anchor: [-0.9, -0.1, 0.1],
      normal: [-1, 0, 0],
      partKey: "root2",
      show: "exploded",
      text: { ar: "[TODO] نص منفذ التوصيل", en: "[TODO] Connector point" },
    },
  ],
  fmc920: [
    {
      id: "f920-hs-unit",
      anchor: [0, 0.25, 0.4],
      normal: [0, 0, 1],
      partKey: "root0",
      show: "always",
      text: { ar: "[TODO] نص الوحدة", en: "[TODO] Unit point" },
    },
  ],
};
