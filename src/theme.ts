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
export const CANVAS_COLOR: Record<ThemeMode, string> = { light: "#f3c3c8", dark: "#1e1a17" };

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
   LIGHT is a pastel-pink studio: matte/anodized charcoal hardware
   (#2A2A2F / #1E1E22) under a hot white key + mint rim and stronger IBL
   so the dark bevels and metal edges pop off the #F3C3C8 canvas, real
   contact shadows grounding the object, normal blending, and vibrant
   mint #22E3A2 reserved for LEDs, PCB traces and active indicators —
   additive light and low bloom thresholds are invisible-or-haze on a
   light canvas.                                                        */

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
}

export const SCENE: Record<ThemeMode, ScenePalette> = {
  light: {
    // Pastel-pink studio (the 3-color system): Soft Pastel Pink #F3C3C8
    // canvas and fog, Deep Charcoal #2A2A2F / #1E1E22 matte-anodized
    // hardware, Vibrant Mint #22E3A2 LEDs, traces and indicators. A hot
    // white key + mint rim + lifted IBL make the charcoal bevels and metal
    // edges pop off the pink ground; real charcoal contact shadows anchor
    // every model like a dark product shot on rose paper.
    canvas: "#f3c3c8",
    fog: "#eeb6bd",
    fogDensity: 0.02,
    exposure: 1.1,
    envIntensity: 1.15,
    keyIntensity: 2.6,
    keyColor: "#ffffff",
    rimIntensity: 1.15,
    rimColor: "#22e3a2",
    fillIntensity: 0.5,
    fillColor: "#f3c3c8",
    hemiIntensity: 0.55,
    hemiSky: "#fdeef0",
    hemiGround: "#e9a9b2",
    shadows: true,
    shadowOpacity: 0.3,
    shadowColor: "#2a2a2f",
    bloom: false,
    vignetteDarkness: 0.22,
    vignetteOffset: 0.1,
    bodyColor: "#2a2a2f",
    bodyMetalness: 0.85,
    bodyRoughness: 0.4,
    // The GLB's authored albedo is already matte charcoal + PCB green +
    // brass — under the hot white key it sits on-palette untinted.
    deviceTint: "#ffffff",
    logoEmissive: 0.3,
    darkPartColor: "#1e1e22",
    pcbBoardColor: "#1e2a24",
    emissiveEmerald: 1.7,
    emissiveIce: 1.3,
    emissivePcb: 0.55,
    ledBase: "#11352a",
    ledEmissive: "#22e3a2",
    iceBase: "#11352a",
    iceEmissive: "#22e3a2",
    pcbEmissive: "#22e3a2",
    partMetal: "#35353c",
    collarBand: "#2a2a2f",
    collarBandDark: "#1e1e22",
    collarSteel: "#3d3d45",
    collarRivet: "#17171b",
    collarStitch: "#f3c3c8",
    slab: "#26262b",
    slabMetalness: 0.5,
    slabRoughness: 0.45,
    terrain: "#34343b",
    cityBase: "#2a2a2f",
    cityTower: "#3c3c44",
    cityWindowA: "#22e3a2",
    cityWindowB: "#f3c3c8",
    cityPulse: "#22e3a2",
    edge: "#22e3a2",
    edgeOpacity: 0.9,
    disc: "#2a2a2f",
    discOpacity: 0.14,
    hubBeacon: "#22e3a2",
    cityBeacon: "#22e3a2",
    arc: "#22e3a2",
    arcWidth: 2.4,
    scan: "#22e3a2",
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
    // Cool steel pull: the ivory key + terracotta fill would brown the
    // black housing; this keeps the night device on its navy-alloy side.
    deviceTint: "#c9d6e6",
    logoEmissive: 1.15,
    darkPartColor: "#071722",
    pcbBoardColor: "#0c2e21",
    emissiveEmerald: 2.2,
    emissiveIce: 1.6,
    emissivePcb: 0.55,
    // The values the components used to hardcode — dark is untouched.
    ledBase: "#0c3f27",
    ledEmissive: "#3fd98b",
    iceBase: "#0a2c3d",
    iceEmissive: "#4fc3e8",
    pcbEmissive: "#2aa368",
    partMetal: "#8a6d2f",
    collarBand: "#8a5733",
    collarBandDark: "#5f3a20",
    collarSteel: "#b4bfc9",
    collarRivet: "#46535f",
    collarStitch: "#d9b98e",
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
