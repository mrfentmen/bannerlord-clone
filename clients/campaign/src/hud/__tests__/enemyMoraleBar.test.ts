/**
 * Task 25: the enemy's morale bar.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMoraleBar, type MoraleSource } from "../moraleBar.js";
import { createLiveBattleSource } from "../liveBattleSource.js";
import type { LiveBattleView } from "../../battleflow/flow.js";

/** A `LiveBattleView` with the two morale figures the source reads. */
function view(playerMorale: number, enemyMorale: number): LiveBattleView {
  return {
    mode: "local",
    battle: {
      id: "b1",
      encounterId: "e1",
      status: "active",
      tick: 1,
      attacker: { partyId: 1, name: "You", troops: 10, morale: playerMorale },
      defender: { partyId: 2, name: "Them", troops: 10, morale: enemyMorale },
    },
    playerSide: { partyId: 1, name: "You", troops: 10, morale: playerMorale },
    enemySide: { partyId: 2, name: "Them", troops: 10, morale: enemyMorale },
    playerIsAttacker: true,
    availableOrders: [],
  };
}

function manualSource(): MoraleSource & { report(fraction: number): void; readonly subscribers: number } {
  const fns = new Set<(fraction: number) => void>();
  return {
    report(fraction: number) {
      for (const fn of fns) fn(fraction);
    },
    get subscribers() {
      return fns.size;
    },
    onMorale(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

function text(root: HTMLElement, testId: string): string {
  return root.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
}

function fillWidth(root: HTMLElement, testId: string): string {
  return root.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.style.width ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("enemy morale bar", () => {
  it("labels itself as the enemy's, not the player's", () => {
    const bar = createMoraleBar(manualSource(), { side: "enemy" });
    document.body.append(bar.root);

    expect(bar.root.className).toContain("hud-morale--enemy");
    expect(bar.root.querySelector(".hud-morale__label")?.textContent).toBe("Enemy morale");
    expect(bar.root.querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe("Enemy morale");

    bar.destroy();
  });

  it("has its own readout, distinct from the player's", () => {
    const player = createMoraleBar(manualSource(), { side: "player" });
    const enemy = createMoraleBar(manualSource(), { side: "enemy" });
    document.body.append(player.root, enemy.root);

    expect(text(player.root, "hud-player-morale")).toBe("—");
    expect(text(enemy.root, "hud-enemy-morale")).toBe("—");

    player.destroy();
    enemy.destroy();
  });

  it("fills and prints from the enemy figure alone", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "enemy" });
    document.body.append(bar.root);

    source.report(0.45);
    expect(text(bar.root, "hud-enemy-morale")).toBe("45%");
    expect(fillWidth(bar.root, "hud-enemy-morale-fill")).toBe("45%");
    expect(bar.root.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("45");

    bar.destroy();
  });

  it("destroy unsubscribes and removes the bar", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "enemy" });
    document.body.append(bar.root);

    bar.destroy();
    expect(source.subscribers).toBe(0);
    expect(bar.root.isConnected).toBe(false);
  });
});

describe("live battle source, enemy morale", () => {
  it("keeps the two armies' morale apart", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = view(1, 1);
    const source = createLiveBattleSource(() => current);
    const player: number[] = [];
    const enemy: number[] = [];
    source.onPlayerMorale((n) => player.push(n));
    source.onEnemyMorale((n) => enemy.push(n));
    vi.advanceTimersByTime(250);

    current = view(0.7, 1); // only the player's morale moved
    vi.advanceTimersByTime(250);

    expect(player).toEqual([1, 0.7]);
    expect(enemy).toEqual([1]);

    source.destroy();
    vi.useRealTimers();
  });

  it("drives the enemy bar from a routing enemy", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = null;
    const source = createLiveBattleSource(() => current);
    const bar = createMoraleBar({ onMorale: (fn) => source.onEnemyMorale(fn) }, { side: "enemy" });
    document.body.append(bar.root);

    current = view(1, 0.95);
    vi.advanceTimersByTime(250);
    expect(text(bar.root, "hud-enemy-morale")).toBe("95%");

    current = view(1, 0.08);
    vi.advanceTimersByTime(250);
    expect(text(bar.root, "hud-enemy-morale")).toBe("8%");
    expect(fillWidth(bar.root, "hud-enemy-morale-fill")).toBe("8%");

    source.destroy();
    bar.destroy();
    vi.useRealTimers();
  });
});