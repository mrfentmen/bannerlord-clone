/**
 * Battle unit AI — the soldier brain.
 *
 * State machine ported from `johnburbridge/swarm-dominion` (MIT)
 * `docs/code-pulls/rts-battle/unit_base.gd`:
 * one active command, explicit transitions —
 * order → move → acquire → engage → attack → die.
 *
 * States: idle, moving, attacking, attack_moving, engaging, dead.
 * Commands: commandMoveTo, commandAttackMove, commandEngage.
 * Targeting: nearest living enemy inside acquireRange, re-checked every tick
 * (matches `_try_acquire_target`).
 *
 * The brain drives any `SoldierLike` entity (BattleSoldier satisfies the
 * interface structurally); the pure parts (acquire, transitions) are
 * unit-tested with fakes.
 */

import { Vector3 } from "@babylonjs/core";

export type UnitState = "idle" | "moving" | "attacking" | "attack_moving" | "engaging" | "dead";

/** Minimal entity surface the brain needs. BattleSoldier matches structurally. */
export interface SoldierLike {
  readonly root: { position: Vector3; rotation: { y: number } };
  readonly alive: boolean;
  damage(amount: number, direction?: Vector3): void;
}

export interface UnitStats {
  /** m/s. */
  moveSpeed: number;
  /** m — attack when closer than this. */
  attackRange: number;
  /** m — auto-acquire enemies inside this. */
  acquireRange: number;
  /** HP per hit. */
  damage: number;
  /** s between hits. */
  attackCooldown: number;
}

export const INFANTRY_STATS: UnitStats = {
  moveSpeed: 3.2,
  attackRange: 2.2,
  acquireRange: 40,
  damage: 12,
  attackCooldown: 1.1,
};

export class UnitBrain {
  state: UnitState = "idle";

  private moveTarget: Vector3 | null = null;
  private target: UnitBrain | null = null;
  private cooldown = 0;

  constructor(
    readonly soldier: SoldierLike,
    readonly team: number,
    readonly stats: UnitStats = INFANTRY_STATS,
  ) {}

  get alive(): boolean {
    return this.soldier.alive;
  }

  get position(): Vector3 {
    return this.soldier.root.position;
  }

  /** Plain move order: walk to the point, then idle. */
  commandMoveTo(target: Vector3): void {
    this.clearTargets();
    this.moveTarget = target.clone();
    this.state = "moving";
  }

  /** Attack-move: advance, engaging anything acquired on the way. */
  commandAttackMove(target: Vector3): void {
    this.clearTargets();
    this.moveTarget = target.clone();
    this.state = "attack_moving";
  }

  /** Direct engagement order against one enemy. */
  commandEngage(enemy: UnitBrain): void {
    this.clearTargets();
    this.target = enemy;
    this.state = "engaging";
  }

  private clearTargets(): void {
    this.moveTarget = null;
    this.target = null;
  }

  /**
   * Nearest living enemy inside acquireRange. Re-checked every tick, so
   * units retarget when their mark dies — same as `_try_acquire_target`.
   */
  acquire(enemies: UnitBrain[]): UnitBrain | null {
    let best: UnitBrain | null = null;
    let bestDist = this.stats.acquireRange;
    for (const e of enemies) {
      if (e.team === this.team || !e.alive) continue;
      const d = Vector3.Distance(this.position, e.position);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private moveToward(point: Vector3, dt: number): boolean {
    const pos = this.position;
    const dx = point.x - pos.x;
    const dz = point.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;
    const step = Math.min(dist, this.stats.moveSpeed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    this.soldier.root.rotation.y = Math.atan2(dx, dz);
    return step >= dist - 1e-6;
  }

  private face(point: Vector3): void {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (dx !== 0 || dz !== 0) this.soldier.root.rotation.y = Math.atan2(dx, dz);
  }

  update(dt: number, enemies: UnitBrain[]): void {
    if (!this.alive) {
      this.state = "dead";
      return;
    }
    dt = Math.min(dt, 1 / 10);

    const seen = this.acquire(enemies);

    switch (this.state) {
      case "idle":
        if (seen !== null) {
          this.target = seen;
          this.state = "engaging";
        }
        break;

      case "moving":
        if (this.moveTarget !== null && this.moveToward(this.moveTarget, dt)) {
          this.moveTarget = null;
          this.state = "idle";
        }
        break;

      case "attack_moving":
        if (seen !== null) {
          this.target = seen;
          this.state = "engaging";
        } else if (this.moveTarget !== null) {
          if (this.moveToward(this.moveTarget, dt)) {
            this.moveTarget = null;
            this.state = "idle";
          }
        } else {
          this.state = "idle";
        }
        break;

      case "engaging": {
        const t = this.target?.alive ? this.target : seen;
        if (t === null) {
          this.target = null;
          this.state = "idle";
          break;
        }
        this.target = t;
        const d = Vector3.Distance(this.position, t.position);
        if (d <= this.stats.attackRange) {
          this.state = "attacking";
          this.cooldown = 0;
        } else {
          this.moveToward(t.position, dt);
        }
        break;
      }

      case "attacking": {
        const t = this.target !== null && this.target.alive ? this.target : seen;
        if (t === null) {
          this.target = null;
          this.state = "idle";
          break;
        }
        this.target = t;
        this.face(t.position);
        const d = Vector3.Distance(this.position, t.position);
        if (d > this.stats.attackRange * 1.25) {
          this.state = "engaging";
          break;
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          this.cooldown = this.stats.attackCooldown;
          const dir = t.position.subtract(this.position);
          dir.y = 0;
          t.soldier.damage(this.stats.damage, dir);
        }
        break;
      }

      case "dead":
        break;
    }
  }
}
