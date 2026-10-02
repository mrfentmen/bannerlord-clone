/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  assignClanRole,
  clanLoyaltyAlerts,
  clearClanStore,
  influenceCompanion,
  loadClanStore,
  roleAssignments,
  setRuler,
  unassignClanRole,
  upsertCompanion,
  upsertMember,
  type ClanStore,
} from "../store.js";
import type { ClanMember, Companion } from "../types.js";

const member = (id: string): ClanMember => ({
  id,
  name: id === "m1" ? "Del" : "Ava",
  gender: "m",
  birthYear: 990,
  traits: [],
  skills: { stewardship: 80, scouting: 40 },
});

const companion = (id: string, loyalty: number): Companion => ({
  ...member(id),
  loyalty,
});

beforeEach(() => {
  localStorage.clear();
  clearClanStore();
});

describe("clan store (integration)", () => {
  it("persists members and companions", () => {
    upsertMember(member("m1"));
    upsertCompanion(companion("c1", 50));
    const store: ClanStore = loadClanStore();
    expect(store.members).toHaveLength(1);
    expect(store.companions).toHaveLength(1);
    // Survives a fresh load (new object, same bytes).
    expect(loadClanStore().members[0]!.name).toBe("Del");
  });

  it("replaces on duplicate id", () => {
    upsertMember(member("m1"));
    upsertMember({ ...member("m1"), name: "Renamed" });
    expect(loadClanStore().members).toHaveLength(1);
    expect(loadClanStore().members[0]!.name).toBe("Renamed");
  });

  it("persists loyalty influence", () => {
    upsertCompanion(companion("c1", 50));
    const updated = influenceCompanion("c1", "gift");
    expect(updated).not.toBeNull();
    expect(updated!.loyalty).toBeGreaterThan(50);
    expect(loadClanStore().companions[0]!.loyalty).toBe(updated!.loyalty);
  });

  it("returns null for unknown companions", () => {
    expect(influenceCompanion("ghost", "gift")).toBeNull();
  });

  it("surfaces loyalty alerts, most urgent first", () => {
    upsertCompanion(companion("c1", 10));
    upsertCompanion(companion("c2", 25));
    upsertCompanion(companion("c3", 90));
    const alerts = clanLoyaltyAlerts();
    expect(alerts.map((a) => a.companion.id)).toEqual(["c1", "c2"]);
  });

  it("persists role assignments with bonuses", () => {
    upsertMember(member("m1"));
    expect(assignClanRole("m1", "steward")).toBe(true);
    const assignments = roleAssignments();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]!.memberId).toBe("m1");
    expect(assignments[0]!.bonus).toContain("%");
    // Vacating persists too.
    unassignClanRole("steward");
    expect(roleAssignments()).toHaveLength(0);
  });

  it("refuses roles for unknown members", () => {
    expect(assignClanRole("ghost", "scout")).toBe(false);
  });

  it("names a ruler for succession previews", () => {
    upsertMember(member("m1"));
    setRuler("m1");
    expect(loadClanStore().rulerId).toBe("m1");
    setRuler("ghost");
    expect(loadClanStore().rulerId).toBe("m1");
  });

  it("drops office holders whose member is gone", () => {
    upsertMember(member("m1"));
    assignClanRole("m1", "scout");
    // Simulate the member leaving the roster: rewrite storage without them.
    const raw = JSON.parse(localStorage.getItem("campaign.clan-store.v1")!) as ClanStore;
    raw.members = [];
    localStorage.setItem("campaign.clan-store.v1", JSON.stringify(raw));
    expect(roleAssignments()).toHaveLength(0);
  });
});
