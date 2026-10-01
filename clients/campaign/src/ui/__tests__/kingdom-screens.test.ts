/**
 * @vitest-environment jsdom
 *
 * Kingdom screens (MASTER_PLAN.md 3D, tasks 115-119):
 *  - NPC profile: age, family, home, faction, traits, relations (115)
 *  - Clan tree: members + holdings, at most 3 generations (116)
 *  - Kingdom overview: fiefs, clans, policies, strength, each linking
 *    to its detail view (117)
 *  - Ruler AI goal: from the sim, refreshable on ticks (118)
 *  - Track NPC: pinning fires onTrack/onUntrack for the map marker (119)
 */

import { describe, expect, it, vi } from "vitest";
import {
  clanTree,
  createRulerGoalPanel,
  kingdomOverview,
  npcProfile,
  type ClanTreeCallbacks,
  type KingdomOverviewCallbacks,
  type NpcProfileCallbacks,
} from "../panels/KingdomScreens.js";
import type { ClanTree, KingdomOverview, NpcProfile, RulerGoal } from "../../data/types.js";

function profile(): NpcProfile {
  return {
    id: "npc-1",
    name: "Mara Voss",
    age: 34,
    family: [
      { id: "npc-2", name: "Deren Voss", relation: "brother" },
      { id: "npc-3", name: "Lio Voss", relation: "son" },
    ],
    homeSettlementId: "sett-7",
    homeSettlementName: "Jersey Depot",
    factionId: "fac-iron",
    factionName: "Iron Compact",
    traits: [
      { name: "calculation", value: 0.8 },
      { name: "valor", value: 0.35 },
    ],
    relations: [
      { entityId: "npc-9", entityName: "Boss Kessler", value: -45 },
      { entityId: "fac-iron", entityName: "Iron Compact", value: 60 },
    ],
  };
}

function profileCallbacks(overrides: Partial<NpcProfileCallbacks> = {}): NpcProfileCallbacks {
  return {
    onTrack: vi.fn(),
    onUntrack: vi.fn(),
    onSelectSettlement: vi.fn(),
    ...overrides,
  };
}

describe("npc profile", () => {
  it("shows age, faction, home, traits, family, and relations", () => {
    const el = npcProfile(profile(), profileCallbacks());
    document.body.append(el);
    expect(el.textContent).toContain("Age 34");
    expect(el.textContent).toContain("Iron Compact");
    expect(el.querySelector('[data-testid="npc-home"]')?.textContent).toContain("Jersey Depot");
    expect(el.querySelector('[data-testid="npc-traits"]')?.textContent).toContain("calculation");
    expect(el.querySelector('[data-testid="npc-family"]')?.textContent).toContain("Deren Voss");
    expect(el.querySelector('[data-testid="npc-relations"]')?.textContent).toContain("Boss Kessler");
    el.remove();
  });

  it("every field is a real value, not a placeholder", () => {
    const el = npcProfile(profile(), profileCallbacks());
    document.body.append(el);
    const body = el.textContent ?? "";
    expect(body).not.toContain("N/A");
    expect(body).not.toContain("TBD");
    el.remove();
  });

  it("home button routes to the settlement detail", () => {
    const cb = profileCallbacks();
    const el = npcProfile(profile(), cb);
    document.body.append(el);
    (el.querySelector('[data-testid="npc-home"]') as HTMLButtonElement).click();
    expect(cb.onSelectSettlement).toHaveBeenCalledWith("sett-7");
    el.remove();
  });

  it("track button toggles pinning and fires onTrack/onUntrack", () => {
    const cb = profileCallbacks();
    const el = npcProfile(profile(), cb);
    document.body.append(el);
    const btn = el.querySelector('[data-testid="npc-track"]') as HTMLButtonElement;
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    btn.click();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.textContent).toContain("Tracking");
    expect(cb.onTrack).toHaveBeenCalledWith("npc-1");

    btn.click();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(cb.onUntrack).toHaveBeenCalledWith("npc-1");
    el.remove();
  });
});

function tree(): ClanTree {
  return {
    id: "clan-1",
    name: "Voss",
    factionId: "fac-iron",
    factionName: "Iron Compact",
    strength: 2400,
    members: [
      {
        id: "npc-1",
        name: "Mara Voss",
        age: 58,
        role: "clan leader",
        children: [
          {
            id: "npc-2",
            name: "Deren Voss",
            age: 34,
            role: "heir",
            children: [
              { id: "npc-3", name: "Lio Voss", age: 12, role: "ward", children: [
                { id: "npc-4", name: "Pip Voss", age: 2, role: "infant", children: [] },
              ] },
            ],
          },
        ],
      },
    ],
    holdings: [
      { settlementId: "sett-7", name: "Jersey Depot" },
      { settlementId: "sett-9", name: "Brick Yard" },
    ],
  };
}

function treeCallbacks(overrides: Partial<ClanTreeCallbacks> = {}): ClanTreeCallbacks {
  return {
    onSelectMember: vi.fn(),
    onSelectSettlement: vi.fn(),
    ...overrides,
  };
}

describe("clan tree", () => {
  it("renders members and holdings", () => {
    const el = clanTree(tree(), treeCallbacks());
    document.body.append(el);
    expect(el.textContent).toContain("Clan Voss");
    expect(el.querySelector('[data-testid="clan-member-npc-1"]')?.textContent).toContain("Mara Voss");
    expect(el.querySelector('[data-testid="clan-holdings"]')?.textContent).toContain("Jersey Depot");
    el.remove();
  });

  it("renders at most 3 generations", () => {
    const el = clanTree(tree(), treeCallbacks());
    document.body.append(el);
    // Gen 1 (root), 2 (child), 3 (grandchild) render; gen 4 does not.
    expect(el.querySelector('[data-testid="clan-member-npc-1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="clan-member-npc-2"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="clan-member-npc-3"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="clan-member-npc-4"]')).toBeNull();
    expect(el.querySelector('[data-testid="clan-member-npc-3"]')?.getAttribute("data-generation")).toBe("3");
    el.remove();
  });

  it("member click opens the NPC profile", () => {
    const cb = treeCallbacks();
    const el = clanTree(tree(), cb);
    document.body.append(el);
    (el.querySelector('[data-testid="clan-member-npc-2"]') as HTMLButtonElement).click();
    expect(cb.onSelectMember).toHaveBeenCalledWith("npc-2");
    el.remove();
  });

  it("holding click opens the settlement detail", () => {
    const cb = treeCallbacks();
    const el = clanTree(tree(), cb);
    document.body.append(el);
    (el.querySelector('[data-testid="clan-holding-sett-9"]') as HTMLButtonElement).click();
    expect(cb.onSelectSettlement).toHaveBeenCalledWith("sett-9");
    el.remove();
  });
});

function kingdom(): KingdomOverview {
  return {
    id: "kg-1",
    name: "Iron Compact",
    rulerId: "ruler-1",
    rulerName: "Boss Kessler",
    fiefs: [
      { settlementId: "sett-7", name: "Jersey Depot", prosperity: 72 },
      { settlementId: "sett-9", name: "Brick Yard", prosperity: 41 },
    ],
    clans: [
      { id: "clan-1", name: "Voss", strength: 2400, loyalty: 80 },
      { id: "clan-2", name: "Halden", strength: 900, loyalty: -10 },
    ],
    policies: [
      { id: "pol-1", name: "Iron Tithe", description: "Clans pay in steel.", effect: "+10% metal, -5 loyalty" },
    ],
    strength: 12500,
  };
}

function kingdomCallbacks(overrides: Partial<KingdomOverviewCallbacks> = {}): KingdomOverviewCallbacks {
  return {
    onSelectFief: vi.fn(),
    onSelectClan: vi.fn(),
    ...overrides,
  };
}

describe("kingdom overview", () => {
  it("shows fiefs, clans, policies, and strength", () => {
    const el = kingdomOverview(kingdom(), kingdomCallbacks());
    document.body.append(el);
    expect(el.textContent).toContain("Iron Compact");
    expect(el.textContent).toContain("12,500");
    expect(el.querySelector('[data-testid="kingdom-fiefs"]')?.textContent).toContain("Jersey Depot");
    expect(el.querySelector('[data-testid="kingdom-clans"]')?.textContent).toContain("Voss");
    expect(el.querySelector('[data-testid="kingdom-policies"]')?.textContent).toContain("Iron Tithe");
    el.remove();
  });

  it("each section links to its detail view", () => {
    const cb = kingdomCallbacks();
    const el = kingdomOverview(kingdom(), cb);
    document.body.append(el);
    (el.querySelector('[data-testid="kingdom-fief-sett-7"]') as HTMLButtonElement).click();
    expect(cb.onSelectFief).toHaveBeenCalledWith("sett-7");
    (el.querySelector('[data-testid="kingdom-clan-clan-1"]') as HTMLButtonElement).click();
    expect(cb.onSelectClan).toHaveBeenCalledWith("clan-1");
    el.remove();
  });
});

function goal(): RulerGoal {
  return {
    rulerId: "ruler-1",
    rulerName: "Boss Kessler",
    goal: "expanding",
    goalText: "Pushing convoys up the Hudson to take the Brick Yard.",
    day: 214,
    progress: 0.4,
  };
}

describe("ruler goal panel", () => {
  it("shows the sim goal with kind, text, and progress", () => {
    const p = createRulerGoalPanel(goal());
    document.body.append(p.root);
    expect(p.root.querySelector('[data-testid="ruler-goal-kind"]')?.textContent).toContain("Expanding");
    expect(p.root.querySelector('[data-testid="ruler-goal-text"]')?.textContent).toContain("Hudson");
    expect(p.root.querySelector('[data-testid="ruler-goal-progress"]')?.getAttribute("aria-label")).toContain(
      "40 percent",
    );
    expect(p.root.querySelector('[data-testid="ruler-goal-day"]')?.textContent).toContain("214");
    p.destroy();
  });

  it("update() refreshes the goal on ticks", () => {
    const p = createRulerGoalPanel(goal());
    document.body.append(p.root);
    p.update({ ...goal(), goal: "defending", goalText: "Holding the depot walls.", day: 215, progress: 0.9 });
    expect(p.root.querySelector('[data-testid="ruler-goal-kind"]')?.textContent).toContain("Defending");
    expect(p.root.querySelector('[data-testid="ruler-goal-text"]')?.textContent).toContain("depot walls");
    expect(p.root.querySelector('[data-testid="ruler-goal-day"]')?.textContent).toContain("215");
    p.destroy();
  });

  it("clamps out-of-range progress", () => {
    const p = createRulerGoalPanel({ ...goal(), progress: 1.7 });
    document.body.append(p.root);
    expect(p.root.querySelector('[data-testid="ruler-goal-progress"]')?.getAttribute("aria-label")).toContain(
      "100 percent",
    );
    p.destroy();
  });
});
