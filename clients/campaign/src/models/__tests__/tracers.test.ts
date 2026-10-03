/**
 * Task 742: tracer rounds, and the toggle that controls them.
 *
 * The toggle is the interesting half. It has to reach tracers already in flight,
 * and it has to cost nothing when it is off.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MuzzleFlashPool } from '../MuzzleFlash.js';
import { TRACER_PROFILES, TracerPool, fireShot, tracerProfileFor, type Point3 } from '../Tracers.js';
import { WEAPON_CATALOGUE, weapon, type WeaponEntry } from '../WeaponCatalogue.js';

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'models');

function bytesFor(id: string): Uint8Array {
  const entry = weapon(id) as WeaponEntry;
  return new Uint8Array(readFileSync(join(modelsDir, entry.file)));
}

const TARGET: Point3 = { x: 0, y: 0, z: 120 };

describe("tracer profiles (task 742)", () => {
  it("has a profile for every weapon class, and only real weapons fire tracers", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const profile = tracerProfileFor(entry);
      expect(profile, entry.id).toBeDefined();
      if (profile.tracerFed) {
        expect(profile.speed, entry.id).toBeGreaterThan(0);
        expect(profile.lifeS, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it("does not give the shotgun a tracer: it fires pellets", () => {
    expect(tracerProfileFor(weapon('weapon-scarl') as WeaponEntry).tracerFed).toBe(false);
    expect(tracerProfileFor(weapon('weapon-ak74') as WeaponEntry).tracerFed).toBe(true);
  });

  it("gives every tracer a sane speed, width and lifetime", () => {
    for (const [name, profile] of Object.entries(TRACER_PROFILES)) {
      if (!profile.tracerFed) {
        // Melee and thrown things are not slung rounds: no width, no life.
        expect(profile.widthM, name).toBe(0);
        expect(profile.lifeS, name).toBe(0);
        continue;
      }
      expect(profile.widthM, name).toBeGreaterThan(0);
      expect(profile.widthM, name).toBeLessThan(0.2);
      expect(profile.speed, name).toBeGreaterThan(500);
      expect(profile.speed, name).toBeLessThan(1000);
      expect(profile.lifeS, name).toBeGreaterThan(0);
    }
  });
});

describe("firing a tracer (task 742)", () => {
  it("starts at the weapon's muzzle and ends at the target", () => {
    const pool = new TracerPool();
    const bytes = bytesFor('weapon-ak74');
    const tracer = pool.fire('weapon-ak74', bytes, TARGET);
    expect(tracer).not.toBeNull();
    // The muzzle is not the origin, and the target is not the muzzle.
    expect((tracer as { from: { x: number } }).from.x).toBeGreaterThan(0);
    expect((tracer as { to: { z: number } }).to.z).toBe(120);
    expect(pool.size).toBe(1);
  });

  it("refuses a weapon that does not feed tracer", () => {
    const pool = new TracerPool();
    expect(pool.fire('weapon-scarl', bytesFor('weapon-scarl'), TARGET)).toBeNull();
    expect(pool.size).toBe(0);
  });

  it("refuses a weapon it does not know", () => {
    const pool = new TracerPool();
    expect(pool.fire('weapon-not-a-gun', bytesFor('weapon-ak74'), TARGET)).toBeNull();
  });
});

describe("the toggle (task 742)", () => {
  it("fires nothing while it is off, rather than firing and hiding", () => {
    const pool = new TracerPool();
    pool.setEnabled(false);
    expect(pool.enabled).toBe(false);
    expect(pool.fire('weapon-ak74', bytesFor('weapon-ak74'), TARGET)).toBeNull();
    expect(pool.size).toBe(0);
  });

  it("clears tracers already in flight when it is turned off", () => {
    // A tracer drawn for another half second after the setting says tracers are
    // off is the bug this exists to prevent.
    const pool = new TracerPool();
    pool.fire('weapon-ak74', bytesFor('weapon-ak74'), TARGET);
    expect(pool.size).toBe(1);
    pool.setEnabled(false);
    expect(pool.size).toBe(0);
  });

  it("fires again when it is turned back on", () => {
    const pool = new TracerPool();
    pool.setEnabled(false);
    pool.setEnabled(true);
    expect(pool.fire('weapon-ak74', bytesFor('weapon-ak74'), TARGET)).not.toBeNull();
  });

  it("treats being told the same thing twice as no change", () => {
    const pool = new TracerPool();
    pool.fire('weapon-ak74', bytesFor('weapon-ak74'), TARGET);
    pool.setEnabled(true);
    // Nothing was cleared, because nothing changed.
    expect(pool.size).toBe(1);
  });
});

describe("the life of a tracer (task 742)", () => {
  it("fades over its lifetime and then goes", () => {
    const pool = new TracerPool();
    const tracer = pool.fire('weapon-ak74', bytesFor('weapon-ak74'), TARGET);
    if (!tracer) throw new Error('expected a tracer');
    pool.update(tracer.lifeS / 2);
    expect(pool.size).toBe(1);
    expect(pool.tracers()[0]?.life).toBeCloseTo(0.5, 5);
    pool.update(tracer.lifeS);
    expect(pool.size).toBe(0);
  });

  it("travels at its own speed", () => {
    const pool = new TracerPool();
    const tracer = pool.fire('weapon-ak74', bytesFor('weapon-ak74'), TARGET);
    if (!tracer) throw new Error('expected a tracer');
    pool.update(0.1);
    expect(TracerPool.travelled(tracer)).toBeCloseTo(tracer.speed * 0.1, 5);
  });

  it("reuses the oldest slot rather than growing past its capacity", () => {
    const pool = new TracerPool(2);
    const bytes = bytesFor('weapon-ak74');
    pool.fire('weapon-ak74', bytes, TARGET);
    pool.update(0.01);
    pool.fire('weapon-ak74', bytes, TARGET);
    pool.update(0.01);
    pool.fire('weapon-ak74', bytes, TARGET);
    expect(pool.size).toBe(2);
  });

  it("ignores a broken frame time", () => {
    const pool = new TracerPool();
    pool.fire('weapon-ak74', bytesFor('weapon-ak74'), TARGET);
    pool.update(Number.NaN);
    pool.update(-0.5);
    expect(pool.size).toBe(1);
    pool.clear();
    expect(pool.size).toBe(0);
  });

  it("refuses a pool it could never allocate", () => {
    expect(() => new TracerPool(0)).toThrow(RangeError);
  });
});

describe("a shot is a flash and a tracer together (task 741, 742)", () => {
  it("fires both from one call, and the flash survives tracers being off", () => {
    const flashes = new MuzzleFlashPool(4);
    const tracers = new TracerPool();
    const bytes = bytesFor('weapon-ak74');
    tracers.setEnabled(false);
    const shot = fireShot(flashes, tracers, 'weapon-ak74', bytes, TARGET);
    expect(shot.flash).not.toBeNull();
    expect(shot.tracer).toBeNull();
    expect(flashes.size).toBe(1);
  });

  it("gives a shotgun a flash and no tracer", () => {
    const flashes = new MuzzleFlashPool(4);
    const tracers = new TracerPool();
    const shot = fireShot(flashes, tracers, 'weapon-scarl', bytesFor('weapon-scarl'), TARGET);
    expect(shot.flash).not.toBeNull();
    expect(shot.tracer).toBeNull();
  });
});
