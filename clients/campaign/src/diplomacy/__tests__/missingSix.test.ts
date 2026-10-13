/**
 * The six missing Bannerlord systems.
 */

import { describe, expect, it } from "vitest";
import {
  contractTerms,
  signContract,
  tickContract,
  breakContract,
} from "../mercenary.js";
import { governorBonus } from "../../settlements/governor.js";
import {
  generateOrder,
  tickOrders,
  fulfillOrder,
} from "../../campaign/craftingOrders.js";
import { offerValue, barter } from "../barter.js";
import { attemptCouch, COUCH_MIN_SPEED } from "../../battleflow/couchLance.js";
import { defect } from "../../court/defection.js";

describe("mercenary contracts", () => {
  const terms = contractTerms("mountain-alliance", "Mountain Alliance", 5);

  it("signs when renown suffices and no contract is active", () => {
    const r = signContract(terms, 100, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contract.daysLeft).toBe(30);
  });

  it("refuses without the renown", () => {
    const r = signContract(terms, 10, null);
    expect(r.ok).toBe(false);
  });

  it("refuses a second contract while one is active", () => {
    const first = signContract(terms, 100, null);
    expect(first.ok).toBe(true);
    const second = signContract(terms, 100, first.ok ? first.contract : null);
    expect(second.ok).toBe(false);
  });

  it("ticks down and expires, paying the retainer", () => {
    let c = signContract({ ...terms, days: 2 }, 100, null);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    let contract = c.contract;
    const t1 = tickContract(contract);
    expect(t1.expired).toBe(false);
    expect(t1.pay).toBe(contract.dailyPay);
    const t2 = tickContract(t1.contract!);
    expect(t2.expired).toBe(true);
    expect(t2.contract).toBeNull();
  });

  it("breaking early costs relations", () => {
    const c = signContract(terms, 100, null);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const b = breakContract(c.contract);
    expect(b.relationPenalty).toBeLessThan(0);
  });
});

describe("governors", () => {
  it("a skilled steward calms and feeds the town", () => {
    const b = governorBonus({ id: "g1", name: "June", skills: { steward: 8, trade: 2, tactics: 2 } });
    expect(b.loyalty).toBeGreaterThan(0);
    expect(b.line).toMatch(/keeps order/);
  });

  it("an incompetent governor is a warm chair", () => {
    const b = governorBonus({ id: "g2", name: "Zeke", skills: { steward: 0 } });
    expect(b.loyalty).toBeLessThan(0);
    expect(b.line).toMatch(/warm chair/);
  });
});

describe("crafting orders", () => {
  const recipes = [{ id: "r1", name: "AR-15" }];

  it("generates an order with a patron, deadline, and reward", () => {
    const o = generateOrder(recipes, "o1", () => 0.5);
    expect(o).not.toBeNull();
    expect(o!.reward).toBeGreaterThan(0);
    expect(o!.daysLeft).toBeGreaterThan(0);
  });

  it("orders expire", () => {
    const o = generateOrder(recipes, "o1", () => 0)!;
    const { kept, expired } = tickOrders([{ ...o, daysLeft: 1 }]);
    expect(kept).toHaveLength(0);
    expect(expired).toHaveLength(1);
  });

  it("fulfilling consumes the forged piece and pays", () => {
    const o = generateOrder(recipes, "o1", () => 0)!;
    const no = fulfillOrder(o, []);
    expect(no.ok).toBe(false);
    const yes = fulfillOrder(o, [{ recipeId: o.recipeId, count: 1 }]);
    expect(yes.ok).toBe(true);
    if (yes.ok) expect(yes.reward).toBe(o.reward);
  });
});

describe("barter", () => {
  const terms = { demandValue: 1000, prices: { arms: 50 }, prisonerValue: 100 };

  it("values gold, goods, prisoners, and tribute", () => {
    const v = offerValue(
      { gold: 500, goods: { arms: 4 }, prisoners: 2, dailyTribute: 10, tributeDays: 10 },
      terms,
    );
    // 500 + 4*50 + 2*100 + 10*10 = 1000
    expect(v).toBe(1000);
  });

  it("accepts a meeting offer, hints at near-misses", () => {
    const ok = barter({ gold: 1000, goods: {}, prisoners: 0, dailyTribute: 0, tributeDays: 0 }, terms);
    expect(ok.accepted).toBe(true);
    const near = barter({ gold: 900, goods: {}, prisoners: 0, dailyTribute: 0, tributeDays: 0 }, terms);
    expect(near.accepted).toBe(false);
    expect(near.line).toMatch(/Close/);
  });
});

describe("couched lancing", () => {
  it("needs a lance and a gallop", () => {
    expect(attemptCouch({ speed: 10, isLance: false, ridingSkill: 5 }).couched).toBe(false);
    expect(
      attemptCouch({ speed: COUCH_MIN_SPEED - 1, isLance: true, ridingSkill: 5 }).couched,
    ).toBe(false);
  });

  it("damage scales with speed and skill", () => {
    const slow = attemptCouch({ speed: 8, isLance: true, ridingSkill: 0 });
    const fast = attemptCouch({ speed: 14, isLance: true, ridingSkill: 10 });
    expect(slow.couched).toBe(true);
    expect(fast.damageMult).toBeGreaterThan(slow.damageMult);
    expect(fast.damageMult).toBeGreaterThan(2.5);
  });
});

describe("defection", () => {
  it("loyal clans won't walk", () => {
    const r = defect({ clanName: "Vance", kingdomName: "Empire", loyalty: 80, fiefs: [] });
    expect(r.ok).toBe(false);
  });

  it("waverers need persuasion first", () => {
    const r = defect({ clanName: "Vance", kingdomName: "Empire", loyalty: 30, fiefs: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/persuade/);
  });

  it("the disloyal walk; the furious keep their fiefs", () => {
    const walk = defect({ clanName: "Vance", kingdomName: "Empire", loyalty: 20, fiefs: ["Gary"] });
    expect(walk.ok).toBe(true);
    if (walk.ok) expect(walk.keepsFiefs).toBe(false);
    const furious = defect({
      clanName: "Vance",
      kingdomName: "Empire",
      loyalty: 5,
      fiefs: ["Gary"],
      joinKingdom: "Horde",
    });
    expect(furious.ok).toBe(true);
    if (furious.ok) {
      expect(furious.keepsFiefs).toBe(true);
      expect(furious.line).toMatch(/Horde/);
    }
  });
});
