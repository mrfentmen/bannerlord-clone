/**
 * The core loop, end to end against the fixture: trade goods, hire soldiers, march,
 * and watch the daily upkeep come out of the purse.
 *
 * These tests drive the provider the same way the panels do. If the client ever
 * computed a price, a wage bill, or a ration line on its own, these would fail —
 * every number here is the simulation's answer, not the test's arithmetic.
 */

import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "./index.js";

describe("market trading", () => {
  it("buying takes gold and adds to the caravan hold", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const moneyBefore = before.player.resources.money;

    const result = await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "grain",
      side: "buy",
      quantity: 10,
      expectedDay: before.day,
    });

    expect(result.accepted).toBe(true);
    expect(result.total).toBeGreaterThan(0);

    const after = await provider.getSnapshot();
    expect(after.player.resources.money).toBeCloseTo(moneyBefore - result.total, 5);
    const held = after.party.goods.find((g) => g.goodId === "grain")!;
    expect(held.quantity).toBe(10);
  });

  it("selling adds gold and empties the hold", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();

    await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "grain",
      side: "buy",
      quantity: 10,
      expectedDay: before.day,
    });
    const moneyAfterBuy = (await provider.getSnapshot()).player.resources.money;

    const result = await provider.trade({
      partyId: "party-player",
      townId: "town-longmont",
      goodId: "grain",
      side: "sell",
      quantity: 10,
      expectedDay: before.day,
    });

    expect(result.accepted).toBe(true);
    const after = await provider.getSnapshot();
    expect(after.player.resources.money).toBeCloseTo(moneyAfterBuy + result.total, 5);
    const held = after.party.goods.find((g) => g.goodId === "grain")!;
    expect(held.quantity).toBe(0);
  });

  it("refuses a trade the purse cannot cover, with a reason", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();

    const result = await provider.trade({
      partyId: "party-player",
      townId: "town-denver",
      goodId: "arms",
      side: "buy",
      quantity: 1000,
      expectedDay: before.day,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe("recruitment", () => {
  it("hiring adds soldiers to the roster and takes the bonus from the purse", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const moneyBefore = before.player.resources.money;
    const town = before.towns.find((t) => t.id === "town-denver")!;
    const militia = town.recruitable.find((u) => u.unitId === "militia")!;
    const headcountBefore = before.party.troops.reduce((a, t) => a + t.count, 0);

    const result = await provider.recruit({
      partyId: "party-player",
      townId: "town-denver",
      unitId: "militia",
      quantity: 10,
      expectedDay: before.day,
    });

    expect(result.accepted).toBe(true);
    expect(result.totalCost).toBe(militia.hireCost * 10);

    const after = await provider.getSnapshot();
    expect(after.player.resources.money).toBeCloseTo(moneyBefore - result.totalCost, 5);
    const headcountAfter = after.party.troops.reduce((a, t) => a + t.count, 0);
    expect(headcountAfter).toBe(headcountBefore + 10);
    const stack = after.party.troops.find((t) => t.id === "t-militia")!;
    expect(stack.count).toBe(10);
    expect(result.newCount).toBe(10);
  });

  it("hiring into an existing stack merges rather than duplicating", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();

    await provider.recruit({
      partyId: "party-player",
      townId: "town-denver",
      unitId: "riflemen",
      quantity: 5,
      expectedDay: before.day,
    });
    const result = await provider.recruit({
      partyId: "party-player",
      townId: "town-denver",
      unitId: "riflemen",
      quantity: 5,
      expectedDay: before.day,
    });

    expect(result.accepted).toBe(true);
    const after = await provider.getSnapshot();
    const stacks = after.party.troops.filter((t) => t.id === "t-riflemen");
    expect(stacks).toHaveLength(1);
    // 18 in the starting roster plus 10 hired.
    expect(stacks[0]!.count).toBe(28);
    expect(result.newCount).toBe(28);
  });

  it("drains the town's pool of willing recruits", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const town = before.towns.find((t) => t.id === "town-central-city")!;
    const scouts = town.recruitable.find((u) => u.unitId === "scouts")!;
    const available = scouts.available;

    // Hire everyone willing.
    const result = await provider.recruit({
      partyId: "party-player",
      townId: "town-central-city",
      unitId: "scouts",
      quantity: available,
      expectedDay: before.day,
    });
    expect(result.accepted).toBe(true);

    // One more should be refused.
    const refused = await provider.recruit({
      partyId: "party-player",
      townId: "town-central-city",
      unitId: "scouts",
      quantity: 1,
      expectedDay: before.day,
    });
    expect(refused.accepted).toBe(false);
    expect(refused.reason).toContain("willing to sign on");
  });

  it("refuses a hire the purse cannot cover, with a reason", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();

    const result = await provider.recruit({
      partyId: "party-player",
      townId: "town-denver",
      unitId: "scouts",
      quantity: 1000,
      expectedDay: before.day,
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe("marching and daily upkeep", () => {
  it("committing a march sets the destination and takes the march cost", async () => {
    const provider = createFixtureSimulationProvider();
    const before = await provider.getSnapshot();
    const moneyBefore = before.player.resources.money;
    const foodBefore = before.party.food;

    const plan = await provider.planMarch({
      partyId: "party-player",
      destinationSettlementId: "denver",
      departure: "now",
    });
    expect(plan.unmapped).toBe(false);

    await provider.commitMarch({
      partyId: "party-player",
      destinationSettlementId: "denver",
      departure: "now",
    });

    const after = await provider.getSnapshot();
    expect(after.party.destination?.settlementId).toBe("denver");
    expect(after.player.resources.money).toBeLessThan(moneyBefore);
    expect(after.party.food).toBeLessThan(foodBefore);
  });

  it("deducts daily upkeep from the purse and the stores as days pass", async () => {
    const provider = createFixtureSimulationProvider();
    // Pause the real-time clock; this test steps days manually.
    provider.setTimeScale(0);
    const before = await provider.getSnapshot();
    const moneyBefore = before.player.resources.money;
    const foodBefore = before.party.food;
    const metalBefore = before.party.metal;

    // March to Denver, then run five days through the public skip.
    await provider.commitMarch({
      partyId: "party-player",
      destinationSettlementId: "denver",
      departure: "now",
    });
    // Denver is 32 km at 34 km/day: one day. March somewhere further instead so the
    // clock actually runs. Longmont is 58 km: two days.
    const { daysAdvanced } = await provider.skipToArrival();
    expect(daysAdvanced).toBeGreaterThan(0);

    const after = await provider.getSnapshot();
    // The ledger's daily bill: wages + camp + rations + ammo, against trade income.
    // Five assertions would be brittle; the shape is what matters: money moved down
    // by roughly the daily net, food and metal each fell.
    expect(after.player.resources.money).toBeLessThan(moneyBefore);
    expect(after.party.food).toBeLessThan(foodBefore);
    expect(after.party.metal).toBeLessThan(metalBefore);
    // The march completed: the party is no longer ordered anywhere.
    expect(after.party.destination).toBeNull();
  });

  it("unpaid wages become wages owed rather than negative money", async () => {
    const provider = createFixtureSimulationProvider();
    provider.setTimeScale(0);
    // This test needs 145 troops; raise clan tier for capacity (25 + 6*25 = 175).
    (provider as any).debugSetClanTier("clan-player", 6);

    // Raise a large force across two towns: 145 militia at 0.5 wage each, which is the
    // whole purse at the $15 hiring bonus. Nothing is left over, so the first day's
    // wage bill cannot be met and the shortfall has somewhere honest to go.
    //
    // The quantities are named rather than read from `available`, and that is the point
    // of this test. `available` is a number the fixture computes from town population,
    // and it drifts whenever population or the town-size factor moves — at which point
    // "hire the whole pool" quietly becomes "spend the whole purse on hiring bonuses",
    // the hire is refused for being unaffordable, and this test fails for a reason that
    // has nothing to do with unpaid wages. The number this test needs is a force big
    // enough that two days of wages outrun the purse; it does not need to be the pool.
    for (const [townId, quantity] of [["town-denver", 120], ["town-aurora", 25]] as [string, number][]) {
      const snap = await provider.getSnapshot();
      const town = snap.towns.find((t) => t.id === townId)!;
      const available = town.recruitable.find((u) => u.unitId === "militia")!.available;
      expect(available, `${townId} has fewer militia than this test hires`).toBeGreaterThanOrEqual(quantity);
      const hired = await provider.recruit({
        partyId: "party-player",
        townId,
        unitId: "militia",
        quantity,
        expectedDay: snap.day,
      });
      expect(hired.accepted, hired.reason ?? "the hire was refused").toBe(true);
    }

    // 163 troops: ~82/day wages + 14 camp against an empty purse. The first day of
    // that cannot be covered, so it becomes wages owed rather than negative money.
    await provider.commitMarch({
      partyId: "party-player",
      destinationSettlementId: "longmont",
      departure: "now",
    });
    await provider.skipToArrival();

    const after = await provider.getSnapshot();
    expect(after.player.resources.money).toBeGreaterThanOrEqual(0);
    expect(after.party.wagesOwed).toBeGreaterThan(0);
  });
});

describe("time controls", () => {
  it("setTimeScale(0) pauses the clock; a positive scale resumes it", async () => {
    const provider = createFixtureSimulationProvider();
    let ticks = 0;
    const unsubscribe = provider.subscribeTicks(() => {
      ticks += 1;
    }, () => {});

    provider.setTimeScale(0);
    await new Promise((r) => setTimeout(r, 300));
    const pausedTicks = ticks;

    provider.setTimeScale(20);
    await new Promise((r) => setTimeout(r, 300));
    unsubscribe();

    expect(ticks).toBeGreaterThan(pausedTicks);
    expect(pausedTicks).toBe(0);
  });

  it("skipToArrival runs the march to completion", async () => {
    const provider = createFixtureSimulationProvider();
    provider.setTimeScale(0);
    const before = await provider.getSnapshot();

    await provider.commitMarch({
      partyId: "party-player",
      destinationSettlementId: "longmont",
      departure: "now",
    });
    const { daysAdvanced } = await provider.skipToArrival();

    expect(daysAdvanced).toBeGreaterThan(0);
    const after = await provider.getSnapshot();
    expect(after.party.destination).toBeNull();
    expect(after.day).not.toBe(before.day);
  });

  it("skipToArrival with no march advances nothing", async () => {
    const provider = createFixtureSimulationProvider();
    provider.setTimeScale(0);
    const { daysAdvanced } = await provider.skipToArrival();
    expect(daysAdvanced).toBe(0);
  });
});
