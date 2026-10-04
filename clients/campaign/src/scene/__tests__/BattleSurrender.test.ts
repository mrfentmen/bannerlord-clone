/**
 * Surrender end-condition — a surrendered unit is alive and has not fled,
 * so the old end check (`alive && !hasFled`) would soft-lock the battle on
 * mass surrender. These tests drive real UnitBrains through the real
 * update() via a prototype harness (BattleLoop.create needs GLBs).
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import { BattleLoop, type BattleResult } from "../BattleLoop.js";
import { UnitBrain, type SoldierLike } from "../battleUnit.js";

function fakeSoldier(x = 0, z = 0): SoldierLike {
  return {
    root: { position: new Vector3(x, 0, z), rotation: { y: 0 } },
    alive: true,
    damage() {},
  };
}

/** Build a BattleLoop around pre-made brains without loading GLBs. */
function harness(brains: UnitBrain[], onEnd?: (r: BattleResult) => void): BattleLoop {
  const loop = Object.create(BattleLoop.prototype) as BattleLoop;
  const priv = loop as unknown as Record<string, unknown>;
  priv["brains"] = brains;
  priv["soldiers"] = [];
  priv["onEnd"] = onEnd;
  priv["morale"] = null; // no MoraleSystem: brains keep their set morale
  priv["battle"] = null;
  priv["cullDistance"] = Infinity;
  priv["tickCount"] = 0;
  priv["elapsed"] = 0;
  priv["ended"] = false;
  priv["disposed"] = false;
  return loop;
}

const dt = 1 / 60;

describe("BattleLoop surrender", () => {
  it("ends the battle when the last enemies surrender", () => {
    const p = new UnitBrain(fakeSoldier(0, 0), 0);
    const e = new UnitBrain(fakeSoldier(60, 0), 1);
    let result: BattleResult | null = null;
    const loop = harness([p, e], (r) => {
      result = r;
    });
    e.surrender();
    expect(e.isSurrendered).toBe(true);
    loop.update(dt);
    expect(loop.isEnded).toBe(true);
    expect(result).not.toBe(null);
    expect(result!.victory).toBe(true);
    expect(result!.enemySurrendered).toBe(1);
    expect(result!.enemyCasualties).toBe(0);
    expect(result!.playerSurrendered).toBe(0);
  });

  it("does not end while surrendered enemies still have fighting allies", () => {
    const p = new UnitBrain(fakeSoldier(0, 0), 0);
    const e1 = new UnitBrain(fakeSoldier(60, 0), 1);
    const e2 = new UnitBrain(fakeSoldier(65, 0), 1);
    const loop = harness([p, e1, e2]);
    e1.surrender();
    loop.update(dt);
    expect(loop.isEnded).toBe(false);
  });

  it("averageMorale reads 0-100 across a team's living brains", () => {
    const a = new UnitBrain(fakeSoldier(0, 0), 0);
    const b = new UnitBrain(fakeSoldier(3, 0), 0);
    const loop = harness([a, b]);
    expect(loop.averageMorale(0)).toBe(100);
    a.morale = 0.5;
    expect(loop.averageMorale(0)).toBe(75);
    expect(loop.averageMorale(1)).toBe(0);
  });

  it("countState counts brains by state", () => {
    const a = new UnitBrain(fakeSoldier(0, 0), 0);
    const e = new UnitBrain(fakeSoldier(60, 0), 1);
    const loop = harness([a, e]);
    expect(loop.countState(1, "idle")).toBe(1);
    e.surrender();
    expect(loop.countState(1, "surrendered")).toBe(1);
    expect(loop.countState(1, "idle")).toBe(0);
  });
});
