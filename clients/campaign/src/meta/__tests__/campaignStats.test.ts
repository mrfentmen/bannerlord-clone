/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { emptyStats } from "../achievements.js";
import {
  campaignStats,
  campaignStatsBreakdown,
  lifetimeTotals,
  recordCampaignStats,
  removeCampaignStats,
} from "../campaignStats.js";

beforeEach(() => localStorage.clear());

const statsA = { ...emptyStats(), battlesWon: 10, coinEarned: 5000 };
const statsB = { ...emptyStats(), battlesWon: 4, coinEarned: 1200 };

describe("lifetime stats per-campaign (solo task 99)", () => {
  it("drills down by campaign", () => {
    recordCampaignStats("c1", "First Reign", statsA);
    recordCampaignStats("c2", "Second Reign", statsB);
    expect(campaignStats("c1")!.stats.battlesWon).toBe(10);
    expect(campaignStats("c2")!.campaignName).toBe("Second Reign");
    expect(campaignStats("nope")).toBeNull();
  });

  it("totals across campaigns", () => {
    recordCampaignStats("c1", "First Reign", statsA);
    recordCampaignStats("c2", "Second Reign", statsB);
    const totals = lifetimeTotals();
    expect(totals.battlesWon).toBe(14);
    expect(totals.coinEarned).toBe(6200);
  });

  it("re-recording replaces a campaign's stats", () => {
    recordCampaignStats("c1", "First Reign", statsA);
    recordCampaignStats("c1", "First Reign", statsB);
    expect(campaignStatsBreakdown()).toHaveLength(1);
    expect(lifetimeTotals().battlesWon).toBe(4);
  });

  it("removes deleted campaigns", () => {
    recordCampaignStats("c1", "First Reign", statsA);
    expect(removeCampaignStats("c1")).toBe(true);
    expect(removeCampaignStats("c1")).toBe(false);
    expect(lifetimeTotals().battlesWon).toBe(0);
  });

  it("empty when no campaigns recorded", () => {
    expect(campaignStatsBreakdown()).toHaveLength(0);
    expect(lifetimeTotals().battlesWon).toBe(0);
  });
});
