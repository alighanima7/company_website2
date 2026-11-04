import { useSyncExternalStore } from "react";
import * as THREE from "three";

/**
 * Theme system — same contract as the production site, scoped to v2:
 *
 *  · LIGHT is the base theme and the first-visit default. DARK is an
 *    explicit override stamped as `data-theme="dark"` on <html>.
 *  · No `prefers-color-scheme` probe anywhere — only explicit choice
 *    persists (localStorage + cookie mirror), read pre-paint by the
 *    inline bootstrap in index.html, so there is zero theme flash.
 *  · v2-scoped keys (`nns.theme.v2` / `nns-v2-theme`) so the experimental
 *    build never touches the production app's theme state on localhost.
 */

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "nns.theme.v2";
export const THEME_COOKIE = "nns-v2-theme";
/** Canvas color per theme — also the toggle cross-fade veil color. */
export const CANVAS_COLOR: Record<ThemeMode, string> = { light: "#eef2f6", dark: "#020a12" };

const listeners = new Set<() => void>();

let mode: ThemeMode =
  typeof document !== "undefined" && document.documentElement.dataset["theme"] === "dark"
    ? "dark"
    : "light";

export function getTheme(): ThemeMode {
  return mode;
}

export function setTheme(next: ThemeMode): void {
  if (next === mode) return;
  mode = next;

  const root = document.documentElement;
  if (next === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");

  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* storage unavailable (private mode) — cookie still carries the choice */
  }
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;

  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CANVAS_COLOR[next]);

  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — any component (DOM or inside the R3F canvas) re-renders on switch. */
export function useTheme(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getTheme);
}

/* ── 3D scene palettes ──────────────────────────────────────────────────
   DARK is a glow instrument: additive blending + bloom + emissive neon.
   LIGHT is a daylight studio: a bright key + silver-blue hemisphere fill,
   stronger IBL for crisp speculars on the navy metal, a soft contact
   shadow grounding the object, normal blending and deep brand inks
   (emerald #0f8a4d / security navy #0d6e9e) — additive light and low
   bloom thresholds are invisible-or-haze on a light canvas.            */

export interface ScenePalette {
  readonly canvas: string;
  readonly fog: string;
  readonly fogDensity: number;
  /** ACES filmic exposure — daylight runs hotter so metals stay punchy. */
  readonly exposure: number;
  readonly envIntensity: number;
  readonly keyIntensity: number;
  readonly keyColor: string;
  readonly rimIntensity: number;
  readonly rimColor: string;
  readonly fillIntensity: number;
  readonly fillColor: string;
  readonly hemiIntensity: number;
  readonly hemiSky: string;
  readonly hemiGround: string;
  /** Real key-light shadows onto a ShadowMaterial catcher (light theme). */
  readonly shadows: boolean;
  readonly shadowOpacity: number;
  readonly shadowColor: string;
  readonly gridCell: string;
  readonly gridSection: string;
  readonly gridCellThickness: number;
  readonly gridSectionThickness: number;
  readonly sparkA: string;
  readonly sparkB: string;
  readonly sparkOpacityA: number;
  readonly sparkOpacityB: number;
  readonly bloom: boolean;
  readonly vignetteDarkness: number;
  readonly vignetteOffset: number;
  /** Tracker materials. */
  readonly bodyColor: string;
  readonly bodyMetalness: number;
  readonly bodyRoughness: number;
  readonly darkPartColor: string;
  readonly pcbBoardColor: string;
  readonly emissiveEmerald: number;
  readonly emissiveIce: number;
  readonly emissivePcb: number;
  /** Kingdom map. */
  readonly slab: string;
  readonly slabMetalness: number;
  readonly slabRoughness: number;
  readonly edge: string;
  readonly edgeOpacity: number;
  readonly disc: string;
  readonly discOpacity: number;
  readonly hubBeacon: string;
  readonly cityBeacon: string;
  readonly arc: string;
  readonly arcWidth: number;
  readonly scan: string;
  readonly glowBlending: THREE.Blending;
  readonly columnOpacity: number;
}

export const SCENE: Record<ThemeMode, ScenePalette> = {
  light: {
    // Muted pearl-slate canvas + calmer exposure/key: anti-glare for long
    // viewing. Line work (grid/edges/arcs) runs DEEPER and heavier instead,
    // so clarity comes from contrast of strokes, not brightness of ground.
    canvas: "#eef2f6",
    fog: "#eaeff4",
    fogDensity: 0.02,
    exposure: 1.08,
    envIntensity: 0.9,
    keyIntensity: 2.0,
    keyColor: "#ffffff",
    rimIntensity: 0.65,
    rimColor: "#1b9e56",
    fillIntensity: 0.55,
    fillColor: "#8fb6d4",
    hemiIntensity: 0.5,
    hemiSky: "#dfeaf4",
    hemiGround: "#eef2f6",
    shadows: true,
    shadowOpacity: 0.26,
    shadowColor: "#0d2440",
    gridCell: "#94a9bc",
    gridSection: "#5f9b7a",
    gridCellThickness: 0.85,
    gridSectionThickness: 1.4,
    sparkA: "#0f8a4d",
    sparkB: "#0d4b6e",
    sparkOpacityA: 0.22,
    sparkOpacityB: 0.15,
    bloom: false,
    vignetteDarkness: 0.22,
    vignetteOffset: 0.1,
    bodyColor: "#123a54",
    bodyMetalness: 0.88,
    bodyRoughness: 0.3,
    darkPartColor: "#102c3e",
    pcbBoardColor: "#0d3527",
    emissiveEmerald: 1.5,
    emissiveIce: 1.1,
    emissivePcb: 0.4,
    slab: "#0f3350",
    slabMetalness: 0.5,
    slabRoughness: 0.38,
    edge: "#128a4f",
    edgeOpacity: 1,
    disc: "#0d4b6e",
    discOpacity: 0.14,
    hubBeacon: "#12a35f",
    cityBeacon: "#1180b3",
    arc: "#0e7fb0",
    arcWidth: 2.4,
    scan: "#10a057",
    glowBlending: THREE.NormalBlending,
    columnOpacity: 0.95,
  },
  dark: {
    canvas: "#020a12",
    fog: "#020a12",
    fogDensity: 0.026,
    exposure: 1.0,
    envIntensity: 0.42,
    keyIntensity: 1.5,
    keyColor: "#cfe9ff",
    rimIntensity: 0.8,
    rimColor: "#3fd98b",
    fillIntensity: 0.5,
    fillColor: "#4fc3e8",
    hemiIntensity: 0,
    hemiSky: "#1a3448",
    hemiGround: "#020a12",
    shadows: false,
    shadowOpacity: 0,
    shadowColor: "#000000",
    gridCell: "#0a2a3c",
    gridSection: "#0f4b32",
    gridCellThickness: 0.6,
    gridSectionThickness: 1,
    sparkA: "#3fd98b",
    sparkB: "#4fc3e8",
    sparkOpacityA: 0.42,
    sparkOpacityB: 0.3,
    bloom: true,
    vignetteDarkness: 0.78,
    vignetteOffset: 0.18,
    bodyColor: "#0b2436",
    bodyMetalness: 0.82,
    bodyRoughness: 0.32,
    darkPartColor: "#071722",
    pcbBoardColor: "#0c2e21",
    emissiveEmerald: 2.2,
    emissiveIce: 1.6,
    emissivePcb: 0.55,
    slab: "#07131f",
    slabMetalness: 0.55,
    slabRoughness: 0.42,
    edge: "#1b9e56",
    edgeOpacity: 0.55,
    disc: "#06243a",
    discOpacity: 0.55,
    hubBeacon: "#3fd98b",
    cityBeacon: "#4fc3e8",
    arc: "#4fc3e8",
    arcWidth: 1.4,
    scan: "#3fd98b",
    glowBlending: THREE.AdditiveBlending,
    columnOpacity: 0.65,
  },
};
