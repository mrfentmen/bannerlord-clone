/**
 * Task 741: muzzle flash, seated on the sockets task 731 resolved.
 *
 * The point of this suite is that the flash comes from the weapon: its seat is
 * that weapon's muzzle, its size is a fraction of that weapon's length, and two
 * shots in one frame are two flashes.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLASH_PROFILES, MuzzleFlashPool, flashProfileFor } from '../MuzzleFlash.js';
import { WEAPON_CATALOGUE, weapon, weaponSockets, type WeaponEntry } from '../WeaponCatalogue.js';

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'models');

function bytesFor(id: string): Uint8Array {
  const entry = weapon(id) as WeaponEntry;
  return new Uint8Array(readFileSync(join(modelsDir, entry.file)));
}

describe("flash profiles (task 741)", () => {
  it("has a profile for every weapon class the catalogue uses", () => {
    for (const entry of WEAPON_CATALOGUE) {
      expect(FLASH_PROFILES[entry.class], entry.id).toBeDefined();
      expect(flashProfileFor(entry).durationS, entry.id).toBeGreaterThan(0);
    }
  });

  it("burns a shotgun's flash longer and wider than a pistol's", () => {
    const shotgun = flashProfileFor(weapon('weapon-scarl') as WeaponEntry);
    const pistol = flashProfileFor(weapon('weapon-p226') as WeaponEntry);
    expect(shotgun.durationS).toBeGreaterThan(pistol.durationS);
    expect(shotgun.size).toBeGreaterThan(pistol.size);
    expect(shotgun.smoke).toBe(true);
    expect(pistol.smoke).toBe(false);
  });

  it("gives melee nothing, because a sword has no muzzle", () => {
    expect(FLASH_PROFILES.melee.durationS).toBe(0);
  });
});

describe("seating the flash on the weapon (task 741)", () => {
  it("puts it exactly at that weapon's muzzle", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const bytes = bytesFor(entry.id);
      const flash = new MuzzleFlashPool(8).fire(entry.id, bytes);
      expect(flash, entry.id).not.toBeNull();
      const muzzle = weaponSockets(entry, bytes).muzzle;
      expect((flash as { offset: { x: number } }).offset.x, entry.id).toBe(muzzle?.offset.x);
      expect((flash as { offset: { y: number } }).offset.y, entry.id).toBe(muzzle?.offset.y);
    }
  });

  it("scales the flash to the weapon, so a pistol does not get a rifle's bloom", () => {
    const rifle = new MuzzleFlashPool(4).fire('weapon-ak74', bytesFor('weapon-ak74'));
    const pistol = new MuzzleFlashPool(4).fire('weapon-p226', bytesFor('weapon-p226'));
    expect((rifle as { sizeM: number }).sizeM).toBeGreaterThan((pistol as { sizeM: number }).sizeM);
    // ...and both are within a sane range of their own weapon's length.
    expect((rifle as { sizeM: number }).sizeM).toBeLessThan(0.9);
    expect((pistol as { sizeM: number }).sizeM).toBeLessThan(0.2);
  });

  it("refuses a weapon it does not know rather than flashing at the origin", () => {
    const pool = new MuzzleFlashPool(4);
    expect(pool.fire('weapon-not-a-gun', bytesFor('weapon-ak74'))).toBeNull();
    expect(pool.size).toBe(0);
  });

  it("refuses a melee weapon, which has no muzzle socket", () => {
    // No melee weapon is staged yet, so this is asserted through the profile the
    // catalogue would hand back rather than by inventing a file.
    expect(flashProfileFor({ class: 'melee' } as WeaponEntry).durationS).toBe(0);
  });
});

describe("the life of a flash (task 741)", () => {
  it("burns for its duration, then goes out", () => {
    const pool = new MuzzleFlashPool(4);
    pool.fire('weapon-ak74', bytesFor('weapon-ak74'));
    expect(pool.size).toBe(1);
    pool.update(0.02);
    expect(pool.size).toBe(1);
    expect(pool.flashes()[0]?.life).toBeLessThan(1);
    pool.update(0.1);
    expect(pool.size).toBe(0);
  });

  it("gives two shots in one frame two flashes", () => {
    const pool = new MuzzleFlashPool(4);
    const bytes = bytesFor('weapon-m3a1');
    const first = pool.fire('weapon-m3a1', bytes);
    const second = pool.fire('weapon-m3a1', bytes);
    expect(first?.id).not.toBe(second?.id);
    expect(pool.size).toBe(2);
  });

  it("reuses the oldest slot when it is full, rather than growing", () => {
    const pool = new MuzzleFlashPool(2);
    const bytes = bytesFor('weapon-ak74');
    pool.fire('weapon-ak74', bytes);
    pool.update(0.01);
    pool.fire('weapon-ak74', bytes);
    pool.update(0.01);
    pool.fire('weapon-ak74', bytes);
    expect(pool.size).toBe(2);
    // The first flash's slot was taken over rather than a third one appearing.
    expect(pool.flashes().map((f) => f.id).sort()).toEqual([0, 1]);
  });

  it("refuses a pool it could never allocate", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => new MuzzleFlashPool(bad), String(bad)).toThrow(RangeError);
    }
  });

  it("ignores a broken frame time instead of aging flashes backwards", () => {
    const pool = new MuzzleFlashPool(2);
    pool.fire('weapon-ak74', bytesFor('weapon-ak74'));
    pool.update(Number.NaN);
    pool.update(-1);
    expect(pool.size).toBe(1);
    expect(pool.flashes()[0]?.ageS).toBe(0);
    pool.clear();
    expect(pool.size).toBe(0);
  });
});
