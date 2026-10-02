/** Tasks 126/128: guided start goals and tutorial progress survive reload. */

import { describe, expect, it } from "vitest";
import { createGuidedStart, START_GOALS } from "../guidedStart.js";
import { createTutorialProgress } from "../progress.js";
import { createTutorial } from "../tutorial.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("guided start (task 126)", () => {
  it("has 5 goals to check off", () => {
    expect(START_GOALS).toHaveLength(5);
    const gs = createGuidedStart(memStorage());
    expect(gs.goals).toHaveLength(5);
    expect(gs.doneCount()).toBe(0);
    gs.complete("move-party");
    gs.complete("move-party"); // idempotent
    expect(gs.doneCount()).toBe(1);
    expect(gs.isComplete()).toBe(false);
  });

  it("persists across instances", () => {
    const storage = memStorage();
    createGuidedStart(storage).complete("recruit");
    const again = createGuidedStart(storage);
    expect(again.doneCount()).toBe(1);
    expect(again.goals.find((g) => g.id === "recruit")!.done).toBe(true);
  });
});

describe("tutorial skip (task 121)", () => {
  it("skip works at any step", () => {
    const t = createTutorial([
      { id: "a", context: "map", text: "A" },
      { id: "b", context: "map", text: "B" },
    ]);
    expect(t.hintsFor("map", 5)).toHaveLength(2);
    t.dismiss("a");
    expect(t.hintsFor("map", 5)).toHaveLength(1);
    t.skip();
    expect(t.skipped()).toBe(true);
    expect(t.hintsFor("map", 5)).toHaveLength(0);
  });
});

describe("tutorial progress (task 128)", () => {
  it("survives reload", () => {
    const storage = memStorage();
    const p1 = createTutorialProgress(storage);
    p1.markFinished("step-1");
    p1.markFinished("step-1"); // no duplicates
    const p2 = createTutorialProgress(storage);
    expect(p2.isFinished("step-1")).toBe(true);
    expect(p2.finished).toEqual(["step-1"]);
  });

  it("recovers from corrupt storage", () => {
    const storage = memStorage();
    storage.setItem("campaign.tutorialProgress.v1", "not json{");
    expect(createTutorialProgress(storage).finished).toEqual([]);
  });
});
