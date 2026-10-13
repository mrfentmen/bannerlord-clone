/**
 * CompoundAssault tests — the gate breach.
 *
 * The core of the prototype is that the gate is a Destructible implementing
 * SoldierLike, so the unmodified UnitBrain targets and destroys it. These
 * tests use a NullEngine scene (no GLBs, no rendering) with a fake-soldier
 * attacker: order the engage, tick, and the gate falls.
 */
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Color3, Vector3 } from "@babylonjs/core";
import { Destructible } from "../CompoundAssault.js";
import { INFANTRY_STATS, UnitBrain, type SoldierLike } from "../battleUnit.js";

function makeScene(): Scene {
  const engine = new NullEngine();
  return new Scene(engine);
}

function fakeSoldier(x = 0, z = 0): SoldierLike & { health: number } {
  const s = {
    root: { position: new Vector3(x, 0, z), rotation: { y: 0 } },
    health: 100,
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

describe("Destructible", () => {
  it("takes damage and dies at zero", () => {
    const scene = makeScene();
    const gate = new Destructible(scene, new Vector3(0, 1.75, -20), 6, 3.5, 0.8, 120, new Color3(0.5, 0.3, 0.1));
    expect(gate.alive).toBe(true);
    expect(gate.healthFraction).toBeCloseTo(1, 5);
    gate.damage(50);
    expect(gate.alive).toBe(true);
    expect(gate.healthFraction).toBeCloseTo(0.583, 2);
    gate.damage(70);
    expect(gate.alive).toBe(false);
    expect(gate.healthFraction).toBe(0);
    scene.dispose();
  });

  it("ignores damage after death (no negative HP)", () => {
    const scene = makeScene();
    const gate = new Destructible(scene, new Vector3(0, 0, 0), 6, 3.5, 0.8, 10, new Color3(1, 1, 1));
    gate.damage(1000);
    expect(gate.alive).toBe(false);
    gate.damage(1000);
    expect(gate.healthFraction).toBe(0);
    scene.dispose();
  });

  it("knocks the mesh flat when breached", () => {
    const scene = makeScene();
    const gate = new Destructible(scene, new Vector3(0, 1.75, -20), 6, 3.5, 0.8, 10, new Color3(1, 1, 1));
    gate.damage(10);
    expect(gate.alive).toBe(false);
    scene.dispose();
  });
});

describe("gate breach via UnitBrain", () => {
  it("a squad brain ordered to engage the gate destroys it", () => {
    const scene = makeScene();
    const gate = new Destructible(scene, new Vector3(0, 1.75, -20), 6, 3.5, 0.8, 120, new Color3(0.5, 0.3, 0.1));
    const gateBrain = new UnitBrain(gate, 1, INFANTRY_STATS);

    const attacker = new UnitBrain(fakeSoldier(0, -24), 0, {
      ...INFANTRY_STATS,
      damage: 40,
      attackCooldown: 0.2,
    });
    attacker.commandEngage(gateBrain);

    let frames = 0;
    while (gate.alive && frames < 3600) {
      attacker.update(dt, [gateBrain]);
      frames++;
    }
    expect(gate.alive).toBe(false);
    expect(frames).toBeLessThan(3600);
    scene.dispose();
  });

  it("attackers retarget off the gate once it falls", () => {
    const scene = makeScene();
    const gate = new Destructible(scene, new Vector3(0, 1.75, -20), 6, 3.5, 0.8, 10, new Color3(0.5, 0.3, 0.1));
    const gateBrain = new UnitBrain(gate, 1, INFANTRY_STATS);
    const guard = new UnitBrain(fakeSoldier(0, -10), 1, INFANTRY_STATS);

    const attacker = new UnitBrain(fakeSoldier(0, -24), 0, {
      ...INFANTRY_STATS,
      damage: 40,
      attackCooldown: 0.2,
    });
    attacker.commandEngage(gateBrain);
    // Kill the gate first.
    gate.damage(1000);
    // Now the attacker should pick up the guard, not the corpse gate.
    attacker.update(dt, [gateBrain, guard]);
    expect(attacker.state).toBe("engaging");
    scene.dispose();
  });
});
