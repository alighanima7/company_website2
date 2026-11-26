import { useSyncExternalStore } from "react";
import type * as THREE from "three";

import type { Bi } from "./locale";
import type { ProductId } from "./productState";

/**
 * Showroom interaction state — the one bridge between the showroom DOM
 * (gesture layer, strip, explode toggle) and the canvas side (ShowroomRig,
 * CameraRig, the scenes' idle gates).
 *
 * Two tiers, same pattern as the scroll stores:
 *  · Plain mutable fields for PER-FRAME readers (yaw/pitch/zoom targets,
 *    velocities, interaction timestamps). The rig reads and damps these in
 *    useFrame; the gesture layer writes them from pointer events. No React
 *    in the hot path.
 *  · A tiny subscribe/notify store for the few REACT consumers: model
 *    readiness (poster crossfade) and whether the showroom is active at
 *    all (RouteScene's wrap decision rides the route, not this).
 */

export interface ShowroomState {
  /** True while the showroom page is mounted — scenes use it to hand their
   *  yaw to the rig (no clock spins under the user's finger). */
  active: boolean;
  /** User rotation, radians. Written by the gesture layer, damped+applied
   *  by the rig. */
  yaw: number;
  pitch: number;
  /** Release velocities (rad/s) — the rig integrates them as inertia. */
  yawV: number;
  pitchV: number;
  /** True only while a pointer is actually down on the stage. */
  dragging: boolean;
  /** performance.now() of the last pointer/wheel activity — idle sway and
   *  the return-to-default wait on this. */
  lastInteract: number;
  /** Dolly factor target, clamped [ZOOM_MIN, ZOOM_MAX]; rig damps `zoom`
   *  toward it and CameraRig divides the pose distance by `zoom`. */
  zoom: number;
  zoomTarget: number;
  /** Explode target for the active product (0 assembled, 1 exploded). */
  explode: number;
  /** Rolling-FPS gate maintained by the rig: false under sustained low
   *  frame rate — idle sway stops costing frames the device doesn't have. */
  fpsOk: boolean;
  /** Active product's yaw limit (radians, ± symmetric); null = free 360°. */
  maxYaw: number | null;
  /** The explode value the scene actually damped to this frame (0..1) —
   *  the label projector's settle gate reads it. */
  explodeCurrent: number;
  /** Safe-area rects the label projector must keep clear of, published by
   *  ShowroomPage outside the frame loop (mount, selection, resize) so
   *  the per-frame code never reads DOM layout. */
  safe: {
    text: { x: number; y: number; w: number; h: number } | null;
    stripTop: number;
    topInset: number;
  } | null;
}

/** One exploded-part label, registered by the scene (FmcDevice controlled
 *  mode), positioned per frame by the rig's projector, rendered as plain
 *  DOM by ShowroomPage. Anchors are DATA-DRIVEN: the part's own bbox
 *  center in its local space — no hand-tuned coordinates, so replacing
 *  the GLBs re-derives everything. */
export interface ShowroomLabel {
  readonly id: string;
  readonly tag: string;
  readonly desc: Bi;
  readonly node: THREE.Object3D;
  /** Part-local bbox center (anchor base) and half-extents. */
  readonly center: THREE.Vector3;
  readonly halfExtents: THREE.Vector3;
  /** Which way this part flies on the explode axis (±1) — its outward
   *  facing for the faces-away fade. */
  readonly sign: 1 | -1;
  /** DOM hookups, filled by ShowroomPage after render. */
  els: {
    root: HTMLElement | null;
    line: HTMLElement | null;
    text: HTMLElement | null;
  };
  /** Projector-owned smoothed visibility (occlusion/off-screen fades are
   *  binary per frame; this damps them so labels never pop). */
  fade: number;
}

export const showroomState: ShowroomState = {
  active: false,
  yaw: 0,
  pitch: 0,
  yawV: 0,
  pitchV: 0,
  dragging: false,
  lastInteract: 0,
  zoom: 1,
  zoomTarget: 1,
  explode: 0,
  fpsOk: true,
  maxYaw: null,
  explodeCurrent: 0,
  safe: null,
};

export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 1.6;
/** Pitch clamp, radians (≈ −10°…+60° — under the model a little, over it a lot). */
export const PITCH_MIN = -0.1745;
export const PITCH_MAX = 1.0472;
/** Seconds of stillness before the view eases home and the sway resumes. */
export const IDLE_RETURN_AFTER_S = 4;

/** Per-product yaw limit (radians, symmetric ±). Absent = free 360°.
 *  Kept for models whose replacement assets are pending clean backs. */
export const MAX_YAW: Partial<Record<ProductId, number>> = {};

/** Reset every gesture value — product switches and unmount both land
 *  here so no rotation/zoom/explode leaks across products or routes. */
export function resetShowroomView(): void {
  showroomState.yaw = 0;
  showroomState.pitch = 0;
  showroomState.yawV = 0;
  showroomState.pitchV = 0;
  showroomState.dragging = false;
  showroomState.zoom = 1;
  showroomState.zoomTarget = 1;
  showroomState.explodeCurrent = 0;
  setShowroomExplode(false);
}

/** One-finger rotate for a stage surface, shared by the showroom's
 *  gesture layer and the phone detail page. Writes straight into
 *  showroomState; ShowroomRig damps, clamps and eases it home. */
export function dragRotate(dx: number, dy: number): void {
  showroomState.yaw += dx * 0.0075;
  showroomState.pitch += dy * 0.006;
  showroomState.lastInteract = performance.now();
}

export function beginDrag(): void {
  showroomState.dragging = true;
  showroomState.yawV = 0;
  showroomState.pitchV = 0;
  showroomState.lastInteract = performance.now();
}

export function endDrag(yawVelocity: number): void {
  showroomState.dragging = false;
  showroomState.yawV = yawVelocity;
  showroomState.lastInteract = performance.now();
}

/* ── React-visible slices: explode toggle + model readiness + labels ──── */

const listeners = new Set<() => void>();
let modelReady = false;
let explodeOn = false;
let labels: readonly ShowroomLabel[] = [];

/** Scene-side registration (FmcDevice controlled mode). Replaces any
 *  previous set — one product's labels exist at a time. */
export function registerShowroomLabels(next: readonly ShowroomLabel[]): void {
  labels = next;
  notify();
}

export function clearShowroomLabels(): void {
  if (labels.length === 0) return;
  labels = [];
  notify();
}

export function getShowroomLabels(): readonly ShowroomLabel[] {
  return labels;
}

export function useShowroomLabels(): readonly ShowroomLabel[] {
  return useSyncExternalStore(subscribe, getShowroomLabels);
}

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

/** Called by each scene's model component once its content is actually
 *  mounted (for GLB scenes that means the decode finished — the component
 *  below the Suspense boundary exists). No-op outside the showroom. */
/** The explode text-toggle. RouteScene (canvas tree) and ShowroomPage
 *  (DOM tree) both subscribe — this is their only shared switch. */
export function setShowroomExplode(on: boolean): void {
  if (explodeOn === on) return;
  explodeOn = on;
  showroomState.explode = on ? 1 : 0;
  notify();
}

export function getShowroomExplode(): boolean {
  return explodeOn;
}

export function useShowroomExplode(): boolean {
  return useSyncExternalStore(subscribe, getShowroomExplode);
}

export function markStageReady(): void {
  if (!showroomState.active || modelReady) return;
  modelReady = true;
  notify();
}

/** Scene unmount / product switch: the poster must cover again. */
export function markStageLoading(): void {
  if (!modelReady) return;
  modelReady = false;
  notify();
}

export function getModelReady(): boolean {
  return modelReady;
}

/** Hookless subscription — the poster boot (no React of its own) listens
 *  for scene readiness through the same store the poster <img> uses. */
export function subscribeModelReady(listener: () => void): () => void {
  return subscribe(listener);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useModelReady(): boolean {
  return useSyncExternalStore(subscribe, getModelReady);
}
