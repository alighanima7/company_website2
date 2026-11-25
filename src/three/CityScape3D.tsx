import { Html, Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";

import { CITY_CALLOUTS } from "../content";
import { useLocale } from "../locale";
import { clamp01, lerp, motionState, phase } from "../motion";
import { FLAGS, timedFrame } from "../perf/probe";
import { BROWSE_PEAK, dampProductScroll, productScroll, productTurn } from "../productScroll";
import { useIsMobile } from "../responsive";
import { SCENE, useTheme } from "../theme";

/**
 * The Smart City platform: a stylized low-poly urban micro-district on a
 * circular stage. Four infrastructure pillars from the profile's Smart
 * City pages sit in four quadrants — a tower cluster (smart building), a
 * parking lot with live occupancy dots, a lamp-lined street arc (smart
 * lighting), and bins + meter + inspection chamber (waste & metering) —
 * all wired to a central IoT hub by dashed data pulses, under a slowly
 * turning management ring.
 *
 * Two modes, decided by whether a scroll driver is attached:
 *  · BROWSE — scrubbed by the segment track. The district ASSEMBLES out
 *    of its platform (towers → lamps → parking → bins, each on its own
 *    staggered window), the ring spins up, the pulses start streaming and
 *    each pillar's callout opens as that pillar finishes rising — then it
 *    all settles back down, so the scene swap lands on a clean state.
 *  · DETAIL — no runway exists for this product, so it stands fully built
 *    and runs the original clock spin + callout carousel.
 *
 * Reduced motion holds the lit district still and fully built.
 */

const PLATFORM_R = 2.3;

/** Callout carousel period (seconds) — four pillars per revolution. */
const CYCLE = 16;

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

/** Callout anchors. The district spins continuously, so the quadrants
 *  rotate through the camera axis — a chip must clear the model at EVERY
 *  yaw, which means riding fully ABOVE the skyline (y ≥ 2.25, under the
 *  toggle-corner floor) or fully BELOW the platform rim (y ≤ -0.9).
 *  Card-to-card safety comes from the one-at-a-time reveal windows, so
 *  the two bands can be shared. Lateral radius ≤ ~1.9 world units keeps
 *  every chip clear of the viewport edge at any yaw. */
const CALLOUT_ANCHORS: Record<string, readonly [number, number, number]> = {
  building: [1.9, 2.25, -0.3],
  parking: [-1.6, -0.9, 0.9],
  lighting: [0.6, 2.25, -1.8],
  waste: [-1.55, -0.95, -1.0],
};

export function CityScape3D(): JSX.Element {
  const root = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  /* Pillar families, each wrapped at y=0 so scaling Y grows them straight
     out of the platform with their bases planted. */
  const towersRef = useRef<THREE.Group>(null);
  const lampsRef = useRef<THREE.Group>(null);
  const parkRef = useRef<THREE.Group>(null);
  const binsRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const pulseRefs = useRef<Array<Line2 | LineSegments2 | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  // Callout portals mount only once the entrance settles.
  const [calloutsLive, setCalloutsLive] = useState(false);
  const calloutsLiveRef = useRef(false);
  const entrance = useRef(motionState.reduced ? 1 : 0);
  const mode = useTheme();
  const locale = useLocale();
  const isMobile = useIsMobile();

  const mats = useMemo(() => {
    const P = SCENE[mode];
    return {
      base: new THREE.MeshStandardMaterial({ color: P.cityBase, metalness: 0.15, roughness: 0.7 }),
      tower: new THREE.MeshStandardMaterial({ color: P.cityTower, metalness: 0.2, roughness: 0.55, flatShading: true }),
      windowA: new THREE.MeshStandardMaterial({
        color: P.cityGlassA,
        emissive: P.cityWindowA,
        emissiveIntensity: P.emissiveEmerald * 0.8,
        roughness: 0.45,
      }),
      windowB: new THREE.MeshStandardMaterial({
        color: P.cityGlassB,
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

  useFrame(timedFrame("frame:city", (state, dt) => {
    const t = state.clock.elapsedTime;
    const reduced = motionState.reduced;

    entrance.current = Math.min(1, entrance.current + dt * 0.55);
    const enter = 1 - Math.pow(1 - entrance.current, 3);

    const live = !reduced && entrance.current >= 1;
    if (live !== calloutsLiveRef.current) {
      calloutsLiveRef.current = live;
      setCalloutsLive(live);
    }

    // Browse scrubs this scene; detail mode (no runway for this product)
    // leaves it on the clock, fully built. Normalized because browse caps
    // at BROWSE_PEAK and that is the only scroll range this scene sees.
    const scrub = productScroll.driven && !reduced;
    const s = scrub ? clamp01(dampProductScroll(dt) / BROWSE_PEAK) : 0;

    /* The district ASSEMBLES: each pillar family grows out of the platform
       on its own staggered window, so the quarter builds itself tower →
       lamps → parking → bins and settles back down by the segment's end.
       Every one of these is a real mesh family in this scene — nothing is
       faked to create the effect. Unscrubbed, everything stands at 1. */
    const build = (a: number, b: number): number => (scrub ? Math.max(0.001, phase(s, a, b)) : 1);
    const rise: ReadonlyArray<[{ current: THREE.Group | null }, number]> = [
      [towersRef, build(0.05, 0.45)],
      [lampsRef, build(0.18, 0.58)],
      [parkRef, build(0.3, 0.7)],
      [binsRef, build(0.42, 0.82)],
    ];
    rise.forEach(([ref, k]) => {
      const node = ref.current;
      if (node !== null) node.scale.y = k;
    });

    const g = root.current;
    if (g !== null) {
      g.visible = true;
      g.scale.setScalar(Math.max(0.001, enter));
      g.position.set(0, lerp(-2.6, -0.35, enter), 0);
    }
    const sp = spinner.current;
    if (sp !== null) {
      // Scrubbed: ONE full revolution of the district, monotonic and eased
      // to a stop at both ends, so the swap always lands on the same
      // orientation. A district has no "front" and its callouts are
      // anchored to clear the model at EVERY yaw, so a full turn is the
      // natural reading here — and there is no texture to mirror.
      // Otherwise the slow presentation spin. Reduced motion holds still.
      sp.rotation.y = scrub ? productTurn() : reduced ? 0 : t * 0.08;
    }

    // Management ring: spins up with the build, then breathes.
    const ring = ringRef.current;
    if (ring !== null) {
      if (!reduced) ring.rotation.z = scrub ? -s * 2.4 : -t * 0.18;
      const m = ring.material as THREE.MeshBasicMaterial;
      const ringIn = scrub ? phase(s, 0.1, 0.5) : 1;
      m.opacity = 0.5 * enter * ringIn * (reduced ? 0.75 : 0.75 + 0.25 * Math.sin(t * 1.4));
    }

    // Data pulses stream hub→pillars once the district is up.
    pulseRefs.current.forEach((line, i) => {
      const material = line?.material;
      if (material !== undefined) {
        const up = scrub ? phase(s, 0.35, 0.75) : 1;
        material.opacity = clamp01((phase(enter, 0.6, 1) * 1.2 - i * 0.05) * up);
        if (!reduced) material.dashOffset = scrub ? -s * 6 - i * 0.2 : -t * 0.5 - i * 0.2;
      }
    });

    // Callouts reveal ONE AT A TIME — scrubbed, each pillar's chip opens
    // as that pillar finishes rising and closes before the next, so they
    // can never stack. Otherwise the clock carousel, as before.
    const cyc = scrub ? s : reduced || !live ? -1 : (t % CYCLE) / CYCLE;
    CITY_CALLOUTS.forEach((_, i) => {
      const el = labelRefs.current[i];
      if (el === null || el === undefined) return;
      let o: number;
      if (scrub) {
        const a = 0.2 + i * 0.17;
        o = live ? phase(s, a, a + 0.07) * (1 - phase(s, a + 0.13, a + 0.2)) : 0;
      } else {
        o =
          cyc < 0
            ? 0
            : phase(cyc, 0.04 + i * 0.24, 0.1 + i * 0.24) *
              (1 - phase(cyc, 0.2 + i * 0.24, 0.24 + i * 0.24));
      }
      el.style.opacity = String(o);
      el.style.transform = `translateY(${String((1 - o) * 8)}px)`;
    });
  }));

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
              pulseRefs.current[i] = el;
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
        <group ref={towersRef}>
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
        </group>
        {calloutsLive && !FLAGS.nohtml && calloutFor("building")}

        {/* ── Pillar 2 · Smart Parking: lot + occupancy dots (−x, +z) ── */}
        <group ref={parkRef}>
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
        </group>
        {calloutsLive && !FLAGS.nohtml && calloutFor("parking")}

        {/* ── Pillar 3 · Smart Street Lighting: lamp arc (−z) ── */}
        <group ref={lampsRef}>
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
        </group>
        {calloutsLive && !FLAGS.nohtml && calloutFor("lighting")}

        {/* ── Pillar 4 · Waste + Metering (−x, −z) ── */}
        <group ref={binsRef}>
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
        </group>
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
        {calloutsLive && !FLAGS.nohtml && calloutFor("waste")}
      </group>
    </group>
  );
}
