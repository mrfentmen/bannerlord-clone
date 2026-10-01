/**
 * @vitest-environment jsdom
 *
 * Court & politics tests (MASTER_PLAN 3B, tasks 85-93).
 */

import { describe, expect, it } from "vitest";
import {
  buildTreaty,
  createCouncil,
  createEventsFeed,
  factionMatrix,
  holdWarCouncil,
  judgeTrial,
  PETITION_KINDS,
  planFeast,
  resolvePetition,
  sortMatrix,
  treatySummary,
  voteOnEdict,
} from "../index.js";

describe("events feed (task 85)", () => {
  it("events are clickable through to their UI", () => {
    const feed = createEventsFeed();
    const opened: string[] = [];
    feed.onOpen("petition", (e) => opened.push(e.id));
    const evt = feed.push({ kind: "petition", title: "Plea", text: "Help", stamp: "Spring" });
    expect(feed.unread()).toBe(1);
    feed.open(evt.id);
    expect(opened).toEqual([evt.id]);
    expect(feed.unread()).toBe(0);
  });
});

describe("feast (task 86)", () => {
  it("previews cost and relation deltas", () => {
    const feast = planFeast(
      [
        { id: "g1", name: "Lord A", relation: 40, rank: 1 },
        { id: "g2", name: "Lady B", relation: 90, rank: 1 },
      ],
      2,
    );
    expect(feast.preview.cost).toBeGreaterThan(0);
    expect(feast.preview.relationDeltas.g1).toBeGreaterThan(0);
    // Diminishing returns: the guest who already loves you gains less.
    expect(feast.preview.relationDeltas.g2).toBeLessThan(feast.preview.relationDeltas.g1!);
    expect(feast.preview.prestige).toBeGreaterThan(0);
  });
});

describe("edicts and council (tasks 87-88)", () => {
  it("each seat shows its modifier", () => {
    const council = createCouncil();
    const mods = council.modifiers();
    expect(mods).toHaveLength(4);
    for (const m of mods) {
      expect(m.effect.length).toBeGreaterThan(0);
      expect(m.holder).toBeNull();
    }
    council.appoint("marshal", { id: "c1", name: "Gen. Hale", influence: 70 });
    expect(council.modifiers().find((m) => m.seat === "marshal")!.holder).toBe("Gen. Hale");
  });

  it("a weighted majority passes the law", () => {
    const council = createCouncil();
    council.appoint("marshal", { id: "c1", name: "A", influence: 60 });
    council.appoint("steward", { id: "c2", name: "B", influence: 40 });
    const law = { id: "l1", name: "Grain tax", description: "Tax grain", effect: "+income", proposedBy: "c1" };
    const pass = voteOnEdict(law, council, { c1: 1, c2: 1 });
    expect(pass.passed).toBe(true);
    const fail = voteOnEdict(law, council, { c1: -1, c2: -1 });
    expect(fail.passed).toBe(false);
  });
});

describe("petitions (task 89)", () => {
  it("covers 10+ types with rep/gold trade-offs", () => {
    expect(PETITION_KINDS.length).toBeGreaterThanOrEqual(10);
    for (const kind of PETITION_KINDS) {
      const p = { id: "p", kind, petitioner: "Someone", text: "..." };
      const grant = resolvePetition(p, "grant");
      const deny = resolvePetition(p, "deny");
      expect(grant.text.length).toBeGreaterThan(0);
      expect(deny.text.length).toBeGreaterThan(0);
    }
    const p = { id: "p", kind: "grain-shortage" as const, petitioner: "Village", text: "..." };
    expect(resolvePetition(p, "grant").gold).toBeLessThan(0);
    expect(resolvePetition(p, "grant").rep).toBeGreaterThan(0);
  });
});

describe("trial (task 90)", () => {
  it("verdicts move town loyalty", () => {
    const trial = { id: "t", title: "Ox dispute", plaintiff: "p1", defendant: "d1", description: "..." };
    const forPlaintiff = judgeTrial(trial, 0.95, 0.2);
    expect(forPlaintiff.verdict).toBe("for-plaintiff");
    const compromise = judgeTrial(trial, 0.5, 0.5);
    expect(compromise.verdict).toBe("compromise");
    expect(compromise.loyalty).toBeGreaterThan(0);
    // Deterministic: same inputs, same verdict.
    expect(judgeTrial(trial, 0.95, 0.2).verdict).toBe("for-plaintiff");
  });
});

describe("relation matrix (task 91)", () => {
  it("renders 7 factions and sorts", () => {
    const matrix = factionMatrix();
    expect(matrix).toHaveLength(7);
    for (const row of matrix) {
      expect(Object.keys(row.vs)).toHaveLength(6);
    }
    const sorted = sortMatrix(matrix, "iron").filter((r) => r.factionId !== "iron");
    const scores = sorted.map((r) => r.vs.iron!);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]!).toBeGreaterThanOrEqual(scores[i]!);
    }
  });
});

describe("war council (task 92)", () => {
  it("a weighted majority carries the plan", () => {
    const plan = { id: "w", target: "Rust Horde", reason: "Raids" };
    const carried = holdWarCouncil(plan, [
      { vassalId: "v1", name: "A", inFavor: true, weight: 3 },
      { vassalId: "v2", name: "B", inFavor: true, weight: 2 },
      { vassalId: "v3", name: "C", inFavor: false, weight: 4 },
    ]);
    expect(carried.carried).toBe(true);
    expect(carried.forWeight).toBe(5);
    const blocked = holdWarCouncil(plan, [
      { vassalId: "v1", name: "A", inFavor: true, weight: 1 },
      { vassalId: "v3", name: "C", inFavor: false, weight: 4 },
    ]);
    expect(blocked.carried).toBe(false);
  });
});

describe("treaty builder (task 93)", () => {
  it("builds enforceable terms", () => {
    const terms = buildTreaty({
      parties: ["Harbor Compact", "Rust Horde"],
      reparations: 1500,
      borderConcessions: ["mill town"],
      durationSeasons: 8,
      prisonerExchange: true,
    });
    expect(terms.reparations).toBe(1500);
    const summary = treatySummary(terms);
    expect(summary).toContain("Harbor Compact");
    expect(summary).toContain("1500 coin reparations");
    expect(() => buildTreaty({ parties: ["A", "A"], reparations: 0, borderConcessions: [], durationSeasons: 4, prisonerExchange: false })).toThrow();
  });
});
