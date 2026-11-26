import type { RootState } from "@react-three/fiber";
import * as THREE from "three";

import { homeScroll } from "../homeScroll";
import { productScroll } from "../productScroll";
import { getProduct } from "../productState";
import { viewport } from "../responsive";

/**
 * AUDIT INSTRUMENTATION — layout/framing measurement API.
 *
 * Installed on `window.__measure` by GlProbe, which mounts only under
 * ?perf=1 behind a lazy import, so none of this exists in a normal
 * visitor's bundle or runtime. It is here so the mobile-layout audit can
 * answer one question numerically instead of by eye: where on screen does
 * the 3D model actually land, and does it collide with the card, the nav,
 * the chips or the top controls.
 *
 * Why it needs to live inside the app rather than in a console script:
 * the scene graph and the camera are R3F internals with no public handle
 * from the DOM, and the damped scroll stores are module singletons.
 *
 * `advance()` is the key to measuring at all: it runs R3F's frame
 * synchronously, so a state can be driven and read without waiting on
 * requestAnimationFrame (which a background tab throttles to ~1Hz).
 *
 * This file is a measurement tool, not product code. It can be deleted
 * wholesale once the audit is signed off.
 */

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoundsReport {
  /** Union of every solid mesh's own bbox corners, projected. Tighter and
   *  more honest than one world-space box around a rotated multi-part
   *  model, which over-reports badly when parts fly apart. */
  perMesh: ScreenRect | null;
  /** One world box around everything solid, projected. Conservative. */
  worldBox: ScreenRect | null;
  /** Meshes counted, and whether any corner fell behind the near plane
   *  (which would make its projection meaningless). */
  meshes: number;
  behindCamera: boolean;
  /** World-space size of the solid bbox, for framing math. */
  worldSize: [number, number, number] | null;
  worldCenter: [number, number, number] | null;
}

function isSolid(material: THREE.Material | THREE.Material[]): boolean {
  const list = Array.isArray(material) ? material : [material];
  // Glow quads, halos, beacon columns and the stage glow are all
  // MeshBasicMaterial; the daylight shadow catcher is ShadowMaterial.
  // Neither is "the model" for framing purposes.
  return list.some((m) => m.type === "MeshStandardMaterial" || m.type === "MeshPhysicalMaterial");
}

function projectPoint(
  v: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number,
): { x: number; y: number; behind: boolean } {
  const p = v.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * width,
    y: (-p.y * 0.5 + 0.5) * height,
    behind: p.z > 1 || p.z < -1,
  };
}

function rectOf(points: ReadonlyArray<{ x: number; y: number }>): ScreenRect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function cornersOf(box: THREE.Box3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        out.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return out;
}

function bounds(state: RootState): BoundsReport {
  const { scene, camera, size } = state;
  camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);

  const world = new THREE.Box3();
  const perMeshPoints: Array<{ x: number; y: number }> = [];
  let meshes = 0;
  let behind = false;

  scene.traverseVisible((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if (!isSolid(mesh.material)) return;
    const geometry = mesh.geometry;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb === null) return;
    meshes += 1;

    const localCorners = cornersOf(bb);
    for (const corner of localCorners) {
      corner.applyMatrix4(mesh.matrixWorld);
      world.expandByPoint(corner);
      const p = projectPoint(corner, camera, size.width, size.height);
      if (p.behind) behind = true;
      perMeshPoints.push(p);
    }
  });

  if (meshes === 0) {
    return {
      perMesh: null,
      worldBox: null,
      meshes: 0,
      behindCamera: false,
      worldSize: null,
      worldCenter: null,
    };
  }

  const worldPoints = cornersOf(world).map((c) => projectPoint(c, camera, size.width, size.height));
  const sizeVec = world.getSize(new THREE.Vector3());
  const centerVec = world.getCenter(new THREE.Vector3());

  return {
    perMesh: rectOf(perMeshPoints),
    worldBox: rectOf(worldPoints),
    meshes,
    behindCamera: behind,
    worldSize: [sizeVec.x, sizeVec.y, sizeVec.z],
    worldCenter: [centerVec.x, centerVec.y, centerVec.z],
  };
}

export interface MeasureApi {
  /** Run `frames` R3F frames synchronously with a FIXED delta, so a
   *  throttled or background tab measures identically to a focused one.
   *
   *  The fixed delta is the whole point. `state.advance(timestamp)` ignores
   *  the timestamp for timing purposes — R3F reads `clock.getDelta()`,
   *  which three implements against `performance.now()`. Called in a tight
   *  synchronous loop that yields dt ~= 0.0001s, so scene state that
   *  integrates dt (every scene's `entrance` ramp, the camera damper)
   *  barely moves and the measured frame is not the settled one. Patching
   *  getDelta for the duration makes simulated time real and repeatable. */
  advance(frames?: number, dtSec?: number): void;
  /** Collapse every damped scroll value onto its target, so a state can
   *  be measured at its exact mark instead of somewhere along the ease. */
  snap(): void;
  /** Projected screen bounds of the solid model, right now. */
  bounds(): BoundsReport;
  /** Camera/renderer/viewport facts behind the current framing. */
  info(): Record<string, unknown>;
  /** Euler rotations (rad) of every rotated Group in the scene — the
   *  audit's roll check (z must stay 0 at rest for product scenes). */
  rolls(): Array<{ name: string; x: number; y: number; z: number }>;
  /** Raw R3F root state — scene-graph access for audit-time elimination
   *  (hiding one object at a time to locate a visual artifact). */
  root: RootState;
}

let clockMs = 0;

export function installMeasureApi(state: RootState): () => void {
  const api: MeasureApi = {
    advance(frames = 1, dtSec = 1 / 60) {
      const clock = state.clock;
      const original = clock.getDelta.bind(clock);
      clock.getDelta = (): number => {
        clock.elapsedTime += dtSec;
        return dtSec;
      };
      try {
        for (let i = 0; i < frames; i += 1) {
          clockMs += dtSec * 1000;
          state.advance(clockMs);
        }
      } finally {
        clock.getDelta = original;
      }
    },
    snap() {
      homeScroll.current = homeScroll.target;
      productScroll.current = productScroll.target;
    },
    bounds() {
      return bounds(state);
    },
    rolls() {
      const out: Array<{ name: string; x: number; y: number; z: number }> = [];
      state.scene.traverse((obj) => {
        if ((obj as THREE.Group).isGroup !== true && (obj as THREE.Mesh).isMesh !== true) return;
        const r = obj.rotation;
        if (r.x !== 0 || r.y !== 0 || r.z !== 0) {
          out.push({ name: obj.name || obj.type, x: +r.x.toFixed(4), y: +r.y.toFixed(4), z: +r.z.toFixed(4) });
        }
      });
      return out;
    },
    root: state,
    info() {
      const cam = state.camera as THREE.PerspectiveCamera;
      return {
        product: getProduct(),
        tier: viewport.tier,
        isMobile: viewport.isMobile,
        coarse: viewport.coarse,
        fov: cam.fov,
        aspect: cam.aspect,
        camPos: [cam.position.x, cam.position.y, cam.position.z],
        camRotX: cam.rotation.x,
        size: [state.size.width, state.size.height],
        dpr: state.viewport.dpr,
        scrollTarget: productScroll.target,
        scrollCurrent: productScroll.current,
        driven: productScroll.driven,
      };
    },
  };

  (window as unknown as { __measure?: MeasureApi }).__measure = api;
  return () => {
    delete (window as unknown as { __measure?: MeasureApi }).__measure;
  };
}
