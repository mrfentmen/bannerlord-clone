/**
 * MASTER_PLAN task 145: film grain + color grading presets ("gritty look controls").
 *
 * Five locked "looks". Each preset is a set of multipliers on the base grade
 * in grade.ts — never absolutes — so a change to the locked grade does not
 * silently desync them. Pure logic, no DOM, no Babylon: unit-testable.
 *
 * The grain intensity slider (setting `grainIntensity`, 0..1) scales whatever
 * grain the quality/era resolution produced: 0% always means grain off, the
 * default (37.5%) reproduces it unchanged, 100% pushes it ~2.7x before the
 * preset's own multiplier.
 */

import { type GradeSettings } from "./grade.js";

/**
 * The grain slider is relative, not absolute: it scales whatever grain the
 * quality/era resolution produced. Low quality drops grain entirely (intensity
 * 0), so the slider multiplies by zero there too — the "low drops grain"
 * guarantee in grade.ts survives. Slider at 0% always means grain off;
 * the default reproduces the resolved grain unchanged.
 */

/** The slider default: scale factor 1, grain exactly as resolved. */
export const DEFAULT_GRAIN_INTENSITY = 0.375;

/** The five task-145 preset ids, in settings-UI order. */
export const LOOK_PRESET_IDS = [
  "standard",
  "gritty",
  "noir",
  "vintage",
  "cinematic",
] as const;

/** Stable preset id, persisted in settings. */
export type LookPresetId = (typeof LOOK_PRESET_IDS)[number];

export interface LookPreset {
  /** Stable id, persisted in settings. */
  id: LookPresetId;
  /** Display name. */
  name: string;
  /** One line for the settings UI. */
  blurb: string;
  /** Multiplier on the base grade's saturation (base is negative: never neon). */
  saturation: number;
  /** Multiplier on the base grade's contrast. */
  contrast: number;
  /** Multiplier on the base grade's exposure. */
  exposure: number;
  /** Added to the base highlight-tint amount (split-tone warmth), in grade units. */
  warmth: number;
  /** Multiplier on the base vignette weight. */
  vignette: number;
  /** Multiplier on the grain intensity after the slider. */
  grain: number;
}

/**
 * The five task-145 presets. Acceptance: 5 presets exist, each named and
 * described, and the grain intensity slider (0-100%) applies live.
 * Ids match LOOK_PRESET_IDS; the array is in settings-UI order.
 */
export const LOOK_PRESETS: LookPreset[] = [
  {
    id: "standard",
    name: "Standard",
    blurb: "The locked grade, exactly as art-directed.",
    saturation: 1,
    contrast: 1,
    exposure: 1,
    warmth: 0,
    vignette: 1,
    grain: 1,
  },
  {
    id: "gritty",
    name: "Gritty",
    blurb: "Pushed grain, lifted shadows, drained colour — the war-reporter look.",
    saturation: 0.6,
    contrast: 1.12,
    exposure: 0.97,
    warmth: 0,
    vignette: 1.2,
    grain: 2.2,
  },
  {
    id: "noir",
    name: "Noir",
    blurb: "Near-monochrome, hard contrast, heavy vignette.",
    saturation: 0.15,
    contrast: 1.25,
    exposure: 0.92,
    warmth: 0,
    vignette: 1.8,
    grain: 1.6,
  },
  {
    id: "vintage",
    name: "Vintage",
    blurb: "Warm, faded, soft grain — the archive-reel look.",
    saturation: 0.8,
    contrast: 0.92,
    exposure: 1.02,
    warmth: 0.04,
    vignette: 1.1,
    grain: 1.4,
  },
  {
    id: "cinematic",
    name: "Cinematic",
    blurb: "Deeper grade, cooler highlights, restrained grain.",
    saturation: 0.9,
    contrast: 1.15,
    exposure: 0.95,
    warmth: -0.01,
    vignette: 1.4,
    grain: 0.8,
  },
];

/** Never throws: unknown ids fall back to Standard. */
export function lookPresetFor(id: unknown): LookPreset {
  const found = LOOK_PRESETS.find((p) => p.id === id);
  return found ?? LOOK_PRESETS[0]!;
}

/** Never throws: clamps to 0..1, non-numbers become the default. */
export function clampGrainIntensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_GRAIN_INTENSITY;
  return Math.min(1, Math.max(0, value));
}

/** Scale factor for the resolved grain: slider / default, times the preset. */
export function grainIntensityScale(slider: number, preset: LookPreset): number {
  return (clampGrainIntensity(slider) / DEFAULT_GRAIN_INTENSITY) * preset.grain;
}

/**
 * Fold a look preset and the user's grain slider into a resolved grade.
 * The base already carries the quality/era resolution; this only applies the
 * player's look on top.
 */
export function applyLookToGrade(
  base: GradeSettings,
  preset: LookPreset,
  grainSlider: number,
): GradeSettings {
  return {
    ...base,
    saturation: base.saturation * preset.saturation,
    contrast: base.contrast * preset.contrast,
    exposure: base.exposure * preset.exposure,
    highlightTint: {
      ...base.highlightTint,
      amount: base.highlightTint.amount + preset.warmth,
    },
    vignette: { ...base.vignette, weight: base.vignette.weight * preset.vignette },
    grain: {
      ...base.grain,
      intensity: base.grain.intensity * grainIntensityScale(grainSlider, preset),
    },
  };
}
