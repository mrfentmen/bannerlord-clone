/**
 * Task 665 (modernized): explosion effect.
 *
 * The medieval spec says "catapult: fire anim". The modern equivalent is an
 * artillery/mortar strike, and no explosion GLB is staged anywhere in the
 * manifest -- so the explosion is a real-time effect, not a model: a fireball
 * that blooms and fades, a shockwave ring that races outward along the ground,
 * a point-light flash for night battles, and a debris burst. The renderer
 * binds meshes/lights to the live entries; this module owns the part that
 * goes wrong quietly -- timing, scale, and the damage falloff the gameplay
 * code reads.
 *
 * Phases, in seconds: flash (0-0.12, white-hot), fireball (0-0.6, orange,
 * rising), shockwave (0.1-0.9, ground ring), smoke (0.5-4, lingering column).
 * Total life is 4 seconds; the damage is dealt once, at detonation.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** How big the bang is. */
export type ExplosionSize = 'breach' | 'mortar' | 'artillery';

export interface ExplosionProfile {
  /** Fireball max radius, metres. */
  fireballM: number;
  /** Shockwave max radius, metres. */
  shockM: number;
  /** Direct-hit damage at ground zero. */
  damage: number;
  /** Beyond this radius the blast does nothing, metres. */
  falloffM: number;
  /** How long the smoke hangs, seconds. */
  smokeS: number;
}

/** Profiles by size. A breach charge is a door, not a city block. */
export const EXPLOSION_PROFILES: Readonly<Record<ExplosionSize, ExplosionProfile>> = {
  breach: { fireballM: 1.2, shockM: 4, damage: 120, falloffM: 6, smokeS: 2 },
  mortar: { fireballM: 2.5, shockM: 10, damage: 90, falloffM: 14, smokeS: 3 },
  artillery: { fireballM: 5, shockM: 22, damage: 160, falloffM: 30, smokeS: 4 },
};

/** Task 666 (modernized): the catapult's 30-second reload is the artillery cooldown. */
export const ARTILLERY_COOLDOWN_S = 30;

/** One live explosion. */
export interface LiveExplosion {
  id: number;
  at: Vec3;
  profile: ExplosionProfile;
  ageS: number;
  /** True once the damage has been dealt (exactly once, at age 0). */
  damageDealt: boolean;
}

/**
 * Owns live explosions: spawn, tick, and the damage falloff.
 * The scene binds visuals to `live`; gameplay reads `damageAt`.
 */
export class ExplosionEffect {
  private nextId = 1;
  private explosions: LiveExplosion[] = [];

  /** Detonate. Damage is dealt on the first tick, not here, so the caller can batch. */
  detonate(at: Vec3, size: ExplosionSize): LiveExplosion {
    const ex: LiveExplosion = {
      id: this.nextId++,
      at: { ...at },
      profile: EXPLOSION_PROFILES[size],
      ageS: 0,
      damageDealt: false,
    };
    this.explosions.push(ex);
    return ex;
  }

  /** Advance all explosions; returns the ones that finished this tick. */
  update(dtS: number): LiveExplosion[] {
    const done: LiveExplosion[] = [];
    for (const ex of this.explosions) {
      ex.ageS += dtS;
      if (ex.ageS >= ex.profile.smokeS) done.push(ex);
    }
    if (done.length > 0) {
      const doneIds = new Set(done.map((d) => d.id));
      this.explosions = this.explosions.filter((e) => !doneIds.has(e.id));
    }
    return done;
  }

  /**
   * Damage at a point, with linear falloff from ground zero to falloffM.
   * Call once per explosion per target; the caller marks damageDealt.
   */
  damageAt(ex: LiveExplosion, point: Vec3): number {
    const dx = point.x - ex.at.x;
    const dy = point.y - ex.at.y;
    const dz = point.z - ex.at.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist >= ex.profile.falloffM) return 0;
    return ex.profile.damage * (1 - dist / ex.profile.falloffM);
  }

  /** Fireball radius right now (blooms to a peak at 0.3 s, gone by 0.6 s). */
  fireballRadius(ex: LiveExplosion): number {
    const t = Math.min(1, ex.ageS / 0.6);
    return ex.profile.fireballM * Math.sin(t * Math.PI);
  }

  /** Shockwave ring radius right now (races out 0.1-0.9 s). */
  shockRadius(ex: LiveExplosion): number {
    const t = Math.min(1, Math.max(0, (ex.ageS - 0.1) / 0.8));
    return ex.profile.shockM * t;
  }

  /** All live explosions, for the renderer. */
  get live(): readonly LiveExplosion[] {
    return this.explosions;
  }

  clear(): void {
    this.explosions = [];
  }
}
