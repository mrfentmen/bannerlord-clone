import { describe, expect, it } from "vitest";
import {
  conceptionChance,
  startPregnancy,
  pregnancyStatus,
  maternalDeathChance,
  resolveBirth,
  PREGNANCY_DAYS,
} from "../../clan/pregnancy.js";
import {
  expressInterest,
  courtAction,
  propose,
  PROPOSAL_AFFECTION,
} from "../../clan/courtship.js";
import {
  conformityNeed,
  dailyConformityGain,
  tickConformity,
  checkConformity,
  isWilling,
  recruitmentMoraleCost,
} from "../../afteraction/conformity.js";
import { brokerRate, brokerOffer, sellToBroker } from "../../economy/brokers.js";

describe("pregnancy", () => {
  it("conception is zero outside fertile ages", () => {
    expect(conceptionChance(16, 25)).toBe(0);
    expect(conceptionChance(46, 25)).toBe(0);
    expect(conceptionChance(25, 70)).toBe(0);
    expect(conceptionChance(25, 30)).toBeGreaterThan(0);
  });

  it("fertility fades with age but never goes negative", () => {
    const young = conceptionChance(25, 30);
    const old = conceptionChance(44, 40);
    expect(old).toBeGreaterThan(0);
    expect(old).toBeLessThan(young);
  });

  it("pregnancy is due 252 days after conception", () => {
    const p = startPregnancy("m", "f", 100);
    expect(p.dueDay - p.startDay).toBe(PREGNANCY_DAYS);
    expect(pregnancyStatus(p, 100)).toBe("waiting");
    expect(pregnancyStatus(p, 100 + PREGNANCY_DAYS)).toBe("due");
    expect(pregnancyStatus(p, 100 + PREGNANCY_DAYS + 3)).toBe("overdue");
  });

  it("maternal death risk climbs with age", () => {
    expect(maternalDeathChance(20)).toBeLessThan(maternalDeathChance(40));
    expect(maternalDeathChance(44)).toBeLessThanOrEqual(0.25);
  });

  it("resolveBirth honors the roll", () => {
    expect(resolveBirth(20, () => 0.99).motherSurvives).toBe(true);
    expect(resolveBirth(20, () => 0.0).motherSurvives).toBe(false);
  });
});

describe("courtship", () => {
  const terms = {
    suitorId: "s",
    targetId: "t",
    suitorName: "Suitor",
    targetName: "Target",
    relation: 20,
    approachRoll: 80,
    day: 10,
  };

  it("accepts a good first impression", () => {
    const r = expressInterest(terms);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.courtship.stage).toBe("courting");
      expect(r.courtship.affection).toBeGreaterThan(0);
    }
  });

  it("rejects a terrible first impression", () => {
    const r = expressInterest({ ...terms, relation: -100, approachRoll: 0 });
    expect(r.ok).toBe(false);
  });

  it("court actions raise affection within bounds", () => {
    const r = expressInterest(terms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = courtAction(r.courtship, "gift", () => 0.99);
    expect(after.affection).toBeGreaterThan(r.courtship.affection);
    expect(after.affection).toBeLessThanOrEqual(100);
  });

  it("a bad poem can backfire", () => {
    const r = expressInterest(terms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // First roll sets gain, second roll < 0.25 inverts it.
    let calls = 0;
    const after = courtAction(r.courtship, "poem", () => (++calls === 2 ? 0.1 : 0.99));
    expect(after.affection).toBeLessThan(r.courtship.affection);
  });

  it("proposal needs 70 affection", () => {
    const r = expressInterest(terms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const low = { ...r.courtship, affection: PROPOSAL_AFFECTION - 1 };
    const refused = propose(low, "Suitor", "Target");
    expect(refused.accepted).toBe(false);
    expect(refused.courtship.stage).toBe("rejected");

    const high = { ...r.courtship, affection: PROPOSAL_AFFECTION };
    const accepted = propose(high, "Suitor", "Target");
    expect(accepted.accepted).toBe(true);
    expect(accepted.courtship.stage).toBe("betrothed");
  });

  it("rejections raise the bar", () => {
    const r = expressInterest(terms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const twiceBurned = { ...r.courtship, affection: PROPOSAL_AFFECTION + 5, rejections: 2 };
    // Bar is now 90; 75 is not enough.
    expect(propose(twiceBurned, "Suitor", "Target").accepted).toBe(false);
  });
});

describe("prisoner conformity", () => {
  it("need scales with tier", () => {
    expect(conformityNeed(1)).toBe(39);
    expect(conformityNeed(4)).toBeGreaterThan(conformityNeed(1));
  });

  it("conformity builds daily and caps at need", () => {
    const need = conformityNeed(2);
    const after = tickConformity({ tier: 2, conformity: need - 1, leadership: 10 });
    expect(after).toBe(need);
    expect(isWilling(2, need)).toBe(true);
    expect(isWilling(2, need - 1)).toBe(false);
  });

  it("leadership speeds the breaking-in", () => {
    expect(dailyConformityGain(20)).toBeGreaterThan(dailyConformityGain(0));
  });

  it("checkConformity explains the wait", () => {
    const c = checkConformity(3, 0);
    expect(c.willing).toBe(false);
    expect(c.reason).toMatch(/conformity/);
  });

  it("recruiting prisoners costs morale, capped", () => {
    expect(recruitmentMoraleCost(1)).toBeGreaterThan(0);
    expect(recruitmentMoraleCost(1000)).toBeLessThanOrEqual(20);
  });
});

describe("ransom brokers", () => {
  it("richer towns pay a better rate, always a discount", () => {
    expect(brokerRate(90)).toBeGreaterThan(brokerRate(10));
    expect(brokerRate(100)).toBeLessThan(1);
    expect(brokerRate(0)).toBeGreaterThan(0);
  });

  it("the offer is a fraction of ransom value", () => {
    const offer = brokerOffer({ ransomValue: 1000, townProsperity: 50 });
    expect(offer).toBeGreaterThan(0);
    expect(offer).toBeLessThan(1000);
  });

  it("sellToBroker produces a readable deal", () => {
    const deal = sellToBroker("Oakhaven", "5 Raiders", { ransomValue: 600, townProsperity: 60 });
    expect(deal.gold).toBeGreaterThan(0);
    expect(deal.line).toMatch(/Oakhaven/);
  });
});
