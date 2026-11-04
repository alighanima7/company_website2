import { Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { JSX } from "react";
import * as THREE from "three";

import { CITIES, KSA_OUTLINE, PHASES } from "../content";
import { useLocale } from "../locale";
import { clamp01, lerp, phase, scrollState } from "../scroll";
import { SCENE, useTheme } from "../theme";

/**
 * The Kingdom as a dark glass slab: the production radar's hand projection
 * extruded into 3D, with the five operating cities as light beacons wired to
 * the Riyadh hub, and a security scan ring that sweeps the surface during the
 * AI phase. Rises from below the fold as the network phase begins.
 */

const MAP_SCALE = 1 / 34; // 400×360 source units → ~11.7×10.5 world units
const SURFACE_Y = 0.26; // extrusion top in slab-local space

function toWorld(x: number, y: number): [number, number] {
  return [(x - 200) * MAP_SCALE, (y - 180) * MAP_SCALE];
}

const HUB = CITIES.find((c) => c.hub === true) ?? { x: 227, y: 172 };

export function KsaMap3D(): JSX.Element {
  const root = useRef<THREE.Group>(null);
  const beaconRefs = useRef<Array<THREE.Group | null>>([]);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);
  const scanRef = useRef<THREE.Mesh>(null);
  const scanMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const arcRefs = useRef<Array<{ material?: { dashOffset: number; opacity: number } } | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);

  /* ── Geometry (built once) ──────────────────────────────────────────── */
  const { slabGeometry, edgeGeometry } = useMemo(() => {
    const shape = new THREE.Shape();
    KSA_OUTLINE.forEach(([x, y], i) => {
      const [wx, wy] = toWorld(x, y);
      // Shape lives in XY; we rotate -90° about X, so flip Y to keep north up.
      if (i === 0) shape.moveTo(wx, -wy);
      else shape.lineTo(wx, -wy);
    });
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: SURFACE_Y,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
    });
    geometry.rotateX(-Math.PI / 2);

    const edges = new THREE.EdgesGeometry(geometry, 28);
    return { slabGeometry: geometry, edgeGeometry: edges };
  }, []);

  const mode = useTheme();
  const locale = useLocale();
  const P = SCENE[mode];

  const slabMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: P.slab,
        metalness: P.slabMetalness,
        roughness: P.slabRoughness,
      }),
    [P],
  );

  useEffect(() => {
    return () => {
      slabMaterial.dispose();
    };
  }, [slabMaterial]);

  /** Hub arcs: quadratic beziers lifted above the surface. */
  const arcs = useMemo(() => {
    const [hx, hy] = toWorld(HUB.x, HUB.y);
    return CITIES.filter((c) => c.hub !== true).map((city) => {
      const [cx, cy] = toWorld(city.x, city.y);
      const mid = new THREE.Vector3((hx + cx) / 2, SURFACE_Y + 1.15, (hy + cy) / 2);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(cx, SURFACE_Y + 0.05, cy),
        mid,
        new THREE.Vector3(hx, SURFACE_Y + 0.05, hy),
      );
      return curve.getPoints(36).map((v) => [v.x, v.y, v.z] as [number, number, number]);
    });
  }, []);

  /* ── Per-frame choreography ─────────────────────────────────────────── */
  useFrame((state) => {
    const p = scrollState.reduced ? (PHASES.collarEnd + PHASES.networkEnd) / 2 : scrollState.current;
    const t = state.clock.elapsedTime;

    const rise = phase(p, PHASES.collarEnd, PHASES.collarEnd + 0.14);
    const settle = 1 - Math.pow(1 - rise, 3);
    const g = root.current;
    if (g !== null) {
      g.position.y = lerp(-5.2, -1.3, settle);
      g.visible = rise > 0.001;
      g.rotation.y = Math.sin(t * 0.05) * 0.02;
    }

    // Beacons ignite with stagger across the network window.
    const ignite = phase(p, PHASES.collarEnd + 0.06, PHASES.networkEnd);
    CITIES.forEach((city, i) => {
      const local = clamp01(ignite * 1.6 - i * 0.14);
      const beacon = beaconRefs.current[i];
      if (beacon !== undefined && beacon !== null) {
        beacon.scale.setScalar(Math.max(0.0001, local));
      }
      const ring = ringRefs.current[i];
      if (ring !== undefined && ring !== null) {
        const pulse = (t * 0.6 + i * 0.3) % 1;
        ring.scale.setScalar(Math.max(0.0001, local * (0.4 + pulse * 1.7)));
        const material = ring.material as THREE.MeshBasicMaterial;
        material.opacity = local * (1 - pulse) * 0.6;
      }
      const label = labelRefs.current[i];
      if (label !== undefined && label !== null) {
        label.style.opacity = String(local);
      }
    });

    // Arc draw-on + slow dash drift.
    const link = phase(p, PHASES.collarEnd + 0.1, PHASES.networkEnd + 0.04);
    arcRefs.current.forEach((line, i) => {
      const material = line?.material;
      if (material !== undefined) {
        material.opacity = clamp01(link * 1.5 - i * 0.08);
        material.dashOffset = -t * 0.35;
      }
    });

    // Security scan: an expanding ring sweeping the slab during the AI phase.
    const scanPhase = phase(p, PHASES.networkEnd, PHASES.aiEnd);
    const scan = scanRef.current;
    const scanMat = scanMatRef.current;
    if (scan !== null && scanMat !== null) {
      const active = scanPhase > 0.01 && scanPhase < 0.999;
      scan.visible = active || (scrollState.reduced && false);
      const sweep = (t * 0.22) % 1;
      const radius = lerp(0.4, 8.5, sweep);
      scan.scale.setScalar(radius);
      scanMat.opacity = active ? (1 - sweep) * 0.5 * clamp01(scanPhase * 4) * clamp01((1 - scanPhase) * 4 + 0.2) : 0;
    }
  });

  return (
    <group ref={root} visible={false}>
      {/* Slab + crisp emerald edges */}
      <mesh geometry={slabGeometry} material={slabMaterial} castShadow />
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color={P.edge} transparent opacity={P.edgeOpacity} />
      </lineSegments>

      {/* Ground disc under the slab: glow pool in the dark, soft contact
          shadow in daylight. */}
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.5, 48]} />
        <meshBasicMaterial color={P.disc} transparent opacity={P.discOpacity} />
      </mesh>

      {/* City beacons */}
      {CITIES.map((city, i) => {
        const [x, z] = toWorld(city.x, city.y);
        const hub = city.hub === true;
        const color = hub ? P.hubBeacon : P.cityBeacon;
        return (
          <group key={city.id} position={[x, SURFACE_Y, z]}>
            <group
              ref={(el) => {
                beaconRefs.current[i] = el;
              }}
            >
              {/* light column (additive glow in the dark, solid ink in light) */}
              <mesh position={[0, hub ? 0.85 : 0.55, 0]}>
                <cylinderGeometry args={[0.016, hub ? 0.07 : 0.05, hub ? 1.7 : 1.1, 10, 1, true]} />
                <meshBasicMaterial color={color} transparent opacity={P.columnOpacity} blending={P.glowBlending} depthWrite={false} />
              </mesh>
              <mesh position={[0, hub ? 1.74 : 1.14, 0]}>
                <sphereGeometry args={[hub ? 0.085 : 0.06, 14, 14]} />
                <meshBasicMaterial color={color} />
              </mesh>
            </group>
            {/* pulsing ground ring */}
            <mesh
              ref={(el) => {
                ringRefs.current[i] = el;
              }}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.02, 0]}
            >
              <ringGeometry args={[0.3, 0.36, 40]} />
              <meshBasicMaterial color={color} transparent opacity={0} blending={P.glowBlending} depthWrite={false} />
            </mesh>
            <Html center distanceFactor={11} position={[0, hub ? 2.15 : 1.5, 0]} zIndexRange={[20, 11]}>
              <div
                className="city-label"
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
              >
                <span className="city-ar">{city.name[locale]}</span>
                <span className="city-en">{city.code}</span>
              </div>
            </Html>
          </group>
        );
      })}

      {/* Hub arcs */}
      {arcs.map((points, i) => (
        <Line
          key={i}
          ref={(el) => {
            arcRefs.current[i] = el as unknown as { material?: { dashOffset: number; opacity: number } };
          }}
          points={points}
          color={P.arc}
          lineWidth={P.arcWidth}
          dashed
          dashSize={0.22}
          gapSize={0.14}
          transparent
          opacity={0}
        />
      ))}

      {/* Security scan ring (unit ring, scaled per frame) */}
      <mesh ref={scanRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, SURFACE_Y + 0.03, 0]} visible={false}>
        <ringGeometry args={[0.92, 1, 64]} />
        <meshBasicMaterial
          ref={scanMatRef}
          color={P.scan}
          transparent
          opacity={0}
          blending={P.glowBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
