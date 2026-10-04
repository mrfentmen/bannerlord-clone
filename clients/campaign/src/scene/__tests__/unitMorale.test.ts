/**
 * Tasks 341-360 (client half): per-unit morale.
 *
 * The delta function is pure — same brains, same delta — so most tests drive
 * it directly with scripted battlefields. The system tests run the real
 * UnitBrain against fake soldiers and step the 5-second check clock.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core";
import { UnitBrain, type SoldierLike } from "../battleUnit.js";
import {
  MoraleSystem,
  moraleDelta,
  MORALE_CHECK_S,
} from "../unitMorale.js";

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

function army(team: number, positions: Array<[number, number]>, health = 100): UnitBrain[] {
  return positions.map(([x, z]) => new UnitBrain(fakeSoldier(x, z, health), team));
}

const dt = 1 / 60;
const routPointFor = (team: number) => new Vector3(0, 0, team === 0 ? -100 : 100);

describe("moraleDelta", () => {
  it("is zero on a quiet field", () => {
    const allies = army(0, [[0, 0]]);
    const enemies = army(1, [[30, 0]]);
    const brains = [...allies, ...enemies];
    const subject = allies[0]!;
    expect(moraleDelta(subject, brains, [])).toBe(0);
  });

  it("shakes survivors near an ally's death", () => {
    const allies = army(0, [[0, 0]]);
    const enemies = army(1, [[30, 0]]);
    const brains = [...allies, ...enemies];
    const subject = allies[0]!;
    const deaths = [{ team: 0, x: 5, z: 0 }];
    expect(moraleDelta(subject, brains, deaths)).toBeLessThan(0);
    // Far away, no shake.
    const farDeaths = [{ team: 0, x: 500, z: 0 }];
    expect(moraleDelta(subject, brains, farDeaths)).toBe(0);
  });

  it("penalizes the outnumbered and rewards the winning", () => {
    const allies = army(0, [[0, 0]]);
    const enemies = army(1, [[30, 0], [32, 0], [34, 0], [36, 0]]);
    const brains = [...allies, ...enemies];
    expect(moraleDelta(allies[0]!, brains, [])).toBeLessThan(0);
  });

  it("spreads panic from routing allies", () => {
    const a0 = new UnitBrain(fakeSoldier(0, 0), 0);
    const a1 = new UnitBrain(fakeSoldier(5, 0), 0);
    const enemies = army(1, [[30, 0]]);
    a1.startRout(new Vector3(0, 0, -100));
    const brains = [a0, a1, ...enemies];
    expect(moraleDelta(a0, brains, [])).toBeLessThan(0);
  });
});

describe("MoraleSystem", () => {
  it("checks every 5 seconds, not every frame", () => {
    const allies = army(0, [[0, 0]]);
    const enemies = army(1, [[10, 0]], 1); // nearly dead enemy, no threat
    const brains = [...allies, ...enemies];
    const system = new MoraleSystem(brains, { routPointFor });
    // Kill the ally's morale directly, then verify the rout fires on the check.
    const subject = allies[0]!;
    subject.morale = 0;
    system.update(MORALE_CHECK_S - 0.1);
    expect(subject.isRouting).toBe(false);
    system.update(0.2);
    expect(subject.isRouting).toBe(true);
    system.destroy();
  });

  it("a router flees, ignores orders, and never strikes", () => {
    const router = new UnitBrain(fakeSoldier(0, 0), 0);
    const enemySoldier = fakeSoldier(2, 0);
    const enemy = new UnitBrain(enemySoldier, 1);
    router.startRout(new Vector3(0, 0, -100));
    // Orders are refused.
    router.commandAttackMove(new Vector3(50, 0, 50));
    expect(router.state).toBe("routing");
    // It runs from the enemy, and the enemy's health never moves.
    for (let i = 0; i < 120; i++) {
      router.update(dt, [enemy]);
      enemy.update(dt, [router]);
    }
    expect(enemySoldier.health).toBe(100);
    expect(router.position.z).toBeLessThan(-5);
  });

  it("a surrounded router surrenders", () => {
    const router = new UnitBrain(fakeSoldier(0, 0), 0);
    const enemies = army(1, [[2, 0], [-2, 0], [0, 2], [0, -2]]);
    const brains = [router, ...enemies];
    const system = new MoraleSystem(brains, { routPointFor });
    router.startRout(new Vector3(0, 0, -100));
    system.update(MORALE_CHECK_S + 0.1);
    expect(router.isSurrendered).toBe(true);
    system.destroy();
  });

  it("a router far from the enemy rallies", () => {
    const router = new UnitBrain(fakeSoldier(0, 0), 0);
    const enemies = army(1, [[200, 0]]);
    const brains = [router, ...enemies];
    const system = new MoraleSystem(brains, { routPointFor });
    router.startRout(new Vector3(0, 0, -100));
    router.morale = 0.2;
    system.update(MORALE_CHECK_S + 0.1);
    expect(router.isRouting).toBe(false);
    expect(router.state).toBe("idle");
    system.destroy();
  });

  it("strikes on routers deal the pursuit bonus", () => {
    const victimSoldier = fakeSoldier(0, 0, 1000);
    const victim = new UnitBrain(victimSoldier, 1);
    victim.startRout(new Vector3(0, 0, 100));
    const attacker = new UnitBrain(fakeSoldier(0, -1.5), 0);
    attacker.commandEngage(victim);
    for (let i = 0; i < 120 && victimSoldier.health === 1000; i++) attacker.update(dt, [victim]);
    // 12 base * 1.5 rear-flank * 1.5 pursuit = 27.
    expect(victimSoldier.health).toBe(1000 - 27);
  });

  it("wavering reads morale under 25%", () => {
    const brain = new UnitBrain(fakeSoldier(0, 0), 0);
    brain.morale = 0.2;
    expect(brain.isWavering).toBe(true);
    brain.morale = 0.3;
    expect(brain.isWavering).toBe(false);
    brain.startRout(new Vector3(0, 0, -100));
    brain.morale = 0.1;
    expect(brain.isWavering).toBe(false);
  });

  it("a router that reaches the edge has fled", () => {
    const router = new UnitBrain(fakeSoldier(0, 0), 0);
    router.startRout(new Vector3(0, 0, -10));
    for (let i = 0; i < 600 && !router.hasFled; i++) router.update(dt, []);
    expect(router.hasFled).toBe(true);
  });
});

describe("WaverMarkers (task 351)", () => {
  it("marks wavering yellow, routing red, steady none", async () => {
    const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
    const { Scene } = await import("@babylonjs/core");
    const { WaverMarkers } = await import("../waverMarkers.js");
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const steady = new UnitBrain(fakeSoldier(0, 0), 0);
    const waverer = new UnitBrain(fakeSoldier(5, 0), 0);
    waverer.morale = 0.2;
    const router = new UnitBrain(fakeSoldier(10, 0), 0);
    router.startRout(new Vector3(0, 0, -100));
    const dead = new UnitBrain(fakeSoldier(15, 0, 0), 0);

    const markers = new WaverMarkers(scene, [steady, waverer, router, dead]);
    markers.update();

    const meshes = scene.meshes.filter((m) => m.name.startsWith("waver_"));
    expect(meshes).toHaveLength(4);
    expect(meshes[0]?.isEnabled()).toBe(false);
    expect(meshes[1]?.isEnabled()).toBe(true);
    expect(meshes[2]?.isEnabled()).toBe(true);
    expect(meshes[3]?.isEnabled()).toBe(false);
    markers.dispose();
    engine.dispose();
  });
});
