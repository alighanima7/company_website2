import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { COPY } from "../content";
import { dampHomeScroll } from "../homeScroll";
import { getLocale, useLocale } from "../locale";
import { dampK, lerp, motionState, phase } from "../motion";
import { useProduct } from "../productState";
import { useIsMobile, useViewportTier, viewport } from "../responsive";
import type { ViewportTier } from "../responsive";
import { getRoute, useRoute } from "../router";
import type { Route } from "../router";
import { getTheme, SCENE, useTheme } from "../theme";
import { CityScape3D } from "./CityScape3D";
import { Collar3D } from "./Collar3D";
import { FmcDevice } from "./FmcDevice";
import { KsaMap3D } from "./KsaMap3D";
import { Logo3D } from "./Logo3D";
import { Tracker } from "./Tracker";

/** Post stack loads on demand — touch devices never fetch its chunks. */
const Effects = lazy(() => import("./Effects"));

/**
 * The persistent 3D stage: ONE fixed full-viewport canvas behind the DOM
 * for the whole app session. Routes swap the scene CONTENT as React
 * subtrees — each showcase disposes its geometry, materials and loader
 * cache on unmount — while the WebGL context, the PMREM environment and
 * the lighting rig survive every navigation (no context churn, no
 * re-upload of the IBL).
 *
 *  · home      → the 3D brand logo floating over the Kingdom map
 *  · products  → the active product showcase (tracker / collar / city)
 *  · support, requests → an empty stage: the themed canvas, fog and
 *    vignette become the page backdrop for pure-DOM content
 *
 * The camera glides between per-route poses on a critically-damped ease
 * (the same convergence law the old scroll rig used), with the pointer
 * parallax and the strict-zoning side truck carried over from the film.
 */

interface StagePose {
  readonly pos: readonly [number, number, number];
  readonly look: readonly [number, number, number];
  /** Strength of the 72% side truck — 1 for routes whose DOM keeps a side
   *  panel (strict zoning), 0 for centered form pages. */
  readonly side: number;
}

const POSES: Record<Route, StagePose> = {
  home: { pos: [0.4, 2.7, 12.2], look: [0, 0.3, 0], side: 1 },
  products: { pos: [2.2, 1.15, 8.6], look: [0, 0.25, 0], side: 1 },
  support: { pos: [0, 1.7, 10.5], look: [0, 0.4, 0], side: 0 },
  requests: { pos: [0, 1.7, 10.5], look: [0, 0.4, 0], side: 0 },
};

/** Horizontal NDC where a side-zoned route's model anchor must project:
 *  72% of the viewport from the copy column's start edge. */
const MODEL_NDC = 0.44;

interface FrameFit {
  readonly fov: number;
  readonly dolly: number;
  readonly sideX: number;
  readonly tilt: number;
}

/** Responsive lens — the same contract the film used: ≥768px keeps strict
 *  side-by-side zoning (slim aspects dolly out as the open half's world
 *  budget shrinks); phones stack — centered composition, wide lens, and a
 *  tilt that parks the scene in the upper half above the bottom-docked
 *  copy. */
function fitFor(tier: ViewportTier, width: number, height: number): FrameFit {
  const aspect = width / Math.max(1, height);
  if (tier === "mobile") {
    const narrow = Math.min(1.6, Math.max(1, 1 + (1 - aspect) * 0.6));
    return { fov: 54, dolly: 1.02 * narrow, sideX: 0, tilt: -0.23 };
  }
  const slim = Math.min(2, Math.max(1, 1.6 / aspect));
  if (tier === "tablet") return { fov: 46, dolly: 1.04 * slim, sideX: 1, tilt: -0.04 };
  return { fov: 42, dolly: slim, sideX: 1, tilt: 0 };
}

const POS = new THREE.Vector3(0, 0.55, 7.6);
const LOOK = new THREE.Vector3(0, 0.3, 0);
const TPOS = new THREE.Vector3();
const TLOOK = new THREE.Vector3();

function CameraRig(): null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const tier = useViewportTier();
  const fit = useMemo(() => fitFor(tier, size.width, size.height), [tier, size.width, size.height]);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = fit.fov;
    persp.updateProjectionMatrix();
  }, [camera, fit.fov]);

  useFrame((state, dt) => {
    const route = getRoute();
    const pose = POSES[route];
    TPOS.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    TLOOK.set(pose.look[0], pose.look[1], pose.look[2]);

    // Home depth film: damp the route-scoped scroll ONCE per frame here
    // (the scenes read the damped value after us — frame callbacks run in
    // mount order) and ride the lens forward along Z through the passage,
    // settling the gaze onto the low-slung map for Act 2. Z-dolly only:
    // the authored height and the zoning truck stay untouched, and the
    // other routes never enter this branch.
    if (route === "home") {
      const hp = dampHomeScroll(dt);
      TPOS.z -= 3.2 * phase(hp, 0.3, 0.85);
      TLOOK.y = lerp(pose.look[1], -0.12, phase(hp, 0.55, 0.92));
    }

    // The compositions are authored for RTL (panels inline-start = right).
    // LTR mirrors the camera so every model sits OPPOSITE the text column.
    const mx = getLocale() === "en" ? -1 : 1;
    TPOS.x *= mx;
    TLOOK.x *= mx;

    // True dolly along the view axis — authored angles survive re-framing.
    TPOS.sub(TLOOK).multiplyScalar(fit.dolly).add(TLOOK);

    // Strict-zoning truck: slide camera AND target laterally so the
    // route's model anchor projects at exactly MODEL_NDC — exact for
    // every dolly and aspect by construction.
    const side = pose.side * fit.sideX;
    if (side > 0) {
      const aspect = size.width / Math.max(1, size.height);
      const tanH = Math.tan((fit.fov * Math.PI) / 360) * aspect;
      const shift = MODEL_NDC * side * TPOS.distanceTo(TLOOK) * tanH * mx;
      TPOS.x += shift;
      TLOOK.x += shift;
    }

    // A breath of pointer parallax keeps held frames alive — desktop only:
    // on touch the pointer freezes wherever the last tap landed.
    if (!viewport.coarse && !motionState.reduced) {
      TPOS.x += state.pointer.x * 0.25;
      TPOS.y -= state.pointer.y * 0.15;
    }

    if (motionState.reduced) {
      POS.copy(TPOS);
      LOOK.copy(TLOOK);
    } else {
      // Critically-damped glide between route poses, dt-normalized so the
      // camera covers the same distance per second on 60Hz and 120Hz.
      const k = dampK(0.002, dt);
      POS.lerp(TPOS, k);
      LOOK.lerp(TLOOK, k);
    }

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
    // fog so the far content (the Kingdom slab) stays as crisp as desktop.
    scene.fog = new THREE.FogExp2(p.fog, p.fogDensity * (isMobile ? 0.72 : 1));
  }, [gl, scene, mode, isMobile]);

  return null;
}

/** Surfaces WebGL context loss to the DOM. `preventDefault` on the lost
 *  event is what allows the browser to attempt a restore; three re-uploads
 *  its resources on `webglcontextrestored` by itself. */
function ContextLossGuard({ onChange }: { onChange: (lost: boolean) => void }): null {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    const onLost = (e: Event): void => {
      e.preventDefault();
      onChange(true);
    };
    const onRestored = (): void => {
      onChange(false);
    };
    el.addEventListener("webglcontextlost", onLost);
    el.addEventListener("webglcontextrestored", onRestored);
    return () => {
      el.removeEventListener("webglcontextlost", onLost);
      el.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, onChange]);

  return null;
}

/** DEV-only: exposes renderer.info so automated checks can assert that
 *  geometries/textures drop back after leaving a 3D route (leak canary). */
function DevGlInfo(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __glinfo?: THREE.WebGLInfo }).__glinfo = gl.info;
    }
  }, [gl]);
  return null;
}

/** Route → scene content. Each branch unmounts WHOLLY on navigation; the
 *  showcases' effects dispose everything they created. */
function RouteScene(): JSX.Element | null {
  const route = useRoute();
  const product = useProduct();

  if (route === "home") {
    return (
      <>
        <Logo3D />
        <KsaMap3D />
      </>
    );
  }
  if (route === "products") {
    if (product === "collar") return <Collar3D />;
    if (product === "city") return <CityScape3D />;
    if (product === "fmc130" || product === "fmc920") return <FmcDevice id={product} />;
    return <Tracker />;
  }
  return null;
}

export function Stage(): JSX.Element {
  const mode = useTheme();
  const p = SCENE[mode];
  const isMobile = useIsMobile();
  const locale = useLocale();
  const [glLost, setGlLost] = useState(false);

  // Bloom/vignette are desktop-only (pointer: fine) — on phones the composer
  // passes alone would eat the 60fps budget. LIVE media queries: a
  // convertible switching modes or an OS reduced-motion toggle takes effect
  // without a reload (and gates the lazy Effects download with it).
  const [effectsOn, setEffectsOn] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (): void => {
      setEffectsOn(fine.matches && !reduce.matches);
    };
    sync();
    fine.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
    };
  }, []);

  // PERF (mobile): cap the render resolution at 1.5× — full 2–3× retina
  // ratios melt phone GPUs for no visible gain at phone viewing distance.
  const dpr = useMemo<number | [number, number]>(
    () => (isMobile ? Math.min(window.devicePixelRatio, 1.5) : ([1, 2] as [number, number])),
    [isMobile],
  );

  const onContextChange = useCallback((lost: boolean) => {
    setGlLost(lost);
  }, []);

  return (
    <>
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
          <DevGlInfo />

          {/* Key / rim / fill / hemisphere — per-theme. Daylight gets a crisp
              white key + silver-blue ambient dome for rich speculars; the ops
              room keeps its moody three-point rig. The key casts real shadows
              in daylight. PERF: plain PCF + 1K map, NOT "soft"/2K. */}
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
              the key light's shadow. (The glow pools play this role in the
              dark theme.) */}
          {p.shadows && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.615, 0]} receiveShadow>
              <planeGeometry args={[36, 36]} />
              <shadowMaterial transparent opacity={p.shadowOpacity} color={p.shadowColor} />
            </mesh>
          )}

          <RouteScene />

          <ContextLossGuard onChange={onContextChange} />

          {/* Post stack: lazy chunk, desktop-only (see Effects.tsx). */}
          {effectsOn && (
            <Suspense fallback={null}>
              <Effects />
            </Suspense>
          )}
        </Canvas>
      </div>

      {/* GPU reset mid-session: the browser usually restores the context on
          its own (the guard prevents the default teardown); this visible,
          focusable chip covers the case where it doesn't. */}
      {glLost && (
        <button
          type="button"
          className="gl-hint"
          onClick={() => {
            window.location.reload();
          }}
        >
          {COPY.glLost[locale]}
        </button>
      )}
    </>
  );
}
