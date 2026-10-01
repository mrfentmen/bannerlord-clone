/**
 * Quest journal tests (MASTER_PLAN task 114).
 *
 * Accept: 100+ quests filterable — the seed size is asserted, and every
 * filter dimension is exercised against the real seed, not a toy list.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  QuestJournal,
  SEED_QUEST_COUNT,
  filterQuests,
  seedQuests,
} from "../index.js";

describe("seedQuests", () => {
  it("produces 100+ quests", () => {
    expect(SEED_QUEST_COUNT).toBeGreaterThanOrEqual(100);
    expect(seedQuests()).toHaveLength(SEED_QUEST_COUNT);
  });

  it("is deterministic", () => {
    const a = seedQuests();
    const b = seedQuests();
    expect(a).toEqual(b);
  });

  it("has unique ids and covers every status and category", () => {
    const quests = seedQuests();
    const ids = new Set(quests.map((q) => q.id));
    expect(ids.size).toBe(quests.length);
    expect(new Set(quests.map((q) => q.status))).toEqual(new Set(["active", "completed", "failed"]));
    expect(new Set(quests.map((q) => q.category))).toEqual(
      new Set(["war", "trade", "bounty", "escort", "intrigue", "exploration", "aid"]),
    );
  });

  it("keeps objectives consistent with status", () => {
    for (const q of seedQuests()) {
      if (q.status === "completed") {
        expect(q.objectives.every((o) => o.done)).toBe(true);
      }
    }
  });
});

describe("filterQuests", () => {
  const quests = seedQuests();

  it("filters by status", () => {
    const active = filterQuests(quests, { ...EMPTY_FILTERS, status: "active" });
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((q) => q.status === "active")).toBe(true);
    const completed = filterQuests(quests, { ...EMPTY_FILTERS, status: "completed" });
    expect(completed.every((q) => q.status === "completed")).toBe(true);
    const failed = filterQuests(quests, { ...EMPTY_FILTERS, status: "failed" });
    expect(failed.every((q) => q.status === "failed")).toBe(true);
    expect(active.length + completed.length + failed.length).toBe(quests.length);
  });

  it("filters by category", () => {
    const war = filterQuests(quests, { ...EMPTY_FILTERS, category: "war" });
    expect(war.length).toBeGreaterThan(0);
    expect(war.every((q) => q.category === "war")).toBe(true);
  });

  it("searches title, giver, settlement and summary", () => {
    const byTitle = filterQuests(quests, { ...EMPTY_FILTERS, query: "raiders" });
    expect(byTitle.length).toBeGreaterThan(0);
    const byGiver = filterQuests(quests, { ...EMPTY_FILTERS, query: "marisol vega" });
    expect(byGiver.length).toBeGreaterThan(0);
    expect(
      byGiver.every((q) =>
        `${q.title} ${q.giver} ${q.settlement} ${q.summary}`.toLowerCase().includes("marisol vega"),
      ),
    ).toBe(true);
    const byPlace = filterQuests(quests, { ...EMPTY_FILTERS, query: "little havana" });
    expect(byPlace.length).toBeGreaterThan(0);
    const none = filterQuests(quests, { ...EMPTY_FILTERS, query: "zzz-no-such-quest" });
    expect(none).toHaveLength(0);
  });

  it("combines all three filters", () => {
    const both = filterQuests(quests, { status: "active", category: "bounty", query: "" });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((q) => q.status === "active" && q.category === "bounty")).toBe(true);
  });

  it("returns newest first", () => {
    const all = filterQuests(quests, EMPTY_FILTERS);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.startedDay).toBeGreaterThanOrEqual(all[i]!.startedDay);
    }
  });
});

describe("QuestJournal", () => {
  it("counts by status and lists through filters", () => {
    const journal = new QuestJournal(seedQuests());
    const counts = journal.countByStatus();
    expect(counts.active + counts.completed + counts.failed).toBe(SEED_QUEST_COUNT);
    expect(journal.list({ ...EMPTY_FILTERS, status: "completed" })).toHaveLength(counts.completed);
  });

  it("adds, transitions status, and toggles objectives", () => {
    const journal = new QuestJournal(seedQuests());
    const first = journal.all()[0]!;
    expect(journal.setStatus(first.id, "failed")).toBe(true);
    expect(journal.get(first.id)?.status).toBe("failed");
    const obj = first.objectives[0]!;
    expect(journal.setObjectiveDone(first.id, obj.id, true)).toBe(true);
    expect(journal.get(first.id)?.objectives[0]?.done).toBe(true);
    expect(journal.setStatus("nope", "completed")).toBe(false);
    expect(journal.setObjectiveDone("nope", "nope", true)).toBe(false);
  });

  it("rejects duplicate ids", () => {
    const journal = new QuestJournal(seedQuests());
    expect(() => journal.add(journal.all()[0]!)).toThrow(/duplicate quest id/);
  });

  it("returns clones, not live references", () => {
    const journal = new QuestJournal(seedQuests());
    const q = journal.get(journal.all()[0]!.id)!;
    q.title = "mutated";
    expect(journal.get(q.id)?.title).not.toBe("mutated");
  });
});
