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
export const CANVAS_COLOR: Record<ThemeMode, string> = { light: "#f4ebe1", dark: "#1e1a17" };

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
  /** Low-poly topographic surface riding on the slab. */
  readonly terrain: string;
  /** Smart City micro-model. */
  readonly cityBase: string;
  readonly cityTower: string;
  readonly cityWindowA: string;
  readonly cityWindowB: string;
  readonly cityPulse: string;
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
    // Warm earthy daylight (the 5-color system): Warm Beige #F4EBE1 canvas
    // and fog, warm key + sand fill, Sage #2F5233 / Terracotta #C87A53 line
    // work, brown-tinted shadows. Clarity comes from deep warm strokes on a
    // soft ground — zero glare. The device hardware keeps its navy alloy +
    // emerald LEDs (product identity, reads near-black on beige like a
    // product shot on kraft paper).
    canvas: "#f4ebe1",
    fog: "#efe4d7",
    fogDensity: 0.02,
    exposure: 1.08,
    envIntensity: 0.95,
    keyIntensity: 2.2,
    keyColor: "#fff6ec",
    rimIntensity: 0.75,
    rimColor: "#3f6b46",
    fillIntensity: 0.55,
    fillColor: "#cdb9a4",
    hemiIntensity: 0.5,
    hemiSky: "#f0e2d2",
    hemiGround: "#f4ebe1",
    shadows: true,
    shadowOpacity: 0.25,
    shadowColor: "#3e332e",
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
    slab: "#294733",
    slabMetalness: 0.45,
    slabRoughness: 0.42,
    terrain: "#3e6b4b",
    cityBase: "#cdbaa2",
    cityTower: "#efe6d8",
    cityWindowA: "#3f8f55",
    cityWindowB: "#c87a53",
    cityPulse: "#c87a53",
    edge: "#6fa077",
    edgeOpacity: 1,
    disc: "#3e332e",
    discOpacity: 0.12,
    hubBeacon: "#c87a53",
    cityBeacon: "#4e7d57",
    arc: "#c87a53",
    arcWidth: 2.4,
    scan: "#4e8c5b",
    glowBlending: THREE.NormalBlending,
    columnOpacity: 0.95,
  },
  dark: {
    // Warm luxury night (the dark 5-color system): #1E1A17 brown-gray
    // canvas and fog, ivory key light, bright-sage rim, terracotta glow
    // fill. The map and city remap to dark-beige/sage/terracotta; the
    // device hardware keeps its navy alloy + emerald/cyan LEDs (product
    // identity, same rule as the light theme).
    canvas: "#1e1a17",
    fog: "#1e1a17",
    fogDensity: 0.026,
    exposure: 1.0,
    envIntensity: 0.5,
    keyIntensity: 1.7,
    keyColor: "#f3e9dd",
    rimIntensity: 0.95,
    rimColor: "#6b8e6f",
    fillIntensity: 0.5,
    fillColor: "#dd8d65",
    hemiIntensity: 0,
    hemiSky: "#3a332c",
    hemiGround: "#1e1a17",
    shadows: false,
    shadowOpacity: 0,
    shadowColor: "#000000",
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
    slab: "#241f1a",
    slabMetalness: 0.5,
    slabRoughness: 0.45,
    terrain: "#2e362c",
    cityBase: "#2a2420",
    cityTower: "#38322b",
    cityWindowA: "#6b8e6f",
    cityWindowB: "#dd8d65",
    cityPulse: "#dd8d65",
    edge: "#6b8e6f",
    edgeOpacity: 0.6,
    disc: "#3a2c20",
    discOpacity: 0.5,
    hubBeacon: "#dd8d65",
    cityBeacon: "#6b8e6f",
    arc: "#dd8d65",
    arcWidth: 1.6,
    scan: "#6b8e6f",
    glowBlending: THREE.AdditiveBlending,
    columnOpacity: 0.7,
  },
};
