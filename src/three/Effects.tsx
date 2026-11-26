import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { SCENE, useTheme } from "../theme";
import { useGlGeneration } from "./glRecovery";

/**
 * Desktop-only post stack, split out behind a dynamic import so touch
 * devices (where effects never render — see `effectsOn` in Experience)
 * never download the postprocessing chunks at all.
 *
 * Bloom belongs to the dark ops room only: on a light canvas the whole
 * frame crosses the luminance threshold and hazes over.
 *
 * MSAA is pinned here rather than left to the library default (4): the
 * composer's multisampled targets are the single heaviest allocation in
 * the frame, and 2 samples carry the silhouette on the integrated GPUs
 * that actually struggle. The WebGL context itself is created WITHOUT
 * antialias whenever this stack will mount (see Stage.tsx) — its own
 * multisampled back buffer was pure waste, because the composer only
 * blits a fullscreen triangle to it.
 */

/** Integrated GPUs share bandwidth with system memory, which is what the
 *  composer's multisampled targets actually consume. CPU core count is a
 *  bad proxy (this project's own test laptop reports 12 threads behind a
 *  Radeon iGPU), so ask the driver instead. */
function usesIntegratedGpu(gl: THREE.WebGLRenderer): boolean {
  try {
    const ctx = gl.getContext();
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    if (ext === null) return true; // unknown: assume the cheaper path
    const name = String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    return /intel|radeon\(tm\) graphics|vega|apple|adreno|mali|powervr|swiftshader|llvmpipe/i.test(
      name,
    );
  } catch {
    return true;
  }
}

export default function Effects(): JSX.Element {
  const mode = useTheme();
  const p = SCENE[mode];
  const gl = useThree((s) => s.gl);
  const [msaa] = useState(() => (usesIntegratedGpu(gl) ? 2 : 4));
  // The composer's render targets do not survive a context restore —
  // remount the whole stack when the recovery generation moves.
  const generation = useGlGeneration();

  return p.bloom ? (
    <EffectComposer key={`${mode}:${String(generation)}`} multisampling={msaa}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.22} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={p.vignetteOffset} darkness={p.vignetteDarkness} />
    </EffectComposer>
  ) : (
    /* No bloom in daylight, so nothing needs values above 1.0 — an 8-bit
       buffer halves the composer's bandwidth versus the half-float
       default, which matters most on the integrated GPUs that share it
       with system memory. */
    <EffectComposer
      key={`${mode}:${String(generation)}`}
      multisampling={msaa}
      frameBufferType={THREE.UnsignedByteType}
    >
      <Vignette eskil={false} offset={p.vignetteOffset} darkness={p.vignetteDarkness} />
    </EffectComposer>
  );
}
