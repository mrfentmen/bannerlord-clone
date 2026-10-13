/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { partyPanel } from "../PartyPanel.js";
import type { PartyState } from "../../../data/types.js";

function party(): PartyState {
  return {
    id: "party-player",
    name: "Rook Company",
    leaderName: "Sam Reyes",
    factionId: "mountain-alliance",
    position: { x: 0, z: 0 },
    destination: null,
    route: [],
    marchingSinceDay: null,
    troopCount: 10,
    speedKmPerDay: 20,
    money: 1500,
    food: 40,
    medicine: 10,
    metal: 60,
    morale: 0.8,
    fatigue: 0.2,
    wagesOwed: 0,
    troops: [{ id: "s1", name: "Militia", count: 10, wounded: 0, tier: 1, wage: 2, quality: 2, morale: 0.8 }],
    roles: { scout: "comp-1" },
    goods: [],
    prisoners: [],
  } as unknown as PartyState;
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    party: party(),
    onWhy: vi.fn(),
    ...overrides,
  } as Parameters<typeof partyPanel>[0];
}

describe("party ops wiring (bucket 1)", () => {
  it("hides merge, roles, and templates when the caller cannot send them", () => {
    const root = partyPanel(options());
    expect(root.querySelector('[data-testid="party-merge-detached-1"]')).toBeNull();
    expect(root.querySelector('[data-testid="party-assign-roles"]')).toBeNull();
    expect(root.querySelector('[data-testid="party-template-save"]')).toBeNull();
  });

  it("lists detached parties with merge buttons", () => {
    const root = partyPanel(options({
      onMergeParty: vi.fn(),
      detachedParties: [{ id: "detached-1", name: "Scout wing", troopCount: 6 }],
    }));
    expect(root.querySelector('[data-testid="party-merge-detached-1"]')).not.toBeNull();
    expect(root.textContent).toContain("Scout wing");
    expect(root.textContent).toContain("6 troops");
  });

  it("sends the merge order when clicked", () => {
    const onMergeParty = vi.fn().mockResolvedValue(undefined);
    const root = partyPanel(options({
      onMergeParty,
      detachedParties: [{ id: "detached-1", name: "Scout wing", troopCount: 6 }],
    }));
    (root.querySelector('[data-testid="party-merge-detached-1"]') as HTMLButtonElement).click();
    expect(onMergeParty).toHaveBeenCalledWith("detached-1");
  });

  it("offers role assignment with companion candidates", () => {
    const root = partyPanel(options({
      onAssignRole: vi.fn(),
      companionCandidates: [{ id: "comp-2", name: "Mira", skills: { medicine: 6 } }],
    }));
    expect(root.querySelector('[data-testid="party-assign-roles"]')).not.toBeNull();
    const surgeon = root.querySelector('[data-testid="party-role-surgeon"]') as HTMLSelectElement;
    expect(surgeon.textContent).toContain("Mira (medicine 6)");
  });

  it("sends the role assignment when the select changes", () => {
    const onAssignRole = vi.fn().mockResolvedValue(undefined);
    const root = partyPanel(options({
      onAssignRole,
      companionCandidates: [{ id: "comp-2", name: "Mira", skills: { medicine: 6 } }],
    }));
    const surgeon = root.querySelector('[data-testid="party-role-surgeon"]') as HTMLSelectElement;
    surgeon.value = "comp-2";
    surgeon.dispatchEvent(new Event("change"));
    expect(onAssignRole).toHaveBeenCalledWith("comp-2", "surgeon");
  });

  it("sends a null-role clear against the currently assigned companion", () => {
    const onAssignRole = vi.fn().mockResolvedValue(undefined);
    const root = partyPanel(options({
      onAssignRole,
      // comp-1 is the party's current scout (see the party fixture), so the
      // app's candidate list would include them.
      companionCandidates: [{ id: "comp-1", name: "Sable", skills: { scouting: 5 } }, { id: "comp-2", name: "Mira", skills: { medicine: 6 } }],
    }));
    const scout = root.querySelector('[data-testid="party-role-scout"]') as HTMLSelectElement;
    expect(scout.value).toBe("comp-1");
    scout.value = "";
    scout.dispatchEvent(new Event("change"));
    expect(onAssignRole).toHaveBeenCalledWith("comp-1", null);
  });

  it("shows the template save form and the refit list", () => {
    const root = partyPanel(options({
      onSaveTemplate: vi.fn(),
      onRefitTemplate: vi.fn(),
      partyTemplates: [{ id: "t1", name: "Line infantry", summary: "20x tier-2 line" }],
    }));
    expect(root.querySelector('[data-testid="party-template-save"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="party-refit-t1"]')).not.toBeNull();
    expect(root.textContent).toContain("Line infantry");
    expect(root.textContent).toContain("20x tier-2 line");
  });

  it("sends a template save with the typed name", () => {
    const onSaveTemplate = vi.fn().mockResolvedValue({ templateId: "t9", summary: "Saved." });
    const root = partyPanel(options({ onSaveTemplate, onRefitTemplate: vi.fn() }));
    const input = root.querySelector('[data-testid="party-template-name"]') as HTMLInputElement;
    input.value = "Shock troops";
    (root.querySelector('[data-testid="party-template-save"]') as HTMLButtonElement).click();
    expect(onSaveTemplate).toHaveBeenCalledWith("Shock troops");
  });

  it("sends the refit order and reports the plan", async () => {
    const onRefitTemplate = vi.fn().mockResolvedValue({
      orders: [{ action: "recruit", tier: 2, branch: null, count: 5 }, { action: "dismiss", tier: 1, branch: null, count: 2 }],
    });
    const root = partyPanel(options({
      onSaveTemplate: vi.fn(),
      onRefitTemplate,
      partyTemplates: [{ id: "t1", name: "Line infantry", summary: "20x tier-2 line" }],
    }));
    (root.querySelector('[data-testid="party-refit-t1"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onRefitTemplate).toHaveBeenCalledWith("t1");
    const msg = root.querySelector('[data-testid="party-template-message"]');
    expect(msg?.textContent).toContain("recruit 5 and dismiss 2");
  });
});

describe("party ops: prisoner release and execute", () => {
  function partyWithPrisoners() {
    const p = party();
    p.prisoners = [{ troopId: "troop-bandit", name: "Bandits", count: 4, tier: 1 }];
    return p as typeof p;
  }

  it("release and execute buttons appear only when the caller can send them", () => {
    const withHandlers = partyPanel(options({ party: partyWithPrisoners(), onReleasePrisoner: vi.fn(), onExecutePrisoner: vi.fn() }));
    expect(withHandlers.querySelector('[data-testid="release-troop-bandit"]')).not.toBeNull();
    expect(withHandlers.querySelector('[data-testid="execute-troop-bandit"]')).not.toBeNull();
    const bare = partyPanel(options({ party: partyWithPrisoners() }));
    expect(bare.querySelector('[data-testid="release-troop-bandit"]')).toBeNull();
    expect(bare.querySelector('[data-testid="execute-troop-bandit"]')).toBeNull();
  });

  it("release prints the sim's line; a refusal lands verbatim and re-arms", async () => {
    const onReleasePrisoner = vi.fn().mockRejectedValue(new Error("No such prisoners held."));
    const root = partyPanel(options({ party: partyWithPrisoners(), onReleasePrisoner }));
    (root.querySelector('[data-testid="release-troop-bandit"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onReleasePrisoner).toHaveBeenCalledWith("troop-bandit");
    expect(root.querySelector('[data-testid="party-prisoner-message"]')?.textContent).toContain("No such prisoners held.");
    expect((root.querySelector('[data-testid="release-troop-bandit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("execute needs two presses, then prints the sim's line", async () => {
    const onExecutePrisoner = vi.fn().mockResolvedValue({ line: "4 Bandits die in the dirt. The next ones you face may run." });
    const root = partyPanel(options({ party: partyWithPrisoners(), onExecutePrisoner }));
    const btn = root.querySelector('[data-testid="execute-troop-bandit"]') as HTMLButtonElement;
    btn.click();
    expect(onExecutePrisoner).not.toHaveBeenCalled();
    expect(btn.textContent).toBe("Confirm");
    expect(root.querySelector('[data-testid="party-prisoner-message"]')?.textContent).toContain("cannot be undone");
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onExecutePrisoner).toHaveBeenCalledWith("troop-bandit");
    expect(root.querySelector('[data-testid="party-prisoner-message"]')?.textContent).toContain("die in the dirt");
    expect(btn.textContent).toBe("Execute");
    expect(btn.disabled).toBe(false);
  });

  it("a successful release prints the sim's line and re-arms the button", async () => {
    const onReleasePrisoner = vi.fn().mockResolvedValue({ line: "You cut 4 Bandits loose. Word travels. Their people notice." });
    const p = party();
    p.prisoners = [{ troopId: "troop-bandit", name: "Bandits", count: 4, tier: 1 }];
    const root = partyPanel(options({ party: p, onReleasePrisoner }));
    (root.querySelector('[data-testid="release-troop-bandit"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onReleasePrisoner).toHaveBeenCalledWith("troop-bandit");
    expect(root.querySelector('[data-testid="party-prisoner-message"]')?.textContent).toContain("Word travels");
    expect((root.querySelector('[data-testid="release-troop-bandit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("a branching tier answers with choices and re-posts the order with the branch id", async () => {
    const p = party();
    p.troops = [{ id: "s1", name: "Militia", count: 1, wounded: 0, tier: 2, wage: 3, quality: 3, morale: 0.8, xp: 500 }];
    const onUpgradeTroops = vi.fn()
      .mockResolvedValueOnce({
        upgraded: false,
        stackId: "s1",
        fromTier: 2,
        toTier: 2,
        xpSpent: 0,
        goldSpent: 0,
        reason: "Militia stand at a fork: choose their specialty.",
        branchChoices: [
          { id: "raider", name: "Raider", role: "Shock infantry — hits harder, breaks lines." },
          { id: "skirmisher", name: "Skirmisher", role: "Skirmish line — mobility over punch." },
        ],
        causedBy: "upgrade-branch-required",
      })
      .mockResolvedValueOnce({
        upgraded: true,
        stackId: "s1",
        fromTier: 2,
        toTier: 3,
        xpSpent: 120,
        goldSpent: 120,
        causedBy: "upgrade-applied",
      });
    const root = partyPanel(options({ party: p, onUpgradeTroops }));
    (root.querySelector('[data-testid="upgrade-s1"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onUpgradeTroops).toHaveBeenCalledWith("s1");
    expect(root.querySelector('[data-testid="branch-choices-s1"]')).not.toBeNull();
    expect(root.textContent).toContain("Raider");
    expect(root.textContent).toContain("Skirmisher");
    (root.querySelector('[data-testid="branch-s1-raider"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onUpgradeTroops).toHaveBeenCalledWith("s1", "raider");
    expect(root.textContent).toContain("trained up to tier 3 (Raider)");
  });
});
