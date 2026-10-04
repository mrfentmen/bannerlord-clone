/**
 * The four missing Bannerlord systems: forced march, food variety, prison
 * break, smithing.
 */

import { describe, expect, it } from "vitest";
import {
  FORCED_MARCH_FOOD_MULT,
  FORCED_MARCH_MORALE_COST,
  FORCED_MARCH_SPEED_MULT,
  SMITHING_RECIPES,
  canForge,
  foodVariety,
  foodVarietyMoraleDelta,
  prisonBreakOdds,
  resolvePrisonBreak,
  smeltYield,
} from "../fieldSystems.js";

describe("forced march", () => {
  it("marches 30% faster at a daily morale and food cost", () => {
    expect(FORCED_MARCH_SPEED_MULT).toBe(1.3);
    expect(FORCED_MARCH_MORALE_COST).toBeGreaterThan(0);
    expect(FORCED_MARCH_FOOD_MULT).toBeGreaterThan(1);
  });
});

describe("food variety", () => {
  it("counts distinct food types", () => {
    expect(foodVariety([], 10)).toBe(1);
    expect(foodVariety([{ goodId: 'grain', quantity: 5 }], 10)).toBe(2);
    expect(foodVariety([{ goodId: 'grain', quantity: 0 }], 10)).toBe(1);
    expect(foodVariety([], 0)).toBe(0);
  });

  it("rewards varied diets with morale", () => {
    expect(foodVarietyMoraleDelta(1)).toBe(0);
    expect(foodVarietyMoraleDelta(2)).toBeGreaterThan(0);
    expect(foodVarietyMoraleDelta(3)).toBeGreaterThan(foodVarietyMoraleDelta(2));
  });
});

describe("prison break", () => {
  it("roguery improves the odds", () => {
    const rookie = prisonBreakOdds({ roguery: 0, teamSize: 4, garrison: 30, prisonersHeld: 5 });
    const pro = prisonBreakOdds({ roguery: 10, teamSize: 4, garrison: 30, prisonersHeld: 5 });
    expect(pro.success).toBeGreaterThan(rookie.success);
  });

  it("small teams are sneakier than big ones", () => {
    const small = prisonBreakOdds({ roguery: 5, teamSize: 4, garrison: 30, prisonersHeld: 5 });
    const big = prisonBreakOdds({ roguery: 5, teamSize: 20, garrison: 30, prisonersHeld: 5 });
    expect(small.success).toBeGreaterThan(big.success);
  });

  it("odds stay within 0-1", () => {
    const odds = prisonBreakOdds({ roguery: 99, teamSize: 1, garrison: 0, prisonersHeld: 5 });
    expect(odds.success).toBeLessThanOrEqual(0.95);
    expect(odds.success).toBeGreaterThanOrEqual(0.05);
  });

  it("a successful break frees everyone, a failed one wounds the team", () => {
    const req = { roguery: 5, teamSize: 4, garrison: 30, prisonersHeld: 5 };
    const win = resolvePrisonBreak(req, () => 0.0);
    expect(win.success).toBe(true);
    expect(win.freed).toBe(5);
    const loss = resolvePrisonBreak(req, () => 0.999);
    expect(loss.success).toBe(false);
    expect(loss.freed).toBe(0);
    expect(loss.wounded).toBeGreaterThan(0);
  });
});

describe("smithing", () => {
  it("ships five modern recipes", () => {
    expect(SMITHING_RECIPES).toHaveLength(5);
    expect(SMITHING_RECIPES.map((r) => r.id)).toContain('suppressor');
  });

  it("higher-tier weapons smelt for more metal", () => {
    expect(smeltYield(5)).toBeGreaterThan(smeltYield(1));
  });

  it("forging checks metal and fuel", () => {
    const knife = SMITHING_RECIPES[0]!;
    expect(canForge(knife, 10, 10).ok).toBe(true);
    expect(canForge(knife, 0, 10).ok).toBe(false);
    expect(canForge(knife, 10, 0).ok).toBe(false);
  });
});
