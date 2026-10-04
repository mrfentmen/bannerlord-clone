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

export type UnitState =
  | "idle"
  | "moving"
  | "attacking"
  | "attack_moving"
  | "engaging"
  | "dead"
  | "routing"
  | "surrendered";

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

/** Damage multiplier for a strike from the victim's rear arc. */
const FLANK_REAR_MULT = 1.5;
/** Damage multiplier for a strike from the victim's side arc. */
const FLANK_SIDE_MULT = 1.25;
/** Cosine thresholds: |dot| <= side is a flank, dot < -rear is behind. */
const FLANK_SIDE_COS = 0.5;

/** Seconds without progress before a stuck unit sidesteps (task 295). */
const STUCK_SECONDS = 2.5;
/** Metres of progress that count as "moving". */
const STUCK_EPSILON_M = 0.15;
/** Sidestep distance when stuck. */
const STUCK_SIDESTEP_M = 2;

/** Charge speed multiplier (task 257): a charge is a sprint, not a walk. */
const CHARGE_SPEED_MULT = 1.6;

/** Below this morale a fighting brain wavers (task 351). */
const WAVER_THRESHOLD = 0.25;
/** Morale a rallied brain steadies at (task 356). */
const RALLY_MORALE = 0.3;
/** Striking a router or a surrendered unit: the pursuit bonus (task 354). */
const PURSUIT_MULT = 1.5;

/**
 * Idle look-around (task 251): bounds for the pause between glances and how
 * far the head turns. Purely cosmetic — an idle soldier that never moves its
 * gaze reads as a statue.
 */
const LOOK_PAUSE_MIN_S = 1.5;
const LOOK_PAUSE_MAX_S = 4;
const LOOK_TURN_RAD = 0.9;

export class UnitBrain {
  state: UnitState = "idle";

  /**
   * Fired after every strike this brain lands, with whether the blow killed.
   * The battle loop wires it to the combat event bus; until then it is null
   * and strikes stay silent, so a brain fighting without a loop never lies
   * about being watched.
   */
  onStrike:
    | ((attacker: UnitBrain, victim: UnitBrain, amount: number, killed: boolean) => void)
    | null = null;

  /** True while a charge order is active: movement is a sprint. */
  private charging = false;
  /** Stuck detection: last position sampled and how long we've been still. */
  private stuckPos: Vector3 | null = null;
  private stuckTime = 0;
  /** Idle look-around timer: seconds until the next glance. */
  private lookTimer = LOOK_PAUSE_MIN_S + Math.random() * (LOOK_PAUSE_MAX_S - LOOK_PAUSE_MIN_S);

  /**
   * Morale 0..1 (tasks 341-351). Starts at 1; the morale system moves it and
   * calls `startRout` at 0. Kept on the brain because the state machine reads
   * it every tick — routing and surrendering are states, not overlays.
   */
  morale = 1;
  /** Where this brain runs when it routs; set by `startRout`. */
  private routTarget: Vector3 | null = null;
  /**
   * Reached the map edge while routing: out of the fight, not dead. The loop
   * hides the soldier and stops counting the brain; casualties don't include
   * the fled.
   */
  hasFled = false;

  private moveTarget: Vector3 | null = null;
  private target: UnitBrain | null = null;
  private cooldown = 0;
  /**
   * Hold order: stand ground, strike enemies that come into range, never
   * chase. Any other command clears it.
   */
  private holding = false;

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
    if (this.isRouting || this.isSurrendered) return;
    this.clearTargets();
    this.holding = false;
    this.charging = false;
    this.moveTarget = target.clone();
    this.state = "moving";
  }

  /**
   * Charge order (task 257): sprint at the point and engage whatever is
   * there. Mechanically an attack-move at 1.6x speed; the charge ends with
   * the first blow, so a charge that reaches empty ground just stops.
   */
  commandCharge(target: Vector3): void {
    if (this.isRouting || this.isSurrendered) return;
    this.clearTargets();
    this.holding = false;
    this.charging = true;
    this.moveTarget = target.clone();
    this.state = "attack_moving";
  }

  /** True while a charge order is still a sprint. */
  get isCharging(): boolean {
    return this.charging;
  }

  /** Morale broke: fleeing, not fighting (tasks 350, 353). */
  get isRouting(): boolean {
    return this.state === "routing";
  }

  /** Gave up: standing still, waiting to be taken (task 355). */
  get isSurrendered(): boolean {
    return this.state === "surrendered";
  }

  /** Below 25% and still fighting: the waver warning shows (task 351). */
  get isWavering(): boolean {
    return this.alive && !this.isRouting && !this.isSurrendered && this.morale < WAVER_THRESHOLD;
  }

  /**
   * Break (task 350): drop everything and run for `point`. A routing brain
   * never acquires, never strikes — routers don't fight back (task 353).
   */
  startRout(point: Vector3): void {
    if (!this.alive || this.isRouting) return;
    this.clearTargets();
    this.holding = false;
    this.charging = false;
    this.routTarget = point.clone();
    this.state = "routing";
  }

  /** Stand down and wait to be taken prisoner (task 355). */
  surrender(): void {
    if (!this.alive || this.isSurrendered) return;
    this.clearTargets();
    this.holding = false;
    this.charging = false;
    this.state = "surrendered";
  }

  /**
   * Rally (task 356): the panic passes, morale steadies at 0.3, the brain
   * rejoins the fight. Only the morale system calls this — a brain never
   * rallies itself mid-rout.
   */
  rally(): void {
    if (!this.alive || !this.isRouting) return;
    this.morale = Math.max(this.morale, RALLY_MORALE);
    this.routTarget = null;
    this.state = "idle";
  }

  /** Attack-move: advance, engaging anything acquired on the way. */
  commandAttackMove(target: Vector3): void {
    if (this.isRouting || this.isSurrendered) return;
    this.clearTargets();
    this.holding = false;
    this.charging = false;
    this.moveTarget = target.clone();
    this.state = "attack_moving";
  }

  /** Direct engagement order against one enemy. */
  commandEngage(enemy: UnitBrain): void {
    if (this.isRouting || this.isSurrendered) return;
    this.clearTargets();
    this.holding = false;
    this.charging = false;
    this.target = enemy;
    this.state = "engaging";
  }

  /** Hold: stand ground, fight enemies in range, never chase. */
  commandHold(): void {
    if (this.isRouting || this.isSurrendered) return;
    this.clearTargets();
    this.holding = true;
    this.charging = false;
    this.state = "idle";
  }

  /** True while a hold order is active. */
  get isHolding(): boolean {
    return this.holding;
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
    if (dist < 0.5) {
      this.stuckPos = null;
      this.stuckTime = 0;
      return true;
    }
    // Stuck detection (task 295): a unit ordered to move that makes no
    // progress is caught on something. After STUCK_SECONDS it sidesteps
    // perpendicular to its heading instead of pushing forever.
    if (this.stuckPos === null) {
      this.stuckPos = pos.clone();
      this.stuckTime = 0;
    } else {
      const moved = Math.hypot(pos.x - this.stuckPos.x, pos.z - this.stuckPos.z);
      if (moved > STUCK_EPSILON_M) {
        this.stuckPos = pos.clone();
        this.stuckTime = 0;
      } else {
        this.stuckTime += dt;
        if (this.stuckTime >= STUCK_SECONDS) {
          this.stuckTime = 0;
          this.stuckPos = pos.clone();
          const side = dist > 1e-6 ? new Vector3(-dz / dist, 0, dx / dist) : new Vector3(1, 0, 0);
          this.moveTarget = new Vector3(
            point.x + side.x * STUCK_SIDESTEP_M,
            0,
            point.z + side.z * STUCK_SIDESTEP_M,
          );
          return this.moveToward(this.moveTarget, dt);
        }
      }
    }
    const speed = this.stats.moveSpeed * (this.charging ? CHARGE_SPEED_MULT : 1);
    const step = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    this.soldier.root.rotation.y = Math.atan2(dx, dz);
    return step >= dist - 1e-6;
  }

  /**
   * Flanking bonus (task 289): a blow from the victim's rear arc hits 1.5x,
   * from the side 1.25x. Computed off the victim's facing — the direction its
   * root is turned — against the bearing to the attacker.
   */
  flankMultiplier(victim: UnitBrain): number {
    const ry = victim.soldier.root.rotation.y;
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    const dx = this.position.x - victim.position.x;
    const dz = this.position.z - victim.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return 1;
    const dot = (dx / dist) * fx + (dz / dist) * fz;
    if (dot < -FLANK_SIDE_COS) return FLANK_REAR_MULT;
    if (Math.abs(dot) <= FLANK_SIDE_COS) return FLANK_SIDE_MULT;
    return 1;
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
        // Look-around (task 251): an idle soldier glances around every few
        // seconds. Cosmetic only — it never moves the body or affects combat.
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.lookTimer = LOOK_PAUSE_MIN_S + Math.random() * (LOOK_PAUSE_MAX_S - LOOK_PAUSE_MIN_S);
          this.soldier.root.rotation.y += (Math.random() - 0.5) * 2 * LOOK_TURN_RAD;
        }
        if (seen !== null) {
          if (this.holding) {
            // Hold: never walk to the enemy, but strike what's in reach —
            // the Bannerlord hold-position behaviour.
            const d = Vector3.Distance(this.position, seen.position);
            if (d <= this.stats.attackRange) {
              this.target = seen;
              this.state = "attacking";
              this.cooldown = 0;
            }
          } else {
            this.target = seen;
            this.state = "engaging";
          }
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
        } else if (this.holding) {
          // Hold: refuse the chase, drop back to the line.
          this.target = null;
          this.state = "idle";
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
          if (this.holding) {
            // Hold: no pursuit — back to the line.
            this.target = null;
            this.state = "idle";
          } else {
            this.state = "engaging";
          }
          break;
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          this.cooldown = this.stats.attackCooldown;
          const dir = t.position.subtract(this.position);
          dir.y = 0;
          const wasAlive = t.alive;
          // Flanking (task 289), pursuit (task 354), and the charge all shape
          // this blow: routers and the surrendered are struck down at 1.5x,
          // and a charge ends with its first strike, win or lose.
          let amount = this.stats.damage * this.flankMultiplier(t);
          if (t.isRouting || t.isSurrendered) amount *= PURSUIT_MULT;
          t.soldier.damage(amount, dir);
          this.charging = false;
          this.onStrike?.(this, t, amount, wasAlive && !t.alive);
        }
        break;
      }

      case "dead":
        break;

      case "routing": {
        // Flee: no acquiring, no striking, no orders taken. Reaching the rout
        // point leaves the field — the brain is out of the fight, not dead.
        if (this.routTarget !== null && this.moveToward(this.routTarget, dt)) {
          this.hasFled = true;
        }
        break;
      }

      case "surrendered":
        // Waiting to be taken. Nothing to do.
        break;
    }
  }
}
