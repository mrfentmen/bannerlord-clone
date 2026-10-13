/**
 * Companion tests: recruitment, role assignment, skill effects.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("companions", () => {
  it("lists companion candidates at game start", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const snap = await provider.getSnapshot();
    const companions = snap.characters.filter((c) => c.role === "companion");
    expect(companions.length).toBeGreaterThan(0);
    // All start clanless
    for (const c of companions) {
      expect(c.clanId).toBe("");
    }
  });

  it("recruits a companion into the player's clan", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const candidate = before.characters.find((c) => c.role === "companion")!;
    const moneyBefore = before.party.money;

    await provider.recruitCompanion(candidate.id);

    const after = await provider.getSnapshot();
    const recruited = after.characters.find((c) => c.id === candidate.id)!;
    expect(recruited.clanId).toBe("clan-player");
    expect(recruited.factionId).toBe(before.player.factionId);
    expect(after.party.money).toBe(moneyBefore - 500);

    const clan = after.clans.find((c) => c.id === "clan-player")!;
    expect(clan.memberIds).toContain(candidate.id);
  });

  it("rejects recruiting a non-companion", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await expect(provider.recruitCompanion("char-player")).rejects.toThrow();
  });

  it("seats the wandering heroes in the tavern with the terms the hire order bills", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const roster = await provider.tavernCompanions("t1");
    expect(roster.length).toBeGreaterThan(0);
    for (const comp of roster) {
      expect(comp.id).toMatch(/^comp-/);
      expect(comp.backstory.length).toBeGreaterThan(0);
      expect(comp.wageDaily).toBeGreaterThan(0);
      expect(comp.recruitKind).toBe("gold");
      expect(comp.recruitValue).toBe(500);
      expect(comp.available).toBe(true);
    }
  });

  it("empties the tavern roster once a companion signs on", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const rosterBefore = await provider.tavernCompanions("t1");
    const candidate = rosterBefore[0]!;

    await provider.recruitCompanion(candidate.id);

    const rosterAfter = await provider.tavernCompanions("t1");
    expect(rosterAfter.some((c) => c.id === candidate.id)).toBe(false);
    expect(rosterAfter.length).toBe(rosterBefore.length - 1);
  });

  it("rejects double recruitment", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const candidate = before.characters.find((c) => c.role === "companion")!;
    await provider.recruitCompanion(candidate.id);
    await expect(provider.recruitCompanion(candidate.id)).rejects.toThrow();
  });

  it("assigns a companion to a party role", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const candidate = before.characters.find((c) => c.role === "companion")!;
    await provider.recruitCompanion(candidate.id);

    await provider.assignPartyRole(candidate.id, "surgeon");

    const after = await provider.getSnapshot();
    expect(after.party.roles.surgeon).toBe(candidate.id);
  });

  it("unassigns a companion from a role", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const candidate = before.characters.find((c) => c.role === "companion")!;
    await provider.recruitCompanion(candidate.id);
    await provider.assignPartyRole(candidate.id, "quartermaster");

    await provider.assignPartyRole(candidate.id, null);

    const after = await provider.getSnapshot();
    expect(after.party.roles.quartermaster).toBeUndefined();
  });

  it("rejects assigning a non-clan member", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const candidate = before.characters.find((c) => c.role === "companion")!;
    // Not recruited yet — should fail
    await expect(provider.assignPartyRole(candidate.id, "scout")).rejects.toThrow();
  });

  it("persists companions through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const candidate = before.characters.find((c) => c.role === "companion")!;
    await provider.recruitCompanion(candidate.id);

    const withCompanion = await provider.getSnapshot();
    expect(withCompanion.characters.find((c) => c.id === candidate.id)!.clanId).toBe("clan-player");

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.characters.find((c) => c.id === candidate.id)!.clanId).toBe("");
  });
});
