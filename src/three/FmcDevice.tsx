import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { FMC130_CALLOUTS, FMC920_CALLOUTS } from "../content";
import type { PartCallout } from "../content";
import { getLocale, useLocale } from "../locale";
import { lerp, motionState, phase } from "../motion";
import { dampProductScroll } from "../productScroll";
import { useIsMobile, useViewportTier } from "../responsive";
import { SCENE, useTheme } from "../theme";

/**
 * The FMC teardown pair: Teltonika-style vehicle units whose GLBs ship
 * four REAL part nodes each (3d_model/FMC{130,920} → public/models via
 * scripts/optimize-models.mjs), so this showcase runs a true scroll-driven
 * exploded view — no faked slicing:
 *
 *  · FMC130 — front housing (label plate), sealed back housing, side
 *    connector port, bottom mounting rail. The housings part along the
 *    device's thickness like an opened chassis.
 *  · FMC920 — the sealed unit, its vehicle power harness (the coiled
 *    wiring loop behind it) and the quick-release connector pieces: the
 *    explosion reads as the unit unplugging from its install harness.
 *
 * One input drives everything: productScroll (0 assembled → 1 exploded),
 * attached by ProductsPage over the runway section and damped here once
 * per frame. Part positions are authored-home + offset·phase(t), so
 * scrolling back to 0 restores the EXACT original assembly. Reduced
 * motion pins the pose assembled and static.
 *
 * Axis note: both GLBs are authored label-face toward +Z (verified by
 * test renders) — the devices' front/back axis ("Y" in the Blender-style
 * source convention) lands on engine Z after the exporter's Y-up
 * conversion, so the parts separate along Z and a presentation turn
 * swings the spread across the screen as it opens.
 */

export type FmcId = "fmc130" | "fmc920";

/** Engine axis the parts separate along (the devices' front/back). */
const EXPLODE_AXIS: "x" | "y" | "z" = "z";
/** Travel of the outermost parts at full explosion, in multiples of the
 *  model's depth along EXPLODE_AXIS (per-part trims in CONFIGS scale it). */
const EXPLODE_DISTANCE = 0.9;
/** Minimum separation every part gets — keeps near-center parts from
 *  reading as glued to their neighbors. Same units as EXPLODE_DISTANCE. */
const EXPLODE_MIN_SEP = 0.18;
/** Per-part stagger: each part's travel window starts this much later
 *  than the previous one's (outermost first), so the opening feels
 *  layered instead of rigid. */
const EXPLODE_STAGGER = 0.07;

interface FmcPartSpec {
  /** Callout id (FMC*_CALLOUTS) whose chip anchors on this part. */
  readonly callout?: string;
  /** Chip anchor offset from the part's exploded center (normalized units). */
  readonly labelAt?: readonly [number, number, number];
  /** Per-part travel trim on the shared explode distance. */
  readonly travel?: number;
}

interface FmcConfig {
  readonly url: string;
  /** Normalized footprint: largest bbox dimension → this many world units. */
  readonly span: number;
  /** Extra trim on the explode travel — the FMC920 normalizes much larger
   *  (its source is tiny), so its spread needs reining in. */
  readonly explodeScale: number;
  /** Group scale at full explosion keeps the widened spread in frame. */
  readonly explodedScale: number;
  /** Presentation yaw at full explosion — enough to read the Z-spread as
   *  depth, small enough that the label faces keep talking to the camera. */
  readonly openYaw: number;
  readonly callouts: readonly PartCallout[];
  /** Node name (sanitized: lowercase alphanumerics — three.js strips the
   *  dots from "root.0.refined") → part behavior. */
  readonly parts: Readonly<Record<string, FmcPartSpec>>;
}

const CONFIGS: Record<FmcId, FmcConfig> = {
  fmc130: {
    // fmc130-lite.glb (512px textures) exists as the aggressive option,
    // but its label face visibly degrades for only ~12% size — the mesh
    // itself is simplification-locked (AI seam topology), so textures are
    // the whole saving. Standard stays live; swap the URL to trade.
    url: "/models/fmc130.glb",
    span: 2.55,
    explodeScale: 1,
    explodedScale: 0.88,
    openYaw: -0.6,
    callouts: FMC130_CALLOUTS,
    parts: {
      root1: { callout: "f130-front", labelAt: [-0.8, 1.3, 0.45] },
      root0refined: { callout: "f130-back", labelAt: [1.5, -1.2, -0.4] },
      root2: { callout: "f130-port", labelAt: [-1.25, -0.4, 0], travel: 1.6 },
      root3: { callout: "f130-rail", labelAt: [1.5, -0.6, 0.2], travel: 1.4 },
    },
  },
  fmc920: {
    url: "/models/fmc920.glb",
    span: 2.2,
    explodeScale: 0.33,
    explodedScale: 0.86,
    openYaw: -0.48,
    callouts: FMC920_CALLOUTS,
    parts: {
      root0: { callout: "f920-unit", labelAt: [-0.3, 1.05, 0.35], travel: 0.8 },
      root1: { callout: "f920-harness", labelAt: [1.35, -0.85, -0.4], travel: 1.7 },
      root2: { callout: "f920-plug", labelAt: [-1.6, 0.05, 0.1], travel: 0.45 },
      root3: { travel: 0.45 },
    },
  },
};

/** Warm both GLBs — called by ProductsPage on mount, so the fetch starts
 *  when the lineup appears rather than at app load (they're the heaviest
 *  assets in the project). Draco OFF (CDN decoder), meshopt ON (bundled). */
export function preloadFmcModels(): void {
  useGLTF.preload(CONFIGS.fmc130.url, false, true);
  useGLTF.preload(CONFIGS.fmc920.url, false, true);
}

/** Node-name key: three's GLTFLoader sanitizes "root.0.refined" into
 *  "root0refined" — normalize the same way so the config map matches. */
function partKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface PartState {
  readonly node: THREE.Object3D;
  /** Authored local position — the assembled pose this part returns to. */
  readonly home: THREE.Vector3;
  /** Full-explosion travel along EXPLODE_AXIS, in source units. */
  readonly offset: number;
  /** Stagger window [start, end] on the 0..1 explode progress. */
  readonly window: readonly [number, number];
  /** Chip content + anchor (normalized space), when this part narrates. */
  readonly chip?: { readonly callout: PartCallout; readonly at: readonly [number, number, number] };
}

/** Suspense shell: the GLB decodes off the critical path — the stage's
 *  lights and the page DOM never wait on it. */
export function FmcDevice({ id }: { id: FmcId }): JSX.Element {
  return (
    <Suspense fallback={null}>
      <FmcModel id={id} />
    </Suspense>
  );
}

function FmcModel({ id }: { id: FmcId }): JSX.Element {
  const cfg = CONFIGS[id];
  const group = useRef<THREE.Group>(null);
  const chipRefs = useRef<Array<HTMLDivElement | null>>([]);
  const entrance = useRef(motionState.reduced ? 1 : 0);
  // Chip <Html> portals recompute a screen-space transform EVERY frame
  // while mounted — they mount only once the teardown is well open (and
  // never under reduced motion; the DOM spec table carries the content).
  const [chipsLive, setChipsLive] = useState(false);
  const chipsLiveRef = useRef(false);
  const mode = useTheme();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const tier = useViewportTier();

  const gltf = useGLTF(cfg.url, false, true);

  // ── Auto-centering + scale normalization (Box3 on mount) ──────────────
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = cfg.span / Math.max(size.x, size.y, size.z, 1e-4);
    return {
      scale,
      size,
      center,
      offset: [-center.x, -center.y, -center.z] as const,
    };
  }, [gltf.scene, cfg]);

  /* Part table: each mesh node's assembled home, its explode travel along
     EXPLODE_AXIS (proportional to where it sits relative to the model
     center — front parts fly front, back parts fly back — plus a minimum
     separation), a stagger window ranked outermost-first, and its chip
     anchor at the exploded position. Computed ONCE per load: the loader
     cache is cleared on unmount, so the scene always arrives assembled. */
  const parts = useMemo<readonly PartState[]>(() => {
    const axis = EXPLODE_AXIS;
    const half = Math.max((axis === "x" ? norm.size.x : axis === "y" ? norm.size.y : norm.size.z) / 2, 1e-4);
    const depth = half * 2;
    const meshes: THREE.Object3D[] = [];
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh === true) meshes.push(obj);
    });

    const raw = meshes.map((node) => {
      const box = new THREE.Box3().setFromObject(node);
      const center = box.getCenter(new THREE.Vector3());
      const rel = center[axis] - norm.center[axis];
      const spec = cfg.parts[partKey(node.name)];
      const sign = rel === 0 ? 1 : Math.sign(rel);
      const travel = spec?.travel ?? 1;
      const offset =
        (rel / half) * EXPLODE_DISTANCE * depth * cfg.explodeScale * travel +
        sign * EXPLODE_MIN_SEP * depth * cfg.explodeScale * travel;
      return { node, center, spec, offset };
    });

    // Outermost parts open first; inner ones follow — layered, not rigid.
    const order = [...raw].sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
    return raw.map((r) => {
      const rank = order.indexOf(r);
      const start = 0.04 + rank * EXPLODE_STAGGER;
      const callout =
        r.spec?.callout !== undefined ? cfg.callouts.find((c) => c.id === r.spec?.callout) : undefined;
      const exploded = new THREE.Vector3()
        .copy(r.center)
        .sub(norm.center)
        .multiplyScalar(norm.scale);
      exploded[EXPLODE_AXIS] += r.offset * norm.scale;
      return {
        node: r.node,
        home: r.node.position.clone(),
        offset: r.offset,
        window: [start, Math.min(start + 0.72, 0.98)] as const,
        ...(callout !== undefined && r.spec?.labelAt !== undefined
          ? {
              chip: {
                callout,
                at: [
                  exploded.x + r.spec.labelAt[0],
                  exploded.y + r.spec.labelAt[1],
                  exploded.z + r.spec.labelAt[2],
                ] as const,
              },
            }
          : {}),
      };
    });
  }, [gltf.scene, cfg, norm]);

  // Every mesh casts onto the daylight shadow catcher AND self-receives
  // the key light — normalBias at the light kills acne.
  useEffect(() => {
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh === true) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [gltf.scene]);

  /* Material harmony: keep the authored PBR set and re-grade it per theme
     via cloned materials — same contract as the Tracker (daylight runs the
     texture untouched, the night room pulls it toward the navy alloy).
     Clones per theme; the loader's originals stay pristine clone sources. */
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
  // Geometries + source materials + their textures, then the loader cache
  // entry, so the next mount (product switch back, or a route return)
  // reloads from a clean slate — with every part back at its authored home.
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

    // The one scroll input, damped here (this scene is productScroll's
    // only 3D consumer). Reduced motion pins the device assembled.
    const explode = reduced ? 0 : dampProductScroll(dt);

    const live = !reduced && entrance.current >= 1 && explode > 0.5;
    if (live !== chipsLiveRef.current) {
      chipsLiveRef.current = live;
      setChipsLive(live);
    }

    // Parts: authored home + travel·phase — exact reassembly at 0 by
    // construction, whatever path the scroll took.
    for (const p of parts) {
      const k = phase(explode, p.window[0], p.window[1]);
      p.node.position.copy(p.home);
      p.node.position[EXPLODE_AXIS] += p.offset * k;
    }

    const g = group.current;
    if (g !== null) {
      // Presentation turn: assembled faces the viewer dead-on; as the
      // chassis opens, a three-quarter swing + slight pitch turns the
      // Z-spread across the screen so the separation reads as depth
      // instead of scale. Idle float keeps held frames alive.
      const open = phase(explode, 0.04, 0.78);
      const float = reduced ? 0 : Math.sin(t * 0.9) * 0.05;
      const sway = reduced ? 0 : Math.sin(t * 0.4) * 0.05 * (1 - open);
      g.scale.setScalar(
        Math.max(0.001, lerp(0.6, 1, inE) * lerp(1, cfg.explodedScale, phase(explode, 0.2, 0.9))),
      );
      g.position.set(0, 0.15 + 0.12 * open + float - (1 - inE) * 1.6, 0);
      // The camera rig mirrors its pose for LTR — mirror the opening turn
      // with it, so the Z-spread swings ACROSS the screen in both locales
      // instead of stacking into the view axis on one of them.
      const mx = getLocale() === "en" ? -1 : 1;
      g.rotation.y = mx * (cfg.openYaw * open + (1 - inE) * 0.9) + sway;
      g.rotation.x = reduced ? 0 : Math.sin(t * 0.5) * 0.03 + 0.15 * open;
    }

    // Chips fade in across the last stretch of the opening, one after
    // another, and back out in reverse on the way down.
    let chipIndex = 0;
    for (const p of parts) {
      if (p.chip === undefined) continue;
      const el = chipRefs.current[chipIndex];
      if (el !== null && el !== undefined) {
        const o = phase(explode, 0.74 + chipIndex * 0.05, 0.88 + chipIndex * 0.05);
        el.style.opacity = String(o);
        el.style.transform = `translateY(${String((1 - o) * 8)}px)`;
      }
      chipIndex += 1;
    }
  });

  // Narrow frames pull the chip ring in — every chip must stay inside its
  // zone (phone stack / tablet half); mobile also renders compact.
  const squeeze = isMobile ? 0.72 : tier === "tablet" ? 0.86 : 1;
  let chipIndex = -1;

  return (
    <group ref={group}>
      {/* Normalization wrapper: uniform fit scale, then the pivot shift
          that parks the bbox center exactly on the group origin. */}
      <group scale={norm.scale}>
        <group position={norm.offset}>
          <primitive object={gltf.scene} />
        </group>
      </group>

      {chipsLive &&
        parts.map((p) => {
          if (p.chip === undefined) return null;
          chipIndex += 1;
          const refIndex = chipIndex;
          const { callout, at } = p.chip;
          return (
            <Html
              key={callout.id}
              center
              distanceFactor={isMobile ? 4.5 : 5.5}
              position={[at[0] * squeeze, at[1] * squeeze, at[2] * squeeze]}
              zIndexRange={[20, 11]}
            >
              <div
                className="callout"
                ref={(el) => {
                  chipRefs.current[refIndex] = el;
                }}
              >
                <span className="callout-en">{callout.tag}</span>
                <span className="callout-ar">{callout.desc[locale]}</span>
                <span className="callout-spec">{callout.spec}</span>
              </div>
            </Html>
          );
        })}
    </group>
  );
}
