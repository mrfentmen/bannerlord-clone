import { describe, expect, it } from "vitest";
import {
  APPROACH_PROFILES,
  ASSASSINATION_APPROACHES,
  attemptAssassination,
} from "../assassination.js";

describe("assassination approach options (solo task 67)", () => {
  it("offers poison, duel, and ambush", () => {
    expect(ASSASSINATION_APPROACHES).toEqual(["poison", "duel", "ambush"]);
    for (const a of ASSASSINATION_APPROACHES) {
      expect(APPROACH_PROFILES[a].description).toBeTruthy();
    }
  });

  it("risks differ by approach", () => {
    // Duel is the most exposing on failure; poison the least.
    expect(APPROACH_PROFILES.duel.exposureOnFailure).toBeGreaterThan(
      APPROACH_PROFILES.poison.exposureOnFailure,
    );
    expect(APPROACH_PROFILES.ambush.successChance).toBeGreaterThan(
      APPROACH_PROFILES.poison.successChance,
    );
  });

  it("a master succeeds often", () => {
    const results = Array.from({ length: 20 }, (_, s) =>
      attemptAssassination("Lord Harrow", "ambush", 10, s),
    );
    const wins = results.filter((r) => r.result === "success").length;
    expect(wins).toBeGreaterThanOrEqual(18);
  });

  it("failures can expose", () => {
    const results = Array.from({ length: 40 }, (_, s) =>
      attemptAssassination("Lord Harrow", "duel", 0, s),
    );
    const failures = results.filter((r) => r.result === "failed");
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.some((r) => r.result === "failed" && r.exposed)).toBe(true);
  });

  it("is deterministic per seed", () => {
    expect(attemptAssassination("X", "poison", 5, 42)).toEqual(attemptAssassination("X", "poison", 5, 42));
  });

  it("unknown approaches throw", () => {
    expect(() => attemptAssassination("X", "nope" as never, 5, 1)).toThrow("unknown assassination approach");
  });
});
