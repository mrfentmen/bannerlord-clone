/**
 * The Why panel's chain walk. This is the premise of the whole game
 * (`README.md`: "Everything affects everything ... and the player can trace the chain
 * afterward"), so it gets the most direct test in the suite.
 *
 * What is being asserted is not "a string appeared" but "the graph was walked": a
 * multi-link chain, in causal order, with no row repeated, and the values on each row
 * the simulation actually wrote.
 */

import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "./index.js";
import type { CauseRow } from "../types.js";

/** The chain in `CAUSE_EFFECT.md` section 4, as a shape rather than as text. */
function chainFor(rows: CauseRow[]): string[] {
  return rows.map((r) => `${r.system}: ${r.field}`);
}

describe("the why chain", () => {
  it("walks a multi-link chain from an outcome back to the original cause", async () => {
    const provider = createFixtureSimulationProvider();
    const chain = await provider.why("town-golden", "unrest");

    // At least five links, which is the Phase 1 exit criterion for a collapsed town.
    expect(chain.rows.length).toBeGreaterThanOrEqual(5);
    expect(chain.totalDepth).toBeGreaterThanOrEqual(4);
    expect(chain.truncated).toBe(false);
  });

  it("starts at the outcome and ends at the origin, in causal order", async () => {
    const provider = createFixtureSimulationProvider();
    const chain = await provider.why("town-golden", "unrest");
    const shape = chainFor(chain.rows);

    // The first row is what the player asked about; the last is the furthest cause.
    expect(shape[0]).toBe("Unrest: unrest");
    expect(shape.at(-1)).toMatch(/^(Security|Military upkeep): /);

    // Every row after the first must be reachable from the one before it, so the
    // order is a real walk and not a list that happened to be sorted.
    const byId = new Map(chain.rows.map((r) => [r.id, r]));
    for (let i = 1; i < chain.rows.length; i += 1) {
      const row = chain.rows[i]!;
      const previous = chain.rows[i - 1]!;
      const isChildOfAnEarlierRow = chain.rows
        .slice(0, i)
        .some((earlier) => earlier.causedBy.includes(row.id));
      expect(
        isChildOfAnEarlierRow,
        `"${row.summary}" at depth ${i} is not caused by anything above it`,
      ).toBe(true);
      expect(byId.has(row.id)).toBe(true);
      void previous;
    }
  });

  it("names the system that wrote each row, so the chain is inspectable", async () => {
    const provider = createFixtureSimulationProvider();
    const chain = await provider.why("town-golden", "unrest");

    // CONSTITUTION.md section 2: systems read and write shared state and never call
    // each other. The system name is therefore the honest explanation of a write, and
    // the panel has to show it.
    const systems = new Set(chain.rows.map((r) => r.system));
    expect(systems.size).toBeGreaterThanOrEqual(4);
    for (const row of chain.rows) {
      expect(row.system.length).toBeGreaterThan(0);
      expect(row.summary.length).toBeGreaterThan(10);
      expect(Number.isFinite(row.old)).toBe(true);
      expect(Number.isFinite(row.new)).toBe(true);
    }
  });

  it("records real before and after values, so a row can be checked by hand", async () => {
    const provider = createFixtureSimulationProvider();
    const chain = await provider.why("town-golden", "unrest");
    const food = chain.rows.find((r) => r.field === "foodStock");
    expect(food).toBeDefined();
    // food_stock is in person-days (CAUSE_EFFECT.md section 2). Golden's store ran
    // from 2.9 days of food to 0.4 days, and the row carries the person-days.
    expect(food!.old).toBeGreaterThan(food!.new);
    expect(food!.old / 20415).toBeCloseTo(2.9, 1);
    expect(food!.new / 20415).toBeCloseTo(0.4, 1);
  });

  it("never repeats a row when the graph branches", async () => {
    const provider = createFixtureSimulationProvider();
    const chain = await provider.why("town-golden", "unrest");
    const ids = chain.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an honest empty chain rather than a generic explanation", async () => {
    const provider = createFixtureSimulationProvider();
    const chain = await provider.why("town-denver", "tax_rate");
    expect(chain.rows).toHaveLength(0);
    expect(chain.totalDepth).toBe(0);
    // The panel renders this as "Nothing caused this." rather than inventing a reason.
  });

  it("branches, so one cause feeding two effects is a real shape and not a list", async () => {
    const provider = createFixtureSimulationProvider();
    // Golden's outbreak is caused by both the medicine stock falling and the medicine
    // caravan being robbed, and the robbery is itself caused by the road going unsafe.
    // That is a diamond: one road, two consequences.
    const infected = await provider.why("town-golden", "infected");
    const systems = infected.rows.map((r) => r.system);
    expect(systems[0]).toBe("Disease");
    // The two causes of the outbreak are the medicine rows, and the road underneath.
    expect(infected.rows.some((r) => r.field === "medicine_stock")).toBe(true);
    expect(infected.rows.some((r) => r.field === "medicine_convoy")).toBe(true);
    expect(infected.rows.some((r) => r.field === "road_safety")).toBe(true);
    // And the walk down from unrest passes through the outbreak, so the two chains are
    // the same graph rather than two separate ones.
    const unrest = await provider.why("town-golden", "unrest");
    const fields = new Set(unrest.rows.map((r) => r.field));
    for (const field of ["foodStock", "food_production", "workers", "infected", "medicine_stock"]) {
      expect(fields.has(field), `the unrest chain does not pass through ${field}`).toBe(true);
    }
  });

  it("reaches an origin the player can act on, not a dead end", async () => {
    const provider = createFixtureSimulationProvider();
    for (const [entityId, field] of [
      ["town-golden", "unrest"],
      ["town-golden", "foodStock"],
      ["town-idaho-springs", "medicine_stock"],
      ["town-longmont", "loyalty"],
    ] as const) {
      const chain = await provider.why(entityId, field);
      expect(chain.rows.length, `${entityId}.${field} has no chain`).toBeGreaterThanOrEqual(2);
      // The furthest link is a root: nothing in the chain caused it, so the player has
      // reached something they could have acted on rather than a row that points
      // further off the end of the log.
      const ids = new Set(chain.rows.map((r) => r.id));
      const roots = chain.rows.filter((r) => r.causedBy.filter((c) => ids.has(c)).length === 0);
      expect(roots.length, `${entityId}.${field} has no origin inside the chain`).toBeGreaterThan(0);
      for (const root of roots) {
        expect(root.summary.length).toBeGreaterThan(10);
        expect(root.system.length).toBeGreaterThan(0);
      }
    }
  });

  it("explains a live trade, linking the player's action to the market and the town", async () => {
    const provider = createFixtureSimulationProvider();
    const snap = await provider.getSnapshot();
    const golden = snap.towns.find((t) => t.name === "Golden")!;

    // Load grain into the party at a town with grain to spare, then sell it into
    // Golden, which is starving.
    const source = snap.towns.find((t) => t.name === "Lakewood")!;
    const buy = await provider.trade({
      partyId: "party-player",
      townId: source.id,
      goodId: "grain",
      side: "buy",
      quantity: 40,
      expectedDay: snap.day,
    });
    expect(buy.accepted).toBe(true);

    const sell = await provider.trade({
      partyId: "party-player",
      townId: golden.id,
      goodId: "grain",
      side: "sell",
      quantity: 40,
      expectedDay: snap.day,
    });
    expect(sell.accepted).toBe(true);
    // Selling fills Golden's market, so scarcity falls and the price comes down. The
    // point is that it moved, and that the reason is walkable.
    expect(sell.marketPriceAfter).toBeLessThan(sell.unitPrice);

    const priceChain = await provider.why(golden.id, "grain_price");
    expect(priceChain.rows.length).toBeGreaterThanOrEqual(3);
    expect(priceChain.rows[0]!.system).toBe("Market");
    expect(priceChain.rows.at(-1)!.system).toBe("Player");
    expect(priceChain.rows.at(-1)!.summary).toMatch(/You sold/);

    // And the food stock chain reaches the town's own food balance, so selling grain
    // into a starving town is traceable end to end.
    const foodChain = await provider.why(golden.id, "foodStock");
    const systems = new Set(foodChain.rows.map((r) => r.system));
    expect(systems.has("Player")).toBe(true);
    expect(systems.has("Food")).toBe(true);
  });
});
