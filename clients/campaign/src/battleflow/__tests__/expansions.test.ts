/**
 * Expansions on the Bannerlord systems: cavalry charges, dirty fighting,
 * smithing quality, march conditions, food spoilage.
 */

import { describe, expect, it } from "vitest";
import { simulateNpcBattle } from "../npcBattle.js";
import {
  resolveDirty,
  riposteMultiplier,
} from "../meleeManeuvers.js";
import {
  rollQuality,
  QUALITY_MULTIPLIERS,
  spoilFood,
  FOOD_GOOD_IDS,
} from "../../campaign/fieldSystems.js";
import { partySpeed } from "../../campaign/partySpeed.js";

const BASE = {
  footTroops: 50,
  mountedTroops: 0,
  horses: [],
  packAnimals: 0,
  trucks: 0,
  trucksFueled: false,
  cargoWeight: 0,
  wounded: 0,
  prisoners: 0,
  morale: 70,
  isNight: false,
  scoutSkill: 0,
  forcedMarch: false,
};

describe("cavalry charges (couch wired into the sim)", () => {
  it("cavalry hits harder in the opening rounds", () => {
    const withCav = simulateNpcBattle(
      { troops: 100, avgLevel: 12, morale: 0.7, cavalryFraction: 0.5, ridingSkill: 8 },
      { troops: 100, avgLevel: 12, morale: 0.7 },
      () => 0.5,
    );
    const without = simulateNpcBattle(
      { troops: 100, avgLevel: 12, morale: 0.7 },
      { troops: 100, avgLevel: 12, morale: 0.7 },
      () => 0.5,
    );
    // The cavalry side should inflict more on the enemy.
    const cavKills = withCav.killed[1] + withCav.wounded[1];
    const plainKills = without.killed[1] + without.wounded[1];
    expect(cavKills).toBeGreaterThanOrEqual(plainKills);
  });
});

describe("dirty fighting", () => {
  it("kicks stagger when they land", () => {
    const r = resolveDirty(
      { move: "kick", defenderSkill: 0, defenderShielded: false },
      () => 0,
    );
    expect(r.result).toBe("stagger");
    expect(r.detail).toMatch(/kick/i);
  });

  it("skilled defenders read the telegraph", () => {
    const r = resolveDirty(
      { move: "kick", defenderSkill: 10, defenderShielded: false },
      () => 0.99,
    );
    expect(r.result).toBe("whiffed");
  });

  it("ripostes reward the clean block", () => {
    const open = riposteMultiplier({ blocked: true, attackerSkill: 5 });
    expect(open.mult).toBeGreaterThan(1.4);
    expect(open.detail).toMatch(/Riposte/);
    const shut = riposteMultiplier({ blocked: false, attackerSkill: 5 });
    expect(shut.mult).toBe(1);
  });
});

describe("smithing quality", () => {
  it("quality tiers have sane value multipliers", () => {
    expect(QUALITY_MULTIPLIERS.crude.value).toBeLessThan(1);
    expect(QUALITY_MULTIPLIERS.fine.value).toBe(1);
    expect(QUALITY_MULTIPLIERS.masterwork.value).toBeGreaterThan(2);
  });

  it("masters make masterworks, novices make crude", () => {
    // Deterministic: skill 10 with a low roll always masterworks.
    expect(rollQuality(10, () => 0.01)).toBe("masterwork");
    expect(rollQuality(10, () => 0.99)).not.toBe("masterwork");
    // Skill 0 with a low roll is crude.
    expect(rollQuality(0, () => 0.01)).toBe("crude");
    expect(rollQuality(0, () => 0.99)).toBe("fine");
    // Mid roll at mid skill is fine work.
    expect(rollQuality(5, () => 0.5)).toBe("fine");
  });

  it("is deterministic given the RNG", () => {
    expect(rollQuality(5, () => 0.99)).toBe(rollQuality(5, () => 0.99));
  });
});

describe("march conditions", () => {
  const TERRAIN = "plains" as const;
  it("weather slows the column", () => {
    const clear = partySpeed({ ...BASE, weather: "clear" }, TERRAIN);
    const rain = partySpeed({ ...BASE, weather: "rain" }, TERRAIN);
    const snow = partySpeed({ ...BASE, weather: "snow" }, TERRAIN);
    const storm = partySpeed({ ...BASE, weather: "storm" }, TERRAIN);
    expect(rain.speedKmPerDay).toBeLessThan(clear.speedKmPerDay);
    expect(snow.speedKmPerDay).toBeLessThan(rain.speedKmPerDay);
    expect(storm.speedKmPerDay).toBeLessThan(snow.speedKmPerDay);
  });

  it("roads matter: interstates fly, trails crawl", () => {
    const trail = partySpeed({ ...BASE, roadQuality: 0 }, TERRAIN);
    const interstate = partySpeed({ ...BASE, roadQuality: 3 }, TERRAIN);
    expect(interstate.speedKmPerDay).toBeGreaterThan(trail.speedKmPerDay);
  });

  it("river crossings cost half the day", () => {
    const dry = partySpeed({ ...BASE }, TERRAIN);
    const wet = partySpeed({ ...BASE, riverCrossing: true }, TERRAIN);
    expect(wet.speedKmPerDay).toBeLessThan(dry.speedKmPerDay * 0.7);
  });
});

describe("food spoilage", () => {
  it("fresh food rots, canned goods don't", () => {
    const goods = [
      { goodId: "meat", quantity: 100 },
      { goodId: "canned", quantity: 100 },
    ];
    const rotted = spoilFood(goods);
    expect(goods[0]!.quantity).toBeLessThan(100);
    expect(goods[1]!.quantity).toBe(100);
    expect(rotted.some((r) => r.goodId === "meat")).toBe(true);
  });

  it("more food types count toward variety", () => {
    expect(FOOD_GOOD_IDS.length).toBeGreaterThanOrEqual(5);
  });
});
