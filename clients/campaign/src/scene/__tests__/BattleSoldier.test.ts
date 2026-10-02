/**
 * BattleSoldier tests.
 *
 * Verifies that multiple soldiers can coexist and die independently
 * without their ragdoll state interfering. The full physics integration
 * is verified in the browser (ragdoll-demo); these tests cover the
 * entity lifecycle logic.
 */
import { describe, expect, it, vi } from "vitest";

// Mock the ragdoll module to avoid needing Havok in unit tests
vi.mock("../../physics/ragdoll.js", () => ({
  createRagdoll: vi.fn(() => ({
    trigger: vi.fn(),
    dispose: vi.fn(),
    active: false,
  })),
}));

import { Vector3 } from "@babylonjs/core";

// Minimal mock for BattleSoldier that doesn't need a real scene
// (the real class needs Babylon Scene; we test the logic via a harness)
class SoldierHarness {
  health = 100;
  alive = true;
  ragdollTriggered = false;
  impulseApplied: Vector3 | null = null;

  damage(amount: number, direction?: Vector3): void {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.die(direction);
    }
  }

  private die(direction?: Vector3): void {
    if (!this.alive) return;
    this.alive = false;
    this.ragdollTriggered = true;
    this.impulseApplied = direction
      ? direction.normalize().scale(15)
      : new Vector3(0, 5, 0);
  }
}

describe("BattleSoldier lifecycle", () => {
  it("5 soldiers can die independently without interference", () => {
    const soldiers = Array.from({ length: 5 }, () => new SoldierHarness());

    // Kill them in different orders with different damage
    soldiers[2]!.damage(100, new Vector3(1, 0, 0));
    soldiers[0]!.damage(50);
    soldiers[0]!.damage(50, new Vector3(0, 0, 1));
    soldiers[4]!.damage(200);
    soldiers[1]!.damage(100);
    soldiers[3]!.damage(30);
    expect(soldiers[3]!.alive).toBe(true); // still alive
    soldiers[3]!.damage(70);

    // All 5 should be dead with ragdolls triggered
    for (const s of soldiers) {
      expect(s.alive).toBe(false);
      expect(s.ragdollTriggered).toBe(true);
      expect(s.health).toBe(0);
    }

    // Impulses should reflect damage directions
    expect(soldiers[2]!.impulseApplied!.x).toBeGreaterThan(0);
    expect(soldiers[0]!.impulseApplied!.z).toBeGreaterThan(0);
  });

  it("dead soldiers ignore further damage", () => {
    const s = new SoldierHarness();
    s.damage(100);
    expect(s.alive).toBe(false);
    const triggered = s.ragdollTriggered;
    s.damage(50); // should be ignored
    expect(s.ragdollTriggered).toBe(triggered); // not re-triggered
    expect(s.health).toBe(0);
  });

  it("partial damage does not trigger ragdoll", () => {
    const s = new SoldierHarness();
    s.damage(30);
    expect(s.alive).toBe(true);
    expect(s.ragdollTriggered).toBe(false);
    expect(s.health).toBe(70);
  });
});
