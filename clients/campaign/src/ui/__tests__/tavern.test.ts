/**
 * Tavern screen UI tests. MASTER_PLAN.md section 4D (task 145).
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTavern,
  type TavernCallbacks,
  type TavernGame,
  type TavernRecruit,
  type TavernRumor,
  type TavernState,
} from "../tavern.js";

function recruit(over: Partial<TavernRecruit> = {}): TavernRecruit {
  return { id: "r1", name: "Mara", tier: "Tier 3", wagePerDay: 8, available: 2, ...over };
}

function rumor(over: Partial<TavernRumor> = {}): TavernRumor {
  return { id: "q1", text: "The miller is buying cheap wool.", source: "the bartender", ...over };
}

function game(over: Partial<TavernGame> = {}): TavernGame {
  return { id: "g1", name: "Dice", description: "Three dice, highest wins.", wager: 10, playersWaiting: 2, canAfford: true, ...over };
}

function state(over: Partial<TavernState> = {}): TavernState {
  return {
    townName: "Millhaven",
    recruits: [recruit()],
    rumors: [rumor()],
    games: [game()],
    purse: 120,
    ...over,
  };
}

function callbacks(over: Partial<TavernCallbacks> = {}): TavernCallbacks {
  return { onRecruit: vi.fn(), onAskRumors: vi.fn(), onPlayGame: vi.fn(), ...over };
}

describe("createTavern", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders recruit, rumor, and game sections (task 145)", () => {
    const handle = createTavern(state(), callbacks());
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector('[data-testid="tavern-recruits"]')).not.toBeNull();
    expect(handle.root.querySelector('[data-testid="tavern-rumors"]')).not.toBeNull();
    expect(handle.root.querySelector('[data-testid="tavern-games"]')).not.toBeNull();
    expect(handle.root.textContent).toContain("Millhaven");
    handle.destroy();
  });

  it("shows the purse so wagers make sense", () => {
    const handle = createTavern(state({ purse: 120 }), callbacks());
    expect(handle.root.querySelector('[data-testid="tavern-purse"]')?.textContent).toContain("120g");
    handle.destroy();
  });

  it("hiring a recruit calls onRecruit with the recruit id", () => {
    const cb = callbacks();
    const handle = createTavern(state(), cb);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="tavern-hire-r1"]')!.click();
    expect(cb.onRecruit).toHaveBeenCalledTimes(1);
    expect(cb.onRecruit).toHaveBeenCalledWith("r1");
    handle.destroy();
  });

  it("shows wage, tier, and availability for each recruit", () => {
    const handle = createTavern(state(), callbacks());
    const row = handle.root.querySelector('[data-testid="tavern-recruit-r1"]');
    expect(row?.textContent).toContain("Tier 3");
    expect(row?.textContent).toContain("8g a day");
    expect(row?.textContent).toContain("2 waiting");
    handle.destroy();
  });

  it("disables the hire button when nobody is available", () => {
    const handle = createTavern(state({ recruits: [recruit({ available: 0 })] }), callbacks());
    expect(handle.root.querySelector<HTMLButtonElement>('[data-testid="tavern-hire-r1"]')?.disabled).toBe(true);
    handle.destroy();
  });

  it("asking around calls onAskRumors", () => {
    const cb = callbacks();
    const handle = createTavern(state(), cb);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="tavern-ask-rumors"]')!.click();
    expect(cb.onAskRumors).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("shows the rumor text and its source", () => {
    const handle = createTavern(state(), callbacks());
    const row = handle.root.querySelector('[data-testid="tavern-rumor-q1"]');
    expect(row?.textContent).toContain("The miller is buying cheap wool.");
    expect(row?.textContent).toContain("the bartender");
    handle.destroy();
  });

  it("update() re-renders fresh rumors from the sim", () => {
    const handle = createTavern(state({ rumors: [] }), callbacks());
    document.body.appendChild(handle.root);
    expect(handle.root.querySelector('[data-testid="tavern-rumor-q1"]')).toBeNull();
    handle.update(state({ rumors: [rumor()] }));
    expect(handle.root.querySelector('[data-testid="tavern-rumor-q1"]')).not.toBeNull();
    handle.destroy();
  });

  it("joining a game calls onPlayGame with the game id", () => {
    const cb = callbacks();
    const handle = createTavern(state(), cb);
    handle.root.querySelector<HTMLButtonElement>('[data-testid="tavern-game-g1"]')!.click();
    expect(cb.onPlayGame).toHaveBeenCalledTimes(1);
    expect(cb.onPlayGame).toHaveBeenCalledWith("g1");
    handle.destroy();
  });

  it("disables a table the player cannot afford, with a reason", () => {
    const handle = createTavern(state({ games: [game({ canAfford: false })] }), callbacks());
    expect(handle.root.querySelector<HTMLButtonElement>('[data-testid="tavern-game-g1"]')?.disabled).toBe(true);
    expect(handle.root.querySelector('[data-testid="tavern-game-g1-poor"]')?.textContent).toContain("Short of the wager");
    handle.destroy();
  });

  it("shows an empty state when the benches are empty", () => {
    const handle = createTavern(state({ recruits: [], rumors: [], games: [] }), callbacks());
    expect(handle.root.textContent).toContain("Nobody is looking for work");
    expect(handle.root.textContent).toContain("Nobody is talking yet");
    expect(handle.root.textContent).toContain("No tables are running");
    // The ask-around button is still offered from the empty rumor state.
    expect(handle.root.querySelector('[data-testid="tavern-ask-rumors"]')).not.toBeNull();
    handle.destroy();
  });
});
