/**
 * @vitest-environment jsdom
 *
 * BattleOrders tests — the command layer over UnitBrain, driven through an
 * isolated input registry (no real keyboard). The scene is a minimal fake:
 * orders with an explicit point never touch it.
 */
import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
import { createInputRegistry } from "../../input/registry.js";
import { INFANTRY_STATS, UnitBrain, type SoldierLike } from "../battleUnit.js";
import { BattleOrders } from "../BattleOrders.js";

function fakeSoldier(x = 0, z = 0): SoldierLike {
  return {
    root: { position: new Vector3(x, 0, z), rotation: { y: 0 } },
    alive: true,
    damage() {},
  };
}

function fakeScene(): Scene {
  return { activeCamera: null, pointerX: 0, pointerY: 0 } as unknown as Scene;
}

function makeBrains(n: number): UnitBrain[] {
  return Array.from({ length: n }, (_, i) => new UnitBrain(fakeSoldier(i * 3, 0), 0, INFANTRY_STATS));
}

describe("BattleOrders", () => {
  it("hold order puts every selected brain on hold", () => {
    const registry = createInputRegistry();
    const brains = makeBrains(4);
    const orders = new BattleOrders({
      scene: fakeScene(),
      input: registry,
      getBrains: () => brains,
      retreatPoint: new Vector3(0, 0, -100),
    });
    registry.dispatch("battle.orderHold", "api");
    for (const b of brains) expect(b.isHolding).toBe(true);
    orders.dispose();
  });

  it("attack order with an explicit point attack-moves the selection", () => {
    const registry = createInputRegistry();
    const brains = makeBrains(3);
    const seen: string[] = [];
    const orders = new BattleOrders({
      scene: fakeScene(),
      input: registry,
      getBrains: () => brains,
      retreatPoint: new Vector3(0, 0, -100),
      onOrder: (order, group) => seen.push(`${group}:${order}`),
    });
    orders.issue("attack", new Vector3(20, 0, 20));
    for (const b of brains) expect(b.state).toBe("attack_moving");
    expect(seen).toEqual(["All troops:attack"]);
    orders.dispose();
  });

  it("retreat sends the selection to the retreat point", () => {
    const registry = createInputRegistry();
    const brains = makeBrains(2);
    const orders = new BattleOrders({
      scene: fakeScene(),
      input: registry,
      getBrains: () => brains,
      retreatPoint: new Vector3(0, 0, -100),
    });
    registry.dispatch("battle.orderRetreat", "api");
    for (const b of brains) expect(b.state).toBe("moving");
    orders.dispose();
  });

  it("rout ignores the selection and moves everyone", () => {
    const registry = createInputRegistry();
    const brains = makeBrains(4);
    const orders = new BattleOrders({
      scene: fakeScene(),
      input: registry,
      getBrains: () => brains,
      retreatPoint: new Vector3(0, 0, -100),
    });
    // Select group 1, then sound the horn — everyone still retreats.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    expect(orders.selectionLabel()).toBe("Group 1");
    registry.dispatch("battle.retreatHorn", "api");
    for (const b of brains) expect(b.state).toBe("moving");
    orders.dispose();
  });

  it("splits living brains round-robin into three groups", () => {
    const registry = createInputRegistry();
    const brains = makeBrains(4);
    const orders = new BattleOrders({
      scene: fakeScene(),
      input: registry,
      getBrains: () => brains,
      retreatPoint: new Vector3(0, 0, -100),
    });
    const groups = orders.groups();
    expect(groups.map((g) => g.length)).toEqual([2, 1, 1]);
    // Group 2's hold touches only its own brain.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    orders.issue("hold");
    expect(groups[1]![0]!.isHolding).toBe(true);
    expect(groups[0]![0]!.isHolding).toBe(false);
    orders.dispose();
  });

  it("attack with no pointer ground position is a safe no-op", () => {
    const registry = createInputRegistry();
    const brains = makeBrains(2);
    const onOrder = vi.fn();
    const orders = new BattleOrders({
      scene: fakeScene(), // activeCamera null → no ground point
      input: registry,
      getBrains: () => brains,
      retreatPoint: new Vector3(0, 0, -100),
      onOrder,
    });
    orders.issue("attack");
    for (const b of brains) expect(b.state).toBe("idle");
    expect(onOrder).not.toHaveBeenCalled();
    orders.dispose();
  });

  it("dispose stops orders from firing", () => {
    const registry = createInputRegistry();
    const brains = makeBrains(2);
    const orders = new BattleOrders({
      scene: fakeScene(),
      input: registry,
      getBrains: () => brains,
      retreatPoint: new Vector3(0, 0, -100),
    });
    orders.dispose();
    registry.dispatch("battle.orderHold", "api");
    for (const b of brains) expect(b.isHolding).toBe(false);
  });
});
