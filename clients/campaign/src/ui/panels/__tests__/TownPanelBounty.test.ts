/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import { createFixtureSimulationProvider } from "../../../data/fixture/index.js";
import type { TownState, BountyOffer } from "../../../data/types.js";

function town(): TownState {
  return {
    id: "t1",
    settlementId: "s1",
    name: "Brooklyn",
    klass: "town",
    holderId: "h1",
    holderName: "Del",
    population: 1000,
    workers: 400,
    foodStock: 100,
    foodProduction: 50,
    foodDemand: 40,
    medicineStock: 10,
    sanitation: 0.6,
    infected: 0.01,
    crowding: 0.2,
    unrest: 0.1,
    loyalty: 0.7,
    security: 0.5,
    culture: "american",
    holderCulture: "american",
    rebellious: false,
    prosperity: 0.6,
    taxRate: 0.2,
    stateTaxRate: 0.05,
    state: "NY",
    buildings: [],
    constructionBuilding: null,
    constructionDaysLeft: 0,
    garrison: 50,
    garrisonConduct: 0.6,
    roadSafety: 0.7,
    informationTrust: 0.6,
    crimeRating: 0.15,
    money: 1000,
    gold: 0,
    metal: 0,
    updatedTick: 1,
    recruitable: [],
    notables: [],
  } as TownState;
}

function bounty(overrides: Partial<BountyOffer> = {}): BountyOffer {
  return {
    id: "bounty-1",
    partyId: "npc-bandit-0",
    townId: "t1",
    reward: 1600,
    strengthEstimate: 8,
    lastKnown: { x: 40, y: -12 },
    banditName: "Rust Vultures",
    banditType: "Bandits",
    ...overrides,
  };
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    town: town(),
    onWhy: vi.fn(),
    onOpenMarket: vi.fn(),
    onMarchHere: vi.fn(),
    onRoster: vi.fn(),
    ...overrides,
  } as Parameters<typeof townPanel>[0];
}

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe("town panel bounty board (bandits/bounties contract)", () => {
  it("hides the bounty board when the caller cannot serve it", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="bounty-section"]')).toBeNull();
  });

  it("the door reads the board on demand; rows carry name, reward, strength, last known", async () => {
    const onGetBounties = vi.fn().mockResolvedValue([bounty()]);
    const root = townPanel(options({ onGetBounties, onClaimBounty: vi.fn() }));
    expect(onGetBounties).not.toHaveBeenCalled();
    (root.querySelector('[data-testid="bounty-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(onGetBounties).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-testid="bounty-bounty-1"]')).not.toBeNull();
    expect(root.textContent).toContain("Rust Vultures — $1,600");
    expect(root.textContent).toContain("read strength ~8");
    expect(root.textContent).toContain("last seen (40, -12)");
  });

  it("an empty board says so instead of rendering nothing", async () => {
    const root = townPanel(options({ onGetBounties: vi.fn().mockResolvedValue([]), onClaimBounty: vi.fn() }));
    (root.querySelector('[data-testid="bounty-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="bounty-empty"]')).not.toBeNull();
  });

  it("a claim the sim refuses lands verbatim and the button re-arms", async () => {
    const onClaimBounty = vi.fn().mockRejectedValue(new Error("Rust Vultures still ride. Destroy the party to claim."));
    const root = townPanel(options({ onGetBounties: vi.fn().mockResolvedValue([bounty()]), onClaimBounty }));
    (root.querySelector('[data-testid="bounty-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="bounty-claim-bounty-1"]') as HTMLButtonElement).click();
    await flush();
    expect(onClaimBounty).toHaveBeenCalledWith("bounty-1");
    expect(root.querySelector('[data-testid="bounty-message"]')?.textContent).toContain("Rust Vultures still ride.");
    expect((root.querySelector('[data-testid="bounty-claim-bounty-1"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("the full fixture loop: refuse on a live party, defeat it, claim pays", async () => {
    const provider = createFixtureSimulationProvider();
    const bounties = await provider.getBounties();
    expect(bounties.length, "the fixture seeds bounties on its bandit parties").toBeGreaterThan(0);
    const first = bounties[0]!;
    // Live target refuses.
    await expect(provider.claimBounty(first.id)).rejects.toThrow(/still ride/);
    // Destroy the party through the sim's own defeat order.
    await provider.defeatNpcParty(first.partyId);
    const result = await provider.claimBounty(first.id);
    expect(result.claimed).toBe(true);
    expect(result.reward).toBeGreaterThan(0);
    // Paid bounties leave the board.
    const after = await provider.getBounties();
    expect(after.find((b) => b.id === first.id)).toBeUndefined();
  });

  it("the fixture's board rows are the sim's own numbers, not the client's", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const bounties = await provider.getBounties();
    for (const b of bounties) {
      const party = snapshot.npcParties.find((p) => p.id === b.partyId);
      expect(party).toBeDefined();
      expect(party!.kind).toBe("bandit");
      expect(b.reward).toBe(150 * party!.troopCount + 400);
    }
  });
});
