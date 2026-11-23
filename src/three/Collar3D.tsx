import { Html, Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { COLLAR_CALLOUTS } from "../content";
import { useLocale } from "../locale";
import { clamp01, lerp, motionState, phase } from "../motion";
import { useIsMobile, viewport } from "../responsive";
import { SCENE, useTheme } from "../theme";

/**
 * The Wild Animal Tracking smart collar, modeled procedurally on the
 * profile's own product photo (p21) — riveted leather band, dashed edge
 * stitching, steel buckle, curved armor plates and the navy tracking
 * module with its emerald LED.
 *
 * Products-page showcase: enters from below on mount, then loops a radial
 * teardown on the clock — module/buckle/plates translate out with stagger
 * while their callouts reveal one at a time, re-seat, rest, repeat.
 * Reduced motion holds the assembled pose with a slow turn and no chips.
 */

const BAND_R = 1.08; // band centerline radius
const BAND_T = 0.05; // half thickness (radial)
const BAND_H = 0.21; // half height (axial)

/** Teardown loop period (seconds). */
const CYCLE = 14;

interface CollarPart {
  readonly id: string;
  /** Resting position (on the band). */
  readonly rest: readonly [number, number, number];
  /** Exploded offset, ADDED to rest. */
  readonly apart: readonly [number, number, number];
  readonly stagger: number;
}

const OUT = BAND_R + BAND_T; // outer band surface radius

const PARTS: readonly CollarPart[] = [
  { id: "module", rest: [OUT + 0.1, 0, 0], apart: [0.95, 0.2, 0], stagger: 0 },
  { id: "buckle", rest: [-(OUT + 0.04), 0, 0], apart: [-0.85, 0.12, 0], stagger: 0.3 },
  { id: "plateA", rest: [0, 0, OUT + 0.02], apart: [0, 0.08, 0.8], stagger: 0.55 },
  { id: "plateB", rest: [0, 0, -(OUT + 0.02)], apart: [0, 0.08, -0.8], stagger: 0.75 },
];

/** Chamfered-rectangle profile swept into the closed leather band. */
function makeBandGeometry(): THREE.LatheGeometry {
  const C = BAND_R;
  const t = BAND_T;
  const h = BAND_H;
  const c = 0.028; // chamfer
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(C - t, h - c),
    new THREE.Vector2(C - t, -h + c),
    new THREE.Vector2(C - t + c, -h),
    new THREE.Vector2(C + t - c, -h),
    new THREE.Vector2(C + t, -h + c),
    new THREE.Vector2(C + t, h - c),
    new THREE.Vector2(C + t - c, h),
    new THREE.Vector2(C - t + c, h),
    new THREE.Vector2(C - t, h - c),
  ];
  return new THREE.LatheGeometry(pts, 80);
}

/** Dashed stitch ring just proud of the band's outer wall. */
function stitchPoints(y: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  const r = OUT + 0.004;
  for (let i = 0; i <= 96; i += 1) {
    const a = (i / 96) * Math.PI * 2;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return pts;
}

/** Hoisted: the stitch geometry is static — computing it per React render
 *  (theme/locale changes) would rebuild the drei Line geometries for nothing. */
const STITCH_RINGS: ReadonlyArray<Array<[number, number, number]>> = [
  BAND_H - 0.045,
  -(BAND_H - 0.045),
].map(stitchPoints);

const RIVET_COUNT = 12;

export function Collar3D(): JSX.Element {
  const root = useRef<THREE.Group>(null);
  const spinner = useRef<THREE.Group>(null);
  const partRefs = useRef<Array<THREE.Group | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  // Callout portals mount only once the entrance settles — drei <Html>
  // does per-frame transform work for as long as it exists.
  const [calloutsLive, setCalloutsLive] = useState(false);
  const calloutsLiveRef = useRef(false);
  const entrance = useRef(motionState.reduced ? 1 : 0);
  const mode = useTheme();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const P = SCENE[mode];

  const bandGeometry = useMemo(makeBandGeometry, []);
  useEffect(() => {
    return () => {
      bandGeometry.dispose();
    };
  }, [bandGeometry]);

  /* Collar materials ride the SCENE palette: daylight dresses the whole
     collar in matte charcoal (band) + anodized gunmetal (plates, buckle)
     with a mint LED and pink stitching; dark keeps the leather-and-steel
     product-photo identity untouched. */
  const mats = useMemo(() => {
    const PAL = SCENE[mode];
    return {
      leather: new THREE.MeshStandardMaterial({ color: PAL.collarBand, metalness: 0.06, roughness: 0.78 }),
      leatherDark: new THREE.MeshStandardMaterial({ color: PAL.collarBandDark, metalness: 0.08, roughness: 0.82 }),
      steel: new THREE.MeshStandardMaterial({ color: PAL.collarSteel, metalness: 0.92, roughness: 0.3 }),
      rivet: new THREE.MeshStandardMaterial({ color: PAL.collarRivet, metalness: 0.9, roughness: 0.38 }),
      module: new THREE.MeshStandardMaterial({ color: PAL.bodyColor, metalness: PAL.bodyMetalness, roughness: PAL.bodyRoughness }),
      led: new THREE.MeshStandardMaterial({
        color: PAL.ledBase,
        emissive: PAL.ledEmissive,
        emissiveIntensity: PAL.emissiveEmerald,
        roughness: 0.4,
      }),
    };
  }, [mode]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => {
        m.dispose();
      });
    };
  }, [mats]);

  // Everything casts onto the daylight shadow catcher.
  useEffect(() => {
    root.current?.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh === true) (obj as THREE.Mesh).castShadow = true;
    });
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const reduced = motionState.reduced;

    entrance.current = Math.min(1, entrance.current + dt * 0.55);
    const enter = 1 - Math.pow(1 - entrance.current, 3);

    const live = !reduced && entrance.current >= 1;
    if (live !== calloutsLiveRef.current) {
      calloutsLiveRef.current = live;
      setCalloutsLive(live);
    }

    const g = root.current;
    if (g !== null) {
      g.visible = true;
      g.scale.setScalar(Math.max(0.001, enter));
      const float = reduced ? 0 : Math.sin(t * 0.8) * 0.045;
      g.position.set(0, lerp(-2.4, 0.12, enter) + float, 0);
      // Presentation tilt from the product photo.
      g.rotation.z = 0.42;
      g.rotation.x = 0.16 + (reduced ? 0 : Math.sin(t * 0.5) * 0.03);
    }
    const s = spinner.current;
    if (s !== null) {
      s.rotation.y = reduced ? t * 0.08 : t * 0.14;
    }

    // Teardown loop: radial separation with stagger, hold, re-seat, rest.
    // Narrow frames pull the radial blast in — the collar plus its exploded
    // parts must fit their zone (phone stack / tablet half).
    const cyc = reduced || !live ? 0 : (t % CYCLE) / CYCLE;
    const explode = phase(cyc, 0.12, 0.3) * (1 - phase(cyc, 0.66, 0.84));
    const spread = viewport.isMobile ? 0.72 : viewport.tier === "tablet" ? 0.85 : 1;
    PARTS.forEach((part, i) => {
      const node = partRefs.current[i];
      if (node === undefined || node === null) return;
      const e = clamp01((explode - part.stagger * 0.3) / 0.7);
      const eased = e * e * (3 - 2 * e) * spread;
      node.position.set(
        part.rest[0] + part.apart[0] * eased,
        part.rest[1] + part.apart[1] * eased,
        part.rest[2] + part.apart[2] * eased,
      );
    });

    // Chips reveal ONE AT A TIME across the exploded hold (per-index
    // windows): four cards at once can't be guaranteed collision-free
    // through the collar's continuous spin, one card always can.
    labelRefs.current.forEach((el, i) => {
      if (el !== null) {
        const o =
          phase(cyc, 0.18 + i * 0.11, 0.24 + i * 0.11) *
          (1 - phase(cyc, 0.29 + i * 0.11, 0.32 + i * 0.11));
        el.style.opacity = String(o);
        el.style.transform = `translateY(${String((1 - o) * 8)}px)`;
      }
    });
  });

  const calloutFor = (id: string | undefined, anchor?: readonly [number, number, number]): JSX.Element | null => {
    if (id === undefined || anchor === undefined) return null;
    const index = COLLAR_CALLOUTS.findIndex((c) => c.id === id);
    const callout = COLLAR_CALLOUTS[index];
    if (callout === undefined) return null;
    // Mobile: chips hug their parts (compact CSS + smaller scale) so none
    // of them parks outside the narrow frame.
    const squeeze = isMobile ? 0.8 : 1;
    return (
      <Html
        center
        distanceFactor={isMobile ? 4.5 : 5.5}
        position={[anchor[0] * squeeze, anchor[1] * squeeze, anchor[2] * squeeze]}
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
        {/* Leather band + darker inner lining ring */}
        <mesh geometry={bandGeometry} material={mats.leather} />

        {/* Edge stitching — two dashed thread rings (cream on leather in the
            dark theme, pink thread on the charcoal band in daylight) */}
        {STITCH_RINGS.map((points, i) => (
          <Line
            key={i}
            points={points}
            color={P.collarStitch}
            lineWidth={1.1}
            dashed
            dashSize={0.05}
            gapSize={0.034}
            transparent
            opacity={0.9}
          />
        ))}

        {/* Rivet row around the band */}
        {Array.from({ length: RIVET_COUNT }, (_, i) => {
          const a = (i / RIVET_COUNT) * Math.PI * 2;
          // Leave the module (+x) and buckle (−x) arcs clear.
          const clear = Math.abs(Math.cos(a)) > 0.86;
          if (clear) return null;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * (OUT + 0.008), 0, Math.sin(a) * (OUT + 0.008)]}
              rotation={[0, -a + Math.PI / 2, Math.PI / 2]}
              material={mats.rivet}
            >
              <cylinderGeometry args={[0.025, 0.025, 0.02, 12]} />
            </mesh>
          );
        })}

        {/* Outer-ring anchors: the four chips sit in four separate quadrants
            around the collar's bounding box — strap deep below, module far
            inline-right, buckle far inline-left, plate high above — so no
            chip covers the hardware or a neighboring chip. */}
        {calloutsLive && calloutFor("strap", [0, -(BAND_H + 1.05), 0.7])}

        {/* ── Module (tracking unit on steel back-plate) ── */}
        <group
          ref={(el) => {
            partRefs.current[0] = el;
          }}
        >
          <group rotation={[0, 0, 0]}>
            {/* curved-fit back plate */}
            <RoundedBox args={[0.09, 0.46, 0.96]} radius={0.03} smoothness={3} material={mats.steel} position={[-0.08, 0, 0]} />
            <RoundedBox args={[0.24, 0.4, 0.82]} radius={0.05} smoothness={4} material={mats.module} position={[0.1, 0, 0]} />
            {/* LED strip + antenna nub */}
            <mesh position={[0.235, 0.08, 0]} material={mats.led}>
              <boxGeometry args={[0.02, 0.05, 0.5]} />
            </mesh>
            <mesh position={[0.16, 0.26, -0.26]} material={mats.module}>
              <cylinderGeometry args={[0.028, 0.04, 0.14, 10]} />
            </mesh>
            <mesh position={[0.16, 0.345, -0.26]} material={mats.led}>
              <sphereGeometry args={[0.032, 10, 10]} />
            </mesh>
          </group>
          {/* Anchors are PART-local and the parts explode outward already —
              keep offsets modest or the chip swings past the viewport edge
              at the worst spinner yaw (radius cap ≈ 2.6 world units). */}
          {calloutsLive && calloutFor("module", [0.1, 0.45, 0])}
        </group>

        {/* ── Buckle (frame + prong + strap tongue) ── */}
        <group
          ref={(el) => {
            partRefs.current[1] = el;
          }}
        >
          <group>
            {[0.17, -0.17].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.steel}>
                <boxGeometry args={[0.06, 0.5, 0.05]} />
              </mesh>
            ))}
            {[0.24, -0.24].map((z) => (
              <mesh key={z} position={[0, 0, z]} material={mats.steel}>
                <boxGeometry args={[0.06, 0.4, 0.05]} />
              </mesh>
            ))}
            {/* prong */}
            <mesh position={[0.012, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]} material={mats.steel}>
              <cylinderGeometry args={[0.018, 0.012, 0.42, 8]} />
            </mesh>
            {/* leather tongue passing through */}
            <RoundedBox args={[0.045, 0.36, 0.62]} radius={0.02} smoothness={3} material={mats.leatherDark} position={[-0.04, 0, 0.12]} />
          </group>
          {/* Outside the buckle's silhouette; low enough to survive the
              part's upward explode without clipping the viewport top. */}
          {calloutsLive && calloutFor("buckle", [-0.2, 0.58, 0])}
        </group>

        {/* ── Armor plates (±z) ── */}
        <group
          ref={(el) => {
            partRefs.current[2] = el;
          }}
        >
          <RoundedBox args={[0.52, 0.34, 0.07]} radius={0.03} smoothness={3} material={mats.steel} />
          {[-0.19, 0.19].map((x) => (
            <mesh key={x} position={[x, 0, 0.045]} rotation={[Math.PI / 2, 0, 0]} material={mats.rivet}>
              <cylinderGeometry args={[0.024, 0.024, 0.02, 10]} />
            </mesh>
          ))}
          {/* High above the collar's silhouette and pulled back toward the
              axis (the plate itself explodes to z≈1.95 — adding more z
              would blow the radius cap). */}
          {calloutsLive && calloutFor("plate", [0.3, 1.3, -0.3])}
        </group>
        <group
          ref={(el) => {
            partRefs.current[3] = el;
          }}
        >
          <RoundedBox args={[0.52, 0.34, 0.07]} radius={0.03} smoothness={3} material={mats.steel} />
          {[-0.19, 0.19].map((x) => (
            <mesh key={x} position={[x, 0, -0.045]} rotation={[Math.PI / 2, 0, 0]} material={mats.rivet}>
              <cylinderGeometry args={[0.024, 0.024, 0.02, 10]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
