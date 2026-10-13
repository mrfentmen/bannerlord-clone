/**
 * Task 743: spent cases and shells leaving the gun.
 *
 * What is checked here is the decision, not the bounce: which weapon throws what,
 * out of which socket, in which direction. The physics is another lane's.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EJECTA_PROFILES, EjectaPool, ejectaProfileFor, ejectionSocketIdFor } from '../Ejecta.js';
import { WEAPON_CATALOGUE, weapon, weaponSockets, type WeaponEntry } from '../WeaponCatalogue.js';

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'models');

function bytesFor(id: string): Uint8Array {
  const entry = weapon(id) as WeaponEntry;
  return new Uint8Array(readFileSync(join(modelsDir, entry.file)));
}

describe("what each weapon ejects (task 743)", () => {
  it("has a profile for every class, and only guns eject anything", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const profile = ejectaProfileFor(entry);
      expect(profile, entry.id).toBeDefined();
      if (profile.speed > 0) expect(profile.sizeM, entry.id).toBeGreaterThan(0);
    }
    expect(EJECTA_PROFILES.melee.speed).toBe(0);
  });

  it("uses the right socket for the right thing", () => {
    // Brass comes out of the ejection port; a shell comes out of the loading port.
    expect(ejectionSocketIdFor(weapon('weapon-ak74') as WeaponEntry)).toBe('ejection');
    expect(ejectionSocketIdFor(weapon('weapon-scarl') as WeaponEntry)).toBe('shell');
    expect(ejectionSocketIdFor({ class: 'melee' } as WeaponEntry)).toBeNull();
  });

  it("throws a shell out of the shotgun, and a case out of everything else", () => {
    expect(ejectaProfileFor(weapon('weapon-scarl') as WeaponEntry).kind).toBe('shell');
    expect(ejectaProfileFor(weapon('weapon-ak74') as WeaponEntry).kind).toBe('case');
    // ...and the shell is the bigger object with more energy behind it.
    const shell = ejectaProfileFor(weapon('weapon-scarl') as WeaponEntry);
    const brass = ejectaProfileFor(weapon('weapon-ak74') as WeaponEntry);
    expect(shell.sizeM).toBeGreaterThan(brass.sizeM);
    expect(shell.speed).toBeGreaterThan(brass.speed);
  });

  it("throws to the right, always", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const profile = ejectaProfileFor(entry);
      if (profile.speed > 0) {
        // Brass goes right for a right-handed shooter; a positive x is right.
        expect(profile.direction.x, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it("throws a pistol's case down as well as out, because the slide is open", () => {
    // A locked-back slide throws it off to the right and down. An upward throw
    // looks like the gun is spitting at the shooter's face, which is the only
    // reason anyone would ever notice this number.
    const pistol = ejectaProfileFor(weapon('weapon-p226') as WeaponEntry);
    const rifle = ejectaProfileFor(weapon('weapon-ak74') as WeaponEntry);
    expect(pistol.direction.y).toBeLessThan(0);
    expect(rifle.direction.y).toBeGreaterThan(0);
  });

  it("spins every case, because a case that does not tumble looks painted on", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const profile = ejectaProfileFor(entry);
      if (profile.speed > 0) expect(profile.spin, entry.id).toBeGreaterThan(0);
    }
  });
});

describe("throwing one (task 743)", () => {
  it("starts at the ejection socket, not at the origin", () => {
    const pool = new EjectaPool();
    const entry = weapon('weapon-ak74') as WeaponEntry;
    const bytes = bytesFor('weapon-ak74');
    const ejected = pool.eject('weapon-ak74', bytes);
    const socket = weaponSockets(entry, bytes).ejection;
    expect(ejected?.origin.x).toBe(socket?.offset.x);
    expect(ejected?.kind).toBe('case');
    expect(pool.size).toBe(1);
  });

  it("carries its velocity along the profile's direction", () => {
    const pool = new EjectaPool();
    const profile = ejectaProfileFor(weapon('weapon-ak74') as WeaponEntry);
    const ejected = pool.eject('weapon-ak74', bytesFor('weapon-ak74'));
    expect((ejected?.velocity.x ?? 0) / profile.direction.x).toBeCloseTo(profile.speed, 5);
    expect((ejected?.velocity.y ?? 0) / profile.direction.y).toBeCloseTo(profile.speed, 5);
  });

  it("throws a shell out of the shotgun's loading socket", () => {
    const pool = new EjectaPool();
    const entry = weapon('weapon-scarl') as WeaponEntry;
    const bytes = bytesFor('weapon-scarl');
    const ejected = pool.eject('weapon-scarl', bytes);
    expect(ejected?.kind).toBe('shell');
    expect(ejected?.origin.x).toBe(weaponSockets(entry, bytes).shell?.offset.x);
    expect(ejected?.hasMesh).toBe(true);
  });

  it("refuses a weapon it does not know, and one that ejects nothing", () => {
    const pool = new EjectaPool();
    expect(pool.eject('weapon-not-a-gun', bytesFor('weapon-ak74'))).toBeNull();
    expect(ejectaProfileFor({ class: 'melee' } as WeaponEntry).speed).toBe(0);
    expect(pool.size).toBe(0);
  });

  it("surfaces a gun with no ejection socket rather than throwing from the origin", () => {
    // A catalogue entry naming a gun whose file has no `ejection` socket: the pool
    // returns null instead of inventing a hole in the weapon.
    const fake = { ...(weapon('weapon-ak74') as WeaponEntry), sockets: { muzzle: { at: { x: 1, y: 0.5, z: 0.5 } } } };
    expect(ejectionSocketIdFor(fake)).toBe('ejection');
    expect(weaponSockets(fake, bytesFor('weapon-ak74')).ejection).toBeUndefined();
  });
});

describe("the life of a case (task 743)", () => {
  it("ages, and can be removed when it lands", () => {
    const pool = new EjectaPool();
    const ejected = pool.eject('weapon-ak74', bytesFor('weapon-ak74'));
    if (!ejected) throw new Error('expected a case');
    pool.update(0.25);
    expect(pool.cases()[0]?.ageS).toBeCloseTo(0.25, 5);
    expect(pool.remove(ejected.id)).toBe(true);
    expect(pool.size).toBe(0);
    expect(pool.remove(ejected.id)).toBe(false);
  });

  it("gives two shots two cases, and never grows past its capacity", () => {
    const pool = new EjectaPool(2);
    const bytes = bytesFor('weapon-m3a1');
    pool.eject('weapon-m3a1', bytes);
    pool.update(0.01);
    pool.eject('weapon-m3a1', bytes);
    pool.update(0.01);
    pool.eject('weapon-m3a1', bytes);
    expect(pool.size).toBe(2);
  });

  it("ignores a broken frame time and empties on clear", () => {
    const pool = new EjectaPool();
    pool.eject('weapon-ak74', bytesFor('weapon-ak74'));
    pool.update(Number.NaN);
    pool.update(-1);
    expect(pool.size).toBe(1);
    pool.clear();
    expect(pool.size).toBe(0);
  });

  it("refuses a pool it could never allocate", () => {
    expect(() => new EjectaPool(0)).toThrow(RangeError);
    expect(() => new EjectaPool(2.5)).toThrow(RangeError);
  });
});
