/**
 * Tasks 649 to 651: blood decals, corpse pools, and the switch that turns them
 * off.
 *
 * The lifetimes are the task numbers themselves -- 30 s for a hit decal, 60 s for
 * a pool -- and the bounds are what stop blood from being a memory leak: a
 * maximum count and a maximum area *per target*, oldest first, so a fresh hit is
 * always the mark that survives and a wall of corpses cannot starve another
 * target's blood off the field.
 *
 * Task 651 is tested through an injected settings store, because the settings
 * module is another lane's: what matters here is that blood off removes the marks
 * rather than hiding them, and that a missing or nonsense setting leaves blood
 * *on*, because turning it off has to be a deliberate act.
 */

import { describe, expect, it } from "vitest";
import {
  BLOOD_DECAL_LIFETIME_S,
  BLOOD_ON,
  BLOOD_OFF,
  BLOOD_POOL_LIFETIME_S,
  BloodDecals,
  HIT_DECAL_AREA_M2,
  MAX_BLOOD_AREA_M2,
  MAX_BLOOD_MARKS,
  POOL_AREA_M2,
  bloodOpacityAt,
  readBloodSettings,
} from "../BloodDecals.js";

const AT = { x: 0, y: 1.2, z: 0.1 };

describe("lifetimes (task 649, 650)", () => {
  it("fades a hit decal over 30 s and a pool over 60", () => {
    expect(BLOOD_DECAL_LIFETIME_S).toBe(30);
    expect(BLOOD_POOL_LIFETIME_S).toBe(60);
    const blood = new BloodDecals();
    const decal = blood.addHitDecal('troop-a', AT);
    const pool = blood.addPool('troop-a', AT);
    expect(decal?.lifetimeS).toBe(30);
    expect(pool?.lifetimeS).toBe(60);
    expect(decal?.areaM2).toBe(HIT_DECAL_AREA_M2);
    expect(pool?.areaM2).toBe(POOL_AREA_M2);
  });

  it("expires a decal at 30 s and a pool at 60", () => {
    const blood = new BloodDecals();
    const decal = blood.addHitDecal('t', AT)!;
    const pool = blood.addPool('t', AT)!;
    expect(blood.update(29).live.length).toBe(2);
    const afterDecal = blood.update(1);
    expect(afterDecal.expired).toContain(decal.id);
    expect(afterDecal.live.map((m) => m.id)).toContain(pool.id);
    const afterPool = blood.update(30);
    expect(afterPool.expired).toContain(pool.id);
    expect(afterPool.live).toEqual([]);
  });

  it("fades a decal throughout and a pool only at the end", () => {
    const blood = new BloodDecals();
    const decal = blood.addHitDecal('t', AT)!;
    const pool = blood.addPool('t', AT)!;
    expect(bloodOpacityAt({ ...decal, ageS: decal.lifetimeS / 2 })).toBeCloseTo(0.5);
    expect(bloodOpacityAt({ ...pool, ageS: pool.lifetimeS / 2 })).toBeGreaterThan(0.7);
    expect(bloodOpacityAt({ ...decal, ageS: decal.lifetimeS * 2 })).toBe(0);
    expect(bloodOpacityAt({ ...pool, ageS: pool.lifetimeS * 3 })).toBe(0);
  });
});

describe("bounds (task 649)", () => {
  it("keeps at most the maximum number of marks on one target", () => {
    const blood = new BloodDecals();
    for (let i = 0; i < MAX_BLOOD_MARKS + 10; i++) blood.addHitDecal('t', { x: i * 0.01, y: 0, z: 0 });
    const frame = blood.update(1 / 60);
    expect(blood.marksOn('t').length).toBeLessThanOrEqual(MAX_BLOOD_MARKS);
    expect(frame.evicted.length).toBeGreaterThan(0);
  });

  it("keeps the total area on one target under the cap", () => {
    const blood = new BloodDecals();
    // Fewer, larger marks: the count is fine, the area is not.
    for (let i = 0; i < 8; i++) blood.addHitDecal('t', AT, 1);
    const frame = blood.update(1 / 60);
    const total = Object.values(frame.areaByTarget).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(MAX_BLOOD_AREA_M2 + 1e-9);
  });

  it("drops the oldest mark, so a fresh hit is the one that survives", () => {
    const blood = new BloodDecals(undefined, 1, MAX_BLOOD_AREA_M2);
    const first = blood.addHitDecal('t', AT)!;
    blood.update(5);
    const fresh = blood.addHitDecal('t', AT)!;
    const frame = blood.update(1 / 60);
    expect(frame.evicted).toContain(first.id);
    expect(frame.live.map((m) => m.id)).toContain(fresh.id);
  });

  it("bounds each target separately, so a pile of corpses cannot starve another", () => {
    const blood = new BloodDecals(undefined, 2, MAX_BLOOD_AREA_M2);
    for (let i = 0; i < 5; i++) blood.addHitDecal('corpse-a', AT);
    for (let i = 0; i < 5; i++) blood.addHitDecal('corpse-b', AT);
    const frame = blood.update(1 / 60);
    expect(blood.marksOn('corpse-a').length).toBe(2);
    expect(blood.marksOn('corpse-b').length).toBe(2);
    expect(frame.evicted.length).toBe(6);
  });

  it("clears a target when it is recycled", () => {
    const blood = new BloodDecals();
    blood.addHitDecal('t', AT);
    blood.addPool('t', AT);
    blood.addHitDecal('other', AT);
    expect(blood.clearTarget('t')).toBe(2);
    expect(blood.marksOn('t')).toEqual([]);
    expect(blood.marksOn('other').length).toBe(1);
    expect(blood.clearTarget('never-hit')).toBe(0);
  });
});

describe("the blood toggle (task 651)", () => {
  it("adds nothing while blood is off", () => {
    const blood = new BloodDecals(BLOOD_OFF);
    expect(blood.addHitDecal('t', AT)).toBeNull();
    expect(blood.addPool('t', AT)).toBeNull();
    expect(blood.update(1 / 60).live).toEqual([]);
  });

  it("takes the marks off the field when blood is turned off mid-fight", () => {
    const blood = new BloodDecals();
    for (let i = 0; i < 5; i++) blood.addHitDecal('t', AT);
    expect(blood.count).toBe(5);
    blood.setSettings(BLOOD_OFF);
    const frame = blood.update(1 / 60);
    expect(frame.evicted).toHaveLength(5);
    expect(blood.count).toBe(0);
  });

  it("shortens lifetimes rather than resizing marks, at reduced intensity", () => {
    const full = new BloodDecals();
    const reduced = new BloodDecals({ enabled: true, intensity: 0.5 });
    const a = full.addHitDecal('t', AT)!;
    const b = reduced.addHitDecal('t', AT)!;
    expect(b.lifetimeS).toBeCloseTo(a.lifetimeS * 0.5);
    expect(b.areaM2).toBe(a.areaM2);
    expect(bloodOpacityAt({ ...b, ageS: b.lifetimeS })).toBe(0);
  });

  it("never fades below a floor, so marks still expire", () => {
    const blood = new BloodDecals({ enabled: true, intensity: 0 });
    const mark = blood.addHitDecal('t', AT)!;
    expect(mark.lifetimeS).toBeGreaterThan(0);
    blood.update(BLOOD_DECAL_LIFETIME_S * 2);
    expect(blood.count).toBe(0);
  });

  it("is on by default, with the documented intensity", () => {
    expect(BLOOD_ON.enabled).toBe(true);
    expect(BLOOD_ON.intensity).toBe(1);
    expect(BLOOD_OFF.enabled).toBe(false);
  });

  it("reads the setting from a store and leaves blood on by default", () => {
    expect(readBloodSettings(() => undefined)).toEqual({ enabled: true, intensity: 1 });
    expect(readBloodSettings((key) => (key === 'blood' ? false : 1))).toEqual({
      enabled: false,
      intensity: 1,
    });
    expect(readBloodSettings(() => true).enabled).toBe(true);
    // Only an explicit false turns it off.
    expect(readBloodSettings(() => 0).enabled).toBe(true);
  });

  it("clamps a nonsense intensity", () => {
    expect(readBloodSettings(() => 5).intensity).toBe(1);
    expect(readBloodSettings(() => -2).intensity).toBe(0);
    expect(readBloodSettings(() => Number.NaN).intensity).toBe(1);
  });

  it("ignores a broken mark area and a broken frame time", () => {
    const blood = new BloodDecals();
    const mark = blood.addHitDecal('t', AT, Number.NaN)!;
    expect(mark.areaM2).toBe(HIT_DECAL_AREA_M2);
    expect(blood.addHitDecal('t', AT, -5)?.areaM2).toBe(HIT_DECAL_AREA_M2);
    const before = blood.count;
    blood.update(Number.NaN);
    expect(blood.count).toBe(before);
  });

  it("reports zero opacity for a mark with no life", () => {
    const blood = new BloodDecals();
    const mark = blood.addHitDecal('t', AT)!;
    expect(bloodOpacityAt({ ...mark, lifetimeS: 0 })).toBe(0);
    expect(bloodOpacityAt({ ...mark, ageS: -5 })).toBe(1);
  });
});