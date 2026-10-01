/**
 * @vitest-environment jsdom
 *
 * Third-person player combat: pure helpers (spread, melee arc, armor) plus the
 * full module under NullEngine — movement, stamina, reload, damage, death,
 * respawn, and kill feed integration.
 */

import { describe, expect, it, vi } from "vitest";
import { Scene, Vector3 } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import {
  applyDamageToPool,
  computeSpreadDeg,
  createPlayerCombat,
  meleeInArc,
  type CombatTarget,
} from "../PlayerCombat.js";
import { createBattleHud } from "../../ui/battle-hud.js";

function testScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
  return new Scene(engine);
}

function makeTarget(id: string, x: number, z: number): CombatTarget {
  let hp = 100;
  return {
    id,
    name: `enemy-${id}`,
    position: new Vector3(x, 0, z),
    get alive() {
      return hp > 0;
    },
    damage(amount: number) {
      hp -= amount;
      return hp <= 0;
    },
  };
}

function key(code: string, down: boolean): void {
  window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
}

describe("computeSpreadDeg", () => {
  it("is tighter when aiming than firing from the hip", () => {
    expect(computeSpreadDeg(true, 0)).toBeLessThan(computeSpreadDeg(false, 0));
  });

  it("widens with movement speed", () => {
    expect(computeSpreadDeg(false, 7.5)).toBeGreaterThan(computeSpreadDeg(false, 0));
  });

  it("still beats hip-fire when aiming on the move", () => {
    expect(computeSpreadDeg(true, 7.5)).toBeLessThan(computeSpreadDeg(false, 7.5));
  });
});

describe("meleeInArc", () => {
  const origin = new Vector3(0, 0, 0);

  it("hits a target dead ahead inside range", () => {
    expect(meleeInArc(origin, 0, new Vector3(0, 0, 2), 2.6, 90)).toBe(true);
  });

  it("misses a target behind the player", () => {
    expect(meleeInArc(origin, 0, new Vector3(0, 0, -2), 2.6, 90)).toBe(false);
  });

  it("misses a target past max range", () => {
    expect(meleeInArc(origin, 0, new Vector3(0, 0, 3), 2.6, 90)).toBe(false);
  });

  it("hits at the edge of the 90-degree arc", () => {
    // 45 degrees off facing at 2m: inside the arc.
    expect(meleeInArc(origin, 0, new Vector3(1.41, 0, 1.41), 2.6, 90)).toBe(true);
    // 60 degrees off: outside.
    expect(meleeInArc(origin, 0, new Vector3(1.73, 0, 1), 2.6, 90)).toBe(false);
  });
});

describe("applyDamageToPool", () => {
  it("armor absorbs half the hit until depleted", () => {
    const after = applyDamageToPool(100, 50, 40);
    expect(after.armor).toBe(30); // 20 absorbed
    expect(after.health).toBe(80); // 20 through
  });

  it("health takes the full hit once armor is gone", () => {
    const after = applyDamageToPool(100, 0, 40);
    expect(after.health).toBe(60);
    expect(after.armor).toBe(0);
  });

  it("never drops below zero", () => {
    const after = applyDamageToPool(10, 5, 100);
    expect(after.health).toBe(0);
    expect(after.armor).toBe(0);
  });
});

describe("player combat module", () => {
  it("spawns with full health, stamina, and a loaded rifle", () => {
    const scene = testScene();
    const combat = createPlayerCombat({ scene });
    expect(combat.state.health).toBe(100);
    expect(combat.state.stamina).toBe(100);
    expect(combat.state.magazine).toBe(30);
    expect(combat.state.reserveAmmo).toBe(120);
    expect(combat.state.alive).toBe(true);
    expect(combat.state.weapon).toBe("rifle");
    combat.dispose();
    scene.dispose();
  });

  it("moves forward with W and sprints with Shift", () => {
    const scene = testScene();
    const combat = createPlayerCombat({ scene });
    const start = combat.position.clone();
    key("KeyW", true);
    combat.update(1);
    const walked = Vector3.Distance(combat.position, start);
    expect(walked).toBeCloseTo(4.0, 0);
    key("KeyW", false);

    // Sprint covers more ground and drains stamina.
    key("KeyW", true);
    key("ShiftLeft", true);
    combat.update(1);
    const sprinted = Vector3.Distance(combat.position, start) - walked;
    expect(sprinted).toBeCloseTo(7.5, 0);
    expect(combat.state.stamina).toBeLessThan(100);
    expect(combat.state.sprinting).toBe(true);
    key("ShiftLeft", false);
    key("KeyW", false);
    combat.dispose();
    scene.dispose();
  });

  it("crouch halves move speed", () => {
    const scene = testScene();
    const combat = createPlayerCombat({ scene });
    const start = combat.position.clone();
    key("KeyC", true);
    key("KeyW", true);
    combat.update(1);
    const moved = Vector3.Distance(combat.position, start);
    expect(moved).toBeCloseTo(2.0, 0);
    expect(combat.state.crouching).toBe(true);
    key("KeyC", false);
    key("KeyW", false);
    combat.dispose();
    scene.dispose();
  });

  it("regenerates stamina when idle", () => {
    const scene = testScene();
    const combat = createPlayerCombat({ scene });
    key("KeyW", true);
    key("ShiftLeft", true);
    combat.update(1); // drain
    key("ShiftLeft", false);
    key("KeyW", false);
    const drained = combat.state.stamina;
    combat.update(1); // idle regen
    expect(combat.state.stamina).toBeGreaterThan(drained);
    combat.dispose();
    scene.dispose();
  });

  it("reloads the magazine and sprint interrupts it", () => {
    const scene = testScene();
    // Fire some rounds via the canvas mousedown path, then reload with R.
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const c2 = createPlayerCombat({ scene, canvas });
    // Fire 5 rounds via mousedown on the canvas.
    for (let i = 0; i < 5; i += 1) {
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
      c2.update(0.2);
    }
    expect(c2.state.magazine).toBe(25);
    // Start reload, then sprint to interrupt.
    key("KeyR", true);
    key("KeyR", false);
    expect(c2.state.reloading).toBe(true);
    key("KeyW", true);
    key("ShiftLeft", true);
    c2.update(0.5);
    expect(c2.state.reloading).toBe(false);
    expect(c2.state.magazine).toBe(25); // interrupted before finishing
    key("ShiftLeft", false);
    key("KeyW", false);
    // Reload cleanly this time.
    key("KeyR", true);
    key("KeyR", false);
    c2.update(2.5);
    expect(c2.state.magazine).toBe(30);
    expect(c2.state.reserveAmmo).toBe(115);
    canvas.remove();
    c2.dispose();
    scene.dispose();
  });

  it("melee kills push to the kill feed", () => {
    const scene = testScene();
    const hud = createBattleHud(() => {});
    document.body.appendChild(hud.root);
    const targets = [makeTarget("a", 0, 2)]; // dead ahead, inside melee range
    // Weaken it so one swing kills.
    targets[0]!.damage(80);
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const c2 = createPlayerCombat({ scene, hud, getTargets: () => targets, canvas });
    key("Digit2", true); // melee
    key("Digit2", false);
    expect(c2.state.weapon).toBe("melee");
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0 }));
    c2.update(0.1);
    expect(targets[0]!.alive).toBe(false);
    const feed = hud.root.querySelector(".battle-killfeed");
    expect(feed?.textContent).toContain("enemy-a");
    canvas.remove();
    hud.destroy();
    c2.dispose();
    scene.dispose();
  });

  it("takes damage through armor, shows hit state, and dies at zero", () => {
    const scene = testScene();
    const onDeath = vi.fn();
    const combat = createPlayerCombat({ scene, onPlayerDeath: onDeath });
    combat.takeDamage(40, new Vector3(0, 0, -1));
    expect(combat.state.armor).toBe(30);
    expect(combat.state.health).toBe(80);
    expect(combat.state.alive).toBe(true);
    combat.takeDamage(200, new Vector3(0, 0, -1));
    expect(combat.state.alive).toBe(false);
    expect(onDeath).toHaveBeenCalledOnce();
    combat.dispose();
    scene.dispose();
  });

  it("respawns with full health and ammo on R", () => {
    const scene = testScene();
    const combat = createPlayerCombat({ scene });
    combat.takeDamage(500, new Vector3(0, 0, -1));
    expect(combat.state.alive).toBe(false);
    combat.respawn(10, 20);
    expect(combat.state.alive).toBe(true);
    expect(combat.state.health).toBe(100);
    expect(combat.state.magazine).toBe(30);
    expect(combat.position.x).toBeCloseTo(10, 5);
    expect(combat.position.z).toBeCloseTo(20, 5);
    combat.dispose();
    scene.dispose();
  });

  it("death overlay appears and hides on respawn", () => {
    const scene = testScene();
    const combat = createPlayerCombat({ scene });
    combat.takeDamage(500, new Vector3(0, 0, -1));
    const overlay = document.querySelector(".player-death") as HTMLElement;
    expect(overlay.style.display).toBe("flex");
    combat.respawn(0, 0);
    expect(overlay.style.display).toBe("none");
    combat.dispose();
    scene.dispose();
  });

  it("disposes without leaking listeners or DOM", () => {
    const scene = testScene();
    const combat = createPlayerCombat({ scene });
    combat.dispose();
    expect(document.querySelector(".player-crosshair")).toBeNull();
    expect(document.querySelector(".player-bars")).toBeNull();
    scene.dispose();
  });
});
