import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo } from "react";
import type { JSX } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { PHASES } from "../content";
import { getLocale } from "../locale";
import { MOBILE_MAX_PX, TABLET_MAX_PX, useIsMobile, viewport } from "../responsive";
import { clamp01, dampScroll, lerp, scrollState } from "../scroll";
import { getTheme, SCENE, useTheme } from "../theme";
import { CityScape3D } from "./CityScape3D";
import { Collar3D } from "./Collar3D";
import { KsaMap3D } from "./KsaMap3D";
import { Tracker } from "./Tracker";

/**
 * Scene orchestration: one fixed full-viewport canvas behind the DOM, a
 * keyframed camera flown by the damped scroll value, studio-ish IBL from
 * three's bundled RoomEnvironment (no network HDR fetch), and bloom/vignette
 * only where the device can afford it.
 */

interface CamKey {
  p: number; // mutable: re-anchored to the live PHASES every frame
  readonly pos: readonly [number, number, number];
  readonly look: readonly [number, number, number];
}

/** The whole film, as ten camera marks. The `p` of the eight middle marks
 *  is re-derived from the runtime-synced PHASES so the cuts always land on
 *  the narrative beats, whatever the real section geometry turns out to be.
 *
 *  SIDE-BY-SIDE RULE: each act's look-at is offset on X so the model parks
 *  on the side OPPOSITE its copy panel (Arabic/RTL reference — the rig is
 *  mirrored wholesale for LTR, see CameraRig): hero & collar copy sit
 *  inline-start (right) so their models project LEFT (look.x > 0);
 *  teardown & city copy sit inline-end (left) so their models project
 *  RIGHT (look.x < 0); the network panel is top-center so the map is
 *  pushed DOWN (look.y raised); the AI panel is left so the map leans
 *  right. Models and panels never stack. */
const CAM_KEYS: readonly CamKey[] = [
  { p: 0.0, pos: [0.4, 0.55, 7.6], look: [1.5, 0.2, 0] },
  { p: 0.13, pos: [2.8, 1.35, 5.5], look: [1.35, 0.12, 0] },
  { p: 0.27, pos: [-3.6, 1.75, 5.8], look: [-1.1, 0.4, 0] },
  { p: 0.37, pos: [3.1, 1.0, 4.4], look: [1.2, 0.1, 0] },
  { p: 0.46, pos: [-2.7, 0.8, 4.9], look: [1.1, 0.05, 0] },
  { p: 0.54, pos: [3.4, 2.0, 5.2], look: [-1.2, 0.55, 0] },
  { p: 0.62, pos: [-3.0, 1.1, 5.4], look: [-1.1, 0.45, 0] },
  { p: 0.75, pos: [0, 6.8, 10.4], look: [0, 0.4, 0] },
  { p: 0.9, pos: [-6.6, 4.7, 7.0], look: [-0.8, -0.95, 0] },
  { p: 1.0, pos: [0.6, 2.5, 12.2], look: [0, -0.55, 0] },
];

function syncCamKeys(): void {
  const k1 = CAM_KEYS[1];
  const k2 = CAM_KEYS[2];
  const k3 = CAM_KEYS[3];
  const k4 = CAM_KEYS[4];
  const k5 = CAM_KEYS[5];
  const k6 = CAM_KEYS[6];
  const k7 = CAM_KEYS[7];
  const k8 = CAM_KEYS[8];
  if (k1) k1.p = PHASES.heroEnd * 0.85;
  if (k2) k2.p = lerp(PHASES.heroEnd, PHASES.teardownEnd, 0.85);
  if (k3) k3.p = lerp(PHASES.teardownEnd, PHASES.collarEnd, 0.3);
  if (k4) k4.p = lerp(PHASES.teardownEnd, PHASES.collarEnd, 0.85);
  if (k5) k5.p = lerp(PHASES.collarEnd, PHASES.cityEnd, 0.3);
  if (k6) k6.p = lerp(PHASES.collarEnd, PHASES.cityEnd, 0.85);
  if (k7) k7.p = lerp(PHASES.cityEnd, PHASES.networkEnd, 0.6);
  if (k8) k8.p = lerp(PHASES.networkEnd, PHASES.aiEnd, 0.55);
}

const POS = new THREE.Vector3();
const LOOK = new THREE.Vector3();

function sampleCamera(p: number, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
  const last = CAM_KEYS[CAM_KEYS.length - 1] as CamKey;
  let a: CamKey = CAM_KEYS[0] as CamKey;
  let b: CamKey = last;
  for (let i = 0; i < CAM_KEYS.length - 1; i += 1) {
    const k0 = CAM_KEYS[i] as CamKey;
    const k1 = CAM_KEYS[i + 1] as CamKey;
    if (p >= k0.p && p <= k1.p) {
      a = k0;
      b = k1;
      break;
    }
  }
  const span = Math.max(1e-5, b.p - a.p);
  const t0 = clamp01((p - a.p) / span);
  // Smootherstep keeps each cut gentle at both ends of its segment.
  const t = t0 * t0 * t0 * (t0 * (t0 * 6 - 15) + 10);
  outPos.set(lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t));
  outLook.set(
    lerp(a.look[0], b.look[0], t),
    lerp(a.look[1], b.look[1], t),
    lerp(a.look[2], b.look[2], t),
  );
}

interface FrameFit {
  /** Vertical FOV — phones get a wider lens for the narrow portrait frame. */
  readonly fov: number;
  /** Dolly factor along the view axis (1 = the authored distance). */
  readonly dolly: number;
  /** How much of the side-by-side X offset survives (1 = full, 0 = centered). */
  readonly sideX: number;
  /** Downward camera tilt (radians) that parks the model in the UPPER part
   *  of the frame while the copy stacks underneath. */
  readonly tilt: number;
}

/** Responsive lens, mirroring the styles.css breakpoints: phones trade the
 *  authored side-by-side framing for a stacked one — side offsets compress
 *  toward center, the camera dollies straight back so wide beats (the
 *  exploded teardown, the Kingdom slab) clear the frame, and a small
 *  downward tilt lifts every act into the top half of the screen. Tablets
 *  get a gentler version; desktop is the authored film, untouched. */
function fitFor(width: number, height: number): FrameFit {
  const aspect = width / Math.max(1, height);
  if (width <= MOBILE_MAX_PX) {
    // The narrower the portrait aspect, the longer the extra dolly —
    // a 375px phone needs more headroom than a 414px one.
    const narrow = Math.min(1.6, Math.max(1, 1 + (1 - aspect) * 0.6));
    return { fov: 54, dolly: 1.12 * narrow, sideX: 0.3, tilt: -0.16 };
  }
  if (width <= TABLET_MAX_PX) return { fov: 46, dolly: 1.08, sideX: 0.72, tilt: -0.05 };
  return { fov: 42, dolly: 1, sideX: 1, tilt: 0 };
}

function CameraRig(): null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const fit = useMemo(() => fitFor(size.width, size.height), [size.width, size.height]);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = fit.fov;
    persp.updateProjectionMatrix();
  }, [camera, fit.fov]);

  useFrame((state, dt) => {
    syncCamKeys();
    const restPose = (PHASES.cityEnd + PHASES.networkEnd) / 2;
    const p = scrollState.reduced ? restPose : dampScroll(Math.min(dt, 0.05));
    sampleCamera(p, POS, LOOK);
    // The film is authored for RTL (panels inline-start = right). For LTR
    // the panels mirror via CSS logical properties — mirroring the camera's
    // X keeps every model on the side OPPOSITE its panel in both locales.
    const mx = getLocale() === "en" ? -1 : 1;
    // A breath of parallax from the pointer keeps held frames alive —
    // desktop only: on touch the pointer freezes wherever the last tap
    // landed, which would hold the whole film permanently off-axis.
    const px = viewport.coarse ? 0 : state.pointer.x * 0.25;
    const py = viewport.coarse ? 0 : state.pointer.y * 0.15;
    LOOK.set(LOOK.x * mx * fit.sideX, LOOK.y, LOOK.z);
    POS.set(POS.x * mx * fit.sideX + px, POS.y - py, POS.z);
    // True dolly: back the camera away from its look target along the view
    // axis, so every authored angle survives the responsive re-framing.
    POS.sub(LOOK).multiplyScalar(fit.dolly).add(LOOK);
    camera.position.copy(POS);
    camera.lookAt(LOOK);
    if (fit.tilt !== 0) camera.rotateX(fit.tilt);
  });

  return null;
}

/** Bundled-asset IBL: PMREM from RoomEnvironment — zero network, real PBR.
 *  Also owns everything atmospheric that must follow the theme: clear color,
 *  fog and environment intensity. */
function StudioEnvironment(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const mode = useTheme();
  const isMobile = useIsMobile();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    return () => {
      scene.environment = null;
      env.texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    const p = SCENE[mode];
    gl.setClearColor(p.canvas, 1);
    // ACES filmic keeps metals and emissives in range; daylight runs a
    // hotter exposure so the alloy stays punchy instead of washing flat.
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = p.exposure;
    scene.environmentIntensity = p.envIntensity;
    // The mobile rig dollies the camera further out — ease the exponential
    // fog so the far beats (the Kingdom slab) stay as crisp as on desktop.
    scene.fog = new THREE.FogExp2(p.fog, p.fogDensity * (isMobile ? 0.72 : 1));
  }, [gl, scene, mode, isMobile]);

  return null;
}

export function Experience(): JSX.Element {
  const mode = useTheme();
  const p = SCENE[mode];
  const isMobile = useIsMobile();

  // Bloom/vignette are desktop-only already (pointer: fine) — on phones the
  // composer passes alone would eat the 60fps budget.
  const effectsOn = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // PERF (mobile): cap the render resolution at 1.5× — full 2–3× retina
  // ratios melt phone GPUs (thermal throttle → dropped frames, battery
  // drain) for no visible gain at phone viewing distance. Desktop keeps
  // the authored [1, 2] range.
  const dpr = useMemo<number | [number, number]>(
    () => (isMobile ? Math.min(window.devicePixelRatio, 1.5) : ([1, 2] as [number, number])),
    [isMobile],
  );

  return (
    <div className="stage" aria-hidden="true">
      <Canvas
        dpr={dpr}
        shadows
        camera={{ fov: 42, near: 0.1, far: 70, position: [0, 0.55, 7.6] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(SCENE[getTheme()].canvas, 1);
        }}
      >
        <StudioEnvironment />
        <CameraRig />

        {/* Key / rim / fill / hemisphere — per-theme. Daylight gets a crisp
            white key + silver-blue ambient dome for rich speculars on the
            navy metal; the ops room keeps its moody three-point rig. The key
            casts real shadows in daylight. PERF: plain PCF + 1K map, NOT
            "soft"/2K — PCFSoft over a screen-filling catcher cratered
            integrated GPUs to ~1fps (measured). */}
        <directionalLight
          position={[4, 6, 5]}
          intensity={p.keyIntensity}
          color={p.keyColor}
          castShadow={p.shadows}
          shadow-mapSize={isMobile ? [512, 512] : [1024, 1024]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
        <directionalLight position={[-6, 3, -4]} intensity={p.rimIntensity} color={p.rimColor} />
        <pointLight position={[0, -2.5, 3]} intensity={p.fillIntensity} color={p.fillColor} />
        {p.hemiIntensity > 0 && (
          <hemisphereLight args={[p.hemiSky, p.hemiGround, p.hemiIntensity]} />
        )}

        {/* Daylight grounding: an invisible catcher plane that renders ONLY
            the key light's shadow — crisp directional grounding under the
            device, its exploded parts and the Kingdom slab. (The glow pool
            plays this role in the dark theme.) */}
        {p.shadows && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.615, 0]} receiveShadow>
            {/* Sized to the shadow frustum — a bigger plane only adds
                shadow-sampling fragments, never more shadow. */}
            <planeGeometry args={[36, 36]} />
            <shadowMaterial transparent opacity={p.shadowOpacity} color={p.shadowColor} />
          </mesh>
        )}

        {/* Clean-studio stage: no floor grid, no particle dust — the solid
            canvas plus real shadows (light) / glow (dark) carry the ground. */}
        <Tracker />
        <Collar3D />
        <CityScape3D />
        <KsaMap3D />

        {/* Bloom belongs to the dark ops room only: on a light canvas the
            whole frame crosses the luminance threshold and hazes over. */}
        {effectsOn &&
          (p.bloom ? (
            <EffectComposer key={mode}>
              <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.22} luminanceSmoothing={0.2} />
              <Vignette eskil={false} offset={p.vignetteOffset} darkness={p.vignetteDarkness} />
            </EffectComposer>
          ) : (
            <EffectComposer key={mode}>
              <Vignette eskil={false} offset={p.vignetteOffset} darkness={p.vignetteDarkness} />
            </EffectComposer>
          ))}
      </Canvas>
    </div>
  );
}
