/**
 * Dynasty power bundle: clan tiers, kingdom founding, lord execution.
 *
 * Pure-module tests (tiers, foundKingdom, prisoners) plus fixture-level
 * tests driving the provider the way the panels do.
 */
import { describe, expect, it } from "vitest";
import {
  tierForRenown,
  tierName,
  maxFiefsForTier,
  partyCapacityForTier,
  companionSlotsForTier,
  renownToNextTier,
  advanceTier,
  canHoldFief,
} from "../../../clan/tiers.js";
import {
  canFoundKingdom,
  foundKingdom,
  recruitVassal,
  FOUND_KINGDOM_MIN_TIER,
  FOUND_KINGDOM_INFLUENCE_COST,
} from "../../../court/foundKingdom.js";
import {
  executionConsequences,
  executeSelected,
  createRoster,
} from "../../../afteraction/prisoners.js";
import { createFixtureSimulationProvider } from "../index.js";

describe("clan tiers", () => {
  it("follows Bannerlord's renown ladder", () => {
    expect(tierForRenown(0)).toBe(0);
    expect(tierForRenown(49)).toBe(0);
    expect(tierForRenown(50)).toBe(1);
    expect(tierForRenown(150)).toBe(2);
    expect(tierForRenown(350)).toBe(3);
    expect(tierForRenown(900)).toBe(4);
    expect(tierForRenown(2350)).toBe(5);
    expect(tierForRenown(6150)).toBe(6);
    expect(tierForRenown(99999)).toBe(6);
  });

  it("names tiers and caps fiefs", () => {
    expect(tierName(0)).toBe("Drifters");
    expect(tierName(6)).toBe("Empire");
    expect(maxFiefsForTier(0)).toBe(1);
    expect(maxFiefsForTier(3)).toBe(4);
    expect(maxFiefsForTier(6)).toBe(Infinity);
  });

  it("scales party capacity and companion slots", () => {
    expect(partyCapacityForTier(1)).toBe(50);
    expect(partyCapacityForTier(6)).toBe(175);
    expect(companionSlotsForTier(0)).toBe(1);
    expect(renownToNextTier(0, 30)).toBe(20);
    expect(renownToNextTier(6, 99999)).toBe(0);
  });

  it("advances with a narrative line", () => {
    const adv = advanceTier(1, 200, "The Test Clan");
    expect(adv.advanced).toBe(true);
    expect(adv.fromTier).toBe(1);
    expect(adv.toTier).toBe(2);
    expect(adv.line).toContain("tier 2");
    const noop = advanceTier(2, 200, "The Test Clan");
    expect(noop.advanced).toBe(false);
  });

  it("forbids holding past the tier cap", () => {
    expect(canHoldFief(1, 1).ok).toBe(true);
    const denied = canHoldFief(1, 2);
    expect(denied.ok).toBe(false);
    expect(denied.reason).toContain("tier 2");
    expect(canHoldFief(6, 40).ok).toBe(true);
  });
});

describe("found kingdom", () => {
  const base = {
    clanName: "The Test Clan",
    tier: 4,
    fiefs: ["town-a"],
    isVassal: false,
    keptFiefsOnDefection: true,
    influence: 150,
    kingdomName: "Testland",
  };

  it("gates on tier, fiefs, influence, and name", () => {
    expect(canFoundKingdom({ ...base, tier: 3 }).ok).toBe(false);
    expect(canFoundKingdom({ ...base, fiefs: [] }).ok).toBe(false);
    expect(canFoundKingdom({ ...base, influence: 10 }).ok).toBe(false);
    expect(canFoundKingdom({ ...base, kingdomName: "  " }).ok).toBe(false);
    expect(canFoundKingdom({ ...base, isVassal: true, formerKingdom: "Old" }).reason).toContain("fealty");
    expect(canFoundKingdom(base).ok).toBe(true);
  });

  it("founds with war when keeping fiefs", () => {
    const r = foundKingdom({ ...base, formerKingdom: "Old Kingdom" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.capital).toBe("town-a");
      expect(r.warWithFormer).toBe(true);
      expect(r.influenceSpent).toBe(FOUND_KINGDOM_INFLUENCE_COST);
      expect(r.line).toContain("treason");
    }
  });

  it("founds peacefully with no land taken", () => {
    const r = foundKingdom({ ...base, fiefs: ["town-a"], keptFiefsOnDefection: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warWithFormer).toBe(false);
  });

  it("recruits vassals on relation + legitimacy", () => {
    const won = recruitVassal({ clanName: "A", relation: 80, persuasionRoll: 80, kingdomRenown: 500 });
    expect(won.ok).toBe(true);
    const lost = recruitVassal({ clanName: "B", relation: -50, persuasionRoll: 10, kingdomRenown: 0 });
    expect(lost.ok).toBe(false);
    expect(FOUND_KINGDOM_MIN_TIER).toBe(4);
  });
});

describe("execution of lords", () => {
  it("scales fallout with the victim's standing", () => {
    const nobody = executionConsequences({ id: "x", name: "X", tier: 1, ransomValue: 0 });
    const lord = executionConsequences({
      id: "y", name: "Lord Y", tier: 4, ransomValue: 0,
      isNoble: true, clanName: "House Y",
    });
    expect(lord.factionRelationDelta).toBeLessThan(nobody.factionRelationDelta);
    expect(lord.honorDelta).toBeLessThan(0);
    expect(lord.dreadGained).toBeGreaterThan(0);
    expect(lord.ownMoraleDelta).toBeLessThan(0);
    expect(lord.line).toContain("House Y");
  });

  it("executeSelected removes victims from the roster", () => {
    const roster = createRoster([
      { id: "a", name: "Lord A", tier: 4, ransomValue: 1000, isNoble: true },
      { id: "b", name: "Captive B", tier: 1, ransomValue: 30 },
    ]);
    roster.selected.add("a");
    const done = executeSelected(roster);
    expect(done).toHaveLength(1);
    expect(done[0]!.victim.name).toBe("Lord A");
    expect(roster.prisoners).toHaveLength(1);
  });
});

describe("dynasty power in the fixture", () => {
  it("reads the clan tier ladder", async () => {
    const provider = createFixtureSimulationProvider({ seed: 7 });
    const info = await provider.getClanTier();
    expect(info.tier).toBe(1);
    expect(info.name).toBe("Rabble");
    expect(info.renownToNext).toBeGreaterThan(0);
    expect(info.fiefLimit).toBe(2);
    expect(info.partyCapacity).toBe(50);
  });

  it("refuses to found a kingdom below tier 4", async () => {
    const provider = createFixtureSimulationProvider({ seed: 7 });
    await expect(provider.foundKingdom("Testland")).rejects.toThrow(/tier 4/i);
  });

  it("starts with no held lords", async () => {
    const provider = createFixtureSimulationProvider({ seed: 7 });
    expect(await provider.getHeldLords()).toEqual([]);
    const snap = await provider.getSnapshot();
    expect(snap.heldLords).toEqual([]);
  });

  it("rejects executing a lord nobody holds", async () => {
    const provider = createFixtureSimulationProvider({ seed: 7 });
    await expect(provider.executeHeldLord("Nobody")).rejects.toThrow(/not your prisoner/i);
  });
});
