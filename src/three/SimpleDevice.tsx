import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { motionState } from "../motion";
import { SCENE, useTheme } from "../theme";
import { StageGlow } from "./FmcDevice";

/**
 * Single-mesh product showcase — the honest counterpart to FmcDevice.
 *
 * Some exports arrive as ONE merged mesh with no node split (Galileosky
 * 10: 624k verts, 1,000,000 triangles, a single material). There is no
 * part structure to separate, so this component never pretends there is
 * one: it centers and scale-normalizes the model, lights it with the same
 * theme-driven stage halo the FMC viewer uses, and turns it slowly so the
 * form reads from every side.
 *
 * Deliberately NOT scroll-coupled: no runway, no productScroll listener.
 * A product on this viewer is a plain document in detail mode, which also
 * keeps it clear of the exploded view's scroll track by construction.
 *
 * Normalization, theme tinting and unmount disposal mirror FmcDevice's
 * contracts exactly, so switching between the two viewers leaves no GPU
 * resources behind.
 */

export type SimpleDeviceId = "galileosky10";

interface SimpleConfig {
  readonly url: string;
  /** Normalized footprint: largest bbox dimension → this many world units. */
  readonly span: number;
  /** Constant yaw bringing the model's large face to the camera. Applied
   *  outside any locale mirror — the camera trucks sideways but stays on
   *  +Z, so the same face must front the viewer in both locales. */
  readonly baseYaw: number;
  /** Radians per second of idle turn (0 under reduced motion). */
  readonly spin: number;
}

const CONFIGS: Record<SimpleDeviceId, SimpleConfig> = {
  // Source bbox 0.046 × 0.120 × 0.173 — thin along X like the Galileosky
  // terminal, so it takes the same quarter turn to face the viewer.
  galileosky10: {
    url: "/models/galileosky10.glb",
    span: 2.2,
    baseYaw: Math.PI / 2,
    spin: 0.16,
  },
};

/** Warm one GLB ahead of its segment, same contract as preloadFmc. */
export function preloadSimple(id: SimpleDeviceId): void {
  useGLTF.preload(CONFIGS[id].url, false, true);
}

export function SimpleDevice({ id }: { id: SimpleDeviceId }): JSX.Element {
  const mode = useTheme();
  const glow = SCENE[mode].stageGlow;
  return (
    <Suspense fallback={null}>
      {glow !== null && <StageGlow color={glow} />}
      <SimpleModel id={id} />
    </Suspense>
  );
}

function SimpleModel({ id }: { id: SimpleDeviceId }): JSX.Element {
  const cfg = CONFIGS[id];
  const group = useRef<THREE.Group>(null);
  const entrance = useRef(motionState.reduced ? 1 : 0);
  const mode = useTheme();

  const gltf = useGLTF(cfg.url, false, true);

  // ── Auto-centering + scale normalization (Box3 on mount) ──────────────
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return {
      scale: cfg.span / Math.max(size.x, size.y, size.z, 1e-4),
      offset: [-center.x, -center.y, -center.z] as const,
    };
  }, [gltf.scene, cfg]);

  // Theme tint on CLONES — the cached source materials are shared with the
  // loader cache and must not be mutated in place.
  const originals = useMemo(() => {
    const map = new Map<THREE.Mesh, THREE.Material>();
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh === true && !Array.isArray(mesh.material)) map.set(mesh, mesh.material);
    });
    return map;
  }, [gltf.scene]);

  const themed = useMemo(() => {
    const P = SCENE[mode];
    const clones = new Map<THREE.Material, THREE.Material>();
    originals.forEach((source) => {
      if (clones.has(source)) return;
      const clone = source.clone();
      if (clone instanceof THREE.MeshStandardMaterial) clone.color.set(P.deviceTint);
      clones.set(source, clone);
    });
    return clones;
  }, [originals, mode]);

  useEffect(() => {
    originals.forEach((source, mesh) => {
      const clone = themed.get(source);
      if (clone !== undefined) mesh.material = clone;
    });
    return () => {
      themed.forEach((clone) => {
        clone.dispose();
      });
    };
  }, [originals, themed]);

  // ── Unmount teardown: everything the GLB brought in goes back out ─────
  useEffect(() => {
    const scene = gltf.scene;
    const materials = gltf.materials;
    const url = cfg.url;
    return () => {
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh === true) mesh.geometry.dispose();
      });
      Object.values(materials).forEach((material) => {
        const std = material as THREE.MeshStandardMaterial;
        std.map?.dispose();
        std.normalMap?.dispose();
        std.metalnessMap?.dispose();
        std.roughnessMap?.dispose();
        std.aoMap?.dispose();
        std.emissiveMap?.dispose();
        material.dispose();
      });
      useGLTF.clear(url);
    };
  }, [gltf.scene, gltf.materials, cfg.url]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const reduced = motionState.reduced;

    entrance.current = Math.min(1, entrance.current + dt * 0.55);
    const inE = 1 - Math.pow(1 - entrance.current, 3);

    const g = group.current;
    if (g === null) return;

    // Reduced motion gets the final static state: settled pose, facing the
    // viewer, no turn and no float.
    const float = reduced ? 0 : Math.sin(t * 0.9) * 0.05;
    g.scale.setScalar(Math.max(0.001, lerpIn(inE)));
    g.position.set(0, 0.15 + float - (1 - inE) * 1.6, 0);
    g.rotation.y = cfg.baseYaw + (reduced ? 0 : t * cfg.spin) + (1 - inE) * 0.9;
    g.rotation.x = reduced ? 0 : Math.sin(t * 0.5) * 0.04;
  });

  return (
    <group ref={group}>
      {/* Normalization wrapper: uniform fit scale, then the pivot shift
          that puts the model's own center on the group origin. */}
      <group scale={norm.scale}>
        <group position={norm.offset}>
          <primitive object={gltf.scene} />
        </group>
      </group>
    </group>
  );
}

/** Entrance scale ramp — matches FmcDevice's 0.6 → 1 settle. */
function lerpIn(inE: number): number {
  return 0.6 + (1 - 0.6) * inE;
}
