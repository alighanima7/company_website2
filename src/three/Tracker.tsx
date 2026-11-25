import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { PART_CALLOUTS } from "../content";
import { useLocale } from "../locale";
import { clamp01, lerp, motionState, phase } from "../motion";
import { FLAGS, timedFrame } from "../perf/probe";
import { BROWSE_PEAK, dampProductScroll, productScroll, productTurn } from "../productScroll";
import { applyBackDim, backDimScale, captureDimBase } from "./backDim";
import { useIsMobile, useViewportTier } from "../responsive";
import { SCENE, useTheme } from "../theme";

/**
 * The flagship product: the NNS telematics tracker — the real hardware
 * model (3d_model/product → public/models/tracker.glb via
 * scripts/optimize-models.mjs: 1M→134k tris at 0.1% error, 1024px WebP,
 * meshopt; 46MB→2.5MB). Decoding is fully local: meshopt's decoder ships
 * inside three-stdlib and WebP is a browser codec — no CDN wasm.
 *
 * Products-page showcase: the unit floats and turns continuously while an
 * inspection cycle runs on the clock — mint scan markers light up on the
 * hardware and the HUD callouts ring it in two alternating waves (the GLB
 * is one fused mesh, so the act is a presentation, not a part explosion).
 * Mount plays a converge-from-below entrance; unmount (switching product
 * or leaving the page) disposes geometry, textures, material clones and
 * the loader cache entry.
 */

const MODEL_URL = "/models/tracker.glb";

/** Normalized footprint: the GLB's largest bbox dimension maps to this many
 *  world units — the framing contract every stage pose and callout radius
 *  is authored against. */
const TRACKER_SPAN = 2.5;

/** Inspection cycle period (seconds): wave 0 presents, hands off to wave 1,
 *  then a beat of rest before the cycle repeats. */
const CYCLE = 11;

// Start the fetch at module-eval time. Draco OFF (its decoder lives on a
// CDN), meshopt ON (decoder bundled in three-stdlib).
useGLTF.preload(MODEL_URL, false, true);

interface SpotSpec {
  /** PART_CALLOUTS id this spot narrates. */
  readonly id: string;
  /** Scan-marker dot, resting ON the hardware (normalized device space). */
  readonly at: readonly [number, number, number];
  /** HUD chip anchor. Anti-collision rules (the device yaws continuously,
   *  so only VERTICAL separation is rotation-proof): per-wave y-tiers
   *  ≥1.3 apart, radius ≤ ~2.4 so no chip swings past the viewport edge,
   *  top cap ≤ 2.05 clear of the toggle corner on the model's side. */
  readonly labelAt: readonly [number, number, number];
  /** Reveal wave 0|1 — three chips per wave always fit the vertical safe
   *  band; six at once cannot on short/wide viewports. */
  readonly wave: 0 | 1;
}

/** Normalized device half-extents are ≈ [1.25, 0.57, 0.31] — `at` points sit
 *  on the housing's features, `labelAt` chips ring the silhouette. */
const SPOTS: readonly SpotSpec[] = [
  { id: "gps", at: [-0.78, 0.34, 0.14], labelAt: [-1.5, 0.75, 0.3], wave: 0 },
  { id: "pcb", at: [-0.3, 0.5, -0.05], labelAt: [-0.5, 2.05, -0.2], wave: 0 },
  { id: "shell", at: [0.1, -0.45, 0.26], labelAt: [0.1, -1.45, 0.4], wave: 0 },
  { id: "canbus", at: [0.95, 0.05, -0.1], labelAt: [1.7, 0.55, -0.2], wave: 1 },
  { id: "battery", at: [0.6, -0.3, 0.18], labelAt: [1.2, -0.8, 0.5], wave: 1 },
  { id: "antenna", at: [0.42, 0.52, -0.12], labelAt: [0.8, 1.9, -0.3], wave: 1 },
];

const SPOT_WAVE = new Map<string, 0 | 1>(SPOTS.map((s) => [s.id, s.wave]));

/** Suspense shell: the GLB decodes off the critical path — the stage's
 *  lights and the page DOM never wait on it. */
export function Tracker(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <TrackerModel />
    </Suspense>
  );
}

function TrackerModel(): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const dotRefs = useRef<Array<THREE.Mesh | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const entrance = useRef(motionState.reduced ? 1 : 0);
  // Callout <Html> portals recompute a screen-space transform EVERY frame
  // while mounted — they mount only once the entrance has settled (and
  // never under reduced motion; the DOM spec table carries the content).
  const [calloutsLive, setCalloutsLive] = useState(false);
  const calloutsLiveRef = useRef(false);
  const mode = useTheme();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const tier = useViewportTier();

  const gltf = useGLTF(MODEL_URL, false, true);

  // ── Auto-centering + scale normalization (Box3 on mount) ──────────────
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = TRACKER_SPAN / Math.max(size.x, size.y, size.z, 1e-4);
    return {
      scale,
      offset: [-center.x, -center.y, -center.z] as const,
    };
  }, [gltf.scene]);

  // Every mesh casts onto the daylight shadow catcher AND self-receives the
  // key light (ribbed housing shading) — normalBias at the light kills acne.
  useEffect(() => {
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh === true) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [gltf.scene]);

  /* Material harmony: keep the authored PBR set (albedo carries the ports,
     screws and connector detail; the normal map the bevels; the MR map the
     metal/plastic split) and re-grade it per theme via a cloned material —
     daylight runs the texture untouched (it IS the charcoal identity), the
     night room pulls it cool toward the navy alloy. Clones per theme, the
     loader's originals kept pristine as clone sources. */
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

  const dimBase = useMemo(() => captureDimBase(themed.values()), [themed]);

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

  /* Scan markers: the platform's mint LED voice, pulsing on the hardware's
     features while their callout wave is live. */
  const dotGeometry = useMemo(() => new THREE.SphereGeometry(0.05, 12, 12), []);
  const dotMaterial = useMemo(() => {
    const P = SCENE[mode];
    return new THREE.MeshStandardMaterial({
      color: P.ledBase,
      emissive: P.ledEmissive,
      emissiveIntensity: P.emissiveEmerald,
      roughness: 0.4,
    });
  }, [mode]);
  useEffect(() => {
    return () => {
      dotMaterial.dispose();
    };
  }, [dotMaterial]);

  // ── Unmount teardown: everything the GLB brought in goes back out ─────
  // Geometries + source materials + their textures, then the drei/useLoader
  // cache entry, so the next mount (product switch back, or a route return)
  // reloads from a clean slate instead of touching disposed GPU resources.
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
        std.aoMap?.dispose();
        std.emissiveMap?.dispose();
        material.dispose();
      });
      useGLTF.clear(MODEL_URL);
    };
  }, [gltf.scene, gltf.materials]);

  useEffect(() => {
    return () => {
      dotGeometry.dispose();
    };
  }, [dotGeometry]);

  useFrame(timedFrame("frame:tracker", (state, dt) => {
    const t = state.clock.elapsedTime;
    const reduced = motionState.reduced;

    entrance.current = Math.min(1, entrance.current + dt * 0.55);
    const inE = 1 - Math.pow(1 - entrance.current, 3);

    const live = !reduced && entrance.current >= 1;
    if (live !== calloutsLiveRef.current) {
      calloutsLiveRef.current = live;
      setCalloutsLive(live);
    }

    // Browse scrubs this scene; detail mode (no runway for this product)
    // leaves it on the clock. Normalized because browse caps at
    // BROWSE_PEAK and that is the only scroll range this scene ever sees.
    const scrub = productScroll.driven && !reduced;
    const s = scrub ? clamp01(dampProductScroll(dt) / BROWSE_PEAK) : 0;
    const turn = scrub ? productTurn() : 0;

    // Inspection: two chip waves. SCRUBBED they are driven by scroll
    // position (wave 0 opens on the way in, wave 1 near the peak) so the
    // reveal is deterministic and reverses exactly; otherwise they run on
    // the clock cycle as before.
    const cyc = scrub ? s : reduced ? 0 : ((t % CYCLE) + CYCLE) % CYCLE / CYCLE;
    // The two waves must stay MUTUALLY EXCLUSIVE: three chips per wave fit
    // the vertical safe band, six at once do not. Scrubbed, wave 0 opens
    // on the way in and closes before wave 1 takes the peak — and because
    // `s` rises then falls, the sequence reads 0 → 1 → 0 across the track.
    const wave0 = live
      ? scrub
        ? phase(s, 0.15, 0.4) * (1 - phase(s, 0.55, 0.75))
        : phase(cyc, 0.08, 0.16) * (1 - phase(cyc, 0.4, 0.48))
      : 0;
    const wave1 = live
      ? scrub
        ? phase(s, 0.72, 0.88)
        : phase(cyc, 0.52, 0.6) * (1 - phase(cyc, 0.86, 0.94))
      : 0;
    const inspect = scrub ? s : Math.min(1, wave0 + wave1);

    const g = group.current;
    if (g !== null) {
      g.visible = true;
      g.scale.setScalar(
        Math.max(0.001, lerp(0.6, 1, inE) * (1 + 0.07 * inspect) * backDimScale(turn)),
      );
      const idle = scrub ? 0.35 : 1;
      const float = reduced ? 0 : Math.sin(t * 0.9) * 0.05 * idle;
      g.position.set(0, 0.15 + 0.18 * inspect + float - (1 - inE) * 1.6, 0);
      // Scrubbed: ONE full revolution, monotonic and eased to a stop at
      // both ends, so the swap always lands square-on and the eye is
      // never asked to follow a direction reversal. Otherwise the
      // continuous presentation turn. Reduced motion holds still.
      const yaw = scrub ? turn : reduced ? 0 : t * 0.16;
      g.rotation.y = yaw + (1 - inE) * 0.9;
      g.rotation.x = (reduced ? 0 : Math.sin(t * 0.5) * 0.04 * idle) + inspect * 0.14;
    }

    applyBackDim(dimBase, turn, SCENE[mode].canvas);

    const waveOpacity: readonly [number, number] = [wave0, wave1];

    SPOTS.forEach((spot, i) => {
      const dot = dotRefs.current[i];
      if (dot === undefined || dot === null) return;
      const o = waveOpacity[spot.wave] ?? 0;
      dot.visible = o > 0.02;
      // Breathing pulse, de-synced per dot so the ring reads as live
      // instruments rather than a blinking array.
      dot.scale.setScalar(Math.max(0.001, o * (1 + Math.sin(t * 3.4 + i * 1.7) * 0.12)));
    });

    labelRefs.current.forEach((el, idx) => {
      if (el !== null) {
        const id = PART_CALLOUTS[idx]?.id;
        const o = waveOpacity[(id !== undefined ? SPOT_WAVE.get(id) : 0) ?? 0] ?? 0;
        el.style.opacity = String(o);
        el.style.transform = `translateY(${String((1 - o) * 8)}px)`;
      }
    });
  }));

  const calloutFor = (spot: SpotSpec): JSX.Element | null => {
    const index = PART_CALLOUTS.findIndex((c) => c.id === spot.id);
    const callout = PART_CALLOUTS[index];
    if (callout === undefined) return null;
    // Narrow frames pull the chip ring in — every chip must stay inside its
    // zone (phone stack / tablet half); mobile also renders compact.
    const squeeze = isMobile ? 0.75 : tier === "tablet" ? 0.86 : 1;
    return (
      <Html
        center
        distanceFactor={isMobile ? 4.5 : 5.5}
        position={[spot.labelAt[0] * squeeze, spot.labelAt[1] * squeeze, spot.labelAt[2] * squeeze]}
        zIndexRange={[20, 11]}
      >
        <div
          className="callout"
          ref={(el) => {
            labelRefs.current[index] = el;
          }}
        >
          <span className="callout-en">{callout.tag}</span>
          <span className="callout-ar">{callout.desc[locale]}</span>
          <span className="callout-spec">{callout.spec}</span>
        </div>
      </Html>
    );
  };

  return (
    <group ref={group}>
      {/* Normalization wrapper: uniform fit scale, then the pivot shift
          that parks the bbox center exactly on the group origin. */}
      <group scale={norm.scale}>
        <group position={norm.offset}>
          <primitive object={gltf.scene} />
        </group>
      </group>

      {SPOTS.map((spot, i) => (
        <group key={spot.id}>
          <mesh
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            position={spot.at}
            visible={false}
            geometry={dotGeometry}
            material={dotMaterial}
          />
          {calloutsLive && !FLAGS.nohtml && calloutFor(spot)}
        </group>
      ))}
    </group>
  );
}
