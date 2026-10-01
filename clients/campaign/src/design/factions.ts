/**
 * Faction colors (MASTER_PLAN task 18).
 *
 * Each playable side gets a banner color and an ink color for text/icons drawn
 * on it. The base palette is art-directed; the per-mode palettes are chosen so
 * the six factions stay mutually distinguishable under each color vision
 * deficiency. `__tests__/factions.test.ts` enforces this: it runs every pair
 * through a Machado et al. (2009) deficiency simulation and requires
 * CIE76 ΔE >= 10 — about four times the just-noticeable difference.
 *
 * Grit, not cute: the base palette is weathered cloth and iron, not candy.
 */

import type { ColorblindMode } from "../settings/schema.js";

/** The six playable sides. Matches `src/data/sides.ts`. */
export type PlayableSideId =
  | "pacific-compact"
  | "mountain-alliance"
  | "great-lakes-union"
  | "southern-compact"
  | "lone-star-frontier"
  | "atlantic-corridor";

export const PLAYABLE_SIDE_IDS: readonly PlayableSideId[] = [
  "pacific-compact",
  "mountain-alliance",
  "great-lakes-union",
  "southern-compact",
  "lone-star-frontier",
  "atlantic-corridor",
];

export interface FactionSwatch {
  /** Banner/cloth color, `#rrggbb`. */
  color: string;
  /** Text and icon color drawn on the banner, `#rrggbb`. */
  ink: string;
}

const PAPER = "#f5f1e8";
const COAL = "#1a120b";

/** Art-directed base palette (no deficiency). */
const BASE: Record<PlayableSideId, FactionSwatch> = {
  "pacific-compact": { color: "#1f4e79", ink: PAPER },
  "mountain-alliance": { color: "#2e5b34", ink: PAPER },
  "great-lakes-union": { color: "#2f6f6b", ink: PAPER },
  "southern-compact": { color: "#8c2f2f", ink: PAPER },
  "lone-star-frontier": { color: "#96490f", ink: PAPER },
  "atlantic-corridor": { color: "#4a3b5c", ink: PAPER },
};

/**
 * Remapped palettes. Each entry is what a viewer WITH that deficiency sees as
 * clearly distinct; the test re-simulates the deficiency over the remap and
 * requires pairwise ΔE >= 10, so the palettes are verified, not assumed.
 *
 * Derived from the Okabe–Ito colorblind-safe set, darkened slightly to keep
 * the weathered look against paper ink.
 */
const REMAP: Record<Exclude<ColorblindMode, "off">, Record<PlayableSideId, FactionSwatch>> = {
  deuteranopia: {
    "pacific-compact": { color: "#0072b2", ink: PAPER },
    "mountain-alliance": { color: "#009e73", ink: COAL },
    "great-lakes-union": { color: "#56b4e9", ink: COAL },
    "southern-compact": { color: "#d55e00", ink: COAL },
    "lone-star-frontier": { color: "#e69f00", ink: COAL },
    "atlantic-corridor": { color: "#cc79a7", ink: COAL },
  },
  protanopia: {
    "pacific-compact": { color: "#0072b2", ink: PAPER },
    "mountain-alliance": { color: "#009e73", ink: COAL },
    "great-lakes-union": { color: "#56b4e9", ink: COAL },
    "southern-compact": { color: "#d55e00", ink: COAL },
    "lone-star-frontier": { color: "#e69f00", ink: COAL },
    "atlantic-corridor": { color: "#cc79a7", ink: COAL },
  },
  tritanopia: {
    "pacific-compact": { color: "#0072b2", ink: PAPER },
    "mountain-alliance": { color: "#8c2f2f", ink: PAPER },
    "great-lakes-union": { color: "#d55e00", ink: COAL },
    "southern-compact": { color: "#cc79a7", ink: COAL },
    "lone-star-frontier": { color: "#e69f00", ink: COAL },
    "atlantic-corridor": { color: "#5a4a6a", ink: PAPER },
  },
};

/** The active swatch set for a colorblind mode. */
export function factionPalette(mode: ColorblindMode): Record<PlayableSideId, FactionSwatch> {
  return mode === "off" ? BASE : REMAP[mode];
}

// -- deficiency simulation (Machado et al. 2009, severe matrices, sRGB) --------

type Rgb = [number, number, number];

/** Machado et al. (2009) simulation matrices, applied to gamma-encoded sRGB. */
const SIM_MATRICES: Record<Exclude<ColorblindMode, "off">, [Rgb, Rgb, Rgb]> = {
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  protanopia: [
    [0.567, 0.433, 0],
    [0.558, 0.442, 0],
    [0, 0.242, 0.758],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.433, 0.567],
    [0, 0.475, 0.525],
  ],
};

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** What a viewer with the given deficiency perceives for an sRGB color. */
export function simulateCvd(rgb: Rgb, mode: Exclude<ColorblindMode, "off">): Rgb {
  const m = SIM_MATRICES[mode];
  return [
    m[0][0] * rgb[0] + m[0][1] * rgb[1] + m[0][2] * rgb[2],
    m[1][0] * rgb[0] + m[1][1] * rgb[1] + m[1][2] * rgb[2],
    m[2][0] * rgb[0] + m[2][1] * rgb[1] + m[2][2] * rgb[2],
  ];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export type Lab = [number, number, number];

/** sRGB (simulated or not) to CIELAB, D65. */
export function rgbToLab([r, g, b]: Rgb): Lab {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  // sRGB -> XYZ (D65)
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = (rl * 0.0333339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE. JND is ~2.3; the palette test requires >= 10. */
export function deltaE(a: Lab, b: Lab): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Perceived distance between two hex colors for a viewer with the given mode.
 * The "off" mode compares the colors as-is.
 */
export function perceivedDistance(aHex: string, bHex: string, mode: ColorblindMode): number {
  let a = hexToRgb(aHex);
  let b = hexToRgb(bHex);
  if (mode !== "off") {
    a = simulateCvd(a, mode);
    b = simulateCvd(b, mode);
  }
  return deltaE(rgbToLab(a), rgbToLab(b));
}
