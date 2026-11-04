import { Html, Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { CITY_CALLOUTS, PHASES } from "../content";
import { useLocale } from "../locale";
import { useIsMobile } from "../responsive";
import { clamp01, lerp, phase, scrollState } from "../scroll";
import { SCENE, useTheme } from "../theme";

/**
 * Act 04 — the Smart City: a stylized low-poly urban micro-district on a
 * circular platform. Four infrastructure pillars from the profile's Smart
 * City pages sit in four quadrants — a tower cluster (smart building), a
 * parking lot with live occupancy dots, a lamp-lined street arc (smart
 * lighting), and bins + meter + inspection chamber (waste & metering) —
 * all wired to a central IoT hub by dashed data pulses, under a slowly
 * turning management ring.
 *
 * Choreography (window collarEnd→cityEnd): rises as the collar exits,
 * takes a scroll-scrubbed turn while the camera orbits, reveals each
 * pillar's bilingual callout in sequence, then sinks away as the Kingdom
 * map rises.
 */

const PLATFORM_R = 2.3;

/** Tower cluster (+x): [x, z, width, height]. */
const TOWERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1.18, -0.28, 0.4, 1.55],
  [1.52, 0.18, 0.34, 1.05],
  [0.92, 0.3, 0.3, 0.8],
  [1.45, -0.72, 0.28, 0.66],
  [0.86, -0.72, 0.26, 1.2],
];

/** Parking rows (−x, +z): slot centers along two rows. */
const PARK_SLOTS: ReadonlyArray<readonly [number, number, boolean]> = [
  [-1.62, 0.62, true],
  [-1.36, 0.62, false],
  [-1.1, 0.62, true],
  [-0.84, 0.62, true],
  [-1.62, 0.95, false],
  [-1.36, 0.95, true],
  [-1.1, 0.95, false],
  [-0.84, 0.95, true],
];

/** Lamp posts along the front street arc (−z half). */
const LAMP_ANGLES: readonly number[] = [-2.45, -2.05, -1.65, -1.25, -0.85];

/** Waste bins (−x, −z). */
const BINS: ReadonlyArray<readonly [number, number]> = [
  [-1.5, -0.55],
  [-1.28, -0.78],
  [-1.06, -0.55],
];

/** Hub-to-pillar pulse lines (from the center pylon to each quadrant node). */
const PULSE_TARGETS: ReadonlyArray<readonly [number, number, number]> = [
  [1.18, 1.62, -0.28], // building cluster top
  [-1.23, 0.3, 0.78], // parking lot
  [0.9 * Math.cos(-1.65), 0.72, 0.9 * Math.sin(-1.65) - 0.75], // mid lamp head
  [-1.28, 0.42, -0.66], // bins
];

function pulsePoints(target: readonly [number, number, number]): Array<[number, number, number]> {
  const from = new THREE.Vector3(0, 0.95, 0);
  const to = new THREE.Vector3(target[0], target[1], target[2]);
  const mid = from.clone().lerp(to, 0.5);
  mid.y += 0.45;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  return curve.getPoints(24).map((v) => [v.x, v.y, v.z] as [number, number, number]);
}

const PULSES: ReadonlyArray<Array<[number, number, number]>> = PULSE_TARGETS.map(pulsePoints);

/** Callout anchors — pushed OUTSIDE the district's silhouette and spread
 *  wide so cards ring the model instead of covering buildings or each
 *  other (collision lesson, round two). */
const CALLOUT_ANCHORS: Record<string, readonly [number, number, number]> = {
  building: [1.75, 2.25, -0.3],
  parking: [-2.25, 0.75, 1.5],
  lighting: [0.6, 1.85, -2.25],
  waste: [-2.35, 0.18, -1.65],
};

export function CityScape3D(): JSX.Element {
  const root = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pulseRefs = useRef<Array<{ material?: { dashOffset: number; opacity: number } } | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const mode = useTheme();
  const locale = useLocale();
  const isMobile = useIsMobile();

  const mats = useMemo(() => {
    const P = SCENE[mode];
    return {
      base: new THREE.MeshStandardMaterial({ color: P.cityBase, metalness: 0.15, roughness: 0.7 }),
      tower: new THREE.MeshStandardMaterial({ color: P.cityTower, metalness: 0.2, roughness: 0.55, flatShading: true }),
      windowA: new THREE.MeshStandardMaterial({
        color: "#13301d",
        emissive: P.cityWindowA,
        emissiveIntensity: P.emissiveEmerald * 0.8,
        roughness: 0.45,
      }),
      windowB: new THREE.MeshStandardMaterial({
        color: "#301d13",
        emissive: P.cityWindowB,
        emissiveIntensity: P.emissiveIce * 0.8,
        roughness: 0.45,
      }),
      dark: new THREE.MeshStandardMaterial({ color: P.bodyColor, metalness: 0.6, roughness: 0.45 }),
    };
  }, [mode]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => {
        m.dispose();
      });
    };
  }, [mats]);

  useEffect(() => {
    root.current?.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh === true) (obj as THREE.Mesh).castShadow = true;
    });
  }, []);

  const P = SCENE[mode];

  useFrame((state) => {
    const p = scrollState.current;
    const t = state.clock.elapsedTime;
    const lp = phase(p, PHASES.collarEnd, PHASES.cityEnd);

    const enter = phase(lp, 0.05, 0.2);
    const exit = phase(lp, 0.9, 1);
    const scale = enter * (1 - exit);

    const g = root.current;
    if (g !== null) {
      g.visible = scale > 0.012 && !scrollState.reduced;
      g.scale.setScalar(Math.max(0.001, scale));
      g.position.set(0, lerp(-2.6, -0.35, enter) - exit * 2.4, 0);
    }
    const s = spinner.current;
    if (s !== null) {
      s.rotation.y = t * 0.06 + lp * Math.PI * 0.9;
    }

    // Management ring: slow counter-rotation + gentle breathing.
    const ring = ringRef.current;
    if (ring !== null) {
      ring.rotation.z = -t * 0.18;
      const m = ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.5 * enter * (1 - exit) * (0.75 + 0.25 * Math.sin(t * 1.4));
    }

    // Data pulses stream hub→pillars.
    pulseRefs.current.forEach((line, i) => {
      const material = line?.material;
      if (material !== undefined) {
        material.opacity = clamp01(phase(lp, 0.18, 0.3) * 1.2 - i * 0.05) * (1 - exit);
        material.dashOffset = -t * 0.5 - i * 0.2;
      }
    });

    // Callouts reveal in sequence as the camera orbits the quadrants.
    CITY_CALLOUTS.forEach((_, i) => {
      const el = labelRefs.current[i];
      if (el === null || el === undefined) return;
      const window = phase(lp, 0.22 + i * 0.07, 0.34 + i * 0.07) * (1 - phase(lp, 0.84, 0.94));
      el.style.opacity = String(window);
      el.style.transform = `translateY(${String((1 - window) * 8)}px)`;
    });
  });

  const calloutFor = (id: string): JSX.Element | null => {
    const index = CITY_CALLOUTS.findIndex((c) => c.id === id);
    const callout = CITY_CALLOUTS[index];
    const anchor = CALLOUT_ANCHORS[id];
    if (callout === undefined || anchor === undefined) return null;
    // Mobile: anchors ride in closer and chips render smaller — the ring of
    // cards must fit a frame barely wider than the district platform.
    const squeezeXZ = isMobile ? 0.72 : 1;
    const squeezeY = isMobile ? 0.9 : 1;
    return (
      <Html
        center
        distanceFactor={isMobile ? 4.5 : 5.5}
        position={[anchor[0] * squeezeXZ, anchor[1] * squeezeY, anchor[2] * squeezeXZ]}
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
    <group ref={root} visible={false}>
      <group ref={spinner}>
        {/* Platform district + rim */}
        <mesh position={[0, -0.06, 0]} material={mats.base}>
          <cylinderGeometry args={[PLATFORM_R, PLATFORM_R + 0.12, 0.12, 48]} />
        </mesh>

        {/* Management ring hovering over the district */}
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.95, 0]}>
          <ringGeometry args={[1.55, 1.6, 64]} />
          <meshBasicMaterial color={P.cityPulse} transparent opacity={0} blending={P.glowBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>

        {/* Central IoT hub pylon + node */}
        <mesh position={[0, 0.42, 0]} material={mats.dark}>
          <cylinderGeometry args={[0.05, 0.1, 0.85, 8]} />
        </mesh>
        <mesh position={[0, 0.95, 0]} material={mats.windowA}>
          <sphereGeometry args={[0.09, 14, 14]} />
        </mesh>

        {/* Data pulses hub→pillars */}
        {PULSES.map((points, i) => (
          <Line
            key={i}
            ref={(el) => {
              pulseRefs.current[i] = el as unknown as { material?: { dashOffset: number; opacity: number } };
            }}
            points={points}
            color={P.cityPulse}
            lineWidth={1.6}
            dashed
            dashSize={0.09}
            gapSize={0.06}
            transparent
            opacity={0}
          />
        ))}

        {/* ── Pillar 1 · Smart Building: tower cluster (+x) ── */}
        {TOWERS.map(([x, z, w, h], i) => (
          <group key={i} position={[x, h / 2, z]}>
            <RoundedBox args={[w, h, w]} radius={0.02} smoothness={2} material={mats.tower} />
            {/* lit window strips alternate the two accent colors */}
            <mesh position={[0, h * 0.18, w / 2 + 0.004]} material={i % 2 === 0 ? mats.windowA : mats.windowB}>
              <boxGeometry args={[w * 0.6, 0.035, 0.012]} />
            </mesh>
            <mesh position={[0, -h * 0.12, w / 2 + 0.004]} material={i % 2 === 0 ? mats.windowB : mats.windowA}>
              <boxGeometry args={[w * 0.6, 0.035, 0.012]} />
            </mesh>
          </group>
        ))}
        {calloutFor("building")}

        {/* ── Pillar 2 · Smart Parking: lot + occupancy dots (−x, +z) ── */}
        <mesh position={[-1.23, 0.015, 0.78]} material={mats.dark}>
          <boxGeometry args={[1.1, 0.03, 0.75]} />
        </mesh>
        {PARK_SLOTS.map(([x, z, busy], i) => (
          <group key={i}>
            {busy && (
              <RoundedBox args={[0.16, 0.07, 0.1]} radius={0.02} smoothness={2} material={mats.tower} position={[x, 0.07, z]} />
            )}
            <mesh position={[x, 0.045, z - 0.09]} material={busy ? mats.windowB : mats.windowA}>
              <sphereGeometry args={[0.018, 8, 8]} />
            </mesh>
          </group>
        ))}
        {calloutFor("parking")}

        {/* ── Pillar 3 · Smart Street Lighting: lamp arc (−z) ── */}
        {LAMP_ANGLES.map((a) => {
          const x = 1.55 * Math.cos(a);
          const z = 1.55 * Math.sin(a) * 0.9;
          return (
            <group key={a} position={[x, 0, z]}>
              <mesh position={[0, 0.34, 0]} material={mats.dark}>
                <cylinderGeometry args={[0.014, 0.022, 0.68, 8]} />
              </mesh>
              <mesh position={[0, 0.69, 0]} material={mats.windowA}>
                <sphereGeometry args={[0.038, 10, 10]} />
              </mesh>
            </group>
          );
        })}
        {calloutFor("lighting")}

        {/* ── Pillar 4 · Waste + Metering (−x, −z) ── */}
        {BINS.map(([x, z], i) => (
          <group key={i} position={[x, 0.14, z]}>
            <mesh material={mats.dark}>
              <cylinderGeometry args={[0.09, 0.08, 0.28, 10]} />
            </mesh>
            {/* fill-level indicator */}
            <mesh position={[0, 0.16, 0]} material={i === 1 ? mats.windowB : mats.windowA}>
              <torusGeometry args={[0.07, 0.014, 8, 20]} />
            </mesh>
          </group>
        ))}
        {/* smart meter box + inspection chamber cover */}
        <RoundedBox args={[0.18, 0.26, 0.1]} radius={0.02} smoothness={2} material={mats.tower} position={[-0.72, 0.13, -1.05]} />
        <mesh position={[-0.72, 0.21, -0.99]} material={mats.windowA}>
          <boxGeometry args={[0.1, 0.05, 0.01]} />
        </mesh>
        <mesh position={[-1.75, 0.012, -0.15]} rotation={[-Math.PI / 2, 0, 0]} material={mats.dark}>
          <circleGeometry args={[0.14, 20]} />
        </mesh>
        <mesh position={[-1.75, 0.02, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.13, 0.145, 24]} />
          <meshBasicMaterial color={P.cityPulse} transparent opacity={0.8} />
        </mesh>
        {calloutFor("waste")}
      </group>
    </group>
  );
}
