import * as THREE from "three";

import { BACK_DIM, backFacing } from "../productScroll";

/**
 * Back-face dimming for the browse revolution.
 *
 * Two of the six source models carry a hallucinated back face baked into
 * their TEXTURE — a garbled pseudo-label on FMC920, mirrored branding on
 * Galileosky 10. Every material is `doubleSided`, but that is not the
 * cause and flipping it would not help: the artwork is painted into the
 * atlas, and re-painting it is off limits. A full revolution necessarily
 * shows it, so instead each device fades toward the stage colour across
 * its back-facing window and the text never resolves.
 *
 * The fade is a pure function of the rotation, which is itself a pure
 * function of scroll position — so it is deterministic, reversible, and
 * stationary whenever the page is. It is NOT a clock animation and adds
 * no independent rhythm of its own.
 *
 * Colours are driven on per-theme CLONES (never the loader's originals),
 * so each frame re-derives from the untouched base instead of compounding
 * a multiply.
 */

/** Remembers each cloned material's undimmed colour, keyed by the clone. */
export type DimBase = Map<THREE.Material, THREE.Color>;

export function captureDimBase(clones: Iterable<THREE.Material>): DimBase {
  const base: DimBase = new Map();
  for (const m of clones) {
    if (m instanceof THREE.MeshStandardMaterial) base.set(m, m.color.clone());
  }
  return base;
}

/**
 * Fade every tracked clone toward the stage by how back-on the device is.
 * `turnRadians` is the browse rotation only — never the base yaw, which
 * merely orients the model's front toward the camera.
 *
 * Two implementations were tried and rejected before this one:
 *  · opacity — every model here is `doubleSided`, so going transparent
 *    makes the shell see-through and the FRONT label shows through from
 *    the inside. Strictly worse.
 *  · colour alone — `material.color` MULTIPLIES the albedo map, and
 *    multiplying preserves contrast, so white label text stays legible
 *    relative to the body no matter how far the tint is pushed.
 *
 * What is left is to attack legibility rather than brightness: stay
 * opaque, pull the colour hard toward the stage (which flattens the body
 * and the text together), and let the caller dolly the device back so the
 * remaining text is also small. This REDUCES legibility a long way but
 * does not erase it — the artwork is in the texture, and the honest fix
 * is to repaint those two atlases or not to rotate those two products.
 */
export function applyBackDim(base: DimBase, turnRadians: number, stage: THREE.ColorRepresentation): void {
  const k = backFacing(turnRadians) * BACK_DIM;
  const target = new THREE.Color(stage);
  base.forEach((colour, material) => {
    const std = material as THREE.MeshStandardMaterial;
    std.color.copy(colour).lerp(target, k);
  });
}

/** Scale multiplier that walks the device away from the camera through
 *  its back window, so whatever survives the colour flatten is at least
 *  small. 1 at the front, BACK_SHRINK at full back-on. */
const BACK_SHRINK = 0.62;
export function backDimScale(turnRadians: number): number {
  return 1 - backFacing(turnRadians) * (1 - BACK_SHRINK);
}
