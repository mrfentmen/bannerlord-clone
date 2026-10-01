/**
 * Arena screen UI tests. MASTER_PLAN.md section 4D (task 146).
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArena,
  type ArenaCallbacks,
  type ArenaState,
  type ArenaTournament,
} from "../arena.js";

function tournament(over: Partial<ArenaTournament> = {}): ArenaTournament {
  return {
    id: "t1",
    name: "Harvest Cup",
    rounds: 4,
    prizeGold: 500,
    entryFee: 25,
    entrants: 12,
    canAfford: true,
    full: false,
    startsInDays: 3,
    ...over,
  };
}

function state(over: Partial<ArenaState> = {}): ArenaState {
  return { townName: "Millhaven", tournaments: [tournament()], purse: 120, ...over };
}

function callbacks(over: Partial<ArenaCallbacks> = {}): ArenaCallbacks {
  return { onPracticeFight: vi.fn(), onEnterTournament: vi.fn(), ...over };
}

describe("createArena", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the practice fight entry (task 146)", () => {
    const handle = createArena(state(), callbacks());
    const btn = handle.root.querySelector<HTMLButtonElement>('[data-testid="arena-practice"]');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain("Enter a practice fight");
    handle.destroy();
  });

  it("practice fight entry calls onPracticeFight", () => {
    const cb = callbacks();
    const handle = createArena(state(), cb);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="arena-practice"]')!.click();
    expect(cb.onPracticeFight).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("renders the tournament list with rounds, prize, fee, and entrants (task 146)", () => {
    const handle = createArena(state(), callbacks());
    const card = handle.root.querySelector('[data-testid="arena-tournament-t1"]');
    expect(card?.textContent).toContain("Harvest Cup");
    expect(card?.textContent).toContain("4 rounds");
    expect(card?.textContent).toContain("12 entered");
    expect(card?.textContent).toContain("starts in 3d");
    expect(handle.root.querySelector('[data-testid="arena-tournament-t1-prize"]')?.textContent).toContain("500g");
    handle.destroy();
  });

  it("entering a tournament calls onEnterTournament with the tournament id", () => {
    const cb = callbacks();
    const handle = createArena(state(), cb);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="arena-enter-t1"]')!.click();
    expect(cb.onEnterTournament).toHaveBeenCalledTimes(1);
    expect(cb.onEnterTournament).toHaveBeenCalledWith("t1");
    handle.destroy();
  });

  it("disables entry when the tournament is full", () => {
    const handle = createArena(state({ tournaments: [tournament({ full: true })] }), callbacks());
    expect(handle.root.querySelector<HTMLButtonElement>('[data-testid="arena-enter-t1"]')?.disabled).toBe(true);
    expect(handle.root.querySelector('[data-testid="arena-tournament-t1-full"]')?.textContent).toContain("Full");
    handle.destroy();
  });

  it("disables entry when the player cannot afford the fee, with a reason", () => {
    const handle = createArena(state({ tournaments: [tournament({ canAfford: false })] }), callbacks());
    expect(handle.root.querySelector<HTMLButtonElement>('[data-testid="arena-enter-t1"]')?.disabled).toBe(true);
    expect(handle.root.querySelector('[data-testid="arena-tournament-t1-poor"]')?.textContent).toContain("Cannot afford the fee");
    handle.destroy();
  });

  it("shows the purse so entry fees make sense", () => {
    const handle = createArena(state({ purse: 120 }), callbacks());
    expect(handle.root.querySelector('[data-testid="arena-purse"]')?.textContent).toContain("120g");
    handle.destroy();
  });

  it("update() re-renders fresh tournament state from the sim", () => {
    const handle = createArena(state({ tournaments: [] }), callbacks());
    expect(handle.root.querySelector('[data-testid="arena-tournament-t1"]')).toBeNull();
    handle.update(state({ tournaments: [tournament({ full: true })] }));
    const card = handle.root.querySelector('[data-testid="arena-tournament-t1"]');
    expect(card).not.toBeNull();
    expect(handle.root.querySelector('[data-testid="arena-tournament-t1-full"]')?.textContent).toContain("Full");
    handle.destroy();
  });

  it("shows an empty state when no tournaments are scheduled", () => {
    const handle = createArena(state({ tournaments: [] }), callbacks());
    expect(handle.root.textContent).toContain("No tournaments are scheduled");
    // Practice entry is still offered from the empty state.
    expect(handle.root.querySelector('[data-testid="arena-practice"]')).not.toBeNull();
    handle.destroy();
  });
});
