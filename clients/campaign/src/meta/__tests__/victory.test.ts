/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  VICTORY_TOWN_THRESHOLD,
  evaluateVictory,
  shouldAnnounceVictory,
  type VictoryStanding,
} from "../victory.js";
import { victoryPanel } from "../victoryPanel.js";

const standing = (towns: number): VictoryStanding => ({
  townsControlled: towns,
  battlesWon: 12,
  daysElapsed: 200,
  clanName: "Fentmen",
});

describe("campaign victory (solo task 1)", () => {
  it("is not achieved below the town threshold", () => {
    const r = evaluateVictory(standing(VICTORY_TOWN_THRESHOLD - 1));
    expect(r.achieved).toBe(false);
    expect(r.townsNeeded).toBe(VICTORY_TOWN_THRESHOLD);
  });

  it("is achieved at the threshold with a title and summary", () => {
    const r = evaluateVictory(standing(VICTORY_TOWN_THRESHOLD));
    expect(r.achieved).toBe(true);
    expect(r.title).toContain("Fentmen");
    expect(r.summaryLines.length).toBeGreaterThan(0);
  });

  it("clamps negative town counts", () => {
    expect(evaluateVictory(standing(-3)).achieved).toBe(false);
  });

  it("announces exactly once per campaign", () => {
    expect(shouldAnnounceVictory(standing(4), false)).toBe(true);
    expect(shouldAnnounceVictory(standing(4), true)).toBe(false);
    expect(shouldAnnounceVictory(standing(1), false)).toBe(false);
  });

  it("panel offers continue and retire", () => {
    const onContinue = vi.fn();
    const onRetire = vi.fn();
    const el = victoryPanel({
      standing: () => standing(5),
      onContinue,
      onRetire,
      onClose: () => {},
    });
    expect(el.querySelector('[data-testid="victory-title"]')?.textContent).toContain("Fentmen");
    (el.querySelector('[data-testid="victory-continue"]') as HTMLButtonElement).click();
    (el.querySelector('[data-testid="victory-retire"]') as HTMLButtonElement).click();
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onRetire).toHaveBeenCalledTimes(1);
  });
});
