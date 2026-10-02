/**
 * Tests for MASTER_PLAN task 145: film grain + color grading presets.
 * Pure-logic checks: 5 presets, corrupt-safe parsing, grain slider math,
 * and correct composition with the quality/era-resolved grade.
 */

import { describe, expect, it } from "vitest";
import { grade, resolveGrade } from "../grade.js";
import {
  DEFAULT_GRAIN_INTENSITY,
  LOOK_PRESETS,
  LOOK_PRESET_IDS,
  applyLookToGrade,
  clampGrainIntensity,
  grainIntensityScale,
  lookPresetFor,
} from "../lookPresets.js";

describe("look presets (task 145)", () => {
  it("ships exactly 5 presets with unique ids, names, and blurbs", () => {
    expect(LOOK_PRESETS).toHaveLength(5);
    expect(new Set(LOOK_PRESET_IDS).size).toBe(5);
    for (const p of LOOK_PRESETS) {
      expect(p.id.trim().length).toBeGreaterThan(0);
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.blurb.trim().length).toBeGreaterThan(0);
    }
    expect(LOOK_PRESET_IDS).toContain("standard");
    expect(LOOK_PRESET_IDS).toContain("gritty");
  });

  it("never lets saturation go positive through a preset multiplier", () => {
    // grade.saturation is negative (locked: not neon). Multiplying by a
    // positive multiplier must keep it negative or zero.
    for (const p of LOOK_PRESETS) {
      expect(grade.saturation * p.saturation).toBeLessThanOrEqual(0);
    }
  });

  it("lookPresetFor never throws and falls back to Standard", () => {
    expect(lookPresetFor("noir").id).toBe("noir");
    expect(lookPresetFor("gritty").name).toBe("Gritty");
    for (const bad of [undefined, null, 42, {}, "does-not-exist", ""]) {
      expect(lookPresetFor(bad).id).toBe("standard");
    }
  });

  it("clampGrainIntensity clamps to 0..1 and never throws", () => {
    expect(clampGrainIntensity(0)).toBe(0);
    expect(clampGrainIntensity(1)).toBe(1);
    expect(clampGrainIntensity(2)).toBe(1);
    expect(clampGrainIntensity(-3)).toBe(0);
    expect(clampGrainIntensity(0.5)).toBe(0.5);
    for (const bad of [undefined, null, NaN, "loud", {}, []]) {
      expect(clampGrainIntensity(bad)).toBe(DEFAULT_GRAIN_INTENSITY);
    }
  });

  it("grain slider: 0 disables, default is neutral, 100% pushes hard", () => {
    const standard = lookPresetFor("standard");
    expect(grainIntensityScale(0, standard)).toBe(0);
    expect(grainIntensityScale(DEFAULT_GRAIN_INTENSITY, standard)).toBeCloseTo(1, 10);
    expect(grainIntensityScale(1, standard)).toBeGreaterThan(2.5);
    // Presets multiply on top of the slider.
    const gritty = lookPresetFor("gritty");
    expect(grainIntensityScale(DEFAULT_GRAIN_INTENSITY, gritty)).toBeCloseTo(2.2, 10);
  });

  it("applyLookToGrade composes the look onto the resolved grade", () => {
    const base = resolveGrade("high", 2005);
    const applied = applyLookToGrade(base, lookPresetFor("gritty"), DEFAULT_GRAIN_INTENSITY);
    expect(applied.saturation).toBeCloseTo(base.saturation * 0.6, 10);
    expect(applied.contrast).toBeCloseTo(base.contrast * 1.12, 10);
    expect(applied.exposure).toBeCloseTo(base.exposure * 0.97, 10);
    expect(applied.vignette.weight).toBeCloseTo(base.vignette.weight * 1.2, 10);
    expect(applied.grain.intensity).toBeCloseTo(base.grain.intensity * 2.2, 10);
    // Standard at the default slider is a no-op on the grade.
    const neutral = applyLookToGrade(base, lookPresetFor("standard"), DEFAULT_GRAIN_INTENSITY);
    expect(neutral).toEqual(base);
  });

  it("applyLookToGrade keeps low quality's grain veto (0 stays 0)", () => {
    const low = resolveGrade("low", 2005);
    expect(low.grain.intensity).toBe(0);
    const applied = applyLookToGrade(low, lookPresetFor("gritty"), 1);
    expect(applied.grain.intensity).toBe(0);
  });

  it("vintage warms the highlights, noir nearly desaturates", () => {
    const base = resolveGrade("high", 2005);
    const vintage = applyLookToGrade(base, lookPresetFor("vintage"), DEFAULT_GRAIN_INTENSITY);
    expect(vintage.highlightTint.amount).toBeGreaterThan(base.highlightTint.amount);
    const noir = applyLookToGrade(base, lookPresetFor("noir"), DEFAULT_GRAIN_INTENSITY);
    expect(Math.abs(noir.saturation)).toBeLessThan(Math.abs(base.saturation) * 0.2);
  });
});
