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
export const CANVAS_COLOR: Record<ThemeMode, string> = { light: "#F1E6CF", dark: "#1C1D20" };

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
   The 60-30-10 brand carried into the scene: the canvas is the 60%
   dominant (#F1E6CF cream studio / #1C1D20 charcoal night), structural
   materials (map slab, city blocks, collar, housings) sit on the 30%
   green/gray secondary, and ORANGE #FF5A26 is the single 10% signal
   voice — LEDs, scan sweeps, arcs, beacons, window glow, rim light.
   DARK is a glow instrument (additive blending + bloom, retuned for the
   orange emissives); LIGHT is a clean studio under a hot white key with
   real contact shadows and normal blending.                            */

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
  /** Albedo multiplier for the imported GLB device (Tracker.tsx): white
   *  preserves the authored charcoal/PCB/brass texture; a cool tint pulls
   *  the housing toward the navy-alloy identity under a warm key. */
  readonly deviceTint: string;
  /** Emissive intensity for the 3D brand logo (its baked emissive map):
   *  a hint of life in daylight, a glow the bloom can pick up at night. */
  readonly logoEmissive: number;
  readonly darkPartColor: string;
  readonly pcbBoardColor: string;
  readonly emissiveEmerald: number;
  readonly emissiveIce: number;
  readonly emissivePcb: number;
  /** LED/indicator materials (base + emissive), PCB trace tint and the GPS
   *  contact-pad metal — themed so daylight runs charcoal hardware with
   *  mint signals while the dark theme keeps its navy/emerald identity. */
  readonly ledBase: string;
  readonly ledEmissive: string;
  readonly iceBase: string;
  readonly iceEmissive: string;
  readonly pcbEmissive: string;
  readonly partMetal: string;
  /** Smart collar materials (band, hardware, stitching). */
  readonly collarBand: string;
  readonly collarBandDark: string;
  readonly collarSteel: string;
  readonly collarRivet: string;
  readonly collarStitch: string;
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
  /** FMC product-stage backdrop glow behind the device (null = flat
   *  canvas). Dark needs it — the black units vanish on #1C1D20
   *  (verified by A/B renders); light separates fine on cream. */
  readonly stageGlow: string | null;
  /** Smart-city window glass bases — tinted dark panes under the
   *  emissive windows (formerly hardcoded in CityScape3D). */
  readonly cityGlassA: string;
  readonly cityGlassB: string;
}

export const SCENE: Record<ThemeMode, ScenePalette> = {
  light: {
    // Cream studio (60-30-10): #F1E6CF canvas and fog, Deep Green
    // #2F4A3B structural hardware (map slab, city, collar, housings),
    // Orange #FF5A26 as the only signal voice — LEDs, scan, arcs,
    // beacons, and a warm orange rim. A hot white key + lifted IBL pop
    // the dark models off the cream ground; real green-charcoal contact
    // shadows anchor them like a product shot on paper.
    canvas: "#F1E6CF",
    fog: "#e6d9bc",
    fogDensity: 0.02,
    exposure: 1.1,
    envIntensity: 1.15,
    keyIntensity: 2.6,
    keyColor: "#ffffff",
    rimIntensity: 1.0,
    rimColor: "#FF5A26",
    fillIntensity: 0.5,
    fillColor: "#F1E6CF",
    hemiIntensity: 0.55,
    hemiSky: "#fbf3e0",
    hemiGround: "#d9c9a6",
    shadows: true,
    shadowOpacity: 0.3,
    shadowColor: "#2F4A3B",
    bloom: false,
    vignetteDarkness: 0.22,
    vignetteOffset: 0.1,
    bodyColor: "#2F4A3B",
    bodyMetalness: 0.85,
    bodyRoughness: 0.4,
    // The GLB's authored albedo is already matte charcoal + PCB green +
    // brass — under the hot white key it sits on-palette untinted.
    deviceTint: "#ffffff",
    logoEmissive: 0.3,
    darkPartColor: "#22332a",
    pcbBoardColor: "#1e2a24",
    emissiveEmerald: 1.7,
    emissiveIce: 1.3,
    emissivePcb: 0.55,
    ledBase: "#4a2314",
    ledEmissive: "#FF5A26",
    iceBase: "#4a2314",
    iceEmissive: "#ff8a5c",
    pcbEmissive: "#FF5A26",
    partMetal: "#3a4a41",
    collarBand: "#2F4A3B",
    collarBandDark: "#243a2e",
    collarSteel: "#58685e",
    collarRivet: "#1C1D20",
    collarStitch: "#F1E6CF",
    slab: "#2F4A3B",
    slabMetalness: 0.5,
    slabRoughness: 0.45,
    terrain: "#3a5847",
    cityBase: "#2F4A3B",
    cityTower: "#3e5a4a",
    cityWindowA: "#FF5A26",
    cityWindowB: "#F1E6CF",
    cityPulse: "#FF5A26",
    edge: "#FF5A26",
    edgeOpacity: 0.9,
    disc: "#2F4A3B",
    discOpacity: 0.14,
    hubBeacon: "#FF5A26",
    cityBeacon: "#FF5A26",
    arc: "#FF5A26",
    arcWidth: 2.4,
    scan: "#FF5A26",
    glowBlending: THREE.NormalBlending,
    columnOpacity: 0.95,
    stageGlow: null,
    cityGlassA: "#4a2314",
    cityGlassB: "#3e3426",
  },
  dark: {
    // Charcoal night (60-30-10): #1C1D20 canvas and fog, #5A6068-family
    // gray structures, cream key light, and ORANGE as every glowing
    // signal — rim, fill pools, LEDs, scan, beacons — picked up by the
    // bloom. The FMC stage gets a #5A6068 radial glow disc so the black
    // units silhouette instead of melting into the canvas.
    canvas: "#1C1D20",
    fog: "#1C1D20",
    fogDensity: 0.026,
    exposure: 1.0,
    envIntensity: 0.5,
    keyIntensity: 1.7,
    keyColor: "#F1E6CF",
    rimIntensity: 0.9,
    rimColor: "#FF5A26",
    fillIntensity: 0.3,
    fillColor: "#FF5A26",
    hemiIntensity: 0,
    hemiSky: "#3a3b40",
    hemiGround: "#1C1D20",
    shadows: false,
    shadowOpacity: 0,
    shadowColor: "#000000",
    bloom: true,
    vignetteDarkness: 0.78,
    vignetteOffset: 0.18,
    bodyColor: "#343941",
    bodyMetalness: 0.82,
    bodyRoughness: 0.32,
    // Neutral steel pull: keeps the night devices on the cool slate side
    // under the cream key, without the old navy cast.
    deviceTint: "#c9ccd2",
    logoEmissive: 1.15,
    darkPartColor: "#15161a",
    pcbBoardColor: "#1f2622",
    emissiveEmerald: 2.2,
    emissiveIce: 1.6,
    emissivePcb: 0.55,
    ledBase: "#4a2314",
    ledEmissive: "#FF5A26",
    iceBase: "#51291a",
    iceEmissive: "#ff8a5c",
    pcbEmissive: "#FF5A26",
    partMetal: "#8a8f96",
    collarBand: "#6e5f4b",
    collarBandDark: "#4a4036",
    collarSteel: "#b9bdc4",
    collarRivet: "#3a3e44",
    collarStitch: "#F1E6CF",
    slab: "#24262a",
    slabMetalness: 0.5,
    slabRoughness: 0.45,
    terrain: "#303832",
    cityBase: "#2a2d32",
    cityTower: "#383c43",
    cityWindowA: "#FF5A26",
    cityWindowB: "#F1E6CF",
    cityPulse: "#FF5A26",
    edge: "#FF5A26",
    edgeOpacity: 0.6,
    disc: "#3a3e44",
    discOpacity: 0.5,
    hubBeacon: "#FF5A26",
    cityBeacon: "#ff8a5c",
    arc: "#FF5A26",
    arcWidth: 1.6,
    scan: "#ff8a5c",
    glowBlending: THREE.AdditiveBlending,
    columnOpacity: 0.7,
    stageGlow: "#5A6068",
    cityGlassA: "#4a2314",
    cityGlassB: "#3e3426",
  },
};
