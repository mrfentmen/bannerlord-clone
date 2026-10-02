import { describe, expect, it } from "vitest";
import { rankCaravanRoutes } from "../caravanRanking.js";
import type { CaravanPlanner, RouteStop } from "../caravans.js";

const stops = (names: string[]): RouteStop[] =>
  names.map((n, i) => ({ settlementId: `s${i}`, settlementName: n }));

const planner: CaravanPlanner = {
  priceAt: (good, settlementId) => {
    // Grain cheap at farm, expensive at city.
    if (good === "grain" && settlementId === "s0") return 2;
    if (good === "grain" && settlementId === "s1") return 8;
    return 5;
  },
  distance: () => 10,
};

describe("caravan profitability ranking (solo task 72)", () => {
  it("ranks routes best-first by profit per day", () => {
    const ranked = rankCaravanRoutes(
      [
        { name: "Farm run", stops: stops(["Farm", "Town"]) },
        { name: "Long haul", stops: stops(["Farm", "City", "Port"]) },
      ],
      "grain",
      100,
      4,
      planner,
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.profitPerDay).toBeGreaterThanOrEqual(ranked[1]!.profitPerDay);
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[1]!.rank).toBe(2);
  });

  it("carries names, labels, and verdicts", () => {
    const ranked = rankCaravanRoutes(
      [{ name: "Farm run", stops: stops(["Farm", "Town"]) }],
      "grain",
      100,
      4,
      planner,
    );
    const r = ranked[0]!;
    expect(r.name).toBe("Farm run");
    expect(r.stops).toEqual(["Farm", "Town"]);
    expect(r.profitPerDayLabel).toContain("/day");
    expect(r.verdict.length).toBeGreaterThan(0);
  });

  it("falls back to stop names when unnamed", () => {
    const ranked = rankCaravanRoutes(
      [{ stops: stops(["Farm", "Town"]) }],
      "grain",
      100,
      4,
      planner,
    );
    expect(ranked[0]!.name).toBe("Farm → Town");
  });

  it("empty candidates yield an empty board", () => {
    expect(rankCaravanRoutes([], "grain", 100, 4, planner)).toHaveLength(0);
  });
});
