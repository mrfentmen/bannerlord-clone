/**
 * Tasks 341-360 (the client half): per-unit morale for the rendered battle.
 *
 * The Go sim owns the strategic morale model; this is what the player SEES:
 * each brain carries 0..1 morale, checked every 5 seconds against the state of
 * the field. At 0 the brain routs — flees for its own edge and stops fighting.
 * Below 0.25 it wavers, which the waver markers show. Far from the enemy a
 * router's nerve returns and it rallies; surrounded, it surrenders instead of
 * running.
 *
 * Every number here is a documented constant, every modifier is computed from
 * brains that actually exist, and the whole thing is deterministic given the
 * same brains — no hidden randomness, so replays agree with the live fight.
 */

import { Vector3 } from "@babylonjs/core";
import type { UnitBrain } from "./battleUnit.js";

/** Seconds between morale checks (task 349). */
export const MORALE_CHECK_S = 5;
/** Base morale every brain starts at (task 341). */
export const BASE_MORALE = 1;
/** An ally death this close shakes the survivors (tasks 271, 343-344). */
export const ALLY_DEATH_RADIUS_M = 15;
export const ALLY_DEATH_HIT = 0.12;
/** Outnumbered past this ratio (task 345). */
export const OUTNUMBERED_RATIO = 1.5;
export const OUTNUMBERED_HIT = 0.1;
/** An enemy in the rear arc (task 346). */
export const FLANKED_HIT = 0.08;
/** Only enemies this close count as flanking — a distant enemy to your side is not on your flank. */
export const FLANKED_RADIUS_M = 12;
/** A routing ally this close spreads the panic (task 348). */
export const CONTAGION_RADIUS_M = 20;
export const CONTAGION_HIT = 0.05;
/** Killing faster than the other side (task 343). */
export const WINNING_BONUS = 0.05;
/** Dying faster than the other side (task 344). */
export const LOSING_HIT = 0.08;
/** A router this far from any enemy starts to steady (task 356). */
export const RALLY_SAFE_RADIUS_M = 40;
export const RALLY_RECOVERY_PER_CHECK = 0.15;
/** A router with this many enemies this close gives up (task 355). */
export const SURRENDER_ENEMIES = 3;
export const SURRENDER_RADIUS_M = 6;

export interface MoraleSystemOptions {
  /** Where a routing brain of `team` runs. */
  routPointFor: (team: number) => Vector3;
}

interface DeathMark {
  team: number;
  x: number;
  z: number;
}

/**
 * The morale check for one brain, pure: the same brains always give the same
 * delta. Exported for tests.
 */
export function moraleDelta(
  brain: UnitBrain,
  brains: UnitBrain[],
  deaths: DeathMark[],
): number {
  let delta = 0;
  const allies = brains.filter((b) => b.team === brain.team && b.alive);
  const enemies = brains.filter((b) => b.team !== brain.team && b.alive);
  const allyCount = allies.length;
  const enemyCount = enemies.length;

  // Ally deaths nearby (tasks 271, 344).
  for (const d of deaths) {
    if (d.team !== brain.team) continue;
    const dist = Math.hypot(d.x - brain.position.x, d.z - brain.position.z);
    if (dist <= ALLY_DEATH_RADIUS_M) delta -= ALLY_DEATH_HIT;
  }

  // Winning / losing: who is dying faster (tasks 343, 344).
  const allyDead = brains.filter((b) => b.team === brain.team && !b.alive).length;
  const enemyDead = brains.filter((b) => b.team !== brain.team && !b.alive).length;
  if (enemyDead > allyDead) delta += WINNING_BONUS;
  else if (allyDead > enemyDead) delta -= LOSING_HIT;

  // Outnumbered (task 345).
  if (allyCount > 0 && enemyCount / allyCount > OUTNUMBERED_RATIO) delta -= OUTNUMBERED_HIT;

  // Flanked: a living enemy in the rear arc, close enough to matter (task 346).
  for (const e of enemies) {
    const dist = Math.hypot(e.position.x - brain.position.x, e.position.z - brain.position.z);
    if (dist <= FLANKED_RADIUS_M && e.flankMultiplier(brain) > 1.01) {
      delta -= FLANKED_HIT;
      break;
    }
  }

  // Contagion: routing allies nearby (task 348).
  for (const a of allies) {
    if (a === brain || !a.isRouting) continue;
    const dist = Math.hypot(a.position.x - brain.position.x, a.position.z - brain.position.z);
    if (dist <= CONTAGION_RADIUS_M) delta -= CONTAGION_HIT;
  }

  return delta;
}

export class MoraleSystem {
  private timer = 0;
  private lastAlive = new Set<UnitBrain>();

  constructor(
    private readonly brains: UnitBrain[],
    private readonly options: MoraleSystemOptions,
  ) {
    // Deaths are found by diffing the alive set each check: the victim's last
    // position is exact, and a death shakes exactly the check that finds it.
    for (const b of brains) if (b.alive) this.lastAlive.add(b);
  }

  /** Advance morale. Call every frame; checks run every MORALE_CHECK_S. */
  update(dt: number): void {
    this.timer += dt;
    if (this.timer < MORALE_CHECK_S) return;
    this.timer = 0;
    this.check();
  }

  private check(): void {
    const deaths: DeathMark[] = [];
    const alive = new Set<UnitBrain>();
    for (const b of this.brains) {
      if (b.alive) alive.add(b);
    }
    for (const b of this.lastAlive) {
      if (!alive.has(b)) {
        deaths.push({ team: b.team, x: b.position.x, z: b.position.z });
      }
    }
    this.lastAlive = alive;

    for (const brain of this.brains) {
      if (!brain.alive) continue;

      if (brain.isRouting) {
        this.checkRouter(brain);
        continue;
      }
      if (brain.isSurrendered) continue;

      brain.morale = Math.max(0, Math.min(1, brain.morale + moraleDelta(brain, this.brains, deaths)));
      if (brain.morale <= 0) {
        brain.startRout(this.options.routPointFor(brain.team));
      }
    }
  }

  /** A router either rallies, surrenders, or keeps running. */
  private checkRouter(brain: UnitBrain): void {
    const enemies = this.brains.filter((b) => b.team !== brain.team && b.alive);
    let nearest = Infinity;
    let close = 0;
    for (const e of enemies) {
      const d = Math.hypot(e.position.x - brain.position.x, e.position.z - brain.position.z);
      if (d < nearest) nearest = d;
      if (d <= SURRENDER_RADIUS_M) close++;
    }
    // Surrounded: give up (task 355).
    if (close >= SURRENDER_ENEMIES) {
      brain.surrender();
      return;
    }
    // Far from the enemy: nerve returns (task 356).
    if (nearest >= RALLY_SAFE_RADIUS_M) {
      brain.morale = Math.min(1, brain.morale + RALLY_RECOVERY_PER_CHECK);
      if (brain.morale >= 0.3) brain.rally();
    }
  }

  destroy(): void {
    this.lastAlive.clear();
  }
}
