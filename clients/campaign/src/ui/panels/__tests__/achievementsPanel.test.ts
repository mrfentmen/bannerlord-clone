/**
 * @vitest-environment jsdom
 *
 * Achievements panel tests (MASTER_PLAN task 137).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAchievementStore, type StorageLike } from "../../../achievements/index.js";
import { achievementsPanel } from "../Achievements.js";

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

describe("achievementsPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("renders the summary and one row per definition", () => {
    const store = createAchievementStore(memoryStorage());
    const root = achievementsPanel({ store });
    document.body.appendChild(root);
    const summary = root.querySelector('[data-testid="achievements-summary"]')!;
    expect(summary.textContent).toContain("0 of 104 unlocked");
    expect(root.querySelectorAll('[data-testid^="achievement-"]').length).toBe(104);
  });

  it("masks hidden locked achievements and shows them after unlock", () => {
    const store = createAchievementStore(memoryStorage());
    const root = achievementsPanel({ store });
    document.body.appendChild(root);
    const row = root.querySelector('[data-testid="achievement-quest-failed-1"]')!;
    expect(row.textContent).toContain("???");
    store.record("quest.failed");
    const root2 = achievementsPanel({ store });
    const row2 = root2.querySelector('[data-testid="achievement-quest-failed-1"]')!;
    expect(row2.textContent).toContain("First Scar");
  });

  it("filters by category tab and unlock state", () => {
    const store = createAchievementStore(memoryStorage());
    store.record("quest.completed");
    const root = achievementsPanel({ store });
    document.body.appendChild(root);
    (root.querySelector('[data-testid="achievements-tab-quests"]') as HTMLElement).click();
    const questRows = root.querySelectorAll('[data-testid^="achievement-quest-"]').length;
    expect(questRows).toBeGreaterThan(0);
    expect(root.querySelectorAll('[data-testid^="achievement-"]').length).toBe(questRows);
    (root.querySelector('[data-testid="achievements-state-unlocked"]') as HTMLElement).click();
    expect(root.querySelector('[data-testid="achievement-quest-completed-1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="achievement-quest-completed-5"]')).toBeNull();
  });

  it("shows a progress bar with clamped values", () => {
    const store = createAchievementStore(memoryStorage());
    store.record("battle.deployed", undefined, 3);
    const root = achievementsPanel({ store });
    document.body.appendChild(root);
    const row = root.querySelector('[data-testid="achievement-battle-deployed-5"]')!;
    const bar = row.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(row.textContent).toContain("3 / 5");
  });

  it("shows the empty state when a filter matches nothing", () => {
    const store = createAchievementStore(memoryStorage());
    const root = achievementsPanel({ store });
    document.body.appendChild(root);
    (root.querySelector('[data-testid="achievements-state-unlocked"]') as HTMLElement).click();
    expect(root.textContent).toContain("Nothing here yet.");
  });

  it("calls onClose when the panel close button is used", () => {
    const store = createAchievementStore(memoryStorage());
    const onClose = vi.fn();
    const root = achievementsPanel({ store, onClose });
    document.body.appendChild(root);
    (root.querySelector('[aria-label="Close Achievements"]') as HTMLElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
