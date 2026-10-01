/**
 * @vitest-environment jsdom
 *
 * Quest tracker HUD (MASTER_PLAN task 115): up to 3 pinned active quests with
 * live objective counts and distances, persisted pins, and a collapsible HUD
 * card.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_PINNED,
  QuestTracker,
  buildTrackerViews,
  createQuestTrackerHud,
  formatDistance,
  localStoragePinStorage,
  type MapPoint,
  type PinnedQuestView,
  type TrackerPositionSource,
} from "../index.js";
import type { Quest } from "../../journal/index.js";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

function quest(id: string, overrides: Partial<Quest> = {}): Quest {
  return {
    id,
    title: `Quest ${id}`,
    summary: "summary",
    giver: "giver",
    settlement: "Testville",
    category: "war",
    status: "active",
    objectives: [
      { id: "o1", text: "one", done: true },
      { id: "o2", text: "two", done: false },
    ],
    reward: "$100",
    daysLeft: 5,
    startedDay: 1,
    ...overrides,
  };
}

function source(player: MapPoint | null, settlements: Record<string, MapPoint> = {}): TrackerPositionSource {
  return {
    player: () => player,
    settlement: (name) => settlements[name] ?? null,
  };
}

describe("pin storage", () => {
  it("round-trips pins through JSON", () => {
    const storage = fakeStorage();
    const pins = localStoragePinStorage(storage);
    pins.save(["a", "b"]);
    expect(localStoragePinStorage(storage).load()).toEqual(["a", "b"]);
  });

  it("caps persisted pins at the maximum and drops non-strings", () => {
    const storage = fakeStorage();
    localStoragePinStorage(storage).save(["a", "b", "c", "d"]);
    expect(localStoragePinStorage(storage).load()).toHaveLength(MAX_PINNED);
    const corrupt = fakeStorage({ "campaign.questTracker.pins.v1": JSON.stringify(["a", 42, null, "b"]) });
    expect(localStoragePinStorage(corrupt).load()).toEqual(["a", "b"]);
  });

  it("returns an empty list for corrupt or missing data", () => {
    expect(localStoragePinStorage(fakeStorage()).load()).toEqual([]);
    const corrupt = fakeStorage({ "campaign.questTracker.pins.v1": "not-json{{" });
    expect(localStoragePinStorage(corrupt).load()).toEqual([]);
  });
});

describe("QuestTracker", () => {
  it("pins up to 3 quests and refuses the 4th", () => {
    const tracker = new QuestTracker(localStoragePinStorage(fakeStorage()));
    expect(tracker.pin("a", "active")).toBe("pinned");
    expect(tracker.pin("b", "active")).toBe("pinned");
    expect(tracker.pin("c", "active")).toBe("pinned");
    expect(tracker.pin("d", "active")).toBe("full");
    expect(tracker.pinnedIds()).toEqual(["a", "b", "c"]);
    expect(tracker.isPinned("a")).toBe(true);
    expect(tracker.isPinned("d")).toBe(false);
  });

  it("keeps pin order for the HUD", () => {
    const tracker = new QuestTracker(localStoragePinStorage(fakeStorage()));
    tracker.pin("b", "active");
    tracker.pin("a", "active");
    expect(tracker.pinnedIds()).toEqual(["b", "a"]);
  });

  it("rejects duplicates, missing, and inactive quests", () => {
    const tracker = new QuestTracker(localStoragePinStorage(fakeStorage()));
    tracker.pin("a", "active");
    expect(tracker.pin("a", "active")).toBe("already");
    expect(tracker.pin("gone", undefined)).toBe("missing");
    expect(tracker.pin("done", "completed")).toBe("inactive");
    expect(tracker.pinnedIds()).toEqual(["a"]);
  });

  it("unpins and restores pins across instances", () => {
    const storage = fakeStorage();
    const first = new QuestTracker(localStoragePinStorage(storage));
    first.pin("a", "active");
    first.pin("b", "active");
    expect(first.unpin("a")).toBe(true);
    expect(first.unpin("a")).toBe(false);
    const second = new QuestTracker(localStoragePinStorage(storage));
    expect(second.pinnedIds()).toEqual(["b"]);
  });

  it("prunes pins for finished or removed quests", () => {
    const storage = fakeStorage();
    const tracker = new QuestTracker(localStoragePinStorage(storage));
    tracker.pin("a", "active");
    tracker.pin("b", "active");
    tracker.pin("c", "active");
    const dropped = tracker.prune([
      quest("a"),
      quest("b", { status: "completed" }),
      // "c" is gone entirely
    ]);
    expect(dropped).toEqual(["b", "c"]);
    expect(tracker.pinnedIds()).toEqual(["a"]);
    // Persisted too, so a reload does not resurrect them.
    expect(new QuestTracker(localStoragePinStorage(storage)).pinnedIds()).toEqual(["a"]);
  });
});

describe("buildTrackerViews", () => {
  const quests = [quest("a"), quest("b", { settlement: "Farburg", daysLeft: null }), quest("c", { status: "completed" })];

  it("builds views in pin order with objective counts and live distances", () => {
    const views = buildTrackerViews(
      quests,
      ["b", "a"],
      source({ x: 0, z: 0 }, { Testville: { x: 3000, z: 4000 }, Farburg: { x: 12000, z: 0 } }),
    );
    expect(views.map((v) => v.id)).toEqual(["b", "a"]);
    expect(views[0]).toMatchObject({
      title: "Quest b",
      settlement: "Farburg",
      objectivesDone: 1,
      objectivesTotal: 2,
      daysLeft: null,
      distanceKm: 12,
    });
    expect(views[1]?.distanceKm).toBeCloseTo(5, 5);
  });

  it("skips pins for missing or non-active quests", () => {
    const views = buildTrackerViews(quests, ["a", "c", "ghost"], source({ x: 0, z: 0 }));
    expect(views.map((v) => v.id)).toEqual(["a"]);
  });

  it("reports null distance when the player or the settlement is unknown", () => {
    const noPlayer = buildTrackerViews(quests, ["a"], source(null, { Testville: { x: 1, z: 1 } }));
    expect(noPlayer[0]?.distanceKm).toBeNull();
    const noTarget = buildTrackerViews(quests, ["a"], source({ x: 0, z: 0 }, {}));
    expect(noTarget[0]?.distanceKm).toBeNull();
  });
});

describe("formatDistance", () => {
  it("formats null, metres, and kilometres", () => {
    expect(formatDistance(null)).toBe("—");
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(0.85)).toBe("850 m");
    expect(formatDistance(5)).toBe("5.0 km");
    expect(formatDistance(12.34)).toBe("12 km");
    expect(formatDistance(9.96)).toBe("10.0 km");
    expect(formatDistance(42.6)).toBe("43 km");
  });
});

function view(id: string, overrides: Partial<PinnedQuestView> = {}): PinnedQuestView {
  return {
    id,
    title: `Quest ${id}`,
    settlement: "Testville",
    objectivesDone: 1,
    objectivesTotal: 2,
    daysLeft: 5,
    distanceKm: 5,
    ...overrides,
  };
}

describe("createQuestTrackerHud", () => {
  it("renders rows, distances, and the empty state", () => {
    let views: PinnedQuestView[] = [view("a"), view("b", { distanceKm: null })];
    const hud = createQuestTrackerHud({
      views: () => views,
      onUnpin: () => {},
      onOpenJournal: () => {},
      collapsed: false,
      onToggleCollapsed: () => {},
    });
    expect(hud.root.querySelector('[data-testid="quest-tracker-count"]')?.textContent).toBe("2/3");
    expect(hud.root.querySelector('[data-testid="quest-tracker-distance-a"]')?.textContent).toBe("5.0 km");
    expect(hud.root.querySelector('[data-testid="quest-tracker-distance-b"]')?.textContent).toBe("—");

    views = [];
    hud.refresh();
    expect(hud.root.querySelector('[data-testid="quest-tracker-empty"]')).not.toBeNull();
    expect(hud.root.querySelector('[data-testid="quest-tracker-count"]')?.textContent).toBe("");
    hud.dispose();
  });

  it("unpicks a quest through the unpin button and opens the journal", () => {
    const unpinned: string[] = [];
    let journalOpened = 0;
    const hud = createQuestTrackerHud({
      views: () => [view("a")],
      onUnpin: (id) => unpinned.push(id),
      onOpenJournal: () => {
        journalOpened += 1;
      },
      collapsed: false,
      onToggleCollapsed: () => {},
    });
    hud.root.querySelector<HTMLButtonElement>('[data-testid="quest-tracker-unpin-a"]')?.click();
    expect(unpinned).toEqual(["a"]);
    hud.root.querySelector<HTMLButtonElement>('[data-testid="quest-tracker-open-journal"]')?.click();
    expect(journalOpened).toBe(1);
    hud.dispose();
  });

  it("collapses, expands, and persists the choice", () => {
    const collapsedStates: boolean[] = [];
    const hud = createQuestTrackerHud({
      views: () => [],
      onUnpin: () => {},
      onOpenJournal: () => {},
      collapsed: true,
      onToggleCollapsed: (c) => collapsedStates.push(c),
    });
    expect(hud.isCollapsed()).toBe(true);
    expect(hud.root.classList.contains("is-collapsed")).toBe(true);
    hud.root.querySelector<HTMLButtonElement>('[data-testid="quest-tracker-toggle"]')?.click();
    expect(hud.isCollapsed()).toBe(false);
    expect(hud.root.classList.contains("is-collapsed")).toBe(false);
    expect(collapsedStates).toEqual([false]);
    hud.setCollapsed(true);
    expect(collapsedStates).toEqual([false, true]);
    hud.dispose();
  });
});
