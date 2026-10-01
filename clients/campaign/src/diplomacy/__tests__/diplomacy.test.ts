/**
 * @vitest-environment jsdom
 *
 * Diplomacy tests (MASTER_PLAN 3E, tasks 109-115).
 */

import { describe, expect, it } from "vitest";
import {
  allianceAcceptOdds,
  createEnvoyCorps,
  createReputationLedger,
  holdSummit,
  negotiateRound,
  proposeVassalage,
  reportHostileAct,
  sendGift,
  signPact,
  tickPact,
  voteAgendaItem,
} from "../index.js";

describe("envoys (task 109)", () => {
  it("tracks missions and risks capture on dangerous routes", () => {
    const corps = createEnvoyCorps();
    const e = corps.send("Marisol", "Sue for peace", "rust", 2);
    expect(corps.envoys()).toHaveLength(1);
    // Safe route: envoy returns after eta.
    let r = corps.tick({ rust: 0 }, { [e.id]: 80 }, () => 0.99);
    expect(r.returned).toHaveLength(0);
    r = corps.tick({ rust: 0 }, { [e.id]: 80 }, () => 0.99);
    expect(r.returned.map((x) => x.id)).toEqual([e.id]);

    // Dangerous route: capture.
    const e2 = corps.send("Tomas", "Spy out defenses", "rust", 3);
    r = corps.tick({ rust: 1 }, { [e2.id]: 0 }, () => 0.0);
    expect(r.captured.map((x) => x.id)).toEqual([e2.id]);
  });
});

describe("alliance negotiation (task 110)", () => {
  it("runs multi-round offers with counter-offers", () => {
    const offer = { from: "Harbor", to: "Iron", terms: ["mutual defense"], demand: 80 };
    const round1 = negotiateRound(offer, 1, 40, 60, 15);
    expect(round1.counter.demand).toBe(65); // moves toward the middle
    expect(round1.counter.from).toBe("Iron");
    expect(round1.acceptOdds).toBeGreaterThan(0);
    expect(round1.acceptOdds).toBeLessThan(1);
    // Better relations and reputation improve the odds shown beforehand.
    expect(allianceAcceptOdds(80, 20, 90)).toBeGreaterThan(allianceAcceptOdds(0, 80, 20));
  });
});

describe("non-aggression pacts (task 111)", () => {
  it("tracks terms, expiry, and violations", () => {
    let pact = signPact(["Harbor", "Rust"], 6, ["no raids across the river"]);
    expect(pact.terms).toHaveLength(1);
    pact = tickPact(pact);
    expect(pact.seasonsLeft).toBe(5);
    const violated = reportHostileAct(pact, "Rust", "Harbor");
    expect(violated.violated).toBe(true);
    const unrelated = reportHostileAct(pact, "Rust", "Iron");
    expect(unrelated.violated).toBe(false);
  });
});

describe("vassalage (task 112)", () => {
  it("shows acceptance odds before the offer", () => {
    const kind = proposeVassalage("Harbor", "Gravel", 100, 20, 70);
    const harsh = proposeVassalage("Harbor", "Gravel", 1500, 200, 10);
    expect(kind.acceptOdds).toBeGreaterThan(harsh.acceptOdds);
    expect(kind.terms.overlord).toBe("Harbor");
  });
});

describe("gifts (task 113)", () => {
  it("gains scale with value and diminish with relation", () => {
    const small = sendGift(100, "Lord A", 10000, 20);
    const large = sendGift(5000, "Lord A", 10000, 20);
    expect(large.relationGain).toBeGreaterThan(small.relationGain);
    const loved = sendGift(5000, "Lord A", 10000, 99);
    expect(loved.relationGain).toBeLessThan(large.relationGain);
    const poor = sendGift(100, "Lord B", 500, 20);
    expect(poor.relationGain).toBeGreaterThan(small.relationGain);
  });
});

describe("reputation (task 114)", () => {
  it("broken deals haunt future negotiations", () => {
    const ledger = createReputationLedger();
    expect(ledger.honor()).toBe(50);
    ledger.recordKept("treaty of the docks");
    ledger.recordBroken("the mill pact");
    // One broken deal outweighs one kept deal.
    expect(ledger.honor()).toBeLessThan(50);
    expect(ledger.history()).toHaveLength(2);
  });
});

describe("summits (task 115)", () => {
  it("agenda items pass by majority", () => {
    const summit = holdSummit("Harbor", ["Harbor", "Iron", "Rust"], ["river tolls", "bandit truce"]);
    expect(summit.agenda).toHaveLength(2);
    const passed = voteAgendaItem(summit.attendees, "river tolls", { Harbor: true, Iron: true, Rust: false });
    expect(passed.passed).toBe(true);
    const failed = voteAgendaItem(summit.attendees, "bandit truce", { Harbor: true, Iron: false, Rust: false });
    expect(failed.passed).toBe(false);
    expect(() => holdSummit("Harbor", ["Harbor"], [])).toThrow();
  });
});
