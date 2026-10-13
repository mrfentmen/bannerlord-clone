/**
 * Task 618: a shot model changes state and changes look.
 *
 * State comes from a health fraction, so two hits of 1 and one hit of 2 land in
 * the same place, and damage clamps at zero instead of running negative. The
 * callback fires on a transition only -- it is a scene write, not a poll.
 *
 * The material path is proven against a real `StandardMaterial` on a NullEngine,
 * because "sooted" has to mean something to Babylon and not just to the test.
 */

import { describe, expect, it, vi } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Scene } from "@babylonjs/core/scene.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import {
  DAMAGE_VISUALS,
  DEFAULT_DAMAGE_THRESHOLDS,
  DamageTracker,
  applyDamageStateToMaterial,
  type DamageEvent,
} from "../DamageStates.js";

describe("DamageTracker (task 618)", () => {
  it("starts intact at full health", () => {
    const tracker = new DamageTracker({ id: 'humvee' });
    expect(tracker.getState()).toBe('intact');
    expect(tracker.getHealthFraction()).toBe(1);
    expect(tracker.getHealth()).toBe(1);
  });

  it("is damaged at half health and destroyed at zero", () => {
    const tracker = new DamageTracker({ id: 'humvee', maxHealth: 100 });
    tracker.applyDamage(49);
    expect(tracker.getState()).toBe('intact');
    tracker.applyDamage(1);
    expect(tracker.getState()).toBe('damaged');
    tracker.applyDamage(50);
    expect(tracker.getState()).toBe('destroyed');
    expect(tracker.getHealth()).toBe(0);
  });

  it("lands in the same place whether the damage came in one hit or many", () => {
    const many = new DamageTracker({ id: 'a', maxHealth: 100 });
    const one = new DamageTracker({ id: 'b', maxHealth: 100 });
    for (let i = 0; i < 30; i++) many.applyDamage(2);
    one.applyDamage(60);
    expect(many.getState()).toBe(one.getState());
    expect(many.getHealth()).toBe(one.getHealth());
  });

  it("clamps at zero instead of running negative", () => {
    const tracker = new DamageTracker({ id: 'a', maxHealth: 10 });
    tracker.applyDamage(500);
    expect(tracker.getHealth()).toBe(0);
    expect(tracker.getHealthFraction()).toBe(0);
    expect(tracker.getState()).toBe('destroyed');
  });

  it("ignores damage that is not a positive number", () => {
    const tracker = new DamageTracker({ id: 'a', maxHealth: 10 });
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(tracker.applyDamage(bad)).toBe('intact');
    }
    expect(tracker.getHealth()).toBe(10);
  });

  it("reports each transition once, with the fraction that caused it", () => {
    const seen: DamageEvent[] = [];
    const tracker = new DamageTracker({
      id: 'watchtower',
      maxHealth: 200,
      onStateChange: (e) => seen.push(e),
    });
    tracker.applyDamage(60); // 140/200 -> still intact
    tracker.applyDamage(60); // 80/200 -> damaged
    tracker.applyDamage(10); // already damaged, no new event
    tracker.applyDamage(80); // 0 -> destroyed
    expect(seen).toEqual([
      { id: 'watchtower', from: 'intact', to: 'damaged', healthFraction: 0.4 },
      { id: 'watchtower', from: 'damaged', to: 'destroyed', healthFraction: 0 },
    ]);
  });

  it("does not fire when a hit changes nothing", () => {
    const onStateChange = vi.fn();
    const tracker = new DamageTracker({ id: 'a', maxHealth: 10, onStateChange });
    tracker.applyDamage(4); // 60% left: still intact
    onStateChange.mockClear();
    tracker.applyDamage(0.5); // 55% left: still intact
    expect(onStateChange).not.toHaveBeenCalled();
    expect(tracker.getState()).toBe('intact');
  });

  it("heals back up through the states", () => {
    const seen: DamageEvent[] = [];
    const tracker = new DamageTracker({ id: 'a', maxHealth: 100, onStateChange: (e) => seen.push(e) });
    tracker.applyDamage(100);
    tracker.heal(30);
    expect(tracker.getState()).toBe('damaged');
    tracker.heal(50);
    expect(tracker.getState()).toBe('intact');
    tracker.heal(500);
    expect(tracker.getHealth()).toBe(100);
    expect(seen.map((e) => e.to)).toEqual(['destroyed', 'damaged', 'intact']);
  });

  it("accepts custom thresholds and falls back for a broken max health", () => {
    const tank = new DamageTracker({ id: 'tank', maxHealth: 100, thresholds: { damagedAt: 0.9 } });
    tank.applyDamage(11);
    expect(tank.getState()).toBe('damaged');
    const broken = new DamageTracker({ id: 'x', maxHealth: Number.NaN });
    expect(broken.getHealthFraction()).toBe(1);
    expect(DEFAULT_DAMAGE_THRESHOLDS.damagedAt).toBe(0.5);
  });
});

describe("damage visuals (task 618)", () => {
  it("keeps a destroyed model out of the picking pool and off the screen", () => {
    expect(DAMAGE_VISUALS.intact).toEqual({ darken: 1, smoke: false, pickable: true, visible: true });
    expect(DAMAGE_VISUALS.damaged.smoke).toBe(true);
    expect(DAMAGE_VISUALS.destroyed.pickable).toBe(false);
    expect(DAMAGE_VISUALS.destroyed.visible).toBe(false);
    // Damaged models darken; a state that did not change brightness would be a
    // state nobody could see.
    expect(DAMAGE_VISUALS.damaged.darken).toBeLessThan(1);
    expect(DAMAGE_VISUALS.destroyed.darken).toBeLessThan(DAMAGE_VISUALS.damaged.darken);
  });
});

describe("applyDamageStateToMaterial on a real material (task 618)", () => {
  function material(): StandardMaterial {
    const scene = new Scene(new NullEngine());
    const mat = new StandardMaterial('test', scene);
    mat.diffuseColor = new Color3(0.8, 0.8, 0.8);
    return mat;
  }

  it("leaves an intact material at its own colour", () => {
    const mat = material();
    applyDamageStateToMaterial(mat, 'intact');
    expect(mat.diffuseColor.r).toBeCloseTo(0.8);
    expect(mat.diffuseColor.g).toBeCloseTo(0.8);
    expect(mat.diffuseColor.b).toBeCloseTo(0.8);
  });

  it("soots a damaged material without turning it black", () => {
    const mat = material();
    applyDamageStateToMaterial(mat, 'damaged');
    expect(mat.diffuseColor.r).toBeLessThan(0.8);
    expect(mat.diffuseColor.r).toBeGreaterThan(0);
    // Soot is warmer than the original grey: r survives better than b.
    expect(mat.diffuseColor.r).toBeGreaterThan(mat.diffuseColor.b);
  });

  it("darkens further as the state worsens", () => {
    const mat = material();
    applyDamageStateToMaterial(mat, 'damaged');
    const damaged = mat.diffuseColor.r;
    applyDamageStateToMaterial(mat, 'destroyed');
    expect(mat.diffuseColor.r).toBeLessThan(damaged);
  });

  it("keeps a faction tint rather than replacing it", () => {
    const scene = new Scene(new NullEngine());
    const mat = new StandardMaterial('tinted', scene);
    mat.diffuseColor = new Color3(0.2, 0.1, 0.6); // violet faction colour
    applyDamageStateToMaterial(mat, 'damaged');
    expect(mat.diffuseColor.b).toBeGreaterThan(mat.diffuseColor.r);
  });

  it("never pushes a channel below zero or above one", () => {
    const scene = new Scene(new NullEngine());
    const mat = new StandardMaterial('dark', scene);
    mat.diffuseColor = new Color3(0.02, 0.02, 0.02);
    applyDamageStateToMaterial(mat, 'destroyed');
    for (const channel of [mat.diffuseColor.r, mat.diffuseColor.g, mat.diffuseColor.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});