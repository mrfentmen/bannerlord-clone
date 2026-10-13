/**
 * @vitest-environment jsdom
 *
 * Lifetime statistics panel tests (MASTER_PLAN task 138): stat cards render
 * from the store, refresh re-reads, and the reset button is two-step.
 */

import { describe, expect, it, afterEach } from "vitest";
import { lifetimeStatsPanel } from "../lifetimeStatsPanel.js";

describe("lifetime stats panel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders an empty state with no history", () => {
    const handle = lifetimeStatsPanel({});
    document.body.appendChild(handle.root);
    expect(document.querySelector('[data-testid="lifetime-note"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="lifetime-stat-battles"]')).toBeNull();
    handle.root.remove();
  });

  it("two-step reset asks for confirmation", () => {
    const handle = lifetimeStatsPanel({});
    document.body.appendChild(handle.root);
    const btn = document.querySelector('[data-testid="lifetime-reset"]') as HTMLButtonElement;
    btn.click();
    expect(btn.textContent).toBe("Click again to confirm reset");
    handle.root.remove();
  });

  it("exposes a refresh handle", () => {
    const handle = lifetimeStatsPanel({});
    document.body.appendChild(handle.root);
    expect(() => handle.refresh()).not.toThrow();
    handle.root.remove();
  });

  it("renders the shareable career showcase", () => {
    const handle = lifetimeStatsPanel({
      playerName: "Del",
      clanName: "fentmen",
      achievementsUnlocked: 25,
      achievementsTotal: 52,
    });
    document.body.appendChild(handle.root);
    const card = document.querySelector('[data-testid="lifetime-showcase-card"]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("Del of fentmen");
    expect(card!.textContent).toContain("25/52");
    expect(document.querySelector('[data-testid="lifetime-showcase-copy"]')).not.toBeNull();
    handle.root.remove();
  });
});

describe("lifetime stats per-campaign drill-down (integration)", () => {
  it("lists each recorded campaign's totals", async () => {
    const { recordCampaignStats } = await import("../campaignStats.js");
    recordCampaignStats("c1", "First Reign", {
      battlesWon: 5, battlesLost: 1, seasonsPlayed: 3,
      coinEarned: 1200, treatiesSigned: 2, schemesCompleted: 1,
    });
    recordCampaignStats("c2", "Second Reign", {
      battlesWon: 2, battlesLost: 4, seasonsPlayed: 1,
      coinEarned: 300, treatiesSigned: 0, schemesCompleted: 0,
    });

    const { root } = lifetimeStatsPanel();
    document.body.appendChild(root);

    const section = root.querySelector('[data-testid="lifetime-campaigns"]')!;
    expect(section.textContent).toContain("First Reign");
    expect(section.textContent).toContain("Second Reign");
    const first = root.querySelector('[data-testid="lifetime-campaign-c1"]')!;
    expect(first.textContent).toContain("5 battles won");
    expect(first.textContent).toContain("3 seasons");
  });
});
