/**
 * Task 742: tracer rounds, toggleable.
 *
 * Two things make this more than a boolean. The toggle has to reach every live
 * tracer, not just future ones -- a tracer already in flight when the setting is
 * turned off is a tracer someone will see after they turned tracers off. And the
 * toggle has to be honest about being per-setting rather than global, because a
 * settings menu that lies about the state of a toggle is worse than no toggle.
 *
 * The tracer itself is a straight line from the muzzle at the moment of firing to
 * wherever the bullet ends up, so this owns the endpoints, the speed and the
 * lifetime, and the renderer draws the line between them.
 */

import { MuzzleFlashPool } from './MuzzleFlash.js';
import { WEAPON_CATALOGUE, weaponSockets, type WeaponEntry } from './WeaponCatalogue.js';

/** How a weapon's tracer behaves. */
export interface TracerProfile {
  /** Metres per second the tracer travels. */
  speed: number;
  /** Seconds a tracer lives once fired, before it fades. */
  lifeS: number;
  /** 0.06 to 0.12: thin and hot to fat and lazy. */
  widthM: number;
  /** Does this weapon fire tracers at all. */
  tracerFed: boolean;
}

/** The no-tracer profile, used by melee, thrown weapons and anything unstaged. */
const NO_TRACER: TracerProfile = { speed: 0, lifeS: 0, widthM: 0, tracerFed: false };

/** Tracer profiles by weapon class. */
export const TRACER_PROFILES: Readonly<Record<string, TracerProfile>> = {
  rifle: { speed: 840, lifeS: 0.55, widthM: 0.07, tracerFed: true },
  sniper: { speed: 850, lifeS: 0.9, widthM: 0.08, tracerFed: true },
  smg: { speed: 780, lifeS: 0.4, widthM: 0.06, tracerFed: true },
  // No tracer and no width: a shotgun fires pellets, so every number here would
  // be dead data describing a round this weapon does not have.
  shotgun: NO_TRACER,
  pistol: { speed: 720, lifeS: 0.45, widthM: 0.06, tracerFed: true },
  lmg: { speed: 820, lifeS: 0.6, widthM: 0.08, tracerFed: true },
  melee: NO_TRACER,
  grenade: NO_TRACER,
  launcher: NO_TRACER,
};

/** A tracer in flight. */
export interface LiveTracer {
  id: number;
  /** World-space start: the muzzle, transformed. */
  from: { x: number; y: number; z: number };
  /** World-space end: where the bullet is going. */
  to: { x: number; y: number; z: number };
  /** Metres per second. */
  speed: number;
  /** Seconds since it was fired. */
  ageS: number;
  /** Seconds before it fades. */
  lifeS: number;
  widthM: number;
  /** 0..1 through its life. */
  life: number;
}

/** A point in space. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** The tracer profile for a weapon's class. */
export function tracerProfileFor(entry: WeaponEntry): TracerProfile {
  return TRACER_PROFILES[entry.class] ?? NO_TRACER;
}

/**
 * Tracers on or off.
 *
 * When tracers are off, {@link TracerPool.fire} returns null and no tracer is ever
 * created -- not a tracer that is created and hidden, which costs the same and
 * shows up in a screenshot if anything forgets to check.
 */
export class TracerPool {
  private readonly live = new Map<number, LiveTracer>();
  private nextId = 0;
  private enabledFlag = true;

  constructor(readonly capacity: number = 64) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`tracer pool needs a positive capacity, got ${capacity}`);
    }
  }

  /** Whether tracers are being produced. */
  get enabled(): boolean {
    return this.enabledFlag;
  }

  /** How many tracers are in flight. */
  get size(): number {
    return this.live.size;
  }

  /**
   * Turns tracers on or off.
   *
   * Turning them off clears the tracers already in flight. Leaving them would mean
   * a tracer drawn for half a second after the setting says tracers are off, and
   * that is the kind of thing that gets reported as a bug and believed.
   */
  setEnabled(on: boolean): void {
    const next = Boolean(on);
    if (next === this.enabledFlag) return;
    this.enabledFlag = next;
    if (!next) this.live.clear();
  }

  /**
   * Fires a tracer from a weapon's muzzle toward a point.
   *
   * Returns null when tracers are off, when the weapon is not staged, or when the
   * weapon does not feed tracer -- a shotgun fires pellets, not a stream, and
   * pretending otherwise is a tracer nobody asked for.
   */
  fire(weaponId: string, weaponBytes: Uint8Array, to: Point3): LiveTracer | null {
    if (!this.enabledFlag) return null;
    const entry = WEAPON_CATALOGUE.find((w) => w.id === weaponId);
    if (!entry) return null;
    const profile = tracerProfileFor(entry);
    if (!profile.tracerFed) return null;
    const muzzle = weaponSockets(entry, weaponBytes).muzzle;
    if (!muzzle) return null;

    const reused = this.size >= this.capacity;
    let id = this.nextId;
    if (reused) {
      const oldest = [...this.live.entries()].sort(
        (a, b) => (a[1].ageS / a[1].lifeS) - (b[1].ageS / b[1].lifeS),
      )[0];
      id = oldest ? oldest[0] : 0;
    } else {
      this.nextId = (this.nextId + 1) % this.capacity;
    }

    // The start is the muzzle in the weapon's own space; the tracer is fired from
    // where the weapon is, so the caller passes the muzzle's world position as
    // `to` relative to this. Here the weapon is at the origin, which is what a
    // unit-local fire means.
    const tracer: LiveTracer = {
      id,
      from: { ...muzzle.offset },
      to: { x: to.x, y: to.y, z: to.z },
      speed: profile.speed,
      ageS: 0,
      lifeS: profile.lifeS,
      widthM: profile.widthM,
      life: 0,
    };
    this.live.set(id, tracer);
    return tracer;
  }

  /** Ages every tracer and drops the ones that have faded. */
  update(dtS: number): void {
    if (!Number.isFinite(dtS) || dtS < 0) return;
    for (const [id, tracer] of this.live) {
      tracer.ageS += dtS;
      tracer.life = tracer.lifeS > 0 ? Math.min(1, tracer.ageS / tracer.lifeS) : 1;
      if (tracer.life >= 1) this.live.delete(id);
    }
  }

  /** How far along its path a tracer has travelled, in metres. */
  static travelled(tracer: LiveTracer): number {
    return tracer.speed * tracer.ageS;
  }

  /** The tracers in flight. */
  tracers(): LiveTracer[] {
    return [...this.live.values()];
  }

  /** Empties the pool. */
  clear(): void {
    this.live.clear();
  }
}

/**
 * A convenience for a caller that has a flash pool and a tracer pool: firing both
 * from one call, so a shot cannot end up with a flash and no tracer because
 * something forgot the second line.
 */
export function fireShot(
  flashes: MuzzleFlashPool,
  tracers: TracerPool,
  weaponId: string,
  weaponBytes: Uint8Array,
  to: Point3,
): { flash: ReturnType<MuzzleFlashPool['fire']>; tracer: LiveTracer | null } {
  return {
    flash: flashes.fire(weaponId, weaponBytes),
    tracer: tracers.fire(weaponId, weaponBytes, to),
  };
}