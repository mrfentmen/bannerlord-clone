/**
 * Caravan registry tests (MASTER_PLAN tasks 102/103). Node environment: the
 * registry is pure logic over an injected storage.
 */

import { describe, expect, it } from "vitest";
import {
  createRouteRegistry,
  DISTANCE_COST_PER_KM,
  MAX_CARAVANS,
  totalProfit,
  type FoundDeps,
  type FoundInput,
  type SettleDeps,
} from "../routeRegistry.js";
import type { GoodId } from "../../data/types.js";

function fakeStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const STOPS = [
  { settlementId: "a", name: "Alpha" },
  { settlementId: "b", name: "Beta" },
  { settlementId: "c", name: "Gamma" },
];

function foundDeps(km = 80): FoundDeps {
  return {
    distanceKm: () => km,
    kmPerDay: 40,
  };
}

function input(overrides: Partial<FoundInput> = {}): FoundInput {
  return {
    name: "Silk Road",
    stops: STOPS,
    goodId: "textiles" as GoodId,
    goodName: "Textiles",
    units: 20,
    guards: 4,
    ...overrides,
  };
}

function settleDeps(prices: Record<string, Record<string, number>>, wage = 2): SettleDeps {
  return {
    priceAt: (goodId, settlementId) => prices[settlementId]?.[goodId as string] ?? null,
    guardWagePerDay: wage,
  };
}

describe("found", () => {
  it("creates a caravan with a closed circuit of legs", () => {
    const reg = createRouteRegistry(fakeStorage());
    const c = reg.found(input(), 10, foundDeps());
    expect(c.stops).toHaveLength(3);
    expect(c.legDays).toHaveLength(3);
    expect(c.legKm).toEqual([80, 80, 80]);
    expect(c.legDays).toEqual([2, 2, 2]);
    expect(c.lastSettledDay).toBe(10);
    expect(c.weeks).toEqual([]);
  });

  it("rejects a blank name", () => {
    const reg = createRouteRegistry(fakeStorage());
    expect(() => reg.found(input({ name: "   " }), 0, foundDeps())).toThrow("name your caravan");
  });

  it("rejects fewer than two stops", () => {
    const reg = createRouteRegistry(fakeStorage());
    expect(() => reg.found(input({ stops: [STOPS[0]!] }), 0, foundDeps())).toThrow(
      "at least two stops",
    );
  });

  it("rejects repeated stops", () => {
    const reg = createRouteRegistry(fakeStorage());
    expect(() =>
      reg.found(input({ stops: [STOPS[0]!, STOPS[1]!, STOPS[0]!] }), 0, foundDeps()),
    ).toThrow("must not repeat");
  });

  it("rejects non-positive cargo and negative guards", () => {
    const reg = createRouteRegistry(fakeStorage());
    expect(() => reg.found(input({ units: 0 }), 0, foundDeps())).toThrow("cargo units");
    expect(() => reg.found(input({ guards: -1 }), 0, foundDeps())).toThrow("guards");
  });

  it("rejects a leg with no surveyed road, naming the pair", () => {
    const reg = createRouteRegistry(fakeStorage());
    const deps: FoundDeps = {
      distanceKm: (from, to) => (from === "b" && to === "c" ? null : 80),
      kmPerDay: 40,
    };
    expect(() => reg.found(input(), 0, deps)).toThrow("Beta to Gamma");
  });

  it("enforces the caravan cap", () => {
    const reg = createRouteRegistry(fakeStorage());
    for (let i = 0; i < MAX_CARAVANS; i += 1) {
      reg.found(input({ name: `C${i}` }), 0, foundDeps());
    }
    expect(() => reg.found(input({ name: "one more" }), 0, foundDeps())).toThrow("limit");
  });
});

describe("advance", () => {
  it("books one ledger entry per full week with correct math", () => {
    const reg = createRouteRegistry(fakeStorage());
    // Two stops, 80 km legs at 40 km/day = 2 days per leg, 4-day circuit.
    reg.found(input({ stops: [STOPS[0]!, STOPS[1]!] }), 0, foundDeps());
    const deps = settleDeps({
      a: { textiles: 10 },
      b: { textiles: 16 },
    });
    reg.advance(7, deps);
    const [after] = reg.list();
    expect(after!.weeks).toHaveLength(1);
    const week = after!.weeks[0]!;
    // 7 days / 4-day circuit = 1.75 circuits; 2 legs share it equally.
    const circuits = 1.75;
    const perLeg = circuits / 2;
    expect(week.revenue).toBeCloseTo(perLeg * 20 * 16 + perLeg * 20 * 10, 6);
    expect(week.costOfGoods).toBeCloseTo(perLeg * 20 * 10 + perLeg * 20 * 16, 6);
    expect(week.guardWages).toBe(4 * 2 * 7);
    expect(week.distanceCost).toBeCloseTo(circuits * 160 * DISTANCE_COST_PER_KM, 6);
    expect(week.profit).toBeCloseTo(
      week.revenue - week.costOfGoods - week.guardWages - week.distanceCost,
      6,
    );
    expect(week.dataMissing).toBe(false);
    expect(after!.lastSettledDay).toBe(7);
  });

  it("is idempotent and settles multiple weeks at once", () => {
    const reg = createRouteRegistry(fakeStorage());
    reg.found(input(), 0, foundDeps());
    const deps = settleDeps({ a: { textiles: 10 }, b: { textiles: 12 }, c: { textiles: 11 } });
    reg.advance(21, deps);
    reg.advance(21, deps);
    expect(reg.list()[0]!.weeks).toHaveLength(3);
    reg.advance(27, deps);
    expect(reg.list()[0]!.weeks).toHaveLength(3);
  });

  it("marks weeks dataMissing instead of inventing prices", () => {
    const reg = createRouteRegistry(fakeStorage());
    reg.found(input(), 0, foundDeps());
    reg.advance(7, settleDeps({}));
    const week = reg.list()[0]!.weeks[0]!;
    expect(week.dataMissing).toBe(true);
    expect(week.revenue).toBe(0);
    expect(week.costOfGoods).toBe(0);
    // Real costs still book.
    expect(week.guardWages).toBeGreaterThan(0);
    expect(week.notes.length).toBeGreaterThan(0);
  });

  it("caps the ledger at a campaign year", () => {
    const reg = createRouteRegistry(fakeStorage());
    reg.found(input(), 0, foundDeps());
    const deps = settleDeps({ a: { textiles: 10 }, b: { textiles: 12 }, c: { textiles: 11 } });
    reg.advance(7 * 60, deps);
    const weeks = reg.list()[0]!.weeks;
    expect(weeks).toHaveLength(52);
    expect(weeks[0]!.weekStartDay).toBe(7 * 8);
  });
});

describe("retire", () => {
  it("removes the caravan and reports unknown ids", () => {
    const reg = createRouteRegistry(fakeStorage());
    const c = reg.found(input(), 0, foundDeps());
    expect(reg.retire("nope")).toBe(false);
    expect(reg.retire(c.id)).toBe(true);
    expect(reg.list()).toHaveLength(0);
  });
});

describe("persistence", () => {
  it("round-trips caravans through storage", () => {
    const storage = fakeStorage();
    const reg = createRouteRegistry(storage);
    const c = reg.found(input(), 5, foundDeps());
    const reg2 = createRouteRegistry(storage);
    const [loaded] = reg2.list();
    expect(loaded!.id).toBe(c.id);
    expect(loaded!.name).toBe("Silk Road");
    expect(loaded!.stops).toHaveLength(3);
  });

  it("starts empty on corrupt storage", () => {
    const reg = createRouteRegistry(fakeStorage({ "campaign.tradeRoutes.v1": "{oops" }));
    expect(reg.list()).toEqual([]);
  });
});

describe("totalProfit", () => {
  it("sums weekly profits", () => {
    const reg = createRouteRegistry(fakeStorage());
    reg.found(input(), 0, foundDeps());
    const deps = settleDeps({ a: { textiles: 10 }, b: { textiles: 20 }, c: { textiles: 15 } });
    reg.advance(14, deps);
    const [c] = reg.list();
    // A circular route's trade margins net near zero, so the books show the
    // real costs (guards + distance) as a loss — the point is the sum, not the sign.
    expect(totalProfit(c!)).toBeCloseTo(
      c!.weeks[0]!.profit + c!.weeks[1]!.profit,
      6,
    );
    expect(c!.weeks).toHaveLength(2);
  });
});
