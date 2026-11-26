import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { useEffect, useRef } from "react";

import { installMeasureApi } from "./measure";
import { bumpDiag, diag, noteDiag, reportEnv, reportGl } from "./probe";

/**
 * In-canvas half of the harness: reads the renderer's own counters and the
 * GPU identity, and hands them to the overlay's sink. Mounted by Stage
 * ONLY under ?perf=1, behind a lazy import, so it is absent from the
 * normal bundle and from the normal scene graph.
 *
 * Two details that matter for the numbers being true:
 *
 *  · `info.autoReset` is turned OFF. three resets the counters inside
 *    every `render()` call, and with an EffectComposer there are several
 *    per frame — left on, `render.calls` would report only the last pass.
 *    With it off the counters accumulate across the whole frame and this
 *    component resets them itself, once, so the figures are per-FRAME
 *    totals rather than per-pass.
 *
 *  · The read runs at useFrame's DEFAULT priority (0) and reports the
 *    counters accumulated since the previous reset — i.e. the PREVIOUS
 *    frame's totals. One frame of lag is irrelevant here, and it buys
 *    correctness: taking a positive priority would flip R3F into manual
 *    render mode and stop the canvas drawing whenever the composer is
 *    absent (?nofx=1, touch devices).
 */
export default function GlProbe(): null {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const store = useThree((s) => s);

  // AUDIT ONLY: expose the layout/framing measurement API (window.__measure).
  // See measure.ts - it exists so the mobile audit can project the model's
  // bounds numerically rather than eyeball them. Deletable with that file.
  useEffect(() => installMeasureApi(store), [store]);

  useEffect(() => {
    const info = gl.info;
    const previous = info.autoReset;
    info.autoReset = false;
    return () => {
      info.autoReset = previous;
    };
  }, [gl]);

  // Environment, re-reported whenever the backing store changes so the
  // pasted report always carries the size the frames were measured at.
  useEffect(() => {
    const context = gl.getContext();
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    const attributes = context.getContextAttributes();
    reportEnv({
      gpu:
        debug === null
          ? "unavailable (WEBGL_debug_renderer_info blocked)"
          : String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)),
      vendor:
        debug === null ? "unavailable" : String(context.getParameter(debug.UNMASKED_VENDOR_WEBGL)),
      glVersion: String(context.getParameter(context.VERSION)),
      cssSize: `${String(size.width)}x${String(size.height)}`,
      backingStore: `${String(context.drawingBufferWidth)}x${String(context.drawingBufferHeight)}`,
      megapixelsPerFrame:
        Math.round(((context.drawingBufferWidth * context.drawingBufferHeight) / 1e6) * 100) / 100,
      rendererDpr: dpr,
      devicePixelRatio: window.devicePixelRatio,
      contextAntialias: attributes === null ? "unknown" : String(attributes.antialias === true),
      // MAX_SAMPLES is WebGL2 only; three falls back to WebGL1 on old GPUs.
      maxSamples:
        "MAX_SAMPLES" in context ? Number(context.getParameter(context.MAX_SAMPLES)) : 0,
      shadowMapEnabled: String(gl.shadowMap.enabled),
      shadowAutoUpdate: String(gl.shadowMap.autoUpdate),
    });
  }, [gl, size.width, size.height, dpr]);

  /* Blank-canvas accounting, per rAF tick.
   *
   *  `info.render.frame` advances once per three render() call. A tick
   *  where it did NOT advance is a frame the compositor may present
   *  without a redraw — and with preserveDrawingBuffer:false that is
   *  exactly what a periodic "blank canvas" looks like. Counting the
   *  skips (and their longest run) says whether the blank is the render
   *  loop stalling or something below it in the compositor.
   *
   *  The mesh count is the Suspense tripwire: solid meshes falling to 0
   *  means the scene content itself vanished (a GLB cache eviction or a
   *  re-suspend), which is a different bug with a different fix. */
  const last = useRef({ frame: -1, t: 0, run: 0, meshes: -1 });

  useFrame((state) => {
    const info = gl.info;
    const now = performance.now();
    const L = last.current;

    if (L.frame >= 0) {
      if (info.render.frame === L.frame) {
        bumpDiag("framesSkipped");
        L.run += 1;
        if (L.run > diag.longestSkipRun) diag.longestSkipRun = L.run;
      } else {
        L.run = 0;
      }
      const dt = now - L.t;
      if (dt > 50) {
        bumpDiag("longFrames");
        if (dt > diag.maxFrameMs) diag.maxFrameMs = Math.round(dt);
      }
    }
    L.frame = info.render.frame;
    L.t = now;

    let meshes = 0;
    state.scene.traverseVisible((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      const mat = mesh.material as THREE.Material | THREE.Material[];
      const type = Array.isArray(mat) ? mat[0]?.type : mat.type;
      if (type === "MeshStandardMaterial" || type === "MeshPhysicalMaterial") meshes += 1;
    });
    diag.meshes = meshes;
    if (L.meshes > 0 && meshes === 0) bumpDiag("suspenseDrops");
    L.meshes = meshes;

    const ctx = gl.getContext();
    const buf = `${String(ctx.drawingBufferWidth)}x${String(ctx.drawingBufferHeight)}`;
    if (buf !== diag.lastBuffer) {
      if (diag.lastBuffer !== "") bumpDiag("bufferResizes");
      noteDiag("lastBuffer", buf);
    }

    reportGl(
      info.render.calls,
      info.render.triangles,
      info.memory.geometries,
      info.memory.textures,
    );
    info.reset();
  });

  return null;
}
