import { Component, useSyncExternalStore } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * Fail-soft shell around the WebGL canvas: if context creation throws
 * (blocklisted GPU, exhausted contexts, remote desktop) or anything inside
 * the scene graph crashes, the 3D layer collapses to nothing and the DOM
 * narrative stays fully readable on the themed body background — never a
 * blank page. The copy, HUD and toggles live outside this boundary.
 *
 * The failure is also published as a singleton store (same contract as
 * theme/locale): pages that stage a product IN the canvas read it to swap
 * in static imagery when the 3D layer is gone.
 */

const listeners = new Set<() => void>();
let failed = false;

function subscribeSceneFailed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSceneFailed(): boolean {
  return failed;
}

/** True once the 3D layer has crashed for this session. */
export function useSceneFailed(): boolean {
  return useSyncExternalStore(subscribeSceneFailed, getSceneFailed);
}

export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The one deliberate console call in the app: a degraded (but working)
    // page should still leave a trace for whoever debugs it.
    console.error("3D scene failed — continuing with DOM content only.", error, info.componentStack);
    if (!failed) {
      failed = true;
      listeners.forEach((listener) => {
        listener();
      });
    }
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
