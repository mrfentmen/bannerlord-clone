/**
 * BorderGrowth + fronts tests.
 */
import { describe, expect, it } from "vitest";
import { BorderGrowth, type TurfTile } from "../borderGrowth.js";
import {
  applyRaid,
  applyTorching,
  BUSINESS_DEFS,
  businessIncomePerDay,
  buyBusiness,
  buySafehouse,
  collectStash,
  accrueDay,
  improveBusiness,
  improveCost,
  raidRisk,
  safehouseIncomePerDay,
  stashCash,
  takeCash,
  upgradeSafehouse,
  upgradeSafehouseCost,
} from "../fronts.js";

function makeTile(id: string, opts: Partial<TurfTile> = {}): TurfTile {
  return { id, adjacent: [], owner: null, ...opts };
}

function grid3x3(): TurfTile[][] {
  const grid: TurfTile[][] = [];
  for (let y = 0; y < 3; y++) {
    const row: TurfTile[] = [];
    for (let x = 0; x < 3; x++) row.push(makeTile(`${x},${y}`));
    grid.push(row);
  }
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const t = grid[y]![x]!;
      if (x > 0) t.adjacent.push(grid[y]![x - 1]!);
      if (x < 2) t.adjacent.push(grid[y]![x + 1]!);
      if (y > 0) t.adjacent.push(grid[y - 1]![x]!);
      if (y < 2) t.adjacent.push(grid[y + 1]![x]!);
    }
  }
  return grid;
}

describe("BorderGrowth", () => {
  it("claim cost follows the Civ 5 curve: 20, 32, 46, ...", () => {
    expect(BorderGrowth.claimCost(0)).toBe(20);
    expect(BorderGrowth.claimCost(1)).toBe(32);
    expect(BorderGrowth.claimCost(2)).toBe(46);
    expect(BorderGrowth.claimCost(10)).toBeGreaterThan(BorderGrowth.claimCost(2));
  });

  it("ring distances walk the adjacency graph", () => {
    const grid = grid3x3();
    const rings = BorderGrowth.ringDistances(grid[1]![1]!, 2);
    expect(rings.get(grid[1]![1]!)).toBe(0);
    expect(rings.get(grid[0]![1]!)).toBe(1);
    expect(rings.get(grid[0]![0]!)).toBe(2);
    expect(rings.size).toBe(9);
  });

  it("chooses the cheapest adjacent unowned tile", () => {
    const grid = grid3x3();
    const center = grid[1]![1]!;
    center.owner = "red";
    const luxury = grid[0]![1]!;
    luxury.resource = "luxury";
    const next = BorderGrowth.chooseNextTile(center, [center], { next: () => 0 });
    expect(next).toBe(luxury);
  });

  it("skips owned tiles and returns undefined when boxed in", () => {
    const grid = grid3x3();
    const center = grid[1]![1]!;
    center.owner = "red";
    for (const row of grid) for (const t of row) t.owner = "blue";
    center.owner = "red";
    expect(BorderGrowth.chooseNextTile(center, [center], { next: () => 0 })).toBeUndefined();
  });

  it("influence cost prefers resources over distance", () => {
    const plain = makeTile("plain");
    const rich = makeTile("rich", { resource: "luxury" });
    // A luxury 2 rings out beats a plain tile 1 ring out.
    expect(BorderGrowth.influenceCost(rich, 2)).toBeLessThan(BorderGrowth.influenceCost(plain, 1));
  });
});

describe("fronts", () => {
  it("defines all 11 modern business types", () => {
    expect(Object.keys(BUSINESS_DEFS)).toHaveLength(11);
    expect(BUSINESS_DEFS.chop_shop!.front).toBe(true);
    expect(BUSINESS_DEFS.liquor_store!.front).toBe(false);
  });

  it("buy / improve / income scale with tier and prosperity", () => {
    const { business: b1, cost } = buyBusiness("garage", "player", "cincinnati");
    expect(cost).toBe(22000);
    expect(b1.tier).toBe(1);
    const poor = businessIncomePerDay(b1, 20);
    const rich = businessIncomePerDay(b1, 90);
    expect(rich).toBeGreaterThan(poor);
    const { business: b2, cost: c2 } = improveBusiness(b1);
    expect(c2).toBe(22000);
    expect(b2.tier).toBe(2);
    expect(businessIncomePerDay(b2, 50)).toBeGreaterThan(businessIncomePerDay(b1, 50));
    expect(improveCost({ ...b2, tier: 3 })).toBeNull();
  });

  it("starved inputs starve income", () => {
    const { business } = buyBusiness("jewelry_store", "player", "cincinnati");
    const full = businessIncomePerDay(business, 80, 1);
    const starved = businessIncomePerDay(business, 80, 0.2);
    expect(starved).toBeLessThan(full / 2);
  });

  it("fronts earn more but carry raid risk", () => {
    const { business: chop } = buyBusiness("chop_shop", "player", "cincinnati");
    const { business: wash } = buyBusiness("car_wash", "player", "cincinnati");
    expect(businessIncomePerDay(chop, 50)).toBeGreaterThan(businessIncomePerDay(wash, 50));
    expect(raidRisk(chop, 50)).toBeGreaterThan(0);
    expect(raidRisk(wash, 50)).toBe(0);
    expect(raidRisk(chop, 80)).toBeGreaterThan(raidRisk(chop, 10));
  });

  it("accrue and collect move income through the stash", () => {
    const bought = buyBusiness("restaurant", "player", "cincinnati");
    const accrued = accrueDay(bought.business, 80);
    expect(accrued.accrued).toBeGreaterThan(0);
    expect(accrued.business.stash).toBe(accrued.accrued);
    const { business: b2, amount } = collectStash(accrued.business);
    expect(amount).toBe(accrued.accrued);
    expect(b2.stash).toBe(0);
  });

  it("raids seize the stash and torching destroys the business", () => {
    let { business } = buyBusiness("casino", "player", "cincinnati");
    ({ business } = accrueDay(business, 80));
    const { business: raided, seized } = applyRaid(business);
    expect(seized).toBeGreaterThan(0);
    expect(raided.stash).toBe(0);
    expect(raided.tier).toBe(1);
    const { destroyed } = applyTorching(raided);
    expect(destroyed.tier).toBe(0);
  });

  it("safehouses: buy, stash with capacity, upgrade, income", () => {
    const { safehouse: sh1, cost } = buySafehouse("player", "cincinnati");
    expect(cost).toBe(12000);
    const { safehouse: sh2, stashed } = stashCash(sh1, 1000000);
    expect(stashed).toBe(50000); // tier 1 capacity
    expect(sh2.stashCash).toBe(50000);
    const { safehouse: sh3, taken } = takeCash(sh2, 20000);
    expect(taken).toBe(20000);
    expect(sh3.stashCash).toBe(30000);
    const upCost = upgradeSafehouseCost(sh3);
    expect(upCost).toBe(30000);
    const { safehouse: sh4 } = upgradeSafehouse(sh3);
    expect(sh4.tier).toBe(2);
    expect(safehouseIncomePerDay(sh4)).toBeGreaterThan(safehouseIncomePerDay(sh1));
    expect(upgradeSafehouseCost({ ...sh4, tier: 3 })).toBeNull();
  });
});
