import { Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";

import { CITIES, KSA_OUTLINE } from "../content";
import { homeScroll } from "../homeScroll";
import { useLocale } from "../locale";
import { clamp01, lerp, motionState, phase } from "../motion";
import { viewport } from "../responsive";
import { SCENE, useTheme } from "../theme";

/**
 * The Kingdom as a dark glass slab: the production radar's hand projection
 * extruded into 3D, with the five operating cities as light beacons wired to
 * the Riyadh hub, and a security scan ring sweeping the surface.
 *
 * Acts 1–2 of the Home depth film: parked DEEP on the Z-axis at load (a
 * dim, unlit landmass behind the foreground logo, softened by the fog),
 * it advances along Z to its stage plane as the scroll passage plays,
 * ignites its beacons with stagger on arrival, draws the hub arcs, then
 * holds the stage with the scan sweeping. Every beat keys off
 * homeScroll.current, so scrubbing back replays it in reverse. Reduced
 * motion maps the scroll directly with pulses and sweep stilled.
 */

const MAP_SCALE = 1 / 34; // 400×360 source units → ~11.7×10.5 world units
const SURFACE_Y = 0.26; // extrusion top in slab-local space

function toWorld(x: number, y: number): [number, number] {
  return [(x - 200) * MAP_SCALE, (y - 180) * MAP_SCALE];
}

const HUB = CITIES.find((c) => c.hub === true) ?? { x: 227, y: 172 };

/* ── Topography ─────────────────────────────────────────────────────────
   Stylized low-poly elevation over the slab, matching the Kingdom's real
   regions: the Sarawat range running inland of the Red Sea coast (peaking
   toward Abha), the Tabuk/Hijaz highlands in the northwest, the gentle
   Najd plateau around Riyadh, and a soft eastern slope to the Gulf. The
   boundary feather pulls every height to zero near the outline, which is
   what makes Jeddah and Dammam sit on true coastal plains for free.     */

/** Sarawat crest polyline (projection coords), inland of the coastline. */
const RIDGE: ReadonlyArray<readonly [number, number]> = [
  [40, 100], [70, 175], [105, 245], [142, 315], [172, 345],
];

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / len2);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function distToRidge(px: number, py: number): number {
  let d = Infinity;
  for (let i = 0; i < RIDGE.length - 1; i += 1) {
    const a = RIDGE[i];
    const b = RIDGE[i + 1];
    if (a && b) d = Math.min(d, segDist(px, py, a[0], a[1], b[0], b[1]));
  }
  return d;
}

function distToOutline(px: number, py: number): number {
  let d = Infinity;
  for (let i = 0; i < KSA_OUTLINE.length; i += 1) {
    const a = KSA_OUTLINE[i];
    const b = KSA_OUTLINE[(i + 1) % KSA_OUTLINE.length];
    if (a && b) d = Math.min(d, segDist(px, py, a[0], a[1], b[0], b[1]));
  }
  return d;
}

function pointInKsa(px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = KSA_OUTLINE.length - 1; i < KSA_OUTLINE.length; j = i, i += 1) {
    const a = KSA_OUTLINE[i];
    const b = KSA_OUTLINE[j];
    if (!a || !b) continue;
    if (a[1] > py !== b[1] > py && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** Elevation (world units) at a projection-space point. Deterministic. */
function heightAt(px: number, py: number): number {
  const south = clamp01((py - 150) / 170);
  const dRidge = distToRidge(px, py);
  const sarawat = Math.exp(-(dRidge * dRidge) / 2312) * (0.36 + 0.5 * south); // σ=34
  const dTabuk = Math.hypot(px - 52, py - 82);
  const tabuk = Math.exp(-(dTabuk * dTabuk) / 4232) * 0.32; // σ=46
  const dNajd = Math.hypot((px - 215) * 0.9, py - 182);
  const najd = Math.exp(-(dNajd * dNajd) / 18050) * 0.2; // σ=95
  const ripple =
    0.034 * Math.sin(px * 0.085 + py * 0.053) +
    0.027 * Math.sin(px * 0.041 - py * 0.077) +
    0.02 * Math.sin(px * 0.019 + py * 0.027);
  const eastSlope = 1 - 0.5 * clamp01((px - 250) / 100);
  // Smoothstepped feather with a flat 4-unit coastal apron: heights melt
  // into the slab well before the outline, so the silhouette stays the
  // slab's crisp bevel instead of stair-stepped mountain cells.
  const f = clamp01((distToOutline(px, py) - 4) / 34);
  const feather = f * f * (3 - 2 * f);
  return Math.max(0, (sarawat + tabuk + najd + 0.055 + ripple) * eastSlope * feather);
}

/** Non-indexed low-poly grid clipped to the Kingdom outline. Built once.
 *  PERF: the point-in-polygon test per cell corner dominates first paint —
 *  touch devices get a coarser grid (6 vs 4), which halves both the build
 *  time and the triangle count with no visible loss at phone size. Keyed on
 *  the input (coarse pointer), not the width, so rotation never rebuilds. */
function buildTerrainGeometry(): THREE.BufferGeometry {
  const STEP = viewport.coarse ? 6 : 4; // projection units per cell (~0.12 world at 4 — crisp facets)
  const positions: number[] = [];
  const S = MAP_SCALE;
  const lift = (px: number, py: number): [number, number, number] => [
    (px - 200) * S,
    SURFACE_Y + heightAt(px, py),
    (py - 180) * S,
  ];
  for (let px = 0; px < 396; px += STEP) {
    for (let py = 4; py < 352; py += STEP) {
      const corners: Array<[number, number]> = [
        [px, py],
        [px + STEP, py],
        [px + STEP, py + STEP],
        [px, py + STEP],
      ];
      if (!corners.every(([cx, cy]) => pointInKsa(cx, cy))) continue;
      const v = corners.map(([cx, cy]) => lift(cx, cy));
      const [v0, v1, v2, v3] = v;
      if (!v0 || !v1 || !v2 || !v3) continue;
      positions.push(...v0, ...v2, ...v1, ...v0, ...v3, ...v2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function KsaMap3D(): JSX.Element {
  const root = useRef<THREE.Group>(null);
  const beaconRefs = useRef<Array<THREE.Group | null>>([]);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);
  const scanRef = useRef<THREE.Mesh>(null);
  const scanMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const arcRefs = useRef<Array<Line2 | LineSegments2 | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  // City-label <Html> portals mount only once the passage brings the slab
  // toward the stage — Act 0 never pays their per-frame transform cost.
  const [labelsLive, setLabelsLive] = useState(false);
  const labelsLiveRef = useRef(false);

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

  useEffect(() => {
    return () => {
      slabGeometry.dispose();
      edgeGeometry.dispose();
    };
  }, [slabGeometry, edgeGeometry]);

  const terrainGeometry = useMemo(buildTerrainGeometry, []);
  useEffect(() => {
    return () => {
      terrainGeometry.dispose();
    };
  }, [terrainGeometry]);

  /** Per-city elevation so beacons, rings and arcs sit ON the terrain. */
  const cityHeights = useMemo(() => CITIES.map((c) => heightAt(c.x, c.y)), []);

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

  const terrainMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: P.terrain,
        flatShading: true, // per-facet normals — the clean low-poly read
        metalness: 0.08,
        roughness: 0.78,
      }),
    [P],
  );
  useEffect(() => {
    return () => {
      terrainMaterial.dispose();
    };
  }, [terrainMaterial]);

  /** Hub arcs: quadratic beziers lifted above the surface — endpoints ride
   *  each city's terrain elevation, the apex clears the Sarawat peaks. */
  const arcs = useMemo(() => {
    const [hx, hy] = toWorld(HUB.x, HUB.y);
    const hubH = heightAt(HUB.x, HUB.y);
    return CITIES.filter((c) => c.hub !== true).map((city) => {
      const [cx, cy] = toWorld(city.x, city.y);
      const cityH = heightAt(city.x, city.y);
      const mid = new THREE.Vector3((hx + cx) / 2, SURFACE_Y + 1.35, (hy + cy) / 2);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(cx, SURFACE_Y + 0.06 + cityH, cy),
        mid,
        new THREE.Vector3(hx, SURFACE_Y + 0.06 + hubH, hy),
      );
      return curve.getPoints(36).map((v) => [v.x, v.y, v.z] as [number, number, number]);
    });
  }, []);

  /* ── Per-frame choreography: scroll-staged depth emergence ──────────── */
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const reduced = motionState.reduced;
    const p = homeScroll.current;

    // The passage, all on the Z-axis: deep park → stage plane. Ignition
    // and linking trail the arrival so the map lights up AS it lands.
    const emerge = phase(p, 0.38, 0.82);
    const ignite = phase(p, 0.6, 0.95);
    const link = phase(p, 0.66, 0.98);

    const live = p > 0.55;
    if (live !== labelsLiveRef.current) {
      labelsLiveRef.current = live;
      setLabelsLive(live);
    }

    const g = root.current;
    if (g !== null) {
      g.visible = true;
      // Composition slot: constant height and scale — depth alone carries
      // the drama. Phones shrink the slab to the narrow frame instead of
      // dollying the lens deeper into the fog.
      g.scale.setScalar(viewport.isMobile ? 0.52 : 0.8);
      g.position.set(
        0,
        viewport.isMobile ? -1.08 : -1.62,
        lerp(viewport.isMobile ? -6.4 : -7.5, -0.5, emerge),
      );
      g.rotation.y = reduced ? 0 : Math.sin(t * 0.05) * 0.02;
    }

    // Beacons ignite with stagger as the slab reaches its stage plane.
    CITIES.forEach((_city, i) => {
      const local = clamp01(ignite * 1.6 - i * 0.14);
      const beacon = beaconRefs.current[i];
      if (beacon !== undefined && beacon !== null) {
        beacon.scale.setScalar(Math.max(0.0001, local));
      }
      const ring = ringRefs.current[i];
      if (ring !== undefined && ring !== null) {
        const pulse = reduced ? 0.4 : (t * 0.6 + i * 0.3) % 1;
        ring.scale.setScalar(Math.max(0.0001, local * (0.4 + pulse * 1.7)));
        const material = ring.material as THREE.MeshBasicMaterial;
        material.opacity = reduced ? local * 0.25 : local * (1 - pulse) * 0.6;
      }
      const label = labelRefs.current[i];
      if (label !== undefined && label !== null) {
        label.style.opacity = String(local);
      }
    });

    // Arc draw-on + slow dash drift.
    arcRefs.current.forEach((line, i) => {
      const material = line?.material;
      if (material !== undefined) {
        material.opacity = clamp01(link * 1.5 - i * 0.08);
        if (!reduced) material.dashOffset = -t * 0.35;
      }
    });

    // Security scan: sweeps only once the map owns the stage (Act 2),
    // stilled under reduced motion.
    const scan = scanRef.current;
    const scanMat = scanMatRef.current;
    if (scan !== null && scanMat !== null) {
      if (reduced || p < 0.85) {
        scan.visible = false;
        scanMat.opacity = 0;
      } else {
        const cycle = (t * 0.09) % 1; // ~11s period, sweep then rest
        const sweeping = cycle < 0.55;
        scan.visible = sweeping;
        if (sweeping) {
          const sweep = cycle / 0.55;
          scan.scale.setScalar(lerp(0.4, 8.5, sweep));
          scanMat.opacity = (1 - sweep) * 0.42;
        } else {
          scanMat.opacity = 0;
        }
      }
    }
  });

  return (
    <group ref={root} visible={false}>
      {/* Slab base + crisp edges, with the low-poly terrain riding on top */}
      <mesh geometry={slabGeometry} material={slabMaterial} castShadow />
      <mesh geometry={terrainGeometry} material={terrainMaterial} castShadow />
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color={P.edge} transparent opacity={P.edgeOpacity} />
      </lineSegments>

      {/* Ground disc under the slab: glow pool in the dark, soft contact
          shadow in daylight. */}
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.5, 48]} />
        <meshBasicMaterial color={P.disc} transparent opacity={P.discOpacity} />
      </mesh>

      {/* City beacons — each group sits at its city's terrain elevation */}
      {CITIES.map((city, i) => {
        const [x, z] = toWorld(city.x, city.y);
        const hub = city.hub === true;
        const color = hub ? P.hubBeacon : P.cityBeacon;
        return (
          <group key={city.id} position={[x, SURFACE_Y + (cityHeights[i] ?? 0), z]}>
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
              position={[0, 0.045, 0]}
            >
              <ringGeometry args={[0.3, 0.36, 40]} />
              <meshBasicMaterial color={color} transparent opacity={0} blending={P.glowBlending} depthWrite={false} />
            </mesh>
            {labelsLive && (
              <Html center distanceFactor={11} position={[0, hub ? 1.92 : 1.5, 0]} zIndexRange={[20, 11]}>
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
            )}
          </group>
        );
      })}

      {/* Hub arcs */}
      {arcs.map((points, i) => (
        <Line
          key={i}
          ref={(el) => {
            arcRefs.current[i] = el;
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

      {/* Security scan ring (unit ring, scaled per frame). Sits just above
          the slab — where it meets the western ranges it reads as sweeping
          behind the mountains. */}
      <mesh ref={scanRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, SURFACE_Y + 0.06, 0]} visible={false}>
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
