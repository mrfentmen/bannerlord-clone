/**
 * Task 23: the enemy's troop count, and the enemy figure the live source pushes.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnemyTroopCount, type EnemyTroopSource } from "../enemyTroopCount.js";
import { createLiveBattleSource } from "../liveBattleSource.js";
import type { LiveBattleView } from "../../battleflow/flow.js";

/** A `LiveBattleView` with the two counts the source reads. */
function view(playerTroops: number, enemyTroops: number): LiveBattleView {
  return {
    mode: "local",
    battle: {
      id: "b1",
      encounterId: "e1",
      status: "active",
      tick: 1,
      attacker: { partyId: 1, name: "You", troops: playerTroops, morale: 1 },
      defender: { partyId: 2, name: "Them", troops: enemyTroops, morale: 1 },
    },
    playerSide: { partyId: 1, name: "You", troops: playerTroops, morale: 1 },
    enemySide: { partyId: 2, name: "Them", troops: enemyTroops, morale: 1 },
    playerIsAttacker: true,
    availableOrders: [],
  };
}

function manualSource(): EnemyTroopSource & { report(troops: number): void; readonly subscribers: number } {
  const fns = new Set<(troops: number) => void>();
  return {
    report(troops: number) {
      for (const fn of fns) fn(troops);
    },
    get subscribers() {
      return fns.size;
    },
    onEnemyTroops(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

function value(root: HTMLElement): string {
  return root.querySelector('[data-testid="hud-enemy-troops"]')?.textContent ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("enemy troop count", () => {
  it("shows a dash until the enemy figure arrives", () => {
    const count = createEnemyTroopCount(manualSource());
    document.body.append(count.root);

    expect(value(count.root)).toBe("—");
    expect(count.root.getAttribute("data-live")).toBe("false");

    count.destroy();
  });

  it("prints each reported figure and marks itself live", () => {
    const source = manualSource();
    const count = createEnemyTroopCount(source);
    document.body.append(count.root);

    source.report(180);
    expect(value(count.root)).toBe("180");
    expect(count.root.getAttribute("data-live")).toBe("true");

    source.report(171);
    expect(value(count.root)).toBe("171");

    count.destroy();
  });

  it("shares the count's own shape but carries its own label and name", () => {
    const count = createEnemyTroopCount(manualSource());
    document.body.append(count.root);

    expect(count.root.getAttribute("aria-label")).toBe("Enemy troops");
    expect(count.root.querySelector(".hud-enemy-troops__label")?.textContent).toBe("Enemy troops");

    count.destroy();
  });

  it("ignores a report that is not a number", () => {
    const source = manualSource();
    const count = createEnemyTroopCount(source);
    document.body.append(count.root);

    source.report(180);
    source.report(Number.POSITIVE_INFINITY);
    expect(value(count.root)).toBe("180");

    count.destroy();
  });

  it("destroy unsubscribes and removes the readout", () => {
    const source = manualSource();
    const count = createEnemyTroopCount(source);
    document.body.append(count.root);

    count.destroy();
    expect(source.subscribers).toBe(0);
    expect(count.root.isConnected).toBe(false);

    source.report(10);
    expect(value(count.root)).toBe("—");
  });
});

describe("live battle source, enemy figure", () => {
  it("pushes the enemy side's count, not a figure derived from the player's", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = view(240, 300);
    const source = createLiveBattleSource(() => current);
    const seen: number[] = [];
    source.onEnemyTroops((n) => seen.push(n));

    vi.advanceTimersByTime(250);
    // The player took casualties; the enemy's count is its own number.
    current = view(238, 291);
    vi.advanceTimersByTime(250);

    expect(seen).toEqual([300, 291]);

    source.destroy();
    vi.useRealTimers();
  });

  it("keeps the two sides' figures apart", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = view(10, 99);
    const source = createLiveBattleSource(() => current);
    const player: number[] = [];
    const enemy: number[] = [];
    source.onPlayerTroops((n) => player.push(n));
    source.onEnemyTroops((n) => enemy.push(n));
    vi.advanceTimersByTime(250); // the opening poll records (10, 99)

    current = view(9, 99); // only the player moved
    vi.advanceTimersByTime(250);

    expect(player).toEqual([10, 9]);
    expect(enemy).toEqual([99]);

    source.destroy();
    vi.useRealTimers();
  });

  it("drives the enemy readout end to end", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = null;
    const source = createLiveBattleSource(() => current);
    const count = createEnemyTroopCount(source);
    document.body.append(count.root);

    current = view(310, 400);
    vi.advanceTimersByTime(250);
    expect(value(count.root)).toBe("400");

    current = view(305, 366);
    vi.advanceTimersByTime(250);
    expect(value(count.root)).toBe("366");

    source.destroy();
    count.destroy();
    vi.useRealTimers();
  });
});