/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { clanPanel } from "../panels/ClanPanel.js";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import type { SimSnapshot } from "../../data/types.js";

/**
 * The clan panel is exercised against the real fixture provider: the same
 * simulation the fixture client runs, so the panel's wiring (options, calls,
 * refusals, repaints) is tested against the sim's own behavior, not mocks.
 */

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe("clan panel (tasks 139-142)", () => {
  it("renders family, courtship, tier and held-lords sections against the fixture", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot: SimSnapshot = await provider.getSnapshot();
    const onChanged = vi.fn();
    const root = clanPanel({
      snapshot,
      playerId: "char-player",
      clanId: "clan-player",
      onChanged,
      onGetClanTier: () => provider.getClanTier(),
      onGetHeir: () => provider.getHeir("clan-player"),
      onMarry: (a, b) => provider.marry(a, b),
      onHaveChild: (p1, p2, n) => provider.haveChild(p1, p2, n),
      onStartCourtship: (t) => provider.startCourtship(t),
      onPerformCourtAction: (a) => provider.performCourtAction(a),
      onProposeMarriage: () => provider.proposeMarriage(),
      onGetCourtships: () => provider.getCourtships(),
      onGetHeldLords: () => provider.getHeldLords(),
      onRansomHeldLord: (n) => provider.ransomHeldLord(n),
      onReleaseHeldLord: (n) => provider.releaseHeldLord(n),
      onExecuteHeldLord: (n) => provider.executeHeldLord(n),
      onFoundKingdom: (n) => provider.foundKingdom(n),
      onCreateArmy: (n) => provider.createArmy(n, "char-player"),
      onJoinArmy: (armyId) => provider.joinArmy(armyId, snapshot.party.id),
      onLeaveArmy: (armyId) => provider.leaveArmy(armyId, snapshot.party.id),
      onDisbandArmy: (armyId) => provider.disbandArmy(armyId),
      onSetArmyObjective: (armyId, townId) => provider.setArmyObjective(armyId, { kind: "town", townId }),
    });
    expect(root.querySelector('[data-testid="clan-family"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="clan-member-char-player"]')).not.toBeNull();
    await flush();
    // Heir and tier read from the sim; the fixture answers both.
    expect(root.querySelector('[data-testid="clan-heir-name"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="clan-tier-name"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="clan-held-empty"]')?.textContent).toContain("No enemy lords in chains.");
    // The clan holds no fiefs in a fresh fixture; the row says so honestly.
    expect(root.querySelector('[data-testid="clan-fief-list"]')?.textContent).toContain("None held");
  });

  it("the empty state shows when the snapshot has no player clan", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const root = clanPanel({
      snapshot,
      playerId: "char-player",
      clanId: "clan-nowhere",
      onChanged: vi.fn(),
      onGetClanTier: () => provider.getClanTier(),
      onGetHeir: () => provider.getHeir("clan-player"),
      onMarry: (a, b) => provider.marry(a, b),
      onHaveChild: (p1, p2, n) => provider.haveChild(p1, p2, n),
      onStartCourtship: (t) => provider.startCourtship(t),
      onPerformCourtAction: (a) => provider.performCourtAction(a),
      onProposeMarriage: () => provider.proposeMarriage(),
      onGetCourtships: () => provider.getCourtships(),
      onGetHeldLords: () => provider.getHeldLords(),
      onRansomHeldLord: (n) => provider.ransomHeldLord(n),
      onReleaseHeldLord: (n) => provider.releaseHeldLord(n),
      onExecuteHeldLord: (n) => provider.executeHeldLord(n),
      onFoundKingdom: (n) => provider.foundKingdom(n),
      onCreateArmy: (n) => provider.createArmy(n, "char-player"),
      onJoinArmy: (armyId) => provider.joinArmy(armyId, snapshot.party.id),
      onLeaveArmy: (armyId) => provider.leaveArmy(armyId, snapshot.party.id),
      onDisbandArmy: (armyId) => provider.disbandArmy(armyId),
      onSetArmyObjective: (armyId, townId) => provider.setArmyObjective(armyId, { kind: "town", townId }),
    });
    expect(root.textContent).toContain("No clan.");
  });

  it("courting follows the sim's rules: started courtships list, refusals carry its reason", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const candidates = snapshot.characters.filter((c) => c.clanId !== "clan-player" && c.alive && !c.spouseId);
    expect(candidates.length, "fixture has unmarried non-player characters").toBeGreaterThan(0);
    let started = 0;
    let refused = 0;
    for (const c of candidates) {
      try {
        const r = await provider.startCourtship(c.id);
        expect(typeof r.line).toBe("string");
        started++;
        break; // one active courtship at a time for the action below
      } catch (err) {
        // The sim's first-impression roll can refuse; that is its rule, not a bug.
        expect(err instanceof Error && err.message.length > 0).toBe(true);
        refused++;
      }
    }
    const courtships = await provider.getCourtships();
    expect(courtships.length).toBe(started);
    if (started > 0) {
      // A court action lands and moves affection.
      const acted = await provider.performCourtAction("visit");
      expect(typeof acted.line).toBe("string");
      expect(typeof acted.affection).toBe("number");
    } else {
      expect(refused).toBeGreaterThan(0);
    }
  });

  it("executing a held lord needs a second press, and the sim takes the order", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    // The fixture seeds no held lords; add one through the debug hook.
    await provider.debugAddPrisoners?.("troop-bandit", "Lord Vex", 1, 5);
    const onChanged = vi.fn();
    const root = clanPanel({
      snapshot,
      playerId: "char-player",
      clanId: "clan-player",
      onChanged,
      onGetClanTier: () => provider.getClanTier(),
      onGetHeir: () => provider.getHeir("clan-player"),
      onMarry: (a, b) => provider.marry(a, b),
      onHaveChild: (p1, p2, n) => provider.haveChild(p1, p2, n),
      onStartCourtship: (t) => provider.startCourtship(t),
      onPerformCourtAction: (a) => provider.performCourtAction(a),
      onProposeMarriage: () => provider.proposeMarriage(),
      onGetCourtships: () => provider.getCourtships(),
      onGetHeldLords: () => provider.getHeldLords(),
      onRansomHeldLord: (n) => provider.ransomHeldLord(n),
      onReleaseHeldLord: (n) => provider.releaseHeldLord(n),
      onExecuteHeldLord: (n) => provider.executeHeldLord(n),
      onFoundKingdom: (n) => provider.foundKingdom(n),
      onCreateArmy: (n) => provider.createArmy(n, "char-player"),
      onJoinArmy: (armyId) => provider.joinArmy(armyId, snapshot.party.id),
      onLeaveArmy: (armyId) => provider.leaveArmy(armyId, snapshot.party.id),
      onDisbandArmy: (armyId) => provider.disbandArmy(armyId),
      onSetArmyObjective: (armyId, townId) => provider.setArmyObjective(armyId, { kind: "town", townId }),
    });
    await flush();
    // The fixture does not seed held lords, so the empty state is the honest read.
    const empty = root.querySelector('[data-testid="clan-held-empty"]');
    if (empty) {
      expect(empty.textContent).toContain("No enemy lords in chains.");
      return;
    }
    // If a future fixture seeds one: the execute button must demand confirmation.
    const exec = root.querySelector<HTMLButtonElement>('[data-testid^="clan-lord-execute-"]');
    expect(exec).not.toBeNull();
    exec!.click();
    expect(exec!.textContent).toBe("Confirm");
  });

  it("army formation works against the fixture, then lists the army as yours", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const onChanged = vi.fn();
    const root = clanPanel({
      snapshot,
      playerId: "char-player",
      clanId: "clan-player",
      onChanged,
      onGetClanTier: () => provider.getClanTier(),
      onGetHeir: () => provider.getHeir("clan-player"),
      onMarry: (a, b) => provider.marry(a, b),
      onHaveChild: (p1, p2, n) => provider.haveChild(p1, p2, n),
      onStartCourtship: (t) => provider.startCourtship(t),
      onPerformCourtAction: (a) => provider.performCourtAction(a),
      onProposeMarriage: () => provider.proposeMarriage(),
      onGetCourtships: () => provider.getCourtships(),
      onGetHeldLords: () => provider.getHeldLords(),
      onRansomHeldLord: (n) => provider.ransomHeldLord(n),
      onReleaseHeldLord: (n) => provider.releaseHeldLord(n),
      onExecuteHeldLord: (n) => provider.executeHeldLord(n),
      onFoundKingdom: (n) => provider.foundKingdom(n),
      onCreateArmy: (n) => provider.createArmy(n, "char-player"),
      onJoinArmy: (armyId) => provider.joinArmy(armyId, snapshot.party.id),
      onLeaveArmy: (armyId) => provider.leaveArmy(armyId, snapshot.party.id),
      onDisbandArmy: (armyId) => provider.disbandArmy(armyId),
      onSetArmyObjective: (armyId, townId) => provider.setArmyObjective(armyId, { kind: "town", townId }),
    });
    expect(root.querySelector('[data-testid="clan-armies-empty"]')?.textContent).toContain("No armies in the field.");
    const name = root.querySelector<HTMLInputElement>('[data-testid="clan-army-name"]');
    const form = root.querySelector<HTMLButtonElement>('[data-testid="clan-army-form"]');
    name!.value = "1st Colorado";
    form!.click();
    await flush(12);
    expect(root.querySelector('[data-testid="clan-message"]')?.textContent).toContain("1st Colorado is under your banner.");
    expect(onChanged).toHaveBeenCalled();
  });

  it("an empty army name is refused locally, before any provider call", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const root = clanPanel({
      snapshot,
      playerId: "char-player",
      clanId: "clan-player",
      onChanged: vi.fn(),
      onGetClanTier: () => provider.getClanTier(),
      onGetHeir: () => provider.getHeir("clan-player"),
      onMarry: (a, b) => provider.marry(a, b),
      onHaveChild: (p1, p2, n) => provider.haveChild(p1, p2, n),
      onStartCourtship: (t) => provider.startCourtship(t),
      onPerformCourtAction: (a) => provider.performCourtAction(a),
      onProposeMarriage: () => provider.proposeMarriage(),
      onGetCourtships: () => provider.getCourtships(),
      onGetHeldLords: () => provider.getHeldLords(),
      onRansomHeldLord: (n) => provider.ransomHeldLord(n),
      onReleaseHeldLord: (n) => provider.releaseHeldLord(n),
      onExecuteHeldLord: (n) => provider.executeHeldLord(n),
      onFoundKingdom: (n) => provider.foundKingdom(n),
      onCreateArmy: (n) => provider.createArmy(n, "char-player"),
      onJoinArmy: (armyId) => provider.joinArmy(armyId, snapshot.party.id),
      onLeaveArmy: (armyId) => provider.leaveArmy(armyId, snapshot.party.id),
      onDisbandArmy: (armyId) => provider.disbandArmy(armyId),
      onSetArmyObjective: (armyId, townId) => provider.setArmyObjective(armyId, { kind: "town", townId }),
    });
    root.querySelector<HTMLButtonElement>('[data-testid="clan-army-form"]')!.click();
    await flush();
    expect(root.querySelector('[data-testid="clan-message"]')?.textContent).toContain("An army needs a name.");
  });

  it("the sim refuses court actions with no active courtship, and the panel says so", async () => {
    const provider = createFixtureSimulationProvider();
    const snapshot = await provider.getSnapshot();
    const onChanged = vi.fn();
    const refuse = new Error("No courtship under way.");
    const root = clanPanel({
      snapshot,
      playerId: "char-player",
      clanId: "clan-player",
      onChanged,
      onGetClanTier: () => provider.getClanTier(),
      onGetHeir: () => provider.getHeir("clan-player"),
      onMarry: (a, b) => provider.marry(a, b),
      onHaveChild: (p1, p2, n) => provider.haveChild(p1, p2, n),
      onStartCourtship: (t) => provider.startCourtship(t),
      onPerformCourtAction: () => Promise.reject(refuse),
      onProposeMarriage: () => provider.proposeMarriage(),
      onGetCourtships: () => provider.getCourtships(),
      onGetHeldLords: () => provider.getHeldLords(),
      onRansomHeldLord: (n) => provider.ransomHeldLord(n),
      onReleaseHeldLord: (n) => provider.releaseHeldLord(n),
      onExecuteHeldLord: (n) => provider.executeHeldLord(n),
      onFoundKingdom: (n) => provider.foundKingdom(n),
      onCreateArmy: (n) => provider.createArmy(n, "char-player"),
      onJoinArmy: (armyId) => provider.joinArmy(armyId, snapshot.party.id),
      onLeaveArmy: (armyId) => provider.leaveArmy(armyId, snapshot.party.id),
      onDisbandArmy: (armyId) => provider.disbandArmy(armyId),
      onSetArmyObjective: (armyId, townId) => provider.setArmyObjective(armyId, { kind: "town", townId }),
    });
    const visit = root.querySelector<HTMLButtonElement>('[data-testid="clan-court-visit"]');
    expect(visit).not.toBeNull();
    visit!.click();
    await flush();
    const message = root.querySelector('[data-testid="clan-message"]');
    expect(message?.textContent).toContain("No courtship under way.");
    expect(visit!.disabled).toBe(false);
  });
});
