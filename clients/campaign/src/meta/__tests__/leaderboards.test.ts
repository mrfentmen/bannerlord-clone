/**
 * @vitest-environment jsdom
 *
 * Local leaderboards tests (MASTER_PLAN task 141): board logic plus the
 * panel's mode tabs, ranked rows, and two-step clear flow.
 */

import { describe, expect, it, afterEach } from "vitest";
import {
  MAX_BOARD_ENTRIES,
  battleScore,
  bestScore,
  clearBoard,
  submitScore,
  topScores,
  tournamentScore,
  type LeaderboardMode,
} from "../leaderboards.js";
import { leaderboardsPanel } from "../leaderboardsPanel.js";

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

const MODES: LeaderboardMode[] = ["quick-battle", "arena", "tournament"];

describe("leaderboard boards", () => {
  it("keeps boards independent per mode", () => {
    const store = memStorage();
    submitScore("quick-battle", { name: "Asha", score: 300 }, store);
    submitScore("arena", { name: "Rurik", score: 500 }, store);
    expect(topScores("quick-battle", store)).toHaveLength(1);
    expect(topScores("arena", store)[0]?.name).toBe("Rurik");
    expect(topScores("tournament", store)).toHaveLength(0);
  });

  it("ranks highest score first and caps at 10", () => {
    const store = memStorage();
    for (let i = 0; i < 12; i++) {
      submitScore("quick-battle", { name: `Fighter ${i}`, score: i * 10 }, store);
    }
    const top = topScores("quick-battle", store);
    expect(top).toHaveLength(MAX_BOARD_ENTRIES);
    expect(top[0]?.score).toBe(110);
    expect(top[9]?.score).toBe(20);
    expect(bestScore("quick-battle", store)?.name).toBe("Fighter 11");
  });

  it("returns the 0-based rank on submit, -1 when missing the cut", () => {
    const store = memStorage();
    for (let i = 0; i < 10; i++) {
      submitScore("arena", { name: `Gladiator ${i}`, score: 1000 - i }, store);
    }
    expect(submitScore("arena", { name: "Champion", score: 2000 }, store)).toBe(0);
    expect(submitScore("arena", { name: "Loser", score: 1 }, store)).toBe(-1);
    expect(topScores("arena", store)).toHaveLength(10);
  });

  it("rejects invalid entries", () => {
    const store = memStorage();
    expect(submitScore("tournament", { name: "", score: 100 }, store)).toBe(-1);
    expect(submitScore("tournament", { name: "X", score: -5 }, store)).toBe(-1);
    expect(submitScore("tournament", { name: "X", score: NaN }, store)).toBe(-1);
    expect(topScores("tournament", store)).toHaveLength(0);
    expect(bestScore("tournament", store)).toBeNull();
  });

  it("clears one board without touching the others", () => {
    const store = memStorage();
    submitScore("quick-battle", { name: "A", score: 10 }, store);
    submitScore("arena", { name: "B", score: 20 }, store);
    clearBoard("quick-battle", store);
    expect(topScores("quick-battle", store)).toHaveLength(0);
    expect(topScores("arena", store)).toHaveLength(1);
  });

  it("scores bouts and tournaments canonically", () => {
    expect(battleScore(10, 2, true)).toBe(10 * 10 + 100 - 2 * 5);
    expect(battleScore(0, 0, false)).toBe(0);
    expect(battleScore(0, 100, false)).toBe(0); // floored at 0
    expect(tournamentScore(4, 1500)).toBe(4 * 25 + 1500);
    expect(tournamentScore(0, 0)).toBe(0);
  });

  it("persists across loads", () => {
    const store = memStorage();
    submitScore("tournament", { name: "Ilsa", score: 900, detail: "champion" }, store);
    const top = topScores("tournament", store);
    expect(top[0]?.detail).toBe("champion");
    expect(typeof top[0]?.dateISO).toBe("string");
  });
});

describe("leaderboards panel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function open() {
    const handle = leaderboardsPanel({});
    document.body.appendChild(handle.root);
    return handle;
  }

  it("renders mode tabs and an empty state per mode", () => {
    open();
    for (const m of MODES) {
      expect(document.querySelector(`[data-testid="boards-tab-${m}"]`)).not.toBeNull();
    }
    expect(document.querySelector('[data-testid="boards-row-0"]')).toBeNull();
  });

  it("switches tabs on click", () => {
    open();
    (document.querySelector('[data-testid="boards-tab-arena"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-testid="boards-tab-arena"]')?.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[data-testid="boards-tab-quick-battle"]')?.getAttribute("aria-selected")).toBe("false");
  });

  it("two-step clear asks for confirmation", () => {
    open();
    const btn = document.querySelector('[data-testid="boards-clear"]') as HTMLButtonElement;
    btn.click();
    expect(btn.textContent).toBe("Click again to confirm");
  });
});
