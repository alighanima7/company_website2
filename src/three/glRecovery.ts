import { useSyncExternalStore } from "react";

/**
 * WebGL context-recovery generation.
 *
 * When the GPU process restarts (driver reset, OS GPU hang, memory
 * pressure) the browser loses and then restores the WebGL context.
 * three.js re-uploads geometries, ordinary textures and programs by
 * itself — but anything whose contents lived in a RENDER TARGET is gone
 * for good, because there is no CPU-side copy to re-upload:
 *
 *  · the PMREM environment map (StudioEnvironment) — without it every
 *    PBR surface renders unlit, so the stage comes back visually blank
 *    even though the scene graph is intact;
 *  · the post stack's buffers (EffectComposer).
 *
 * Both subscribe to this counter and rebuild when it changes. Kept in its
 * own module so the canvas tree and the Effects chunk can share it
 * without importing each other.
 */

const listeners = new Set<() => void>();
let generation = 0;

/** Called from ContextLossGuard on `webglcontextrestored`. */
export function notifyContextRestored(): void {
  generation += 1;
  listeners.forEach((listener) => {
    listener();
  });
}

export function getGlGeneration(): number {
  return generation;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGlGeneration(): number {
  return useSyncExternalStore(subscribe, getGlGeneration);
}
