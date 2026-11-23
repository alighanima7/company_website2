import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { homeScroll } from "../homeScroll";
import { motionState, phase } from "../motion";
import { useIsMobile } from "../responsive";
import { SCENE, useTheme } from "../theme";

/**
 * The 3D brand mark (3d_model/logo → public/models/logo.glb via
 * scripts/optimize-models.mjs: 500k→~67k tris, 1024px WebP, meshopt — with
 * the generator's loose emissive map wired in, so the palm's mint strokes
 * glow under the dark theme's bloom).
 *
 * Act 0 of the Home depth film: the emblem OWNS the foreground Z-plane
 * (z≈3.6, between the lens and the deep-parked map), breathing in place
 * while the hero copy reads. Across the passage (homeScroll 0.36→0.68) it
 * advances along +Z toward the viewer, growing and fading as it sweeps
 * past the lens — the fade completes while the emblem is still ~1 world
 * unit in front of the near plane, so there is never a clipped
 * cross-section — then `visible=false` hands the stage to the map.
 * Scrubbing back replays everything in reverse.
 *
 * Same lifecycle contract as the tracker GLB: Box3 re-pivot + normalize,
 * shadows on every mesh, per-theme material clones (transparent — the
 * Z-exit drives their opacity), full disposal on unmount including the
 * loader cache entry.
 */

const MODEL_URL = "/models/logo.glb";

/** The emblem is taller than wide — normalize its HEIGHT to this span so
 *  it balances against the map slab in the Home composition. */
const LOGO_SPAN = 2.3;

useGLTF.preload(MODEL_URL, false, true);

export function Logo3D(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LogoModel />
    </Suspense>
  );
}

function LogoModel(): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const entrance = useRef(motionState.reduced ? 1 : 0);
  /** Theme clones, flat list for the per-frame opacity write. */
  const fadeMats = useRef<THREE.Material[]>([]);
  const mode = useTheme();
  const isMobile = useIsMobile();

  const gltf = useGLTF(MODEL_URL, false, true);

  // Box3 on mount: re-pivot the emblem's center to the group origin and
  // normalize scale (the raw export stands on y=0 in its own units).
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = LOGO_SPAN / Math.max(size.x, size.y, size.z, 1e-4);
    return { scale, offset: [-center.x, -center.y, -center.z] as const };
  }, [gltf.scene]);

  useEffect(() => {
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh === true) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [gltf.scene]);

  /* Theme grade: the authored teal + mint read is the brand — both themes
     keep it untinted and only the baked emissive breathes with the rig
     (a hint in daylight, bloom fuel at night). */
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
      if (clone instanceof THREE.MeshStandardMaterial) {
        clone.emissive.set("#ffffff");
        clone.emissiveIntensity = P.logoEmissive;
      }
      // The Z-exit fades the whole emblem out through the lens sweep.
      clone.transparent = true;
      clones.set(source, clone);
    });
    return clones;
  }, [originals, mode]);

  useEffect(() => {
    originals.forEach((source, mesh) => {
      const clone = themed.get(source);
      if (clone !== undefined) mesh.material = clone;
    });
    fadeMats.current = [...themed.values()];
    return () => {
      fadeMats.current = [];
      themed.forEach((clone) => {
        clone.dispose();
      });
    };
  }, [originals, themed]);

  // Unmount teardown — geometries, source materials + textures, cache.
  useEffect(() => {
    const scene = gltf.scene;
    const materials = gltf.materials;
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
        std.emissiveMap?.dispose();
        std.aoMap?.dispose();
        material.dispose();
      });
      useGLTF.clear(MODEL_URL);
    };
  }, [gltf.scene, gltf.materials]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const reduced = motionState.reduced;
    const p = homeScroll.current;

    // Entrance ages even while hidden, so a deep-linked load that starts
    // past the passage has it finished before any scrub back up.
    entrance.current = Math.min(1, entrance.current + dt * 0.6);
    const inE = 1 - Math.pow(1 - entrance.current, 3);

    const g = group.current;
    if (g === null) return;

    // ── Z-exit gate: past the passage the emblem is gone outright ──────
    // (no invisible flight math, no transparent draw) until a scrub back
    // below the boundary replays the sweep in reverse.
    if (p >= 0.7) {
      if (g.visible) g.visible = false;
      return;
    }
    g.visible = true;

    // The passage: advance along +Z toward the viewer, grow, then fade —
    // opacity hits zero while the emblem is still well short of the lens
    // (the camera dollies to z≈9.7 by then; nothing ever crosses the
    // near plane while visible).
    const adv = phase(p, 0.36, 0.68);
    const fade = 1 - phase(p, 0.5, 0.68);

    // Foreground anchor: on-axis at its depth plane (the look ray passes
    // y≈1.0 at z≈3.6), mobile a notch higher for the stacked tilt. The
    // idle breath and swing calm as the flight takes over; the entrance
    // is itself a Z-approach from the deep.
    // Phones dolly the lens further out — the emblem compensates with a
    // fuller fit and a closer depth plane to keep its foreground read.
    const fit = isMobile ? 0.95 : 1;
    const breathe = reduced ? 0 : Math.sin(t * 0.7) * 0.05 * (1 - adv);
    g.scale.setScalar(Math.max(0.001, fit * (0.86 + 0.14 * inE) * (1 + 0.45 * adv)));
    g.position.set(
      0,
      (isMobile ? 1.45 : 1.02) + breathe,
      (isMobile ? 4.2 : 3.6) + adv * 5.2 - (1 - inE) * 6.5,
    );
    g.rotation.y = (reduced ? 0 : Math.sin(t * 0.32) * 0.3 * (1 - adv)) + (1 - inE) * 0.6;

    fadeMats.current.forEach((m) => {
      m.opacity = fade;
    });
  });

  return (
    <group ref={group}>
      <group scale={norm.scale}>
        <group position={norm.offset}>
          <primitive object={gltf.scene} />
        </group>
      </group>
    </group>
  );
}
