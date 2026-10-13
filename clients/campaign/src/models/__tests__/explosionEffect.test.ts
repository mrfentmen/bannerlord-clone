/**
 * Tasks 665-666, modernized: the explosion effect.
 *
 * The catapult's fire mission is an artillery strike now. Tests pin the parts
 * that gameplay depends on: damage is dealt once with linear falloff, the
 * fireball blooms and fades on schedule, the shockwave races outward, finished
 * explosions leave the live set, and the artillery cooldown is 30 seconds.
 */

import { describe, expect, it } from "vitest";
import {
  ARTILLERY_COOLDOWN_S,
  EXPLOSION_PROFILES,
  ExplosionEffect,
} from "../ExplosionEffect.js";

describe("ExplosionEffect (tasks 665-666 modernized)", () => {
  it("detonates and tracks a live explosion", () => {
    const fx = new ExplosionEffect();
    const ex = fx.detonate({ x: 0, y: 0, z: 0 }, 'mortar');
    expect(fx.live).toHaveLength(1);
    expect(ex.damageDealt).toBe(false);
  });

  it("deals full damage at ground zero, none past falloff, linear between", () => {
    const fx = new ExplosionEffect();
    const ex = fx.detonate({ x: 0, y: 0, z: 0 }, 'mortar');
    const profile = EXPLOSION_PROFILES.mortar;
    expect(fx.damageAt(ex, { x: 0, y: 0, z: 0 })).toBe(profile.damage);
    expect(fx.damageAt(ex, { x: profile.falloffM, y: 0, z: 0 })).toBe(0);
    expect(fx.damageAt(ex, { x: profile.falloffM * 2, y: 0, z: 0 })).toBe(0);
    const half = fx.damageAt(ex, { x: profile.falloffM / 2, y: 0, z: 0 });
    expect(half).toBeCloseTo(profile.damage / 2, 6);
  });

  it("a breach charge is smaller and shorter than artillery", () => {
    expect(EXPLOSION_PROFILES.breach.fireballM).toBeLessThan(EXPLOSION_PROFILES.artillery.fireballM);
    expect(EXPLOSION_PROFILES.breach.falloffM).toBeLessThan(EXPLOSION_PROFILES.artillery.falloffM);
  });

  it("fireball blooms then fades; shockwave races outward", () => {
    const fx = new ExplosionEffect();
    const ex = fx.detonate({ x: 0, y: 0, z: 0 }, 'mortar');
    const early = fx.fireballRadius({ ...ex, ageS: 0.05 });
    const peak = fx.fireballRadius({ ...ex, ageS: 0.3 });
    const late = fx.fireballRadius({ ...ex, ageS: 0.59 });
    expect(peak).toBeGreaterThan(early);
    expect(late).toBeLessThan(peak);
    expect(fx.shockRadius({ ...ex, ageS: 0.05 })).toBe(0);
    expect(fx.shockRadius({ ...ex, ageS: 0.9 })).toBeCloseTo(EXPLOSION_PROFILES.mortar.shockM, 6);
  });

  it("removes finished explosions from the live set", () => {
    const fx = new ExplosionEffect();
    fx.detonate({ x: 0, y: 0, z: 0 }, 'mortar');
    const done = fx.update(EXPLOSION_PROFILES.mortar.smokeS);
    expect(done).toHaveLength(1);
    expect(fx.live).toHaveLength(0);
  });

  it("keeps young explosions across a partial tick", () => {
    const fx = new ExplosionEffect();
    fx.detonate({ x: 0, y: 0, z: 0 }, 'artillery');
    expect(fx.update(1)).toHaveLength(0);
    expect(fx.live).toHaveLength(1);
  });

  it("the artillery cooldown is 30 seconds (task 666)", () => {
    expect(ARTILLERY_COOLDOWN_S).toBe(30);
  });
});
