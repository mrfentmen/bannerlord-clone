/**
 * Task 563 wiring: the battle flow drives the combat bed.
 *
 * The mixer's ladder itself is covered in `audio/__tests__/combatIntensity.test.ts`;
 * this file covers the caller's mapping — a live battle never drops to silence
 * while the player holds, and a full push brings in every stem.
 */

import { describe, expect, it } from "vitest";
import { COMBAT_BASE_INTENSITY, combatIntensityFor } from "../flow.js";
import { COMBAT_LAYERS, battleLayersFor } from "../../audio/combatLayers.js";

describe("combat bed wiring (task 563)", () => {
  it("keeps the base stem while holding still", () => {
    const intensity = combatIntensityFor(undefined);
    expect(intensity).toBe(COMBAT_BASE_INTENSITY);
    expect(battleLayersFor(intensity)).toEqual([COMBAT_LAYERS[0]!.id]);
  });

  it("brings in every stem at a full advance", () => {
    expect(combatIntensityFor(1)).toBe(1);
    expect(battleLayersFor(1)).toEqual(COMBAT_LAYERS.map((layer) => layer.id));
  });

  it("gains layers as the push grows, never losing one", () => {
    const half = battleLayersFor(combatIntensityFor(0.5));
    expect(half).toEqual([
      "battle-theme-stem-drums",
      "battle-theme-stem-bass",
      "battle-theme-stem-fx",
    ]);
    expect(battleLayersFor(combatIntensityFor(0.9)).length).toBeGreaterThanOrEqual(half.length);
  });

  it("clamps a garbage advance to holding still", () => {
    expect(combatIntensityFor(NaN)).toBe(COMBAT_BASE_INTENSITY);
    expect(combatIntensityFor(-1)).toBe(COMBAT_BASE_INTENSITY);
    expect(combatIntensityFor(2)).toBe(1);
  });
});
