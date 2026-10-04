/**
 * UnitBrain tests — the state machine from `unit_base.gd`, driven with fake
 * soldiers (no Scene needed). Verifies: acquire → engage → attack → die,
 * command transitions, retargeting, and that the loop's end condition is
 * reachable.
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import { INFANTRY_STATS, UnitBrain, type SoldierLike } from "../battleUnit.js";

function fakeSoldier(x = 0, z = 0, health = 100): SoldierLike & { health: number } {
  const s = {
    root: { position: new Vector3(x, 0, z), rotation: { y: 0 } },
    health,
    get alive() {
      return this.health > 0;
    },
    damage(amount: number) {
      this.health = Math.max(0, this.health - amount);
    },
  };
  return s;
}

const dt = 1 / 60;

describe("UnitBrain", () => {
  it("idles with no enemies around", () => {
    const brain = new UnitBrain(fakeSoldier(), 0);
    brain.update(dt, []);
    expect(brain.state).toBe("idle");
  });

  it("acquires an enemy in range and engages", () => {
    const brain = new UnitBrain(fakeSoldier(0, 0), 0);
    const enemy = new UnitBrain(fakeSoldier(10, 0), 1);
    brain.update(dt, [enemy]);
    expect(brain.state).toBe("engaging");
  });

  it("ignores enemies outside acquire range and same-team units", () => {
    const brain = new UnitBrain(fakeSoldier(0, 0), 0);
    const far = new UnitBrain(fakeSoldier(500, 0), 1);
    const friend = new UnitBrain(fakeSoldier(5, 0), 0);
    brain.update(dt, [far, friend]);
    expect(brain.state).toBe("idle");
  });

  it("walks a move order to completion", () => {
    const brain = new UnitBrain(fakeSoldier(0, 0), 0);
    brain.commandMoveTo(new Vector3(10, 0, 0));
    expect(brain.state).toBe("moving");
    for (let i = 0; i < 600 && brain.state === "moving"; i++) brain.update(dt, []);
    expect(brain.state).toBe("idle");
    expect(brain.position.x).toBeCloseTo(10, 0);
  });

  it("attack-move interrupts for a spotted enemy, then attacks in range", () => {
    const brain = new UnitBrain(fakeSoldier(0, 0), 0);
    const enemy = new UnitBrain(fakeSoldier(15, 0), 1);
    brain.commandAttackMove(new Vector3(100, 0, 0));
    brain.update(dt, [enemy]);
    expect(brain.state).toBe("engaging");
    // let it close and fight
    for (let i = 0; i < 1200 && enemy.alive; i++) {
      brain.update(dt, [enemy]);
      enemy.update(dt, [brain]);
    }
    expect(brain.state).toBe("attacking");
    expect(enemy.alive).toBe(false);
  });

  it("deals damage on the attack cooldown and kills", () => {
    const stats = { ...INFANTRY_STATS, damage: 50, attackCooldown: 0.1 };
    const brain = new UnitBrain(fakeSoldier(0, 0), 0, stats);
    const enemySoldier = fakeSoldier(1, 0, 100);
    const enemy = new UnitBrain(enemySoldier, 1, stats);
    brain.commandEngage(enemy);
    for (let i = 0; i < 600 && enemy.alive; i++) {
      brain.update(dt, [enemy]);
      enemy.update(dt, [brain]);
    }
    expect(enemy.alive).toBe(false);
    expect(enemy.state).toBe("dead");
    expect(enemySoldier.health).toBe(0);
  });

  it("retargets when its mark dies mid-engage", () => {
    const brain = new UnitBrain(fakeSoldier(0, 0), 0);
    const dying = new UnitBrain(fakeSoldier(5, 0, 1), 1);
    const other = new UnitBrain(fakeSoldier(8, 0), 1);
    // kill the first mark outright
    dying.soldier.damage(1000);
    brain.commandEngage(dying);
    brain.update(dt, [dying, other]);
    // should not be stuck engaging a corpse
    expect(brain.state === "engaging" || brain.state === "attacking").toBe(true);
  });

  it("a dead brain stays dead and never acts", () => {
    const soldier = fakeSoldier(0, 0, 10);
    const brain = new UnitBrain(soldier, 0);
    const enemy = new UnitBrain(fakeSoldier(5, 0), 1);
    soldier.damage(1000);
    brain.update(dt, [enemy]);
    expect(brain.state).toBe("dead");
    const pos = brain.position.clone();
    brain.update(dt, [enemy]);
    expect(brain.position.equals(pos)).toBe(true);
  });

  it("full skirmish: two brains fight until one dies", () => {
    const stats = { ...INFANTRY_STATS, damage: 25, attackCooldown: 0.2, moveSpeed: 6 };
    const a = new UnitBrain(fakeSoldier(-10, 0), 0, stats);
    const b = new UnitBrain(fakeSoldier(10, 0), 1, stats);
    a.commandAttackMove(new Vector3(10, 0, 0));
    b.commandAttackMove(new Vector3(-10, 0, 0));
    let frames = 0;
    while (a.alive && b.alive && frames < 3600) {
      a.update(dt, [b]);
      b.update(dt, [a]);
      frames++;
    }
    expect(a.alive !== b.alive).toBe(true);
    expect(frames).toBeLessThan(3600);
  });
});
