/**
 * Task 24: the player's morale bar, and the morale figure the live source pushes.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMoraleBar, type MoraleSource } from "../moraleBar.js";
import { createLiveBattleSource } from "../liveBattleSource.js";
import type { LiveBattleView } from "../../battleflow/flow.js";

/** A `LiveBattleView` with the morale figures the source reads. */
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
  const el = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  return el?.style.width ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("player morale bar", () => {
  it("starts empty and unvalued rather than reading as full strength", () => {
    const bar = createMoraleBar(manualSource(), { side: "player" });
    document.body.append(bar.root);

    expect(text(bar.root, "hud-player-morale")).toBe("—");
    expect(fillWidth(bar.root, "hud-player-morale-fill")).toBe("");
    expect(bar.root.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);

    bar.destroy();
  });

  it("fills the bar and prints the figure the source reports", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "player" });
    document.body.append(bar.root);

    source.report(0.82);
    expect(text(bar.root, "hud-player-morale")).toBe("82%");
    expect(fillWidth(bar.root, "hud-player-morale-fill")).toBe("82%");

    source.report(0.25);
    expect(text(bar.root, "hud-player-morale")).toBe("25%");
    expect(fillWidth(bar.root, "hud-player-morale-fill")).toBe("25%");

    bar.destroy();
  });

  it("reports the figure to assistive tech as a progressbar", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "player" });
    document.body.append(bar.root);

    source.report(0.5);
    const track = bar.root.querySelector('[role="progressbar"]');
    expect(track?.getAttribute("aria-label")).toBe("Your morale");
    expect(track?.getAttribute("aria-valuemin")).toBe("0");
    expect(track?.getAttribute("aria-valuemax")).toBe("100");
    expect(track?.getAttribute("aria-valuenow")).toBe("50");
    expect(track?.getAttribute("data-live")).toBe("true");

    bar.destroy();
  });

  it("clamps a figure from outside 0..1 so the fill cannot exceed its track", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "player" });
    document.body.append(bar.root);

    source.report(1.4);
    expect(fillWidth(bar.root, "hud-player-morale-fill")).toBe("100%");
    expect(text(bar.root, "hud-player-morale")).toBe("100%");

    source.report(-0.2);
    expect(fillWidth(bar.root, "hud-player-morale-fill")).toBe("0%");
    expect(text(bar.root, "hud-player-morale")).toBe("0%");

    bar.destroy();
  });

  it("rounds to whole percent so the print and the fill agree", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "player" });
    document.body.append(bar.root);

    source.report(1 / 3);
    expect(text(bar.root, "hud-player-morale")).toBe("33%");
    expect(fillWidth(bar.root, "hud-player-morale-fill")).toBe("33%");

    bar.destroy();
  });

  it("ignores a report that is not a number", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "player" });
    document.body.append(bar.root);

    source.report(0.6);
    source.report(Number.NaN);
    expect(text(bar.root, "hud-player-morale")).toBe("60%");

    bar.destroy();
  });

  it("destroy unsubscribes and removes the bar", () => {
    const source = manualSource();
    const bar = createMoraleBar(source, { side: "player" });
    document.body.append(bar.root);

    bar.destroy();
    expect(source.subscribers).toBe(0);
    expect(bar.root.isConnected).toBe(false);

    source.report(0.9);
    expect(text(bar.root, "hud-player-morale")).toBe("—");
  });
});

describe("live battle source, player morale", () => {
  it("pushes the fraction the battle reports", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = view(1, 1);
    const source = createLiveBattleSource(() => current);
    const seen: number[] = [];
    source.onPlayerMorale((n) => seen.push(n));
    vi.advanceTimersByTime(250);

    current = view(0.6, 1);
    vi.advanceTimersByTime(250);
    current = view(0.6, 1);
    vi.advanceTimersByTime(250); // unchanged: nothing pushed

    expect(seen).toEqual([1, 0.6]);

    source.destroy();
    vi.useRealTimers();
  });

  it("drives the bar end to end", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let current: LiveBattleView | null = null;
    const source = createLiveBattleSource(() => current);
    const bar = createMoraleBar(
      { onMorale: (fn) => source.onPlayerMorale(fn) },
      { side: "player" },
    );
    document.body.append(bar.root);

    current = view(0.9, 1);
    vi.advanceTimersByTime(250);
    expect(text(bar.root, "hud-player-morale")).toBe("90%");

    // A routed enemy: morale collapses and the bar follows it down.
    current = view(0.12, 1);
    vi.advanceTimersByTime(250);
    expect(text(bar.root, "hud-player-morale")).toBe("12%");
    expect(fillWidth(bar.root, "hud-player-morale-fill")).toBe("12%");

    source.destroy();
    bar.destroy();
    vi.useRealTimers();
  });
});