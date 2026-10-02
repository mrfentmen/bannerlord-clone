/**
 * @vitest-environment jsdom
 *
 * Battle-end aftermath wiring (integration): endBattle() records a war
 * story when the battle was memorable, tracks the enemy commander as a
 * rival, compares against the previous battle, and appraises the loot.
 * The after-action view exposes all of it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  BattleFlow,
  type BattleApi,
  type Encounter,
  type EncounterSide,
} from "../index";

const attacker: EncounterSide = { partyId: 1, name: "Player Warband", troops: 100, power: 120 };
const defender: EncounterSide = { partyId: 2, name: "Rival Gang", troops: 80, power: 70 };

let encounterSeq = 0;
function encounter(): Encounter {
  encounterSeq += 1;
  return { id: `enc-${encounterSeq}`, attacker, defender, status: "pending" };
}

function apiWith(attackerLosses: number, defenderLosses: number, loot: number): BattleApi {
  const fail = () => Promise.reject(new Error("not used"));
  return {
    createEncounter: async () => encounter(),
    listEncounters: async () => [encounter()],
    getEncounter: async () => encounter(),
    resolveEncounter: async () => ({
      ...encounter(),
      status: "resolved" as const,
      resolution: { winnerPartyId: 1, attackerLosses, defenderLosses, loot },
    }),
    startBattle: fail,
    getBattle: fail,
    submitOrders: fail,
    endBattle: fail,
  };
}

const localSource = { describeEncounter: () => ({ attacker, defender }) };

beforeEach(() => localStorage.clear());

describe("battle-end aftermath (integration)", () => {
  it("records rival, loot appraisal, and a war story for a costly victory", async () => {
    const flow = new BattleFlow(apiWith(30, 20, 150), localSource, 1);
    await flow.begin(1, 2);
    await flow.autoResolve();
    const after = flow.afterActionView()!;
    const { aftermath } = after;
    // Enemy survived (80 - 20 = 60 troops left): tracked as an escaped rival.
    expect(aftermath.rivalLine).toContain("Rival Gang");
    expect(aftermath.rivalLine).toContain("escaped");
    // Loot appraised.
    expect(aftermath.lootAppraisal).toContain("150");
    // Costly victory (30 of ours for 20 of theirs) is memorable.
    expect(aftermath.warStory).not.toBeNull();
    expect(aftermath.warStory!).toContain("Rival Gang");
  });

  it("skips the war story for a routine victory", async () => {
    const flow = new BattleFlow(apiWith(12, 36, 200), localSource, 1);
    await flow.begin(1, 2);
    await flow.autoResolve();
    const after = flow.afterActionView()!;
    expect(after.aftermath.warStory).toBeNull();
    expect(after.aftermath.rivalLine).toContain("Rival Gang");
  });

  it("compares the second battle against the first", async () => {
    const mk = () =>
      new BattleFlow(apiWith(12, 36, 200), localSource, 1);
    const first = mk();
    await first.begin(1, 2);
    await first.autoResolve();
    expect(first.afterActionView()!.aftermath.comparison).toBeNull();

    const second = mk();
    await second.begin(1, 2);
    await second.autoResolve();
    const cmp = second.afterActionView()!.aftermath.comparison;
    expect(cmp).not.toBeNull();
    expect(cmp!.deltas).toHaveLength(4);
    expect(cmp!.verdict.length).toBeGreaterThan(0);
  });

  it("marks the rival defeated when the enemy is wiped out", async () => {
    const flow = new BattleFlow(apiWith(10, 80, 300), localSource, 1);
    await flow.begin(1, 2);
    await flow.autoResolve();
    expect(flow.afterActionView()!.aftermath.rivalLine).toContain("defeated");
  });
});
