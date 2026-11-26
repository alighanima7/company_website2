import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { JSX, ReactNode } from "react";
import * as THREE from "three";

import { dampK, motionState, phase } from "../motion";
import { timedFrame } from "../perf/probe";
import {
  getShowroomLabels,
  IDLE_RETURN_AFTER_S,
  PITCH_MAX,
  PITCH_MIN,
  showroomState,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../showroom";
import { SCENE, useTheme } from "../theme";
import { StageGlow } from "./FmcDevice";

/**
 * The showroom's interaction rig — a PARENT group over the active product
 * scene, so the user's rotation composes with whatever the scene does to
 * its own transforms and nothing fights over rotation.y.
 *
 * Per frame it:
 *  · integrates release inertia (yawV/pitchV decay exponentially),
 *  · clamps pitch (and yaw, for products with a declared maxYaw),
 *  · after IDLE_RETURN_AFTER_S of stillness eases the view back to the
 *    default pose (yaw/pitch → 0 the SHORT way around, zoom → 1),
 *  · adds the gentle idle sway — gated OFF while dragging, within the
 *    idle-return delay, under prefers-reduced-motion, while the tab is
 *    hidden, and on devices that cannot hold ~45fps (rolling sample;
 *    sticky for the session once tripped — weak GPUs don't flap),
 *  · damps the zoom factor the DOM wheel/pinch handlers target
 *    (CameraRig divides its pose distance by the damped value),
 *  · billboards the stage halo and positions the exploded-part labels
 *    (see LabelProjector below).
 *
 * The faint floor ring and the halo sit OUTSIDE the rotating group: the
 * stage doesn't tip or swing when the model does. (The old in-scene glow
 * disc DID ride the rig and faced +Z — from the trucked camera it
 * projected as a hard diagonal beam; billboarding is the fix.)
 *
 * Phase B (hotspots) hook: `rigGroup` is the world transform any
 * screen-space projection must compose with.
 */

/** The rig's group — exposed for Phase B's hotspot projection. */
export const rigGroup: { current: THREE.Group | null } = { current: null };

/** Rolling frame-time window for the sway's FPS gate. */
const FPS_WINDOW = 90;
const FPS_TRIP_MS = 22; // sustained mean above this (~<45fps) trips the gate

const frameTimes: number[] = [];
let frameSum = 0;

function FloorRing(): JSX.Element {
  const mode = useTheme();
  const P = SCENE[mode];
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: P.edge,
        transparent: true,
        opacity: mode === "dark" ? 0.22 : 0.3,
        depthWrite: false,
      }),
    [P.edge, mode],
  );
  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.45, 0]} material={material}>
      <ringGeometry args={[1.56, 1.6, 72]} />
    </mesh>
  );
}

/** Wrap an angle into (-π, π] so the idle return unwinds the short way. */
function shortestWrap(angle: number): number {
  const tau = Math.PI * 2;
  let a = angle % tau;
  if (a > Math.PI) a -= tau;
  if (a < -Math.PI) a += tau;
  return a;
}

/* ── Label projector ──────────────────────────────────────────────────
   Exploded-part labels, positioned entirely in screen space each frame:

    · anchor = the part's own bbox center (part-local, registered by the
      scene) carried through node.matrixWorld — it follows the explode
      offset AND the user's rotation; a hair of camera-ward nudge keeps
      the dot reading as "on the near surface" (screen-invariant: the
      nudge runs along the projection ray).
    · text sits OUTSIDE the model's projected rect, pushed radially from
      the model's screen center, then de-collided (sorted, min vertical
      gap) and clamped out of the text zone / strip / top chrome.
    · leader = one thin line from the dot to the text's near edge, angle
      computed per label per frame — never a fixed direction.
    · fades: explode-settle in/out (tracks the damped value, so assemble
      fades them away), faces-away (part's outward explode direction vs
      the camera), off-screen.

   All DOM writes are imperative (transform/opacity strings); all DOM
   READS happen outside the frame loop (ShowroomPage publishes the safe
   rects; text sizes are measured once per content change).             */

const V_ANCHOR = new THREE.Vector3();
const V_DIR = new THREE.Vector3();
const V_CORNER = new THREE.Vector3();
const M_CENTER = new THREE.Vector3();

const EDGE = 16; // viewport padding

interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  side: 1 | -1;
  opacity: number;
  el: { root: HTMLElement; line: HTMLElement; text: HTMLElement };
}

function LabelProjector(): null {
  useFrame(
    timedFrame("frame:labels", (state, dt) => {
      const labels = getShowroomLabels();
      if (labels.length === 0) return;
      const cam = state.camera;
      const W = state.size.width;
      const H = state.size.height;
      const safe = showroomState.safe;
      const settle = phase(showroomState.explodeCurrent, 0.9, 0.985);

      // Model silhouette + occluder rects from EVERY solid mesh under the
      // rig — narrated or not (galileosky narrates 3 of its 6 parts; the
      // keep-out must still cover the unnarrated fittings).
      let mnX = Infinity;
      let mnY = Infinity;
      let mxX = -Infinity;
      let mxY = -Infinity;
      const partRects: Array<{
        node: THREE.Object3D;
        x0: number;
        y0: number;
        x1: number;
        y1: number;
        dist: number;
      }> = [];
      const rg = rigGroup.current;
      if (rg === null) return;
      rg.updateWorldMatrix(true, true);
      rg.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh !== true) return;
        const mat = mesh.material as THREE.Material | THREE.Material[];
        const type = Array.isArray(mat) ? mat[0]?.type : mat.type;
        if (type !== "MeshStandardMaterial" && type !== "MeshPhysicalMaterial") return;
        if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (bb === null) return;
        let px0 = Infinity;
        let py0 = Infinity;
        let px1 = -Infinity;
        let py1 = -Infinity;
        for (let i = 0; i < 8; i += 1) {
          V_CORNER.set(
            (i & 1) === 0 ? bb.min.x : bb.max.x,
            (i & 2) === 0 ? bb.min.y : bb.max.y,
            (i & 4) === 0 ? bb.min.z : bb.max.z,
          );
          V_CORNER.applyMatrix4(mesh.matrixWorld).project(cam);
          const sx = (V_CORNER.x * 0.5 + 0.5) * W;
          const sy = (-V_CORNER.y * 0.5 + 0.5) * H;
          if (sx < px0) px0 = sx;
          if (sy < py0) py0 = sy;
          if (sx > px1) px1 = sx;
          if (sy > py1) py1 = sy;
        }
        if (px0 < mnX) mnX = px0;
        if (py0 < mnY) mnY = py0;
        if (px1 > mxX) mxX = px1;
        if (py1 > mxY) mxY = py1;
        V_CORNER.copy(bb.min).add(bb.max).multiplyScalar(0.5);
        V_CORNER.applyMatrix4(mesh.matrixWorld);
        partRects.push({
          node: mesh,
          x0: px0,
          y0: py0,
          x1: px1,
          y1: py1,
          dist: V_CORNER.distanceTo(cam.position),
        });
      });
      if (partRects.length === 0) return;
      const mcx = (mnX + mxX) / 2;
      const mcy = (mnY + mxY) / 2;

      const placed: Placed[] = [];
      const fadeK = Math.min(1, dt * 7); // damp the binary gates: no popping
      for (const L of labels) {
        const root = L.els.root;
        const line = L.els.line;
        const text = L.els.text;
        if (root === null || line === null || text === null) continue;

        // Anchor: part bbox center → world, plus a small camera-ward
        // nudge (along the projection ray — screen position unchanged).
        V_ANCHOR.copy(L.center).applyMatrix4(L.node.matrixWorld);
        V_DIR.copy(cam.position).sub(V_ANCHOR);
        const minHalf = Math.min(L.halfExtents.x, L.halfExtents.y, L.halfExtents.z);
        const anchorDist = V_DIR.length();
        V_ANCHOR.addScaledVector(V_DIR.normalize(), minHalf * 0.3);

        M_CENTER.copy(V_ANCHOR).project(cam);
        const ax = (M_CENTER.x * 0.5 + 0.5) * W;
        const ay = (-M_CENTER.y * 0.5 + 0.5) * H;
        const behind = M_CENTER.z > 1;

        // "Faces away" = the anchor is COVERED by a nearer part after a
        // user rotation. (An explode-sign normal was tried first and
        // wrongly hid parts that fly backward yet sit fully visible
        // beside the body, like fmc920's harness.)
        let occluded = false;
        for (let oi = 0; oi < partRects.length; oi += 1) {
          const r = partRects[oi];
          if (r === undefined || r.node === L.node) continue;
          if (
            r.dist < anchorDist - minHalf &&
            ax > r.x0 + 2 &&
            ax < r.x1 - 2 &&
            ay > r.y0 + 2 &&
            ay < r.y1 - 2
          ) {
            occluded = true;
            break;
          }
        }
        const offscreen = behind || ax < -40 || ax > W + 40 || ay < -40 || ay > H + 40;
        L.fade += ((occluded || offscreen ? 0 : 1) - L.fade) * fadeK;

        const opacity = settle * L.fade;
        if (opacity < 0.015) {
          root.style.opacity = "0";
          continue;
        }

        // Radial preference: which side of the model this label leans.
        let dx = ax - mcx;
        let dy = ay - mcy;
        const len = Math.hypot(dx, dy);
        if (len < 1) {
          dx = mcx < W / 2 ? -1 : 1;
          dy = 0;
        } else {
          dx /= len;
          dy /= len;
        }

        const tw = text.offsetWidth; // static between content changes
        const th = text.offsetHeight;
        const side: 1 | -1 = dx >= 0 ? 1 : -1;
        placed.push({
          x: 0, // resolved below — columns/bands, not free radial pushes
          y: ay + dy * 24,
          w: tw,
          h: th,
          ax,
          ay,
          side,
          opacity,
          el: { root, line, text },
        });
      }

      /* ── Placement: columns beside the silhouette, bands above/below ──
         A label's TEXT may never cross the model, another label, the
         text zone, the strip or the control row. Free radial pushes with
         corrective clamps could not guarantee that (clamps re-collided
         what earlier steps separated — measured), so placement is now
         structural:

           1. each label goes to a side COLUMN (fully left or right of
              the model rect) when that side has room — preferring its
              radial side, avoiding the text zone's side unless the gap
              between model and zone fits the text;
           2. otherwise into the clear BAND above or below the model;
           3. labels in the same column/band resolve overlaps with a
              bidirectional chain relaxation (height-aware gaps);
           4. a cell with no fitting region parks the label flush at the
              band edge — the matrix flags any residual overlap.        */

      const topLimit = (safe?.topInset ?? 70) + 14;
      let bottomLimit = (safe?.stripTop ?? H - 70) - 20;
      const tz = safe?.text ?? null;
      // The text zone is a SIDE panel on wide layouts but a full-width
      // BOTTOM sheet on phones. A stacked zone must lower the vertical
      // window — treating it as a side panel collapsed the horizontal
      // span to nonsense and pushed labels off-viewport (measured).
      const zoneStacked = tz !== null && tz.x < mcx && tz.x + tz.w > mcx;
      if (tz !== null && zoneStacked) bottomLimit = Math.min(bottomLimit, tz.y - 12);

      interface Region {
        kind: "left" | "right" | "top" | "bottom";
        members: Placed[];
      }
      const regions: Record<Region["kind"], Placed[]> = {
        left: [],
        right: [],
        top: [],
        bottom: [],
      };

      // Horizontal room on each side of the model (minus the text zone
      // when it owns that side).
      let leftEdge = EDGE;
      let rightEdge = W - EDGE;
      if (tz !== null && !zoneStacked) {
        if (tz.x + tz.w / 2 < mcx) leftEdge = Math.max(leftEdge, tz.x + tz.w + 18);
        else rightEdge = Math.min(rightEdge, tz.x - 18);
      }
      if (rightEdge - leftEdge < 140) {
        // Degenerate span (extreme zones) — fall back to the viewport.
        leftEdge = EDGE;
        rightEdge = W - EDGE;
      }
      const roomLeft = mnX - 12 - leftEdge;
      const roomRight = rightEdge - (mxX + 12);
      const roomTop = mnY - 10 - topLimit;
      const roomBottom = bottomLimit - (mxY + 10);

      for (const pl of placed) {
        const fitsLeft = roomLeft >= pl.w;
        const fitsRight = roomRight >= pl.w;
        const prefer: Region["kind"][] =
          pl.side === -1
            ? ["left", "right", pl.ay <= mcy ? "top" : "bottom", pl.ay <= mcy ? "bottom" : "top"]
            : ["right", "left", pl.ay <= mcy ? "top" : "bottom", pl.ay <= mcy ? "bottom" : "top"];
        let chosen: Region["kind"] | null = null;
        for (const k of prefer) {
          if (k === "left" && fitsLeft) chosen = "left";
          else if (k === "right" && fitsRight) chosen = "right";
          else if (k === "top" && roomTop >= pl.h) chosen = "top";
          else if (k === "bottom" && roomBottom >= pl.h) chosen = "bottom";
          if (chosen !== null) break;
        }
        if (chosen === null) chosen = roomBottom >= roomTop ? "bottom" : "top";
        regions[chosen].push(pl);
      }

      // Side columns: x pinned beside the silhouette; y from the anchor,
      // chain-relaxed, clamped to the vertical window.
      for (const kind of ["left", "right"] as const) {
        const col = regions[kind];
        if (col.length === 0) continue;
        for (const pl of col) {
          pl.side = kind === "left" ? -1 : 1;
          pl.x = kind === "left" ? mnX - 12 : mxX + 12; // text near edge
          pl.y = Math.max(topLimit + pl.h / 2, Math.min(bottomLimit - pl.h / 2, pl.ay));
        }
        col.sort((a, b) => a.y - b.y);
        for (let pass = 0; pass < 6; pass += 1) {
          let moved = false;
          for (let i = 1; i < col.length; i += 1) {
            const a = col[i - 1];
            const b = col[i];
            if (a === undefined || b === undefined) continue;
            const need = (a.h + b.h) / 2 + 12;
            const gap = b.y - a.y;
            if (gap < need) {
              const push = (need - gap) / 2;
              a.y -= push;
              b.y += push;
              moved = true;
            }
          }
          const first = col[0];
          const last = col[col.length - 1];
          if (first !== undefined && first.y - first.h / 2 < topLimit) {
            const d = topLimit - (first.y - first.h / 2);
            for (const pl of col) pl.y += d;
            moved = true;
          }
          if (last !== undefined && last.y + last.h / 2 > bottomLimit) {
            const d = last.y + last.h / 2 - bottomLimit;
            for (const pl of col) pl.y -= d;
            moved = true;
          }
          if (!moved) break;
        }
      }

      // Bands hold ONE row each — when a band's labels cannot fit the
      // free span side by side, the widest overflow moves to the other
      // band BEFORE relaxation (a post-hoc second row had nowhere to go
      // on phones and got clamped back onto row one — measured).
      {
        const span = rightEdge - leftEdge;
        const width = (arr: Placed[]): number =>
          arr.reduce((acc, pl) => acc + pl.w + 18, 0) - (arr.length > 0 ? 18 : 0);
        const give = (from: Placed[], to: Placed[]): void => {
          while (from.length > 1 && width(from) > span) {
            let widest = 0;
            for (let i = 1; i < from.length; i += 1) {
              const a = from[i];
              const b = from[widest];
              if (a !== undefined && b !== undefined && a.w > b.w) widest = i;
            }
            const moved = from.splice(widest, 1)[0];
            if (moved !== undefined) to.push(moved);
            else break;
          }
        };
        if (width(regions.top) > span) give(regions.top, regions.bottom);
        if (width(regions.bottom) > span) give(regions.bottom, regions.top);
      }

      // Bands: y pinned above/below the silhouette; x from the anchor,
      // chain-relaxed horizontally, clamped to the free span.
      for (const kind of ["top", "bottom"] as const) {
        const band = regions[kind];
        if (band.length === 0) continue;
        const bandY =
          kind === "top"
            ? Math.max(topLimit + 10, mnY - 22)
            : Math.min(bottomLimit - 10, mxY + 30);
        for (const pl of band) {
          pl.y = kind === "top" ? bandY - pl.h / 2 : bandY + pl.h / 2;
          // Side by anchor; x = text near-edge at the anchor column.
          pl.side = pl.ax <= mcx ? -1 : 1;
          pl.x = pl.ax + (pl.side === 1 ? 10 : -10);
          const lo = leftEdge;
          const hi = rightEdge;
          const l0 = pl.side === 1 ? pl.x : pl.x - pl.w;
          if (l0 < lo) pl.x += lo - l0;
          else if (l0 + pl.w > hi) pl.x -= l0 + pl.w - hi;
        }
        band.sort((a, b) => a.x - b.x);
        const lo = leftEdge;
        const hi = rightEdge;
        for (let round = 0; round < 4; round += 1) {
          let moved = false;
          for (let i = 1; i < band.length; i += 1) {
            const a = band[i - 1];
            const b = band[i];
            if (a === undefined || b === undefined) continue;
            const aL = a.side === 1 ? a.x : a.x - a.w;
            const bL = b.side === 1 ? b.x : b.x - b.w;
            const need = a.w + 18;
            const gap = bL - aL;
            if (gap < need) {
              const push = (need - gap) / 2;
              a.x -= push;
              b.x += push;
              moved = true;
            }
          }
          // Relaxation must never escape the span — re-clamp every round
          // (unclamped pushes were measured 30px past the zone edge and
          // 53px off the viewport's start).
          for (const pl of band) {
            const l0 = pl.side === 1 ? pl.x : pl.x - pl.w;
            if (l0 < lo) {
              pl.x += lo - l0;
              moved = true;
            } else if (l0 + pl.w > hi) {
              pl.x -= l0 + pl.w - hi;
              moved = true;
            }
          }
          if (!moved) break;
        }
      }

      for (const p of placed) {
        const attachX = p.side === 1 ? p.x - 6 : p.x + 6;
        const lineLen = Math.hypot(attachX - p.ax, p.y - p.ay);
        const angle = Math.atan2(p.y - p.ay, attachX - p.ax);
        p.el.root.style.opacity = String(p.opacity);
        p.el.root.style.transform = `translate3d(${String(p.ax)}px, ${String(p.ay)}px, 0)`;
        p.el.line.style.width = `${String(Math.max(0, lineLen))}px`;
        p.el.line.style.transform = `rotate(${String(angle)}rad)`;
        p.el.text.style.transform = `translate(${String(p.x - p.ax)}px, ${String(
          p.y - p.ay,
        )}px) translate(${p.side === 1 ? "0" : "-100%"}, -50%)`;
      }
    }),
  );
  return null;
}

/** Camera-facing halo (dark theme): replaces the scenes' in-scene glow
 *  disc on this route. Billboarded every frame and parked OUTSIDE the
 *  rotating group, so it can never smear into a beam or ride a drag. */
function Halo(): JSX.Element | null {
  const mode = useTheme();
  const glow = SCENE[mode].stageGlow;
  const mesh = useRef<THREE.Mesh | null>(null);
  useFrame((state) => {
    mesh.current?.quaternion.copy(state.camera.quaternion);
  });
  if (glow === null) return null;
  return (
    <StageGlow
      color={glow}
      position={[0, 0.2, -2.4]}
      scale={3.1}
      opacity={0.62}
      meshRef={(el) => {
        mesh.current = el;
      }}
    />
  );
}

export function ShowroomRig({ children }: { children: ReactNode }): JSX.Element {
  useFrame(
    timedFrame("frame:rig", (state, dt) => {
      const s = showroomState;
      const g = rigGroup.current;
      if (g === null) return;
      const t = state.clock.elapsedTime;

      // FPS gate: a rolling mean over the last FPS_WINDOW frames; trips
      // once and stays off for the session.
      if (s.fpsOk && dt > 0 && dt < 0.5) {
        const ms = dt * 1000;
        frameTimes.push(ms);
        frameSum += ms;
        if (frameTimes.length > FPS_WINDOW) frameSum -= frameTimes.shift() ?? 0;
        if (frameTimes.length === FPS_WINDOW && frameSum / FPS_WINDOW > FPS_TRIP_MS) {
          s.fpsOk = false;
        }
      }

      // Release inertia — the gesture layer writes positions directly
      // while dragging, so integration only runs after release.
      if (!s.dragging) {
        s.yaw += s.yawV * dt;
        s.pitch += s.pitchV * dt;
        const decay = Math.exp(-3.2 * dt);
        s.yawV *= decay;
        s.pitchV *= decay;
      }
      s.pitch = THREE.MathUtils.clamp(s.pitch, PITCH_MIN, PITCH_MAX);
      if (s.maxYaw !== null) s.yaw = THREE.MathUtils.clamp(s.yaw, -s.maxYaw, s.maxYaw);

      const idleFor = (performance.now() - s.lastInteract) / 1000;
      const resting = !s.dragging && idleFor > IDLE_RETURN_AFTER_S;

      // Idle return: ease home the short way around, and bring the zoom
      // back with it. Under reduced motion the return is immediate.
      if (resting) {
        if (motionState.reduced) {
          s.yaw = 0;
          s.pitch = 0;
          s.zoomTarget = 1;
          s.yawV = 0;
          s.pitchV = 0;
        } else {
          const k = dampK(0.02, dt);
          s.yaw = shortestWrap(s.yaw) * (1 - k);
          s.pitch *= 1 - k;
          s.zoomTarget += (1 - s.zoomTarget) * k;
        }
      }

      // Gentle sway — only while resting, and only when every gate allows.
      const sway =
        resting && !motionState.reduced && !document.hidden && s.fpsOk
          ? Math.sin(t * 0.3) * 0.045
          : 0;

      g.rotation.y = s.yaw + sway;
      g.rotation.x = s.pitch;

      // Damped zoom for CameraRig (which divides pose distance by it).
      s.zoomTarget = THREE.MathUtils.clamp(s.zoomTarget, ZOOM_MIN, ZOOM_MAX);
      if (motionState.reduced) s.zoom = s.zoomTarget;
      else s.zoom += (s.zoomTarget - s.zoom) * dampK(0.002, dt);
    }),
  );

  return (
    <>
      <Halo />
      <FloorRing />
      <group
        ref={(el) => {
          rigGroup.current = el;
        }}
      >
        {children}
      </group>
      <LabelProjector />
    </>
  );
}
