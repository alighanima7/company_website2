import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { JSX } from "react";

import { SCENE, useTheme } from "../theme";

/**
 * Desktop-only post stack, split out behind a dynamic import so touch
 * devices (where effects never render — see `effectsOn` in Experience)
 * never download the postprocessing chunks at all.
 *
 * Bloom belongs to the dark ops room only: on a light canvas the whole
 * frame crosses the luminance threshold and hazes over.
 */
export default function Effects(): JSX.Element {
  const mode = useTheme();
  const p = SCENE[mode];

  return p.bloom ? (
    <EffectComposer key={mode}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.22} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={p.vignetteOffset} darkness={p.vignetteDarkness} />
    </EffectComposer>
  ) : (
    <EffectComposer key={mode}>
      <Vignette eskil={false} offset={p.vignetteOffset} darkness={p.vignetteDarkness} />
    </EffectComposer>
  );
}
