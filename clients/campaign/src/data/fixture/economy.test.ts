/**
 * The end-to-end behaviour the Phase 2 exit criterion names: trade goods, then watch
 * prices and unrest respond over time.
 *
 * The point of these tests is that the client does not compute any of it. They drive
 * the provider the same way the market panel does and check that the simulation's
 * outputs move in response, so a future change that made the client guess would fail
 * here rather than ship.
 */

import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "./index.js";

describe("trading moves prices, and prices move unrest", () => {
  it("raises the market price when goods leave a market", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const market = before.markets["town-longmont"]!;
    const grain = market.goods.find((g) => g.goodId === "grain")!;

    // Buy a large amount into the market, which drains its stock.
    const buy = await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "grain",
      side: "buy",
      quantity: 50,
      expectedDay: before.day,
    });
    expect(buy.accepted).toBe(true);

    // Buying takes stock out, so scarcity should push the price up.
    expect(buy.marketPriceAfter).toBeGreaterThan(buy.unitPrice);
    expect(buy.unitPrice).toBeCloseTo(grain.price, 5);
  });

  it("lowers the market price when goods arrive", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();

    // Stock the party first, then dump it into the same market.
    const buy = await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "grain",
      side: "buy",
      quantity: 45,
      expectedDay: before.day,
    });
    expect(buy.accepted).toBe(true);

    const sell = await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "grain",
      side: "sell",
      quantity: 45,
      expectedDay: before.day,
    });
    expect(sell.accepted).toBe(true);
    // Selling fills a hungry market, so the price falls back below where the buy left it.
    expect(sell.marketPriceAfter).toBeLessThan(buy.marketPriceAfter);
    expect(sell.marketPriceAfter).toBeLessThan(sell.unitPrice);
  });

  it("calms a starving town when grain is delivered to it", async () => {
    // CAUSE_EFFECT.md section 5, case 5: delivering food and medicine brings unrest
    // down. Good outcomes must emerge the same way bad ones do, and the same Why
    // chain has to explain them.
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const golden = before.towns.find((t) => t.name === "Golden")!;
    const source = before.towns.find((t) => t.name === "Lakewood")!;

    await provider.trade({
      partyId: "party-player",
      townId: source.id,
      goodId: "grain",
      side: "buy",
      quantity: 45,
      expectedDay: before.day,
    });
    const sell = await provider.trade({
      partyId: "party-player",
      townId: golden.id,
      goodId: "grain",
      side: "sell",
      quantity: 45,
      expectedDay: before.day,
    });
    expect(sell.accepted).toBe(true);

    const after = await provider.getSnapshot();
    const goldenAfter = after.towns.find((t) => t.id === golden.id)!;

    // The food store rose, in person-days, and the days-of-food figure rose with it.
    expect(goldenAfter.foodStock).toBeGreaterThan(golden.foodStock);
    expect(goldenAfter.foodStock / goldenAfter.foodDemand).toBeGreaterThan(golden.foodStock / golden.foodDemand);
    // And the unrest that had been rising came down.
    expect(goldenAfter.unrest).toBeLessThan(golden.unrest);
  });

  it("raises unrest when the party takes food out of a starving town's own store", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const golden = before.towns.find((t) => t.name === "Golden")!;

    // Buying from Golden draws on its own market, and the Food system takes that out
    // of the town's stores. A worsening, not a rescue.
    const buy = await provider.trade({
      partyId: "party-player",
      townId: golden.id,
      goodId: "grain",
      side: "buy",
      quantity: 45,
      expectedDay: before.day,
    });
    expect(buy.accepted).toBe(true);

    const after = await provider.getSnapshot();
    const goldenAfter = after.towns.find((t) => t.id === golden.id)!;
    expect(goldenAfter.foodStock).toBeLessThan(golden.foodStock);
    expect(goldenAfter.unrest).toBeGreaterThan(golden.unrest);

    // And the reason the unrest moved is walkable back to the player's own order.
    const chain = await provider.why(golden.id, "unrest");
    const systems = chain.rows.map((r) => r.system);
    expect(systems).toContain("Player");
    expect(systems).toContain("Food");
  });

  it("refuses a trade the player cannot afford, and says why in the product's voice", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const poor = await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "arms",
      side: "buy",
      quantity: 10_000,
      expectedDay: before.day,
    });
    expect(poor.accepted).toBe(false);
    // Not "Error". Not "Insufficient funds". The player is told the shortfall.
    expect(poor.reason).toMatch(/^Short \$/);
    expect(poor.reason).toMatch(/You have \$/);
    // Never the words a developer would write.
    expect(poor.reason).not.toMatch(/undefined|NaN|Error/i);
  });

  it("refuses to sell goods the party does not hold", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const sell = await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "lumber",
      side: "sell",
      quantity: 5,
      expectedDay: before.day,
    });
    expect(sell.accepted).toBe(false);
    expect(sell.reason).toMatch(/You hold 0/);
  });
});

describe("ticks move the world", () => {
  it("advances the day and sends updates to a subscriber", async () => {
    const provider = createFixtureSimulationProvider();
    const ticks: number[] = [];
    const stop = provider.subscribeTicks(
      (t) => ticks.push(t.day),
      () => {},
    );
    const first = await provider.getSnapshot();
    await new Promise((r) => setTimeout(r, 2600));
    stop();
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    expect(ticks.at(-1)!).toBeGreaterThan(first.day);
  });

  it("produces a price history a sparkline can draw", async () => {
    const provider = createFixtureSimulationProvider();
    const stop = provider.subscribeTicks(
      () => {},
      () => {},
    );
    await new Promise((r) => setTimeout(r, 2600));
    stop();
    const snap = await provider.getSnapshot();
    const grain = snap.markets["town-longmont"]!.goods.find((g) => g.goodId === "grain")!;
    expect(grain.history.length).toBeGreaterThanOrEqual(2);
    for (const point of grain.history) {
      expect(Number.isFinite(point.price)).toBe(true);
      expect(point.day).toBeGreaterThan(0);
    }
  });
});

describe("the march planner prices before it commits", () => {
  it("returns distance, days, and cost without moving the party", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const plan = await provider.planMarch({
      partyId: "party-player",
      destinationSettlementId: "denver",
      departure: "now",
    });
    const after = await provider.getSnapshot();

    expect(plan.unmapped).toBe(false);
    expect(plan.distanceKm).toBeGreaterThan(0);
    expect(plan.days).toBeGreaterThan(0);
    expect(plan.cost.food).toBeGreaterThan(0);
    expect(plan.arrivalDay).toBe(before.day + plan.days);
    // Planning is not committing: the party's position and destination are unchanged.
    expect(after.party.destination).toBeNull();
    expect(after.party.food).toBe(before.party.food);
  });

  it("warns when the grain will not last the march", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const plan = await provider.planMarch({
      partyId: "party-player",
      destinationSettlementId: "denver",
      departure: "now",
    });
    if (plan.cost.food > before.party.food) {
      expect(plan.warnings.join(" ")).toMatch(/grain/i);
    } else {
      expect(plan.daysOfFoodOnArrival).toBeGreaterThan(0);
    }
  });

  it("moves the party only when the march is committed", async () => {
    const provider = createFixtureSimulationProvider();
    await provider.commitMarch({
      partyId: "party-player",
      destinationSettlementId: "denver",
      departure: "now",
    });
    const snap = await provider.getSnapshot();
    expect(snap.party.destination?.name).toBe("Denver");
    expect(snap.party.marchingSinceDay).toBe(snap.day);
    // The cost is drawn down at the moment of commitment, as the planner said it would.
    expect(snap.party.food).toBeLessThan(46);
  });
});
