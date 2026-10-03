/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { partyPanel } from "../PartyPanel.js";
import { TROOP_TIERS, troopTier, type PartyState, type TroopStack, type UpgradeTroopsResult } from "../../../data/types.js";

function stack(overrides: Partial<TroopStack> = {}): TroopStack {
  return {
    id: "s1",
    name: "Militia",
    count: 20,
    wounded: 0,
    quality: 2,
    tier: 2,
    xp: 0,
    wage: 3.5,
    morale: 0.6,
    ...overrides,
  };
}

function partyWith(troops: TroopStack[]): PartyState {
  return {
    id: "p1",
    name: "The Fence Company",
    leaderName: "You",
    factionId: "f1",
    position: { x: 0, z: 0 },
    destination: null,
    route: [],
    marchingSinceDay: null,
    food: 40,
    medicine: 10,
    metal: 60,
    money: 5000,
    morale: 0.6,
    fatigue: 0.2,
    wagesOwed: 0,
    speedKmPerDay: 40,
    troops,
    roles: {},
    goods: [],
    prisoners: [],
  } as PartyState;
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    party: partyWith([stack()]),
    onWhy: vi.fn(),
    ...overrides,
  } as Parameters<typeof partyPanel>[0];
}

/** Let the click handler's promise chain run to completion. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function accepted(stackId: string): UpgradeTroopsResult {
  const from = troopTier(2);
  return {
    upgraded: true,
    stackId,
    fromTier: from.tier,
    toTier: from.tier + 1,
    xpSpent: from.xpToNext! * 20,
    goldSpent: 400,
    causedBy: "training",
  };
}

describe("party panel training (task 146)", () => {
  it("draws no training section when the caller cannot send the order", () => {
    // A training section whose button does nothing would promise something the
    // panel cannot deliver.
    const root = partyPanel(options());
    expect(root.querySelector('[data-testid="party-training"]')).toBeNull();
  });

  it("draws the training section once an order handler exists", () => {
    const root = partyPanel(options({ onUpgradeTroops: vi.fn() }));
    expect(root.querySelector('[data-testid="party-training"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="training-s1"]')).not.toBeNull();
  });

  it("disables the button until the stack has banked the tier's XP", () => {
    const tier = troopTier(2);
    const needed = tier.xpToNext! * 20;
    const short = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ xp: needed - 1 })]) }),
    );
    const btn = short.querySelector('[data-testid="upgrade-s1"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(short.querySelector('[data-testid="training-s1"]')!.getAttribute("data-ready")).toBe("false");
    expect(short.textContent).toContain(`1 XP short`);

    const ready = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ xp: needed })]) }),
    );
    const readyBtn = ready.querySelector('[data-testid="upgrade-s1"]') as HTMLButtonElement;
    expect(readyBtn.disabled).toBe(false);
    expect(ready.querySelector('[data-testid="training-s1"]')!.getAttribute("data-ready")).toBe("true");
  });

  it("scales the XP requirement by the number of soldiers in the stack", () => {
    const small = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ count: 5, xp: 0 })]) }),
    );
    const big = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ count: 100, xp: 0 })]) }),
    );
    const threshold = troopTier(2).xpToNext!;
    const read = (root: HTMLElement): string =>
      root.querySelector('[data-testid="training-xp-s1"]')!.textContent ?? "";
    expect(read(small)).toContain(`0 / ${(threshold * 5).toLocaleString("en-US")}`);
    expect(read(big)).toContain(`0 / ${(threshold * 100).toLocaleString("en-US")}`);
    // The threshold belongs to the tier being left, which is what the simulation
    // reads: tier 2's 250 XP per soldier, not tier 3's 500.
    expect(threshold).toBe(250);
  });

  it("prints the promotion the simulation made, with what it spent", async () => {
    const onUpgradeTroops = vi.fn().mockResolvedValue(accepted("s1"));
    const tier = troopTier(2);
    const root = partyPanel(
      options({ onUpgradeTroops, party: partyWith([stack({ xp: tier.xpToNext! * 20 })]) }),
    );
    (root.querySelector('[data-testid="upgrade-s1"]') as HTMLButtonElement).click();
    expect(onUpgradeTroops).toHaveBeenCalledWith("s1");
    await settle();

    const message = root.querySelector('[data-testid="party-training-message"]')!;
    expect((message as HTMLElement).style.display).not.toBe("none");
    expect(message.textContent).toContain("trained up to tier 3");
    expect(message.textContent).toContain("5,000 XP");
    expect(message.textContent).toContain("$400");
  });

  it("prints the simulation's refusal reason verbatim", async () => {
    const onUpgradeTroops = vi.fn().mockResolvedValue({
      upgraded: false,
      stackId: "s1",
      fromTier: 2,
      toTier: 2,
      xpSpent: 0,
      goldSpent: 0,
      reason: "The company cannot pay for this.",
      causedBy: "training",
    } satisfies UpgradeTroopsResult);
    const tier = troopTier(2);
    const root = partyPanel(
      options({ onUpgradeTroops, party: partyWith([stack({ xp: tier.xpToNext! * 20 })]) }),
    );
    (root.querySelector('[data-testid="upgrade-s1"]') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('[data-testid="party-training-message"]')!.textContent).toBe(
      "The company cannot pay for this.",
    );
  });

  it("re-enables the button when the order fails outright", async () => {
    const onUpgradeTroops = vi.fn().mockRejectedValue(new Error("connection refused"));
    const tier = troopTier(2);
    expect(tier.tier).toBe(2);
    const root = partyPanel(
      options({ onUpgradeTroops, party: partyWith([stack({ xp: tier.xpToNext! * 20 })]) }),
    );
    const btn = root.querySelector('[data-testid="upgrade-s1"]') as HTMLButtonElement;
    btn.click();
    await settle();
    expect(btn.disabled).toBe(false);
    expect(root.querySelector('[data-testid="party-training-message"]')!.textContent).toBe(
      "The training order did not go through.",
    );
  });

  it("says there is nothing above the top tier instead of showing a dead button", () => {
    const root = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ tier: 5 })]) }),
    );
    const row = root.querySelector('[data-testid="training-s1"]')!;
    expect(row.textContent).toContain("top of the ladder");
    expect(row.querySelector('[data-testid="upgrade-s1"]')).toBeNull();
    // Elite is the last rung of the ladder the simulation walks.
    expect(TROOP_TIERS[TROOP_TIERS.length - 1]!.xpToNext).toBeNull();
  });

  it("has an empty state for a party with no troops", () => {
    const root = partyPanel(options({ onUpgradeTroops: vi.fn(), party: partyWith([]) }));
    const section = root.querySelector('[data-testid="party-training"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("No troops to train");
  });

  it("names the promotion in the button's accessible name", () => {
    const tier = troopTier(2);
    const root = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ xp: tier.xpToNext! * 20 })]) }),
    );
    const btn = root.querySelector('[data-testid="upgrade-s1"]')!;
    expect(btn.getAttribute("aria-label")).toBe(`Train Militia up to ${troopTier(3).name}`);
    expect(btn.textContent).toContain(troopTier(3).name);
  });
});

describe("party panel upgrade path (task 147)", () => {
  it("shows what the next tier does and what it costs on the wage bill", () => {
    const root = partyPanel(options({ onUpgradeTroops: vi.fn() }));
    const path = root.querySelector('[data-testid="training-path-s1"]')!;
    const next = troopTier(3);
    expect(path.textContent).toContain(next.name);
    expect(path.textContent).toContain(`×${next.combatMultiplier.toFixed(1)}`);
    expect(path.textContent).toContain(`×${next.wageMultiplier.toFixed(1)}`);
  });

  it("names the current tier and the one above it", () => {
    const root = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ tier: 1 })] ) }),
    );
    expect(root.querySelector('[data-testid="training-tier-s1"]')!.textContent).toContain(
      `Tier 1 ${troopTier(1).name} → ${troopTier(2).name}`,
    );
  });

  it("fills the XP bar in proportion to what is banked", () => {
    const tier = troopTier(2);
    const needed = tier.xpToNext! * 20;
    const root = partyPanel(
      options({ onUpgradeTroops: vi.fn(), party: partyWith([stack({ xp: needed / 4 })]) }),
    );
    const fill = root.querySelector('[data-testid="training-xp-s1"] .gauge__fill')!;
    expect(fill.getAttribute("style")).toContain("width:25%");
  });

  it("gives each stack its own button and its own XP bar", () => {
    const root = partyPanel(
      options({
        onUpgradeTroops: vi.fn(),
        party: partyWith([stack({ id: "s1", name: "Militia" }), stack({ id: "s2", name: "Riflemen", count: 5 })]),
      }),
    );
    expect(root.querySelector('[data-testid="upgrade-s1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="upgrade-s2"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="training-xp-s1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="training-xp-s2"]')).not.toBeNull();
  });
});
describe("the troop table", () => {
  it("shows a wounded column with each stack's wounded count", () => {
    const root = partyPanel(
      options({ party: partyWith([stack({ id: "s1", wounded: 3 }), stack({ id: "s2", wounded: 0 })]) }),
    );
    const cells = Array.from(root.querySelectorAll('[data-testid="troop-wounded"]'));
    expect(cells.map((c) => c.textContent)).toEqual(["3", "0"]);
  });
});

describe("the prisoners section", () => {
  it("lists held prisoners with counts and tiers", () => {
    const party = partyWith([]);
    party.prisoners = [
      { troopId: "t-bandit", name: "Bandit", count: 4, tier: 1 },
      { troopId: "t-raider", name: "Raider", count: 7, tier: 2 },
    ];
    const root = partyPanel(options({ party }));
    const counts = Array.from(root.querySelectorAll('[data-testid="prisoner-count"]'));
    expect(counts.map((c) => c.textContent)).toEqual(["4", "7"]);
  });

  it("says plainly when there are no prisoners", () => {
    const root = partyPanel(options({ party: partyWith([]) }));
    expect(root.textContent).toContain("No prisoners.");
  });
});

describe("prisoner actions", () => {
  function partyWithPrisoners() {
    const party = partyWith([]);
    party.prisoners = [{ troopId: "t-bandit", name: "Bandit", count: 4, tier: 1 }];
    return party;
  }

  it("shows ransom and recruit buttons when the caller provides handlers", () => {
    const root = partyPanel(
      options({
        party: partyWithPrisoners(),
        onRansomPrisoners: vi.fn().mockResolvedValue({ gold: 100 }),
        onRecruitPrisoners: vi.fn().mockResolvedValue(undefined),
      }),
    );
    expect(root.querySelector('[data-testid="ransom-t-bandit"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="recruit-t-bandit"]')).not.toBeNull();
  });

  it("hides the action buttons when no handlers are provided", () => {
    const root = partyPanel(options({ party: partyWithPrisoners() }));
    expect(root.querySelector('[data-testid="ransom-t-bandit"]')).toBeNull();
    expect(root.querySelector('[data-testid="recruit-t-bandit"]')).toBeNull();
  });

  it("calls the ransom handler with troop id and count", async () => {
    const onRansom = vi.fn().mockResolvedValue({ gold: 100 });
    const root = partyPanel(
      options({ party: partyWithPrisoners(), onRansomPrisoners: onRansom }),
    );
    (root.querySelector('[data-testid="ransom-t-bandit"]') as HTMLButtonElement).click();
    await settle();
    expect(onRansom).toHaveBeenCalledWith("t-bandit", 4);
  });
});
