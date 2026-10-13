/**
 * The wire shapes, checked one endpoint at a time.
 *
 * These are unit tests on the validators themselves, with no HTTP in the way: given a
 * payload, does the check name the field that is wrong? That question is separate from
 * "does the provider turn a bad payload into a sentence a player can read", which
 * `provider.test.ts` asks.
 *
 * The rule every case here follows is CONSTITUTION.md section 1.3: an external payload is
 * untrusted, and refusing it must name the offending field. "Invalid payload" is not an
 * answer a developer can act on; "award 2 has no stackId" is.
 */

import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_SCHEMA_MAX,
  SNAPSHOT_SCHEMA_MIN,
  SNAPSHOT_SCHEMA_VERSION,
  battleXpProblem,
  constructionResultProblem,
  improveRelationRequestProblem,
  improveRelationResultProblem,
  marchCommitProblem,
  marchPlanProblem,
  nearbyForceListProblem,
  recruitRequestProblem,
  recruitResultProblem,
  schemaVersionProblem,
  skipToArrivalProblem,
  snapshotProblem,
  stepDaysRequestProblem,
  stepDaysResultProblem,
  tavernCompanionListProblem,
  smithingStaminaReplyProblem,
  talkResultProblem,
  taxResultProblem,
  timeScaleProblem,
  tradeRequestProblem,
  tradeResultProblem,
  upgradeRequestProblem,
  upgradeResultProblem,
  whyChainProblem,
} from "./wire.js";

function base(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    day: 1,
    year: 2005,
    eraTier: 4,
    player: {
      partyId: "p1",
      characterName: "Surveyor",
      factionId: "f1",
      resources: { money: 100, gold: 10, food: 40, metal: 5, medicine: 2 },
      influence: 3,
      renown: 1,
    },
    party: { id: "p1", name: "Caravan", troops: [], morale: 0.9 },
    ledger: { day: 1, income: [], expenses: [], netPerDay: { money: 1 } },
    towns: [],
    markets: {},
    sides: [],
    rulers: [],
    warnings: [],
    notifications: [],
    causeLog: {},
    ...extra,
  };
}

describe("the snapshot's own checks name the field that is wrong", () => {
  it("accepts a complete snapshot", () => {
    expect(snapshotProblem(base())).toBeNull();
  });

  const CASES: [string, unknown][] = [
    ["a missing schema version", { ...base(), schemaVersion: undefined }],
    ["a schema version that is not a number", { ...base(), schemaVersion: "1" }],
    ["a party with no id", { ...base(), party: { name: "x", troops: [], morale: 0.5 } }],
    ["a party with no name", { ...base(), party: { id: "p", troops: [], morale: 0.5 } }],
    [
      "a troop with no tier",
      { ...base(), party: { id: "p", name: "x", morale: 0.5, troops: [{ id: "t", name: "Militia", count: 4, quality: 2, xp: 0, wage: 0.5, morale: 0.8 }] } },
    ],
    ["a player with no influence", { ...base(), player: { ...(base().player as object), influence: undefined } }],
    ["markets that are not a table", { ...base(), markets: [] }],
    ["a market with no goods", { ...base(), markets: { "town-golden": { townId: "town-golden" } } }],
    ["a market good with no price", { ...base(), markets: { "town-golden": { townId: "t", goods: [{ goodId: "grain", name: "Grain" }] } } }],
  ];

  for (const [what, payload] of CASES) {
    it(`names the field for ${what}`, () => {
      expect(snapshotProblem(payload), "an unchecked payload is worse than a refused one").not.toBeNull();
    });
  }

  it("says which town is broken, not merely that the list is", () => {
    const broken = base({
      towns: [
        { id: "t1", settlementId: "s1", name: "Golden", klass: "town", unrest: 0.2, loyalty: 0.7, security: 0.6, taxRate: 0.1, stateTaxRate: 0.05, updatedTick: 3, buildings: [] },
        { id: "t2", settlementId: "s2", name: "Aurora", klass: "town", unrest: 0.2, loyalty: 0.7, security: 0.6, taxRate: 0.1, stateTaxRate: 0.05, updatedTick: 3, buildings: [{ id: "walls", name: "Walls", level: 1 }] },
      ],
    });
    // A building with no maxLevel or nextCost would render as `undefined` on the project
    // card, which reads as a tier the town does not have.
    expect(snapshotProblem(broken)).toMatch(/building 0/);
  });

  it("names a cause row by id", () => {
    const broken = base({ causeLog: { "c-1": { id: "c-1", tick: 1 } } });
    expect(snapshotProblem(broken)).toMatch(/cause row c-1/);
  });
});

describe("a schema version outside the supported range is a skew, not a bad field", () => {
  it("reports a world that is too new", () => {
    expect(schemaVersionProblem(base({ schemaVersion: SNAPSHOT_SCHEMA_MAX + 1 }))).toBe("too new");
  });

  it("reports a world that is too old", () => {
    expect(schemaVersionProblem(base({ schemaVersion: SNAPSHOT_SCHEMA_MIN - 1 }))).toBe("too old");
  });

  it("accepts every version in the supported range", () => {
    for (let v = SNAPSHOT_SCHEMA_MIN; v <= SNAPSHOT_SCHEMA_MAX; v += 1) {
      expect(schemaVersionProblem(base({ schemaVersion: v })), `version ${v}`).toBeNull();
    }
  });

  it("leaves a payload with no readable version to the field checks", () => {
    // Not a skew: a missing version is a malformed payload, and reporting it as a skew
    // would tell the player to update the game for a server bug.
    expect(schemaVersionProblem(base({ schemaVersion: undefined }))).toBeNull();
    expect(snapshotProblem(base({ schemaVersion: undefined }))).toMatch(/schemaVersion/);
  });
});

describe("a trade is checked on the way out and on the way back", () => {
  const request = { partyId: "p1", townId: "t1", goodId: "grain" as const, side: "buy" as const, quantity: 10, expectedDay: 4 };

  it("accepts a well-formed order", () => {
    expect(tradeRequestProblem(request)).toBeNull();
  });

  it("refuses an order with no town, rather than sending it and being refused", () => {
    expect(tradeRequestProblem({ ...request, townId: "" })).toMatch(/townId/);
  });

  it("refuses an order for no grain at all", () => {
    expect(tradeRequestProblem({ ...request, quantity: 0 })).toMatch(/quantity/);
  });

  it("refuses a side that is neither buy nor sell", () => {
    expect(tradeRequestProblem({ ...request, side: "borrow" as never })).toMatch(/side/);
  });

  const accepted = {
    accepted: true,
    side: "buy",
    unitPrice: 12.5,
    quantity: 10,
    total: 125,
    partyQuantity: 10,
    marketPriceAfter: 13,
    causedBy: "c-1",
  };

  it("accepts a priced trade", () => {
    expect(tradeResultProblem(accepted)).toBeNull();
  });

  it("refuses a reply with no post-trade price, which the market panel prints", () => {
    const { marketPriceAfter: _dropped, ...withoutPrice } = accepted;
    expect(tradeResultProblem(withoutPrice)).toMatch(/marketPriceAfter/);
  });

  it("refuses a refusal with no reason, because the panel would have nothing to print", () => {
    expect(tradeResultProblem({ ...accepted, accepted: false })).toMatch(/reason/);
  });

  it("accepts a refusal that explains itself", () => {
    expect(tradeResultProblem({ ...accepted, accepted: false, reason: "Only 4 grain in store." })).toBeNull();
  });
});

/**
 * `causedBy` is set only for an order the simulation carried out.
 *
 * `TradeResult.CausedBy`, `RecruitResult.CausedBy`, `ImproveRelationResult.CausedBy` and
 * `UpgradeTroopsResult.CausedBy` all carry no `omitempty`, and every one of them is
 * assigned inside an `if accepted` in the campaign layer. So a refusal sends the key
 * present and empty, and a refusal is the one reply of the four that carries the sentence
 * the player needs.
 *
 * These all failed once. Validated with the non-empty-string check used everywhere else in
 * this file, the empty `causedBy` made each refusal unreadable, and the player's screen
 * said the simulation had sent an answer this client cannot read — discarding the reason
 * and reporting a transport problem where the simulation had answered perfectly well.
 * That is the failure `apiContract.test.ts` exists to prevent, arriving through a field
 * rather than a route: nothing 404s, every test that uses the fixture passes, and the
 * game still cannot show a single refusal.
 *
 * No test caught it because the fixture never sends the empty string the server sends. A
 * refused trade comes back from `fixtureProvider` tagged `"trade-rejected"`, a refused
 * hire `"recruit-rejected"`, a refused promotion `"upgrade-rejected"` — the fixture
 * invents a marker row, so `causedBy` is always populated and the check always passed.
 * The refusals below are written the way the server writes them, which is the only way
 * the difference shows up.
 */
describe("a refused order carries an empty causedBy, which is an answer and not a fault", () => {
  it("accepts a refused trade", () => {
    expect(
      tradeResultProblem({
        accepted: false,
        side: "buy",
        unitPrice: 12.5,
        quantity: 10,
        total: 125,
        partyQuantity: 0,
        marketPriceAfter: 1,
        reason: "Golden has 480 to sell, not 5000.",
        causedBy: "",
      }),
    ).toBeNull();
  });

  it("accepts a refused hire", () => {
    expect(
      recruitResultProblem({
        accepted: false,
        unitName: "Militia",
        quantity: 5,
        totalCost: 500,
        newCount: 0,
        reason: "That unit cannot be raised here.",
        causedBy: "",
      }),
    ).toBeNull();
  });

  it("accepts a refused gift", () => {
    expect(
      improveRelationResultProblem({
        accepted: false,
        notableId: "ruler1",
        name: "Lady Wray",
        relationBefore: 10,
        relationAfter: 10,
        summary: "Nothing changed.",
        reason: "She will not accept that.",
        causedBy: "",
      }),
    ).toBeNull();
  });

  it("accepts a refused promotion", () => {
    expect(
      upgradeResultProblem({
        upgraded: false,
        stackId: "s1",
        fromTier: 1,
        toTier: 1,
        xpSpent: 0,
        goldSpent: 0,
        reason: "No experience to spend.",
        causedBy: "",
      }),
    ).toBeNull();
  });

  it("still refuses a reply with no causedBy key at all", () => {
    // The fix is `isText`, which allows an empty string but not a missing key. A reply
    // from something that is not the campaign server has no business answering for it.
    const { causedBy: _dropped, ...withoutRow } = {
      accepted: true,
      side: "buy",
      unitPrice: 12.5,
      quantity: 10,
      total: 125,
      partyQuantity: 10,
      marketPriceAfter: 13,
      causedBy: "c-1",
    };
    expect(tradeResultProblem(withoutRow)).toMatch(/causedBy/);
  });
});

describe("a hire is checked on the way out and on the way back", () => {
  const request = { partyId: "p1", townId: "t1", unitId: "militia", quantity: 5, expectedDay: 4 };

  it("accepts a well-formed order", () => {
    expect(recruitRequestProblem(request)).toBeNull();
  });

  it("refuses a fractional number of soldiers", () => {
    expect(recruitRequestProblem({ ...request, quantity: 2.5 })).toMatch(/whole number/);
  });

  const accepted = { accepted: true, unitName: "Militia", quantity: 5, totalCost: 75, newCount: 12, causedBy: "c-2" };

  it("accepts a completed hire", () => {
    expect(recruitResultProblem(accepted)).toBeNull();
  });

  it("refuses a reply with no count, which the party roster adds up", () => {
    const { newCount: _dropped, ...withoutCount } = accepted;
    expect(recruitResultProblem(withoutCount)).toMatch(/newCount/);
  });

  it("refuses a refusal with no reason", () => {
    expect(recruitResultProblem({ ...accepted, accepted: false })).toMatch(/reason/);
  });
});

describe("a conversation is checked, and an empty one is allowed", () => {
  const talk = {
    notableId: "n1",
    name: "Ilse Halloway",
    dialogue: ["You are either useful or you are leaving."],
    actions: [{ id: "gift", label: "Give coin", detail: "Spend money on goodwill.", available: true }],
  };

  it("accepts a real conversation", () => {
    expect(talkResultProblem(talk)).toBeNull();
  });

  it("accepts a notable with nothing to say", () => {
    // An empty dialogue array is a legitimate answer from someone who has nothing to
    // offer. It is the renderer that must print fallback copy, not the validator that
    // must refuse — refusing here would turn a valid answer into a failure.
    expect(talkResultProblem({ ...talk, dialogue: [] })).toBeNull();
  });

  it("refuses a dialogue that is not a list of lines", () => {
    expect(talkResultProblem({ ...talk, dialogue: "You are late." })).toMatch(/dialogue is not a list/);
    expect(talkResultProblem({ ...talk, dialogue: [42] })).toMatch(/dialogue line 0/);
  });

  it("refuses an action with no label, which would render as an unnamed button", () => {
    expect(talkResultProblem({ ...talk, actions: [{ id: "gift", detail: "x", available: true }] })).toMatch(/label/);
  });

  it("refuses an unavailable action with no reason, which would be a dead button", () => {
    expect(
      talkResultProblem({ ...talk, actions: [{ id: "gift", label: "Give coin", detail: "x", available: false }] }),
    ).toMatch(/reason/);
  });
});

describe("a gesture is checked on both sides", () => {
  it("refuses a gift with no amount, which would be a gesture worth nothing", () => {
    expect(improveRelationRequestProblem({ notableId: "n1", action: "gift" })).toMatch(/amount/);
  });

  it("accepts a favor, which costs nothing and needs no amount", () => {
    expect(improveRelationRequestProblem({ notableId: "n1", action: "favor" })).toBeNull();
  });

  const result = {
    accepted: true,
    notableId: "n1",
    name: "Ilse Halloway",
    relationBefore: 20,
    relationAfter: 25,
    summary: "She is a little warmer.",
    causedBy: "c-3",
  };

  it("accepts a relation move", () => {
    expect(improveRelationResultProblem(result)).toBeNull();
  });

  it("refuses a reply with no before-figure, so the delta cannot be shown", () => {
    const { relationBefore: _dropped, ...withoutBefore } = result;
    expect(improveRelationResultProblem(withoutBefore)).toMatch(/relationBefore/);
  });

  it("refuses a reply with no after-figure", () => {
    const { relationAfter: _dropped, ...withoutAfter } = result;
    expect(improveRelationResultProblem(withoutAfter)).toMatch(/relationAfter/);
  });
});

describe("a speed change is answered, not assumed", () => {
  it("accepts an acceptance that names the speed now running", () => {
    expect(timeScaleProblem({ accepted: true, daysPerRealSecond: 3 })).toBeNull();
  });

  it("refuses an acceptance with no speed, which leaves the dial guessing", () => {
    expect(timeScaleProblem({ accepted: true })).toMatch(/daysPerRealSecond/);
  });

  it("refuses a refusal with no reason", () => {
    expect(timeScaleProblem({ accepted: false })).toMatch(/reason/);
  });

  it("refuses a reply that is not an acceptance at all", () => {
    expect(timeScaleProblem({ daysPerRealSecond: 3 })).toMatch(/accepted/);
  });
});

describe("skipping to arrival is counted in whole days", () => {
  it("accepts a whole number of days", () => {
    expect(skipToArrivalProblem({ daysAdvanced: 3 })).toBeNull();
    expect(skipToArrivalProblem({ daysAdvanced: 0 })).toBeNull();
  });

  it("refuses a count that is not a number at all", () => {
    expect(skipToArrivalProblem({ daysAdvanced: "three" })).toMatch(/not a number/);
    expect(skipToArrivalProblem({ daysAdvanced: null })).toMatch(/not a number/);
    expect(skipToArrivalProblem({ daysAdvanced: Number.NaN })).toMatch(/not a number/);
  });

  it("refuses a fractional or negative count", () => {
    expect(skipToArrivalProblem({ daysAdvanced: 1.5 })).toMatch(/whole number/);
    expect(skipToArrivalProblem({ daysAdvanced: -1 })).toMatch(/negative/);
  });
});

describe("battle XP comes back as one award per stack", () => {
  it("accepts an awards list", () => {
    expect(battleXpProblem([{ stackId: "t-militia", xp: 40 }, { stackId: "t-veteran", xp: 12 }])).toBeNull();
  });

  it("accepts an empty list, which is what a battle nobody learned from looks like", () => {
    expect(battleXpProblem([])).toBeNull();
  });

  it("refuses a reply that is not a list, rather than iterating an object", () => {
    expect(battleXpProblem({ awards: [] })).toMatch(/not a list/);
  });

  it("says which award is broken", () => {
    expect(battleXpProblem([{ stackId: "a", xp: 1 }, { xp: 2 }])).toMatch(/award 1 has no stackId/);
  });
});

describe("a promotion carries the tiers it produced", () => {
  const upgraded = { upgraded: true, stackId: "t-militia", fromTier: 2, toTier: 3, xpSpent: 250, goldSpent: 40, causedBy: "c-4" };

  it("accepts a promotion", () => {
    expect(upgradeResultProblem(upgraded)).toBeNull();
    expect(upgradeRequestProblem({ stackId: "t-militia" })).toBeNull();
  });

  it("refuses a promotion with no new tier, which would leave the roster showing the old one", () => {
    const { toTier: _dropped, ...withoutTo } = upgraded;
    expect(upgradeResultProblem(withoutTo)).toMatch(/toTier/);
  });

  it("refuses a promotion that does not raise a tier", () => {
    expect(upgradeResultProblem({ ...upgraded, fromTier: 3, toTier: 3 })).toMatch(/does not raise a tier/);
  });

  it("refuses a refusal with no reason", () => {
    expect(upgradeResultProblem({ ...upgraded, upgraded: false, reason: undefined })).toMatch(/reason/);
  });

  it("refuses an order with no stack", () => {
    expect(upgradeRequestProblem({ stackId: "" })).toMatch(/stackId/);
  });
});

describe("a tax order answers with the rate in force", () => {
  it("accepts a clamped rate", () => {
    expect(taxResultProblem({ rate: 0.12 })).toBeNull();
  });

  it("refuses a reply with no rate, which the stepper would print as undefined", () => {
    expect(taxResultProblem({})).toMatch(/rate/);
  });

  it("refuses a rate that is not a number", () => {
    expect(taxResultProblem({ rate: "12%" })).toMatch(/rate/);
  });
});

describe("a queued project carries the tick it finishes on", () => {
  it("accepts an acceptance with a completion tick", () => {
    expect(
      constructionResultProblem({ ok: true, message: "Walls tier 2 started.", buildingId: "walls", buildingName: "City Walls", completionTick: 412, daysLeft: 10 }),
    ).toBeNull();
  });

  it("refuses an acceptance with no completion tick, so the card would count down to nothing", () => {
    expect(constructionResultProblem({ ok: true, message: "Walls tier 2 started." })).toMatch(/completionTick/);
  });

  it("refuses an acceptance with no days remaining", () => {
    expect(
      constructionResultProblem({ ok: true, message: "x", buildingId: "walls", buildingName: "City Walls", completionTick: 412 }),
    ).toMatch(/daysLeft/);
  });

  it("accepts a refusal with only a message, because there is nothing to count down", () => {
    expect(constructionResultProblem({ ok: false, message: "Aurora is already building Watch." })).toBeNull();
  });
});

describe("a march plan is checked as something the map can draw", () => {
  const plan = {
    partyId: "p1",
    destinationSettlementId: "longmont",
    destinationName: "Longmont",
    route: [{ x: 0, z: 0 }, { x: 500, z: 250 }],
    distanceKm: 58,
    days: 2,
    arrivalDay: 6,
    cost: { food: 12, money: 40, metal: 1 },
    daysOfFoodOnArrival: 4.2,
    roadDanger: 0.3,
    warnings: [],
    unmapped: false,
  };

  it("accepts a priced route", () => {
    expect(marchPlanProblem(plan)).toBeNull();
  });

  it("refuses a route that is not points, which would draw a line to nowhere", () => {
    expect(marchPlanProblem({ ...plan, route: [0, 1, 2] })).toMatch(/route point 0/);
    expect(marchPlanProblem({ ...plan, route: [{ x: 1 }] })).toMatch(/route point 0 has no z/);
  });

  it("refuses a mapped march with fewer than two points, which draws no line", () => {
    expect(marchPlanProblem({ ...plan, route: [{ x: 1, z: 2 }] })).toMatch(/fewer than two points/);
  });

  it("allows an unmapped march to have no route, because there is nothing to draw", () => {
    expect(marchPlanProblem({ ...plan, route: [], unmapped: true, warnings: ["No surveyed road."] })).toBeNull();
  });

  it("refuses a plan with no supply cost", () => {
    expect(marchPlanProblem({ ...plan, cost: { food: 1, money: 1 } })).toMatch(/cost.metal/);
  });

  it("refuses a plan with no arrival day, which the bill prints", () => {
    const { arrivalDay: _dropped, ...withoutArrival } = plan;
    expect(marchPlanProblem(withoutArrival)).toMatch(/arrivalDay/);
  });

  it("accepts null days-of-food, which is how the plan says it will not arrive fed", () => {
    expect(marchPlanProblem({ ...plan, daysOfFoodOnArrival: null })).toBeNull();
  });

  it("refuses a commitment with no march id", () => {
    expect(marchCommitProblem({ destinationName: "Longmont", arrivalDay: 6, days: 2 })).toMatch(/marchId/);
  });

  it("accepts a commitment that names the march", () => {
    expect(marchCommitProblem({ marchId: "march-9", destinationName: "Longmont", arrivalDay: 6, days: 2 })).toBeNull();
  });
});

describe("a cause chain is checked before the Why panel walks it", () => {
  const row = {
    id: "c-1",
    tick: 4,
    day: 1,
    entityId: "town-golden",
    entityName: "Golden",
    field: "unrest",
    old: 0.1,
    new: 0.4,
    system: "unrest",
    causedBy: [],
    summary: "A tax was cut.",
  };

  it("accepts a chain whose rows carry the fields the walk reads", () => {
    expect(whyChainProblem({ entityId: "town-golden", field: "unrest", rows: [row], related: [] })).toBeNull();
  });

  it("refuses a chain with no rows list, rather than rendering an empty Why panel", () => {
    expect(whyChainProblem({ entityId: "x", field: "y" })).toMatch(/rows is not a list/);
  });

  it("refuses a row with no summary, which would draw as a blank line", () => {
    expect(whyChainProblem({ entityId: "x", field: "y", rows: [{ ...row, summary: "" }], related: [] })).toMatch(/summary/);
  });

  it("refuses a broken related row too, which the panel prints under its own heading", () => {
    expect(whyChainProblem({ entityId: "x", field: "y", rows: [row], related: [{ ...row, system: 7 }] })).toMatch(/related row 0/);
  });
});
describe("a force in encounter range is checked before the panel is raised from it", () => {
  // Exactly what GET /v1/parties/nearby sends: the server tracks a party it is
  // not simulating as a count and a morale, so it sends no composition, and
  // `troops` is genuinely absent rather than filled in with a stand-in.
  const serverRow = {
    id: "7",
    name: "Yorver's company",
    troopCount: 84,
    hostile: true,
    distanceKm: 3.5,
    position: { x: 12.5, z: -4.25 },
  };

  it("accepts a row carrying the fields the encounter flow reads", () => {
    expect(nearbyForceListProblem([serverRow])).toBeNull();
  });

  it("accepts the fixture's richer rows, which carry a composition and an id that is not a number", () => {
    expect(
      nearbyForceListProblem([
        {
          ...serverRow,
          id: "bandit-1",
          kind: "bandit",
          factionId: "side-2",
          troops: [{ name: "Bandit", count: 40, tier: 2 }],
          destination: null,
          speedKmPerDay: 0,
        },
      ]),
    ).toBeNull();
  });

  it("refuses a reply that is not a list, rather than iterating its fields", () => {
    expect(nearbyForceListProblem({ forces: [serverRow] })).toMatch(/not a list of forces/);
  });

  it("names the force and the field when the row cannot be read", () => {
    expect(nearbyForceListProblem([{ ...serverRow, id: undefined }])).toMatch(/force 0 has no id/);
  });

  // An empty id is a missing one wearing a disguise: it would go into the
  // encounter request as a party the server cannot find.
  it("refuses an empty id, which is how a missing id usually arrives", () => {
    expect(nearbyForceListProblem([{ ...serverRow, id: "" }])).toMatch(/has no id/);
  });

  it("refuses a headcount that is not a number, which would print as NaN fighters", () => {
    expect(nearbyForceListProblem([{ ...serverRow, troopCount: null }])).toMatch(/has no troopCount/);
  });

  // The flee path subtracts this position from the player's own, so a missing
  // axis is a NaN direction arriving at the server rather than an error.
  it("refuses a position with no x or no z, which is where the flee vector comes from", () => {
    expect(nearbyForceListProblem([{ ...serverRow, position: { x: 1 } }])).toMatch(/position has no z/);
    expect(nearbyForceListProblem([{ ...serverRow, position: { z: 1 } }])).toMatch(/position has no x/);
  });

  it("refuses a hostile flag that is not a boolean, so a force is not read as neutral by accident", () => {
    expect(nearbyForceListProblem([{ ...serverRow, hostile: "yes" }])).toMatch(/has no hostile/);
  });

  it("allows a distance to be absent, because nothing in the encounter flow reads it", () => {
    const { distanceKm: _omitted, ...withoutDistance } = serverRow;
    expect(nearbyForceListProblem([withoutDistance])).toBeNull();
  });

  it("refuses a distance that is present and not a number", () => {
    expect(nearbyForceListProblem([{ ...serverRow, distanceKm: "3.5" }])).toMatch(/distanceKm/);
  });
});

describe("a tavern roster is checked before the panel seats anyone", () => {
  // The shape the Go server sends for `GET /v1/towns/{id}/tavern/companions`
  // (campaign.CompanionView). Every field the tavern section reads is present.
  const serverRow = {
    id: "chen_wei",
    name: "Chen Wei",
    backstory: "ER trauma surgeon. Now stitches people in a panel van for cash.",
    traits: ["loyal", "cautious"],
    skills: { medic: 90, quartermaster: 35, fighter: 20 },
    wageDaily: 22,
    recruitKind: "gold",
    recruitValue: 700,
    hired: false,
    xp: 0,
    available: true,
  };

  it("accepts a row carrying the fields the tavern section reads", () => {
    expect(tavernCompanionListProblem([serverRow])).toBeNull();
  });

  it("refuses a row with no wage, because the hire button prices the daily bill from it", () => {
    const { wageDaily: _omitted, ...withoutWage } = serverRow;
    expect(tavernCompanionListProblem([withoutWage])).toMatch(/has no wageDaily/);
  });

  it("refuses a recruit kind the hire flow does not implement", () => {
    expect(tavernCompanionListProblem([{ ...serverRow, recruitKind: "fame" }])).toMatch(/has no recruitKind/);
  });

  it("refuses a skills map that is not a map of numbers", () => {
    expect(tavernCompanionListProblem([{ ...serverRow, skills: { medic: "ninety" } }])).toMatch(/has no skills/);
  });

  it("refuses a reply that is not a list", () => {
    expect(tavernCompanionListProblem({ companions: [] })).toMatch(/not a list/);
  });
});

describe("the smithing stamina reply is checked before the bench trusts it", () => {
  // The shape `GET /v1/smithing/stamina` returns. The bench prints the pair
  // directly, so a missing or garbage field would read as `undefined/undefined`.
  it("accepts the shape the smithy section prints", () => {
    expect(smithingStaminaReplyProblem({ stamina: 84, max: 100 })).toBeNull();
  });

  it("refuses a reply with no max, because the bench prints the pair", () => {
    expect(smithingStaminaReplyProblem({ stamina: 84 })).toMatch(/has no max/);
  });

  it("refuses a max that is not a positive number", () => {
    expect(smithingStaminaReplyProblem({ stamina: 84, max: 0 })).toMatch(/has no max/);
    expect(smithingStaminaReplyProblem({ stamina: 84, max: "full" })).toMatch(/has no max/);
  });

  it("refuses a negative stamina, which no honest bench reports", () => {
    expect(smithingStaminaReplyProblem({ stamina: -1, max: 100 })).toMatch(/has no stamina/);
  });

  it("refuses a reply that is not an object", () => {
    expect(smithingStaminaReplyProblem([84, 100])).toMatch(/not a JSON object/);
  });
});

describe("a wait order is checked before the world gives up a day", () => {
  // Task 132. Waiting is the one order that gives the simulation permission to
  // run every daily system at once, so the count is checked like a payment.
  it("accepts whole days inside the month cap", () => {
    expect(stepDaysRequestProblem({ days: 1 })).toBeNull();
    expect(stepDaysRequestProblem({ days: 7 })).toBeNull();
    expect(stepDaysRequestProblem({ days: 30 })).toBeNull();
  });

  it("refuses zero, negative, fractional and missing counts", () => {
    expect(stepDaysRequestProblem({ days: 0 })).toMatch(/whole number/);
    expect(stepDaysRequestProblem({ days: -3 })).toMatch(/whole number/);
    expect(stepDaysRequestProblem({ days: 1.5 })).toMatch(/whole number/);
    expect(stepDaysRequestProblem({ days: Number.NaN })).toMatch(/whole number/);
  });

  it("refuses a month or more, because travel is how distance is crossed", () => {
    expect(stepDaysRequestProblem({ days: 31 })).toMatch(/march instead/);
  });

  it("accepts the reply shape and refuses one without its day", () => {
    expect(stepDaysResultProblem({ ok: true, day: 7 })).toBeNull();
    expect(stepDaysResultProblem({ ok: true })).toMatch(/no day/);
    expect(stepDaysResultProblem({ ok: true, day: "later" })).toMatch(/no day/);
    expect(stepDaysResultProblem("day 7")).toMatch(/not a JSON object/);
  });
});
