/**
 * Task 22: the player's troop count, and the live source that feeds it.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerTroopCount, type PlayerTroopSource } from "../playerTroopCount.js";
import { createLiveBattleSource } from "../liveBattleSource.js";
import type { LiveBattleView } from "../../battleflow/flow.js";

/** A `LiveBattleView` with only the fields the source reads. */
function view(playerTroops: number): LiveBattleView {
  return {
    mode: "local",
    battle: {
      id: "b1",
      encounterId: "e1",
      status: "active",
      tick: 1,
      attacker: { partyId: 1, name: "You", troops: playerTroops, morale: 1 },
      defender: { partyId: 2, name: "Them", troops: 100, morale: 1 },
    },
    playerSide: { partyId: 1, name: "You", troops: playerTroops, morale: 1 },
    enemySide: { partyId: 2, name: "Them", troops: 100, morale: 1 },
    playerIsAttacker: true,
    availableOrders: [],
  };
}

/** A source that reports whatever the test tells it to. */
function manualSource(): PlayerTroopSource & { report(troops: number): void; readonly subscribers: number } {
  const fns = new Set<(troops: number) => void>();
  return {
    report(troops: number) {
      for (const fn of fns) fn(troops);
    },
    get subscribers() {
      return fns.size;
    },
    onPlayerTroops(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

function value(root: HTMLElement): string {
  return root.querySelector('[data-testid="hud-player-troops"]')?.textContent ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("player troop count", () => {
  it("shows a dash, not a zero, until the source reports", () => {
    const count = createPlayerTroopCount(manualSource());
    document.body.append(count.root);

    expect(value(count.root)).toBe("—");
    expect(count.root.getAttribute("data-live")).toBe("false");

    count.destroy();
  });

  it("prints each figure the source reports and marks itself live", () => {
    const source = manualSource();
    const count = createPlayerTroopCount(source);
    document.body.append(count.root);

    source.report(240);
    expect(value(count.root)).toBe("240");
    expect(count.root.getAttribute("data-live")).toBe("true");

    source.report(233);
    expect(value(count.root)).toBe("233");

    count.destroy();
  });

  it("names the figure for a screen reader", () => {
    const count = createPlayerTroopCount(manualSource());
    document.body.append(count.root);

    expect(count.root.getAttribute("aria-label")).toBe("Your troops");

    count.destroy();
  });

  it("ignores a report that is not a number rather than printing it", () => {
    const source = manualSource();
    const count = createPlayerTroopCount(source);
    document.body.append(count.root);

    source.report(240);
    source.report(Number.NaN);
    expect(value(count.root)).toBe("240");

    count.destroy();
  });

  it("destroy unsubscribes and removes the readout", () => {
    const source = manualSource();
    const count = createPlayerTroopCount(source);
    document.body.append(count.root);

    count.destroy();
    expect(source.subscribers).toBe(0);
    expect(count.root.isConnected).toBe(false);

    // A destroyed readout must not move again, even while its source lives on.
    source.report(10);
    expect(value(count.root)).toBe("—");
  });
});

describe("live battle source", () => {
  it("pushes the figure the battle reports, not one it invents", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = view(240);
    const source = createLiveBattleSource(() => current);
    const seen: number[] = [];
    source.onPlayerTroops((n) => seen.push(n));

    current = view(239);
    vi.advanceTimersByTime(250);
    current = view(238);
    vi.advanceTimersByTime(250);

    expect(seen).toEqual([239, 238]);

    source.destroy();
    vi.useRealTimers();
  });

  it("replays the current figure to a listener that subscribes late", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = view(12);
    const source = createLiveBattleSource(() => current);
    vi.advanceTimersByTime(250);

    const seen: number[] = [];
    source.onPlayerTroops((n) => seen.push(n));
    expect(seen).toEqual([12]);

    source.destroy();
    vi.useRealTimers();
  });

  it("does not notify when the figure has not changed", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const source = createLiveBattleSource(() => view(50));
    let calls = 0;
    source.onPlayerTroops(() => calls++);

    vi.advanceTimersByTime(250);
    expect(calls).toBe(1); // the first figure, which is a change from "unknown"
    vi.advanceTimersByTime(250);
    vi.advanceTimersByTime(250);
    expect(calls).toBe(1); // and nothing since, because the value never moved

    source.destroy();
    vi.useRealTimers();
  });

  it("reports nothing while the battle has no live view yet", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const source = createLiveBattleSource(() => null);
    let calls = 0;
    source.onPlayerTroops(() => calls++);

    vi.advanceTimersByTime(1_000);
    expect(calls).toBe(0);

    source.destroy();
    vi.useRealTimers();
  });

  it("drives the troop readout end to end and stops on destroy", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = null;
    const source = createLiveBattleSource(() => current);
    const count = createPlayerTroopCount(source);
    document.body.append(count.root);

    expect(value(count.root)).toBe("—");

    current = view(310);
    vi.advanceTimersByTime(250);
    expect(value(count.root)).toBe("310");

    current = view(298);
    vi.advanceTimersByTime(250);
    expect(value(count.root)).toBe("298");

    source.destroy();
    count.destroy();
    current = view(1);
    vi.advanceTimersByTime(1_000);
    expect(value(count.root)).toBe("298");

    vi.useRealTimers();
  });
});