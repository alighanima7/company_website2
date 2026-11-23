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
export const CANVAS_COLOR: Record<ThemeMode, string> = { light: "#F0F6F4", dark: "#0B1619" };

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
   The logo-extracted brand carried into the scene: the canvas is the 60%
   dominant (#F0F6F4 paper studio / #0B1619 teal-black night), structural
   materials (map slab, city blocks, collar, housings) sit on the 30%
   teal secondary, and the PALM GREEN #198948 (with its derived glow
   #3FD97F in the dark room) is the single 10% signal voice — LEDs, scan
   sweeps, arcs, beacons, window glow, rim light. Orange appears nowhere
   in the scene: it is the DOM's warning role only. DARK is a glow
   instrument (additive blending + bloom); LIGHT is a clean studio under
   a hot white key with real contact shadows and normal blending.       */

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
   *  canvas). Dark needs it — the black units vanish on the night
   *  canvas (verified by A/B renders); light separates fine on paper. */
  readonly stageGlow: string | null;
  /** Smart-city window glass bases — tinted dark panes under the
   *  emissive windows (formerly hardcoded in CityScape3D). */
  readonly cityGlassA: string;
  readonly cityGlassB: string;
}

export const SCENE: Record<ThemeMode, ScenePalette> = {
  light: {
    // Paper studio (60-30-10): #F0F6F4 canvas and fog, brand teal
    // #19586A structural hardware (map slab, city, collar, housings),
    // palm green #198948 as the only signal voice — LEDs, scan, arcs,
    // beacons, and the rim. A hot white key + lifted IBL pop the dark
    // models off the cool paper; real deep-teal contact shadows anchor
    // them like a product shot.
    canvas: "#F0F6F4",
    fog: "#dfeae7",
    fogDensity: 0.02,
    exposure: 1.1,
    envIntensity: 1.15,
    keyIntensity: 2.6,
    keyColor: "#ffffff",
    rimIntensity: 1.0,
    rimColor: "#198948",
    fillIntensity: 0.5,
    fillColor: "#F0F6F4",
    hemiIntensity: 0.55,
    hemiSky: "#fafdfc",
    hemiGround: "#cfdeda",
    shadows: true,
    shadowOpacity: 0.3,
    shadowColor: "#0c3845",
    bloom: false,
    vignetteDarkness: 0.22,
    vignetteOffset: 0.1,
    bodyColor: "#19586A",
    bodyMetalness: 0.85,
    bodyRoughness: 0.4,
    // The GLB's authored albedo is already matte charcoal + PCB green +
    // brass — under the hot white key it sits on-palette untinted.
    deviceTint: "#ffffff",
    logoEmissive: 0.3,
    darkPartColor: "#0e2e38",
    pcbBoardColor: "#0f2b26",
    emissiveEmerald: 1.7,
    emissiveIce: 1.3,
    emissivePcb: 0.55,
    ledBase: "#0a3a22",
    ledEmissive: "#198948",
    iceBase: "#0a3a22",
    iceEmissive: "#3fd97f",
    pcbEmissive: "#198948",
    partMetal: "#2f5560",
    collarBand: "#19586A",
    collarBandDark: "#0c3845",
    collarSteel: "#557c88",
    collarRivet: "#06262e",
    collarStitch: "#F0F6F4",
    slab: "#19586A",
    slabMetalness: 0.5,
    slabRoughness: 0.45,
    terrain: "#2e6e64",
    cityBase: "#19586A",
    cityTower: "#246a7e",
    cityWindowA: "#198948",
    cityWindowB: "#F0F6F4",
    cityPulse: "#198948",
    edge: "#198948",
    edgeOpacity: 0.9,
    disc: "#19586A",
    discOpacity: 0.14,
    hubBeacon: "#198948",
    cityBeacon: "#198948",
    arc: "#198948",
    arcWidth: 2.4,
    scan: "#198948",
    glowBlending: THREE.NormalBlending,
    columnOpacity: 0.95,
    stageGlow: null,
    cityGlassA: "#0a3a22",
    cityGlassB: "#0e3e4d",
  },
  dark: {
    // Teal night (60-30-10): #0B1619 canvas and fog, #16333C-family teal
    // structures, paper key light, and GREEN as every glowing signal —
    // rim, fill pools, LEDs, scan, beacons — picked up by the bloom. The
    // FMC stage gets a teal radial glow disc so the black units
    // silhouette instead of melting into the canvas (A/B re-run below).
    canvas: "#0B1619",
    fog: "#0B1619",
    fogDensity: 0.026,
    exposure: 1.0,
    envIntensity: 0.5,
    keyIntensity: 1.7,
    keyColor: "#F0F6F4",
    rimIntensity: 0.9,
    rimColor: "#3fd97f",
    fillIntensity: 0.3,
    fillColor: "#198948",
    hemiIntensity: 0,
    hemiSky: "#2a3b40",
    hemiGround: "#0B1619",
    shadows: false,
    shadowOpacity: 0,
    shadowColor: "#000000",
    bloom: true,
    vignetteDarkness: 0.78,
    vignetteOffset: 0.18,
    bodyColor: "#1c3b45",
    bodyMetalness: 0.82,
    bodyRoughness: 0.32,
    // Cool teal-steel pull keeps the night devices in the brand family
    // under the paper key.
    deviceTint: "#c6d4d6",
    logoEmissive: 1.15,
    darkPartColor: "#0a1e24",
    pcbBoardColor: "#0e2b24",
    emissiveEmerald: 2.2,
    emissiveIce: 1.6,
    emissivePcb: 0.55,
    ledBase: "#0a3a22",
    ledEmissive: "#3fd97f",
    iceBase: "#0a3a22",
    iceEmissive: "#7fe3ac",
    pcbEmissive: "#35c473",
    partMetal: "#7e939b",
    collarBand: "#4e6a66",
    collarBandDark: "#35494c",
    collarSteel: "#afc2c6",
    collarRivet: "#2a3c42",
    collarStitch: "#F0F6F4",
    slab: "#10242b",
    slabMetalness: 0.5,
    slabRoughness: 0.45,
    terrain: "#1e4038",
    cityBase: "#132b33",
    cityTower: "#1e4450",
    cityWindowA: "#3fd97f",
    cityWindowB: "#F0F6F4",
    cityPulse: "#3fd97f",
    edge: "#3fd97f",
    edgeOpacity: 0.6,
    disc: "#1e4450",
    discOpacity: 0.5,
    hubBeacon: "#3fd97f",
    cityBeacon: "#7fe3ac",
    arc: "#3fd97f",
    arcWidth: 1.6,
    scan: "#7fe3ac",
    glowBlending: THREE.AdditiveBlending,
    columnOpacity: 0.7,
    stageGlow: "#1E4450",
    cityGlassA: "#0a3a22",
    cityGlassB: "#0e3e4d",
  },
};
