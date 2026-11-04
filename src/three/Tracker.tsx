import { Html, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { PART_CALLOUTS, PHASES } from "../content";
import { useLocale } from "../locale";
import { useIsMobile, viewport } from "../responsive";
import { clamp01, lerp, phase, scrollState } from "../scroll";
import { SCENE, useTheme } from "../theme";

/**
 * The hero object: a procedural NNS telematics tracker, built entirely from
 * primitives (no model files exist for this product — and a stylized,
 * manifesto-grade device reads better than a cheap photoreal one anyway).
 *
 * Choreography, all driven by the damped scroll value:
 *   · entrance  (load):            parts converge from scattered offsets
 *   · teardown  (PHASES hero→…):   parts translate to exploded offsets with
 *                                  per-part stagger; HUD callouts fade in
 *   · network   (…→networkEnd):    device shrinks + rises to hover as the
 *                                  "hub node" above the Kingdom
 *   · always:                      gentle float + slow yaw so it never dies
 */

interface PartSpec {
  readonly id: string;
  /** Resting (assembled) position. */
  readonly rest: readonly [number, number, number];
  /** Exploded offset, ADDED to rest during teardown. */
  readonly apart: readonly [number, number, number];
  /** Entrance offset, where the part flies in FROM on load. */
  readonly from: readonly [number, number, number];
  /** Stagger slot 0..1 within the teardown window. */
  readonly stagger: number;
  /** Anchor for the HUD callout (in part-local space), if any. */
  readonly callout?: string;
}

const PARTS: readonly PartSpec[] = [
  { id: "shell", rest: [0, 0, 0], apart: [0, -1.15, 0], from: [0, -6, 2], stagger: 0.0, callout: "shell" },
  { id: "lid", rest: [0, 0.3, 0], apart: [0, 1.5, 0], from: [0, 7, -2], stagger: 0.12 },
  { id: "pcb", rest: [0, 0.1, 0], apart: [0, 0.42, 0], from: [-7, 2, 0], stagger: 0.28, callout: "pcb" },
  { id: "gps", rest: [-0.55, 0.22, 0.25], apart: [-0.95, 0.9, 0.7], from: [-5, 5, 4], stagger: 0.45, callout: "gps" },
  { id: "canbus", rest: [0.55, 0.2, -0.22], apart: [1.5, 0.8, -0.7], from: [6, 4, -3], stagger: 0.58, callout: "canbus" },
  { id: "battery", rest: [0.45, 0.17, 0.35], apart: [1.1, 0.35, 1.35], from: [5, -3, 5], stagger: 0.72, callout: "battery" },
  { id: "antenna", rest: [-0.85, 0.34, -0.35], apart: [-1.4, 1.55, -0.9], from: [-4, 8, -5], stagger: 0.86, callout: "antenna" },
];

/** Procedural PCB texture: dark board + emerald traces. Drawn once. */
function makePcbTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#07271c";
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = "rgba(63,217,139,0.8)";
    g.lineWidth = 2;
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 46; i += 1) {
      let x = rnd() * 512;
      let y = rnd() * 320;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s += 1) {
        // Manhattan traces: alternate horizontal/vertical runs.
        if (s % 2 === 0) x = clamp01(rnd()) * 512;
        else y = clamp01(rnd()) * 320;
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = "rgba(63,217,139,0.95)";
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const V = new THREE.Vector3();

export function Tracker(): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const partRefs = useRef<Array<THREE.Group | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const entrance = useRef(scrollState.reduced ? 1 : 0);
  const pcbTexture = useMemo(makePcbTexture, []);
  const mode = useTheme();
  const locale = useLocale();
  const isMobile = useIsMobile();

  useEffect(() => {
    return () => {
      pcbTexture.dispose();
    };
  }, [pcbTexture]);

  /* The device keeps its navy-metal identity in both themes, but daylight
     lifts the alloy a notch and polishes it (lower roughness → crisp
     speculars under the white key light) so it reads as a studio product
     shot instead of a silhouette; emissives calm down where no bloom
     backs them. All values come from the SCENE palette. */
  const mats = useMemo(() => {
    const P = SCENE[mode];
    return {
      body: new THREE.MeshStandardMaterial({
        color: P.bodyColor,
        metalness: P.bodyMetalness,
        roughness: P.bodyRoughness,
      }),
      dark: new THREE.MeshStandardMaterial({ color: P.darkPartColor, metalness: 0.7, roughness: 0.45 }),
      emerald: new THREE.MeshStandardMaterial({
        color: "#0c3f27",
        emissive: "#3fd98b",
        emissiveIntensity: P.emissiveEmerald,
        roughness: 0.4,
      }),
      ice: new THREE.MeshStandardMaterial({
        color: "#0a2c3d",
        emissive: "#4fc3e8",
        emissiveIntensity: P.emissiveIce,
        roughness: 0.4,
      }),
      pcb: new THREE.MeshStandardMaterial({
        map: pcbTexture,
        emissiveMap: pcbTexture,
        emissive: "#2aa368",
        emissiveIntensity: P.emissivePcb,
        color: P.pcbBoardColor,
        roughness: 0.6,
      }),
      gold: new THREE.MeshStandardMaterial({ color: "#8a6d2f", metalness: 0.95, roughness: 0.3 }),
    };
  }, [pcbTexture, mode]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => {
        m.dispose();
      });
    };
  }, [mats]);

  // Every part (incl. RoundedBox internals) casts onto the daylight shadow
  // catcher — exploded components each throw their own grounded shadow.
  useEffect(() => {
    group.current?.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh === true) (obj as THREE.Mesh).castShadow = true;
    });
  }, []);

  const bodyMat = mats.body;
  const darkMat = mats.dark;
  const emeraldGlow = mats.emerald;
  const iceGlow = mats.ice;
  const pcbMat = mats.pcb;
  const goldMat = mats.gold;

  useFrame((state, dt) => {
    const p = scrollState.current;
    const t = state.clock.elapsedTime;

    // Entrance plays once on load (skipped under reduced motion).
    entrance.current = Math.min(1, entrance.current + dt * 0.55);
    const inE = 1 - Math.pow(1 - entrance.current, 3);

    // Re-assemble quickly as the collar phase begins, then shrink + rise to
    // the hub pose DURING the collar showcase so the stage belongs to the
    // second asset; by the time the map rises the device is already parked
    // as the network hub.
    const explode = phase(p, PHASES.heroEnd, PHASES.teardownEnd) * (1 - phase(p, PHASES.teardownEnd + 0.01, PHASES.teardownEnd + 0.05));
    const hub = phase(p, PHASES.teardownEnd, lerp(PHASES.teardownEnd, PHASES.collarEnd, 0.45));
    const g = group.current;
    if (g !== null) {
      const scale = lerp(1, 0.34, hub);
      g.scale.setScalar(scale * lerp(0.6, 1, inE));
      g.position.set(0, lerp(0.15, 2.05, hub) + Math.sin(t * 0.9) * 0.05, 0);
      g.rotation.y = t * 0.14 + p * Math.PI * 1.2;
      g.rotation.x = Math.sin(t * 0.5) * 0.04 + lerp(0, 0.5, hub);
    }

    // Mobile: the narrow frame can't afford the full lateral blast radius —
    // pull the exploded offsets in so every part (and its callout chip)
    // stays inside the phone viewport.
    const spread = viewport.isMobile ? 0.72 : 1;
    PARTS.forEach((part, i) => {
      const node = partRefs.current[i];
      if (node === undefined || node === null) return;
      // Per-part stagger inside the teardown window.
      const e = clamp01((explode - part.stagger * 0.35) / 0.65);
      const eased = e * e * (3 - 2 * e) * spread;
      const back = 1 - inE;
      node.position.set(
        part.rest[0] + part.apart[0] * eased + part.from[0] * back,
        part.rest[1] + part.apart[1] * eased + part.from[1] * back,
        part.rest[2] + part.apart[2] * eased + part.from[2] * back,
      );
      node.rotation.z = eased * 0.25 * (i % 2 === 0 ? 1 : -1);
    });

    // Callout opacity rides the explode factor (direct style writes, no
    // React) — and dies FAST when the collar act begins, so the stage
    // handoff isn't cluttered with stale hardware labels.
    const labelOpacity = clamp01(explode * 1.6 - 0.25) * (1 - phase(p, PHASES.teardownEnd, PHASES.teardownEnd + 0.03));
    labelRefs.current.forEach((el) => {
      if (el !== null) {
        el.style.opacity = String(labelOpacity);
        el.style.transform = `translateY(${String((1 - labelOpacity) * 8)}px)`;
      }
    });

    // Reduced motion: freeze assembled, no explode (scroll still moves camera
    // minimally via the rig's own reduced branch).
    if (scrollState.reduced && g !== null) {
      g.rotation.y = t * 0.1;
    }
    V.set(0, 0, 0); // keep the shared vector warm; avoids GC churn elsewhere
  });

  const calloutFor = (id: string | undefined): JSX.Element | null => {
    if (id === undefined) return null;
    const index = PART_CALLOUTS.findIndex((c) => c.id === id);
    const callout = PART_CALLOUTS[index];
    if (callout === undefined) return null;
    // Mobile chips render smaller (and compact via CSS) so they ring the
    // hardware without covering it.
    return (
      <Html center distanceFactor={isMobile ? 4.5 : 5.5} zIndexRange={[20, 11]}>
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
      {PARTS.map((part, i) => (
        <group
          key={part.id}
          ref={(el) => {
            partRefs.current[i] = el;
          }}
        >
          {part.id === "shell" && (
            <group>
              <RoundedBox args={[2.3, 0.34, 1.5]} radius={0.09} smoothness={4} material={bodyMat} />
              {/* side ports */}
              <mesh position={[1.17, 0, 0.3]} material={darkMat}>
                <boxGeometry args={[0.08, 0.14, 0.34]} />
              </mesh>
              <mesh position={[1.17, 0, -0.25]} material={iceGlow}>
                <boxGeometry args={[0.06, 0.1, 0.22]} />
              </mesh>
            </group>
          )}
          {part.id === "lid" && (
            <group>
              <RoundedBox args={[2.3, 0.18, 1.5]} radius={0.08} smoothness={4} material={bodyMat} />
              {/* brand LED ring + engraved vents */}
              <mesh position={[0.62, 0.1, 0.38]} rotation={[-Math.PI / 2, 0, 0]} material={emeraldGlow}>
                <torusGeometry args={[0.17, 0.028, 12, 40]} />
              </mesh>
              {[-0.5, -0.32, -0.14].map((x) => (
                <mesh key={x} position={[x, 0.095, -0.3]} material={darkMat}>
                  <boxGeometry args={[0.07, 0.02, 0.6]} />
                </mesh>
              ))}
            </group>
          )}
          {part.id === "pcb" && (
            <mesh material={pcbMat}>
              <boxGeometry args={[2.05, 0.06, 1.28]} />
            </mesh>
          )}
          {part.id === "gps" && (
            <group>
              <mesh material={goldMat}>
                <boxGeometry args={[0.46, 0.1, 0.46]} />
              </mesh>
              <mesh position={[0, 0.08, 0]} material={iceGlow}>
                <boxGeometry args={[0.3, 0.06, 0.3]} />
              </mesh>
            </group>
          )}
          {part.id === "canbus" && (
            <group>
              <mesh material={darkMat}>
                <boxGeometry args={[0.62, 0.16, 0.4]} />
              </mesh>
              <mesh position={[0, 0.1, 0]} material={emeraldGlow}>
                <boxGeometry args={[0.4, 0.05, 0.2]} />
              </mesh>
            </group>
          )}
          {part.id === "battery" && (
            <mesh material={darkMat}>
              <cylinderGeometry args={[0.14, 0.14, 0.52, 20]} />
            </mesh>
          )}
          {part.id === "antenna" && (
            <group>
              <mesh material={bodyMat}>
                <cylinderGeometry args={[0.05, 0.08, 0.5, 14]} />
              </mesh>
              <mesh position={[0, 0.34, 0]} material={emeraldGlow}>
                <sphereGeometry args={[0.06, 14, 14]} />
              </mesh>
            </group>
          )}
          {calloutFor(part.callout)}
        </group>
      ))}
    </group>
  );
}
