/**
 * Custom difficulty sliders (MASTER_PLAN task 144): model, presets, parsing.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESET_IDS,
  DIFFICULTY_PRESETS,
  DIFFICULTY_SLIDERS,
  applyDifficultyPreset,
  difficultyPresetFor,
  difficultySummary,
  parseDifficulty,
  withDifficultyValue,
  type DifficultySliderId,
} from "../difficulty.js";
import { migrateSettings, parseSettings, SETTINGS_VERSION } from "../schema.js";
import { DEFAULT_GRAIN_INTENSITY } from "../../design/lookPresets.js";

const IDS = DIFFICULTY_SLIDERS.map((s) => s.id);

describe("difficulty sliders", () => {
  it("defines exactly 8 sliders with unique ids and sane ranges", () => {
    expect(DIFFICULTY_SLIDERS).toHaveLength(8);
    expect(new Set(IDS).size).toBe(8);
    for (const s of DIFFICULTY_SLIDERS) {
      expect(s.min, s.id).toBeLessThan(s.def);
      expect(s.def, s.id).toBeLessThan(s.max);
      expect(s.step, s.id).toBeGreaterThan(0);
    }
  });

  it("covers damage, economy, and AI", () => {
    const cats = new Set(DIFFICULTY_SLIDERS.map((s) => s.category));
    expect([...cats].sort()).toEqual(["ai", "damage", "economy"]);
  });

  it("ships 4 presets, each with 8 in-range values, all mutually distinct", () => {
    expect(DIFFICULTY_PRESET_IDS).toHaveLength(4);
    const seen = new Set<string>();
    for (const id of DIFFICULTY_PRESET_IDS) {
      const p = DIFFICULTY_PRESETS[id]!;
      expect(Object.keys(p.values).sort()).toEqual([...IDS].sort());
      for (const s of DIFFICULTY_SLIDERS) {
        expect(p.values[s.id], `${id}.${s.id}`).toBeGreaterThanOrEqual(s.min);
        expect(p.values[s.id], `${id}.${s.id}`).toBeLessThanOrEqual(s.max);
      }
      const key = JSON.stringify(p.values);
      expect(seen.has(key), id).toBe(false);
      seen.add(key);
    }
  });
});

describe("parseDifficulty", () => {
  it("turns garbage into the normal defaults and never throws", () => {
    for (const raw of [undefined, null, 42, "hard", [], { values: "nope" }]) {
      const d = parseDifficulty(raw);
      expect(d).toEqual(DEFAULT_DIFFICULTY);
    }
  });

  it("clamps out-of-range values instead of rejecting them", () => {
    const d = parseDifficulty({ values: { playerDamage: 99, enemyDamage: -3, aiAggression: NaN } });
    expect(d.values.playerDamage).toBe(2);
    expect(d.values.enemyDamage).toBe(0.5);
    expect(d.values.aiAggression).toBe(1); // NaN -> slider default
    expect(d.preset).toBe("custom");
  });

  it("keeps valid values and recomputes the preset label from them", () => {
    const d = parseDifficulty({ preset: "story", values: { ...DIFFICULTY_PRESETS.veteran.values } });
    expect(d.preset).toBe("veteran"); // stale label corrected
    expect(d.values.aiBattleSkill).toBe(1.3);
  });

  it("labels off-preset values custom", () => {
    const d = parseDifficulty({
      values: { ...DIFFICULTY_PRESETS.normal.values, playerDamage: 1.5 },
    });
    expect(d.preset).toBe("custom");
  });
});

describe("preset helpers", () => {
  it("difficultyPresetFor matches exact presets and nothing else", () => {
    expect(difficultyPresetFor({ ...DIFFICULTY_PRESETS.story.values })).toBe("story");
    expect(difficultyPresetFor({ ...DIFFICULTY_PRESETS.nightmare.values })).toBe("nightmare");
    expect(
      difficultyPresetFor({ ...DIFFICULTY_PRESETS.normal.values, troopWages: 1.05 }),
    ).toBe("custom");
  });

  it("applyDifficultyPreset returns a fresh bundle for the preset", () => {
    const d = applyDifficultyPreset("veteran");
    expect(d.preset).toBe("veteran");
    expect(d.values).toEqual(DIFFICULTY_PRESETS.veteran.values);
    expect(d.values).not.toBe(DIFFICULTY_PRESETS.veteran.values);
  });

  it("withDifficultyValue clamps, never mutates, and recomputes the preset", () => {
    const before = applyDifficultyPreset("normal");
    const moved = withDifficultyValue(before, "playerDamage", 1.5);
    expect(moved.values.playerDamage).toBe(1.5);
    expect(moved.preset).toBe("custom");
    expect(before.values.playerDamage).toBe(1); // input untouched

    const clamped = withDifficultyValue(before, "enemyDamage", 99);
    expect(clamped.values.enemyDamage).toBe(2);

    // Dialing every slider back onto a preset restores its name.
    let d = moved;
    for (const s of DIFFICULTY_SLIDERS) {
      d = withDifficultyValue(d, s.id, DIFFICULTY_PRESETS.story.values[s.id]);
    }
    expect(d.preset).toBe("story");
  });

  it("difficultySummary names presets and custom", () => {
    expect(difficultySummary(applyDifficultyPreset("nightmare"))).toBe("Nightmare");
    expect(difficultySummary(withDifficultyValue(applyDifficultyPreset("normal"), "playerIncome" as DifficultySliderId, 0.5))).toBe("Custom");
  });
});

describe("difficulty in the settings schema", () => {
  it("is version 3 and defaults v1 blobs to normal difficulty", () => {
    expect(SETTINGS_VERSION).toBe(3);
    const s = migrateSettings({ raw: { version: 1, renderScale: 1.5 }, readLegacy: () => null });
    expect(s.version).toBe(3);
    expect(s.difficulty).toEqual(DEFAULT_DIFFICULTY);
    expect(s.renderScale).toBe(1.5); // the rest of the v1 blob survives
    expect(s.lookPreset).toBe("standard"); // v3 fields default on old blobs
    expect(s.grainIntensity).toBe(DEFAULT_GRAIN_INTENSITY);
  });

  it("parseSettings keeps a valid stored difficulty", () => {
    const s = parseSettings({
      difficulty: { preset: "custom", values: { ...DIFFICULTY_PRESETS.normal.values, aiAggression: 1.5 } },
    });
    expect(s.difficulty.preset).toBe("custom");
    expect(s.difficulty.values.aiAggression).toBe(1.5);
  });

  it("parseSettings heals a corrupt difficulty blob to defaults", () => {
    const s = parseSettings({ difficulty: { values: { playerDamage: "lots" } } });
    expect(s.difficulty).toEqual(DEFAULT_DIFFICULTY);
  });
});
