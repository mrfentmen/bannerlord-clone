/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { scoreCampaign, type CampaignScoreInput } from "../campaignScore.js";
import { scorePanel } from "../scorePanel.js";

const input: CampaignScoreInput = {
  battlesWon: 10,
  battlesLost: 2,
  treatiesSigned: 3,
  warsWon: 1,
  wealth: 5000,
  townsControlled: 2,
  daysElapsed: 200,
  renown: 60,
};

describe("campaign score (solo task 4)", () => {
  it("scores three categories deterministically", () => {
    const a = scoreCampaign(input);
    const b = scoreCampaign(input);
    expect(a).toEqual(b);
    expect(a.categories.map((c) => c.name)).toEqual(["Warfare", "Diplomacy", "Wealth"]);
    expect(a.total).toBe(a.categories.reduce((s, c) => s + c.points, 0));
  });

  it("warfare rewards wins, wars and towns; penalizes losses", () => {
    const w = scoreCampaign(input).categories[0]!;
    // 10*10 + 1*50 + 2*25 - 2*4 = 100+50+50-8 = 192
    expect(w.points).toBe(192);
  });

  it("assigns rank titles by total", () => {
    expect(scoreCampaign({ ...input, battlesWon: 0, battlesLost: 0, treatiesSigned: 0, warsWon: 0, wealth: 0, townsControlled: 0, renown: 0 }).rank).toBe("Foot Soldier");
    expect(scoreCampaign({ ...input, battlesWon: 200 }).rank).toBe("Legend of the Age");
  });

  it("clamps negatives to zero", () => {
    const s = scoreCampaign({ ...input, battlesWon: -5, wealth: -100 });
    expect(s.total).toBeGreaterThanOrEqual(0);
  });

  it("panel renders rank, total and three categories", () => {
    const el = scorePanel({ input: () => input, onClose: () => {} });
    expect(el.querySelector('[data-testid="score-rank"]')?.textContent).toBeTruthy();
    expect(el.querySelector('[data-testid="score-total"]')?.textContent).toContain("Total:");
    expect(el.querySelectorAll('[data-testid="score-categories"] li').length).toBe(3);
  });
});
