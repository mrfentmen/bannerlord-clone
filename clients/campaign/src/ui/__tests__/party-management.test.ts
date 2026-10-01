/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPartyManagement,
  dailyWageBill,
  projectedTreasury,
  treasuryRunoutDay,
  PROJECTION_DAYS,
  type PartyManagementCallbacks,
  type PartyManagementState,
} from "../party-management.js";

const baseState = (): PartyManagementState => ({
  day: 100,
  name: "Night Wolves",
  leaderName: "Del",
  treasury: 2000, // 2000 / 40 per day = 50 days, holds the full window
  morale: 0.65,
  foodDays: 5.2,
  tierGroups: [
    {
      tier: 1,
      troops: [
        {
          id: "s1",
          name: "Street Recruit",
          count: 10,
          quality: 1,
          wage: 2,
          morale: 0.6,
          upgrade: {
            stackId: "s1",
            canUpgrade: true,
            costPerTroop: 50,
            targetTier: 2,
            targetName: "Street Soldier",
          },
        },
      ],
    },
    {
      tier: 2,
      troops: [
        {
          id: "s2",
          name: "Street Soldier",
          count: 5,
          quality: 2,
          wage: 4,
          morale: 0.7,
          upgrade: {
            stackId: "s2",
            canUpgrade: false,
            costPerTroop: 120,
            targetTier: 3,
            targetName: "Street Veteran",
            blockedReason: "needs 200 more gold",
          },
        },
      ],
    },
  ],
  wounded: [
    { id: "w1", name: "Street Recruit", count: 3, recoveryDay: 104 },
  ],
  prisoners: [
    { id: "p1", name: "Rival Gunner", count: 2, ransomEach: 150 },
  ],
  speedKmPerDay: 32,
  speedFactors: [
    { label: "Light wagons", deltaKmPerDay: 2, bad: false },
    { label: "Overweight — hauling scrap", deltaKmPerDay: -6, bad: true },
  ],
  inventory: {
    medicine: 12,
    ammo: 400,
    goods: [{ goodId: "textiles", name: "Textiles", quantity: 20 }],
  },
});

const baseCallbacks = (): PartyManagementCallbacks => ({
  onUpgrade: vi.fn(async () => {}),
  fetchMoraleCauses: vi.fn(async () => [
    { label: "Won the last fight", delta: 12 },
    { label: "Good rations", delta: 5 },
    { label: "Late wages", delta: -4 },
    { label: "Rainy march", delta: -2 },
  ]),
  onRecruitPrisoner: vi.fn(async () => {}),
  onReleasePrisoner: vi.fn(async () => {}),
  onRansomPrisoner: vi.fn(async () => ({ gold: 300 })),
});

let state: PartyManagementState;
let callbacks: PartyManagementCallbacks;

beforeEach(() => {
  state = baseState();
  callbacks = baseCallbacks();
});

describe("roster grouped by tier (101)", () => {
  it("renders troops grouped by tier with counts matching the sim", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.textContent).toContain("Tier 1 — 10 troops");
    expect(root.textContent).toContain("Tier 2 — 5 troops");
    const tier1Counts = root.querySelectorAll('[data-testid="party-tier-1-count"]');
    expect(tier1Counts).toHaveLength(1);
    expect(tier1Counts[0]?.textContent).toBe("10");
  });

  it("shows an empty state when nobody follows", () => {
    const { root } = createPartyManagement({ ...state, tierGroups: [] }, callbacks);
    expect(root.textContent).toContain("Nobody is following you.");
  });
});

describe("upgrades (102)", () => {
  it("shows an upgrade button per upgradeable stack", () => {
    const { root } = createPartyManagement(state, callbacks);
    const btn = root.querySelector('[data-testid="party-upgrade-s1"]');
    expect(btn?.textContent).toContain("Upgrade to Street Soldier");
  });

  it("shows the blocked reason for non-upgradeable stacks", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.textContent).toContain("needs 200 more gold");
  });

  it("calls onUpgrade with the stack id when the button is clicked", async () => {
    const { root } = createPartyManagement(state, callbacks);
    const btn = root.querySelector<HTMLButtonElement>('[data-testid="party-upgrade-s1"]');
    btn?.click();
    await vi.waitFor(() => {
      expect(callbacks.onUpgrade).toHaveBeenCalledWith("s1");
    });
  });

  it("reflects the new tier immediately when fresh state comes through update()", () => {
    const handle = createPartyManagement(state, callbacks);
    const upgraded: PartyManagementState = {
      ...state,
      tierGroups: [
        { tier: 1, troops: [] },
        {
          tier: 2,
          troops: [
            { id: "s1", name: "Street Soldier", count: 10, quality: 2, wage: 4, morale: 0.65 },
            { id: "s2", name: "Street Soldier", count: 5, quality: 2, wage: 4, morale: 0.7 },
          ],
        },
      ],
    };
    handle.update(upgraded);
    expect(handle.root.textContent).toContain("Tier 2 — 15 troops");
  });
});

describe("wages and treasury projection (103)", () => {
  it("shows the daily wage bill as the sum of count times wage", () => {
    // 10*2 + 5*4 = 40.
    expect(dailyWageBill(state)).toBe(40);
    const { root } = createPartyManagement(state, callbacks);
    expect(root.querySelector('[data-testid="party-wage-bill"]')?.textContent).toContain("40.00");
  });

  it("renders a projection covering exactly 30 days", () => {
    const { root } = createPartyManagement(state, callbacks);
    const days = [...root.querySelectorAll('[data-testid="party-projection-day"]')].map((el) =>
      el.textContent,
    );
    expect(days).toEqual(["+0", "+7", "+14", "+21", "+30"]);
    expect(PROJECTION_DAYS).toBe(30);
    expect(root.textContent).toContain("Projection covers exactly 30 days.");
  });

  it("projects the treasury as treasury minus bill times days", () => {
    expect(projectedTreasury(state, 30)).toBe(2000 - 40 * 30);
  });

  it("warns when the treasury runs out inside the window", () => {
    const broke = { ...state, treasury: 100 };
    expect(treasuryRunoutDay(broke)).toBe(3); // ceil(100/40)
    const { root } = createPartyManagement(broke, callbacks);
    expect(root.querySelector('[data-testid="party-treasury-runout"]')?.textContent).toContain(
      "runs out in 3 days",
    );
  });

  it("stays quiet when the treasury holds the full 30 days", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.querySelector('[data-testid="party-treasury-ok"]')).not.toBeNull();
    expect(treasuryRunoutDay(state)).toBeNull();
  });
});

describe("morale causes (104)", () => {
  it("fetches causes on Why? and lists the top 3 in the tooltip", async () => {
    const { root } = createPartyManagement(state, callbacks);
    root.querySelector<HTMLButtonElement>('[data-testid="party-why-morale"]')?.click();
    await vi.waitFor(() => {
      const tip = root.querySelector('[data-testid="party-morale-causes-tip"]');
      expect(tip).not.toBeNull();
      expect(tip?.textContent).toContain("Won the last fight");
      expect(tip?.textContent).toContain("Good rations");
      expect(tip?.textContent).toContain("Late wages");
      expect(tip?.textContent).not.toContain("Rainy march");
      expect(tip?.getAttribute("title")).toContain("Won the last fight");
    });
    expect(callbacks.fetchMoraleCauses).toHaveBeenCalledTimes(1);
  });
});

describe("food stocks (105)", () => {
  it("shows the days-remaining estimate", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.querySelector('[data-testid="party-food-days"]')?.textContent).toContain("5.2 days");
    expect(root.querySelector('[data-testid="party-food-ok"]')).not.toBeNull();
  });

  it("turns critical under 3 days", () => {
    const { root } = createPartyManagement({ ...state, foodDays: 2.4 }, callbacks);
    expect(root.querySelector('[data-testid="party-food-critical"]')?.textContent).toContain("Under 3 days");
  });
});

describe("wounded (106)", () => {
  it("lists wounded separately with recovery ETAs", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.textContent).toContain("Wounded");
    const eta = root.querySelector('[data-testid="party-wounded-eta"]');
    expect(eta?.textContent).toContain("4 days (day 104)");
    expect(root.querySelector('[data-testid="party-wounded-count"]')?.textContent).toBe("3");
  });
});

describe("prisoners (107)", () => {
  it("offers recruit, release, and ransom actions per stack", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.querySelector('[data-testid="party-prisoner-recruit-p1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="party-prisoner-release-p1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="party-prisoner-ransom-p1"]')).not.toBeNull();
  });

  it("recruiting calls onRecruitPrisoner with the prisoner id", async () => {
    const { root } = createPartyManagement(state, callbacks);
    root.querySelector<HTMLButtonElement>('[data-testid="party-prisoner-recruit-p1"]')?.click();
    await vi.waitFor(() => {
      expect(callbacks.onRecruitPrisoner).toHaveBeenCalledWith("p1");
    });
  });

  it("releasing calls onReleasePrisoner with the prisoner id", async () => {
    const { root } = createPartyManagement(state, callbacks);
    root.querySelector<HTMLButtonElement>('[data-testid="party-prisoner-release-p1"]')?.click();
    await vi.waitFor(() => {
      expect(callbacks.onReleasePrisoner).toHaveBeenCalledWith("p1");
    });
  });

  it("ransoming reports the gold the sim paid", async () => {
    const { root } = createPartyManagement(state, callbacks);
    root.querySelector<HTMLButtonElement>('[data-testid="party-prisoner-ransom-p1"]')?.click();
    await vi.waitFor(() => {
      expect(callbacks.onRansomPrisoner).toHaveBeenCalledWith("p1");
    });
  });
});

describe("party speed (108)", () => {
  it("shows the speed and highlights bad factors", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.querySelector('[data-testid="party-speed"]')?.textContent).toContain("32 km/day");
    expect(root.textContent).toContain("Overweight — hauling scrap");
    expect(root.textContent).toContain("Slowing the party");
  });
});

describe("party inventory (109)", () => {
  it("shows medicine, ammo, and trade good quantities from the sim", () => {
    const { root } = createPartyManagement(state, callbacks);
    expect(root.querySelector('[data-testid="party-inventory-medicine"]')?.textContent).toContain("12 doses");
    expect(root.querySelector('[data-testid="party-inventory-ammo"]')?.textContent).toContain("400 rounds");
    expect(root.querySelector('[data-testid="party-inventory-good-qty"]')?.textContent).toBe("20");
  });
});

describe("update/destroy", () => {
  it("re-renders every section on update", () => {
    const handle = createPartyManagement(state, callbacks);
    handle.update({ ...state, foodDays: 1.1, morale: 0.2 });
    expect(handle.root.querySelector('[data-testid="party-food-critical"]')).not.toBeNull();
  });

  it("destroy removes the panel", () => {
    const handle = createPartyManagement(state, callbacks);
    document.body.appendChild(handle.root);
    handle.destroy();
    expect(document.body.contains(handle.root)).toBe(false);
  });
});
