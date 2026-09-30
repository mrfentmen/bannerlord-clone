/**
 * The side data is transcribed from a design document, so it is checked against that
 * document rather than trusted. `FACTIONS.md` section 3 is the specification for the
 * ratings table, and section 4 and 7 for the prose, and a transcription error in
 * either would be invisible to the player and permanent in the game.
 *
 * The StateProfile ratings are a different thing and get a different check. They are
 * derived from the real cropland share and the real mining character of each state
 * (`src/data/sides.ts` `StateSeed`), so the test asserts that the derived order agrees
 * with the real figures rather than comparing it to a hand-typed table.
 */

import { describe, expect, it } from "vitest";
import {
  DESIGN_TARGET_RATINGS,
  SIDE_DEFINITIONS,
  STARTING_ROLES,
  STATE_SEEDS,
  STATE_TOTAL_POPULATION,
  buildStateProfiles,
} from "./sides.js";
import type { SideState } from "./types.js";

/**
 * FACTIONS.md section 3, transcribed a second time, independently of `sides.ts`.
 *
 * The six sections only. The Wanderer is documented in FACTIONS.md section 4 as
 * "Wanderer (no side)" with "no section bonuses or penalties", and is deliberately
 * absent from this table because the document gives it no ratings to copy.
 */
const FACTIONS_SECTION_3: Record<string, { ratings: SideState["ratings"]; difficulty: SideState["difficulty"] }> = {
  "Pacific Compact": { ratings: { money: 5, gold: 3, food: 2, metal: 2, population: 4 }, difficulty: "Hard" },
  "Mountain Alliance": { ratings: { money: 2, gold: 5, food: 2, metal: 5, population: 1 }, difficulty: "Medium" },
  "Great Lakes Union": { ratings: { money: 3, gold: 1, food: 5, metal: 4, population: 5 }, difficulty: "Easy to Medium" },
  "Southern Compact": { ratings: { money: 3, gold: 1, food: 4, metal: 3, population: 4 }, difficulty: "Medium" },
  "Lone Star Frontier": { ratings: { money: 4, gold: 2, food: 3, metal: 4, population: 3 }, difficulty: "Medium" },
  "Atlantic Corridor": { ratings: { money: 5, gold: 4, food: 1, metal: 2, population: 5 }, difficulty: "Hard" },
};

/** The one side that is not a section, and so has no row in the ratings table. */
const UNRATED_SIDE = "wanderer";

describe("FACTIONS.md section 3 ratings", () => {
  it("covers all six sections, plus the one non-section the document also names", () => {
    const fromDoc = [...Object.keys(FACTIONS_SECTION_3), "Wanderer"].sort();
    const fromCode = SIDE_DEFINITIONS.map((s) => s.name).sort();
    expect(fromCode).toEqual(fromDoc);
  });

  it("matches the document's numbers, id for id", () => {
    for (const side of SIDE_DEFINITIONS) {
      if (side.id === UNRATED_SIDE) continue;
      const expected = FACTIONS_SECTION_3[side.name];
      if (!expected) throw new Error(`FACTIONS.md section 3 has no row for ${side.name}`);
      expect(DESIGN_TARGET_RATINGS[side.id], `${side.name} ratings`).toEqual(expected.ratings);
      expect(side.difficulty, `${side.name} difficulty`).toBe(expected.difficulty);
    }
  });

  it("gives the Wanderer no ratings, because the document gives it none", () => {
    // The client must not invent a section profile for a side that is defined as
    // having no section at all. `src/data/fixture/sides.ts` supplies a neutral set at
    // render time instead, and says so.
    expect(UNRATED_SIDE in DESIGN_TARGET_RATINGS).toBe(false);
  });

  it("keeps every rating inside the 1 to 5 scale the document defines", () => {
    for (const [id, ratings] of Object.entries(DESIGN_TARGET_RATINGS)) {
      for (const [key, value] of Object.entries(ratings)) {
        expect(Number.isInteger(value), `${id}.${key} is not a whole rating`).toBe(true);
        expect(value, `${id}.${key} is outside 1 to 5`).toBeGreaterThanOrEqual(1);
        expect(value, `${id}.${key} is outside 1 to 5`).toBeLessThanOrEqual(5);
      }
    }
  });

  it("gives every side a danger line and a mechanic, because that is what the screen shows", () => {
    for (const side of SIDE_DEFINITIONS) {
      expect(side.biggestDanger.length, `${side.name} has no biggest-danger line`).toBeGreaterThan(20);
      expect(side.signatureMechanic.length, `${side.name} has no signature mechanic`).toBeGreaterThan(10);
      expect(side.pros.length, `${side.name} has no advantages`).toBeGreaterThan(0);
      expect(side.cons.length, `${side.name} has no disadvantages`).toBeGreaterThan(0);
    }
  });

  it("gives every side except the wanderer at least one member state", () => {
    for (const side of SIDE_DEFINITIONS) {
      if (side.id === UNRATED_SIDE) continue;
      expect(side.memberStates.length, `${side.name} claims no member states`).toBeGreaterThan(0);
    }
  });
});

describe("state profiles come from real figures, not from a typed table", () => {
  it("rates food in the same order as the real cropland share", () => {
    // USDA 2022 Census of Agriculture cropland share, as recorded in the seeds. If a
    // rating is edited away from its figure, the orders disagree and this fails.
    const byFood = [...STATE_SEEDS].sort((a, b) => b.food - a.food);
    for (let i = 1; i < byFood.length; i += 1) {
      const better = byFood[i - 1];
      const worse = byFood[i];
      if (!better || !worse) continue;
      if (better.food === worse.food) continue;
      expect(
        better.croplandShare,
        `${better.name} is rated above ${worse.name} for food but has less cropland`,
      ).toBeGreaterThan(worse.croplandShare);
    }
  });

  it("resolves every seed population from real data, never to nothing", () => {
    const totals = new Map(Object.entries(STATE_TOTAL_POPULATION));
    const profiles = buildStateProfiles(STATE_SEEDS, new Map(), totals);
    for (const profile of profiles) {
      expect(profile.population, `${profile.name} resolved to no population`).not.toBeNull();
      expect(profile.population ?? 0, `${profile.name} population is not a real figure`).toBeGreaterThan(0);
    }
  });

  it("prefers the in-region census total over the whole state when both exist", () => {
    const totals = new Map(Object.entries(STATE_TOTAL_POPULATION));
    const colorado = STATE_SEEDS.find((s) => s.code === "CO")!;
    const stateTotal = totals.get("CO")!;
    // A figure that counts only the settlements inside the V1 region.
    const inRegion = buildStateProfiles([colorado], new Map([["CO", 1_500_000]]), totals)[0]!;
    expect(inRegion.population).toBe(1_500_000);
    // With no in-region figure it falls back to the published state total.
    const fallback = buildStateProfiles([colorado], new Map(), totals)[0]!;
    expect(fallback.population).toBe(stateTotal);
  });

  it("writes a summary a player can read, with the cropland share as a percentage", () => {
    const totals = new Map(Object.entries(STATE_TOTAL_POPULATION));
    for (const profile of buildStateProfiles(STATE_SEEDS, new Map(), totals)) {
      expect(profile.summary, `${profile.name} has no summary`).not.toMatch(/NaN|undefined|null/);
      const seed = STATE_SEEDS.find((s) => s.code === profile.code)!;
      expect(profile.summary).toContain(`${Math.round(seed.croplandShare * 100)}%`);
    }
  });

  it("puts every seed on a side that exists", () => {
    const ids = new Set(SIDE_DEFINITIONS.map((s) => s.id));
    for (const seed of STATE_SEEDS) {
      expect(ids.has(seed.sideId), `${seed.name} is on unknown side ${seed.sideId}`).toBe(true);
    }
  });
});

describe("starting roles", () => {
  it("offers the three roles FACTIONS.md section 2 names", () => {
    expect(STARTING_ROLES.map((r) => r.id)).toEqual([
      "ruler-in-waiting",
      "mercenary-captain",
      "wanderer",
    ]);
  });

  it("says what each one starts holding, in the product's voice", () => {
    for (const role of STARTING_ROLES) {
      expect(role.description.length, `${role.name} has no description`).toBeGreaterThan(20);
      expect(role.startsWith.length, `${role.name} does not say what it starts with`).toBeGreaterThan(10);
    }
  });
});
