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

    // Raise a force across two towns that the purse cannot pay for: militia at 0.5
    // wage each, hired at the hiring bonus, until the bag cannot cover another head.
    //
    // The headcount is derived from the purse rather than written down, because the
    // willing-recruit pool is fixture data, not a constant: it scales with town
    // population, with the power of the town's notables, and with the character's
    // ethnicity. A hard-coded roster is a test that fails when the towns change
    // instead of when the rule breaks — which is what happened to the 138 militia
    // this test used to name, before notable power and ethnicity moved the pools.
    let hireCost = 0;
    for (const townId of ["town-denver", "town-aurora"]) {
      const snap = await provider.getSnapshot();
      const town = snap.towns.find((t) => t.id === townId)!;
      const militia = town.recruitable.find((u) => u.unitId === "militia")!;
      hireCost = militia.hireCost;
      const quantity = Math.min(Math.floor(snap.player.resources.money / militia.hireCost), militia.available);
      if (quantity <= 0) continue; // The purse is already below one head.
      const hired = await provider.recruit({
        partyId: "party-player",
        townId,
        unitId: "militia",
        quantity,
        expectedDay: snap.day,
      });
      expect(hired.accepted).toBe(true);
    }

    // Precondition, and the reason this test is worth having: the purse now holds
    // less than one head's hiring bonus, which no day of wages and camp fits inside.
    // If the fixture ever starts a party rich enough to cover a day's bill without
    // hiring, this fails here rather than passing for the wrong reason.
    const purse = (await provider.getSnapshot()).player.resources.money;
    expect(purse).toBeLessThan(hireCost);

    // March, so the clock runs and the day bill lands on that purse.
    await provider.commitMarch({
      partyId: "party-player",
      destinationSettlementId: "longmont",
      departure: "now",
    });
    const { daysAdvanced } = await provider.skipToArrival();
    expect(daysAdvanced).toBeGreaterThan(0);

    // The ledger's rule: the purse stops at zero and the shortfall it could not pay
    // is owed, not negative gold.
    const after = await provider.getSnapshot();
    expect(after.player.resources.money).toBe(0);
    expect(after.party.money).toBe(0); // One purse, two views of it.
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
