/**
 * In-battle orders — the Bannerlord command layer for the 3D battle.
 *
 * Subscribes to the `battle-command` actions from `input/actions.ts`
 * (f/F1 attack, h/F3 hold, g/F2 follow, r/F4 retreat, x rout, ctrl+a select
 * all) through the shared input registry, so keybindings stay remappable and
 * the gamepad/touch layers keep working. Group selection (1/2/3, 0 for all)
 * is local to the battle — no action defines it.
 *
 * Orders that need a ground point (attack/follow) use the pointer's current
 * ground position: press the key and the order lands where you're pointing.
 * No second click, no modal state.
 */

import { Matrix, Scene, Vector3 } from "@babylonjs/core";
import type { InputRegistry } from "../input/registry.js";
import type { UnitBrain } from "./battleUnit.js";

export type BattleOrderKind = "attack" | "follow" | "hold" | "retreat" | "rout";

export interface BattleOrdersOptions {
  scene: Scene;
  input: InputRegistry;
  /** Live player brains; filtered for the living on every order. */
  getBrains: () => UnitBrain[];
  /** Where "retreat" sends the selected group (own deployment edge). */
  retreatPoint: Vector3;
  /** Fired after every order — the HUD feed and sound hooks listen here. */
  onOrder?: (order: BattleOrderKind, groupLabel: string, point: Vector3 | null) => void;
}

const GROUP_COUNT = 3;

/** Ray from the camera through the pointer, intersected with the y=0 plane. */
export function pointerGroundPoint(scene: Scene): Vector3 | null {
  const camera = scene.activeCamera;
  if (!camera) return null;
  const ray = scene.createPickingRay(
    scene.pointerX,
    scene.pointerY,
    Matrix.Identity(),
    camera,
  );
  // Plane y = 0: t = -origin.y / dir.y. Behind or parallel → no point.
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  const t = -ray.origin.y / ray.direction.y;
  if (t < 0) return null;
  return ray.origin.add(ray.direction.scale(t));
}

export class BattleOrders {
  private readonly options: BattleOrdersOptions;
  private readonly unsubscribers: Array<() => void> = [];
  /** -1 = all groups, 0..GROUP_COUNT-1 = one group. */
  private selected = -1;
  private disposed = false;

  constructor(options: BattleOrdersOptions) {
    this.options = options;
    const { input } = options;
    this.unsubscribers.push(
      input.on("battle.orderAttack", () => this.issue("attack")),
      input.on("battle.orderFollow", () => this.issue("follow")),
      input.on("battle.orderHold", () => this.issue("hold")),
      input.on("battle.orderRetreat", () => this.issue("retreat")),
      input.on("battle.retreatHorn", () => this.issue("rout")),
      input.on("battle.selectAll", () => {
        this.selected = -1;
      }),
    );
    window.addEventListener("keydown", this.onGroupKey);
  }

  /** Living player brains, split round-robin into GROUP_COUNT groups. */
  groups(): UnitBrain[][] {
    const brains = this.options.getBrains().filter((b) => b.alive);
    const groups: UnitBrain[][] = Array.from({ length: GROUP_COUNT }, () => []);
    brains.forEach((b, i) => groups[i % GROUP_COUNT]!.push(b));
    return groups;
  }

  /** The brains the next order will hit. */
  selectedBrains(): UnitBrain[] {
    if (this.selected === -1) return this.options.getBrains().filter((b) => b.alive);
    return this.groups()[this.selected] ?? [];
  }

  selectionLabel(): string {
    if (this.selected === -1) return "All troops";
    return `Group ${this.selected + 1}`;
  }

  private onGroupKey = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    // Ignore when typing in a panel.
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key >= "1" && e.key <= String(GROUP_COUNT)) {
      this.selected = Number(e.key) - 1;
    } else if (e.key === "0") {
      this.selected = -1;
    }
  };

  /** Issue an order now; `point` overrides the pointer ground position. */
  issue(order: BattleOrderKind, point?: Vector3 | null): void {
    if (this.disposed) return;
    const brains = order === "rout"
      ? this.options.getBrains().filter((b) => b.alive)
      : this.selectedBrains();
    if (brains.length === 0) return;

    let target: Vector3 | null = null;
    switch (order) {
      case "attack":
      case "follow": {
        target = point ?? pointerGroundPoint(this.options.scene);
        if (!target) return;
        for (const b of brains) {
          if (order === "attack") b.commandAttackMove(target);
          else b.commandMoveTo(target);
        }
        break;
      }
      case "hold":
        for (const b of brains) b.commandHold();
        break;
      case "retreat":
      case "rout":
        target = this.options.retreatPoint.clone();
        for (const b of brains) b.commandMoveTo(target);
        break;
    }
    this.options.onOrder?.(order, order === "rout" ? "All troops" : this.selectionLabel(), target);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    window.removeEventListener("keydown", this.onGroupKey);
  }
}
