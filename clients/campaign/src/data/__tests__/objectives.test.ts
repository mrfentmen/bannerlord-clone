/**
 * The objectives panel (mandate §12).
 *
 * Each objective shows its title, what to do, and a progress gauge — or a completed
 * mark for finished ones. The numbers are the live evaluation, re-read from the world
 * every time the panel opens.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  evaluateObjectives,
  loadObjectiveStore,
  saveObjectiveStore,
  type ObjectiveInput,
} from "../objectives.js";
import { createFixtureSimulationProvider } from "../fixture/index.js";
import type { PartyState, SimSnapshot } from "../types.js";

let snapshot: SimSnapshot;

beforeAll(async () => {
  const provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
});

function input(overrides: Partial<ObjectiveInput> = {}): ObjectiveInput {
  return {
    party: snapshot.party,
    visitedSettlementIds: new Set<string>(),
    notifications: snapshot.notifications,
    ...overrides,
  };
}

describe("evaluateObjectives", () => {
  it("measures troops, money, visits and battle wins from real state", () => {
    const objectives = evaluateObjectives(input(), new Set());
    const byId = new Map(objectives.map((o) => [o.id, o] as const));
    const troops = snapshot.party.troops.reduce((s, t) => s + t.count, 0);
    expect(byId.get("muster")!.progress).toBe(Math.min(troops, 10));
    expect(byId.get("war-chest")!.progress).toBe(
      Math.min(Math.max(0, Math.floor(snapshot.party.money)), 1000),
    );
    expect(byId.get("scout-region")!.progress).toBe(0);
  });

  it("counts a battle win from the simulation's own notifications", () => {
    const party: PartyState = { ...snapshot.party, factionId: "side-7" };
    const win = {
      id: "notif-win",
      day: 3,
      priority: "critical" as const,
      text: "side-7 won",
      entityId: "town-1",
      field: null,
      kind: "battle",
      winnerSide: 7,
      loserSide: 2,
    };
    const objectives = evaluateObjectives(input({ party, notifications: [win] }), new Set());
    expect(objectives.find((o) => o.id === "first-blood")!.completed).toBe(true);
  });

  it("does not credit a battle the player's side lost", () => {
    const party: PartyState = { ...snapshot.party, factionId: "side-7" };
    const loss = {
      id: "notif-loss",
      day: 3,
      priority: "critical" as const,
      text: "side-7 lost",
      entityId: "town-1",
      field: null,
      kind: "battle",
      winnerSide: 2,
      loserSide: 7,
    };
    const objectives = evaluateObjectives(input({ party, notifications: [loss] }), new Set());
    expect(objectives.find((o) => o.id === "first-blood")!.completed).toBe(false);
  });

  it("keeps completed objectives done even when the numbers drop", () => {
    const poor: PartyState = { ...snapshot.party, money: 0, troops: [] };
    const objectives = evaluateObjectives(input({ party: poor }), new Set(["muster", "war-chest"]));
    expect(objectives.find((o) => o.id === "muster")!.completed).toBe(true);
    expect(objectives.find((o) => o.id === "war-chest")!.completed).toBe(true);
    expect(objectives.find((o) => o.id === "war-chest")!.progress).toBe(0);
  });

  it("completes scouting after three different settlements", () => {
    const objectives = evaluateObjectives(
      input({ visitedSettlementIds: new Set(["a", "b", "c"]) }),
      new Set(),
    );
    const scout = objectives.find((o) => o.id === "scout-region")!;
    expect(scout.progress).toBe(3);
    expect(scout.completed).toBe(true);
  });
});

describe("objective store", () => {
  it("round-trips through localStorage and survives corruption", () => {
    localStorage.clear();
    expect(loadObjectiveStore().visited.size).toBe(0);
    saveObjectiveStore({ visited: new Set(["s1"]), completed: new Set(["muster"]) });
    const loaded = loadObjectiveStore();
    expect(loaded.visited.has("s1")).toBe(true);
    expect(loaded.completed.has("muster")).toBe(true);
    localStorage.setItem("blc-objectives-v1", "not json{{{");
    expect(loadObjectiveStore().visited.size).toBe(0);
    localStorage.clear();
  });
});
