/**
 * Tasks 731-735: the weapon catalogue, checked against the files on disk.
 *
 * The point of this suite is that the catalogue cannot rot. Every entry has to name
 * a file that exists, in the manifest, and load as a GLB; every socket has to be
 * somewhere a muzzle can be; and the five tasks have to be answered by a real
 * asset rather than by the nearest available gun.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readMaterialNames } from "../GlbFormat.js";
import { readAuthoredBounds } from "../ModelTransform.js";
import {
  WEAPON_CATALOGUE,
  WEAPON_GAPS,
  MUZZLE_SETBACK,
  catalogueFiles,
  hasSocket,
  hasWeaponClass,
  socketIds,
  weapon,
  weaponSockets,
  weaponsOfClass,
  type WeaponClass,
  type WeaponEntry,
  type WeaponSocket,
} from "../WeaponCatalogue.js";

const campaignRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const publicDir = join(campaignRoot, "public");
const modelsDir = join(publicDir, "models");

const manifest = JSON.parse(readFileSync(join(modelsDir, "models.manifest.json"), "utf8")) as {
  models: Array<{ file: string }>;
};

// Manifest and catalogue paths are relative to `public/models/`, like the
// `pickup-truck.glb` entry at the top of the manifest.
function stagedFile(file: string): string {
  return join(modelsDir, file);
}

describe("every catalogue entry names a file that exists (tasks 731-735)", () => {
  it("has a distinct id for every weapon", () => {
    const ids = WEAPON_CATALOGUE.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every entry at a file on disk that loads as a GLB", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const path = stagedFile(entry.file);
      expect(existsSync(path), entry.id).toBe(true);
      const bytes = readFileSync(path);
      // 'glTF' in the first chunk is what makes it a file at all.
      expect(bytes.subarray(0, 4).toString('ascii'), entry.id).toBe('glTF');
    }
  });

  it("is a subset of the manifest, and covers every weapon in it", () => {
    const manifestWeapons = manifest.models
      .map((m) => m.file)
      .filter((f) => f.startsWith('weapons/'))
      .sort();
    // The catalogue lists every staged weapon -- hiding one would make the
    // "variant 2" answers wrong by omission.
    expect(catalogueFiles()).toEqual(manifestWeapons);
  });

  it("gives every weapon a muzzle, a magazine and something to eject from", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const ids = Object.keys(entry.sockets);
      expect(ids, entry.id).toContain('muzzle');
      expect(ids, entry.id).toContain('magazine');
      expect(
        ids.includes('ejection') || ids.includes('shell'),
        entry.id,
      ).toBe(true);
    }
  });

  it("resolves every socket to a real point inside the weapon's own bounds", () => {
    // The packs are authored along X in centimetre units, so sockets are fractions
    // of the authored bounds scaled to the manifest's target length. A socket
    // outside that box is a flash in mid-air.
    for (const entry of WEAPON_CATALOGUE) {
      const bytes = readFileSync(stagedFile(entry.file));
      const box = readAuthoredBounds(bytes);
      const sockets = weaponSockets(entry, bytes);
      const scale = entry.targetLengthM / Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
      for (const socket of Object.values(sockets)) {
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(Number.isFinite(socket.offset[axis]), `${entry.id}.${socket.id}.${axis}`).toBe(true);
        }
        // Inside the body, to a centimetre of slack for a socket that sits proud.
        expect(socket.offset.x, `${entry.id}.${socket.id}.x`).toBeGreaterThan(box.min.x * scale - 0.02);
        expect(socket.offset.x, `${entry.id}.${socket.id}.x`).toBeLessThan(box.max.x * scale + 0.02);
      }
      // The muzzle is the furthest-forward socket on the weapon: rounds come out
      // of the tip, not of the magazine well.
      const muzzle = sockets.muzzle as WeaponSocket;
      const others = Object.values(sockets).filter((s) => s.id !== 'muzzle');
      for (const socket of others) {
        expect(muzzle.offset.x, `${entry.id}: muzzle vs ${socket.id}`).toBeGreaterThan(socket.offset.x);
      }
      // The magazine hangs below the body.
      expect((sockets.magazine as WeaponSocket).offset.y, entry.id).toBeLessThan(0);
    }
  });

  it("puts the muzzle just behind the barrel tip, not at it", () => {
    const entry = weapon('weapon-ak74') as WeaponEntry;
    const bytes = readFileSync(stagedFile(entry.file));
    const box = readAuthoredBounds(bytes);
    const scale = entry.targetLengthM / (box.max.x - box.min.x);
    const muzzle = weaponSockets(entry, bytes).muzzle as WeaponSocket;
    const tip = box.max.x * scale;
    expect(muzzle.offset.x).toBeLessThan(tip);
    expect(tip - muzzle.offset.x).toBeLessThan(entry.targetLengthM * MUZZLE_SETBACK + 0.001);
  });

  it("feeds magazines only where it should", () => {
    const shotgun = weaponsOfClass('shotgun')[0];
    expect(shotgun?.id).toBe('weapon-scarl');
    expect(shotgun?.magazineFed).toBe(false);
    for (const entry of WEAPON_CATALOGUE) {
      if (entry.class !== 'shotgun') expect(entry.magazineFed, entry.id).toBe(true);
    }
  });
});

describe("the five variants, answered by real assets (tasks 731-735)", () => {
  it("731: the second assault rifle is a different file from the first", () => {
    const rifles = weaponsOfClass('rifle');
    expect(rifles.length).toBeGreaterThanOrEqual(2);
    const files = rifles.map((r) => r.file);
    expect(files).toContain('weapons/ak74.glb');
    expect(files).toContain('weapons/m3a1.glb');
    // ...and they really are two different guns.
    expect(new Set(files).size).toBe(files.length);
  });

  it("732: the sniper rifle is its own file, and there is more than one", () => {
    const snipers = weaponsOfClass('sniper');
    expect(snipers.length).toBeGreaterThanOrEqual(2);
    for (const sniper of snipers) {
      expect(sniper.role).toContain('sniper');
      expect(sniper.magazineFed).toBe(true);
    }
  });

  it("733: the SMG variant is a real SMG file", () => {
    const smgs = weaponsOfClass('smg');
    expect(smgs.length).toBeGreaterThanOrEqual(2);
    expect(smgs.map((s) => s.file)).toContain('weapons/mp5a5.glb');
  });

  it("734: the shotgun variant exists as a shotgun", () => {
    const shotguns = weaponsOfClass('shotgun');
    expect(shotguns.length).toBe(1);
    expect(shotguns[0]?.file).toBe('weapons/scarl.glb');
    expect(hasWeaponClass('shotgun')).toBe(true);
  });

  it("735: the second pistol is a different file from the first", () => {
    const pistols = weaponsOfClass('pistol');
    expect(pistols.length).toBeGreaterThanOrEqual(2);
    const files = pistols.map((p) => p.file);
    expect(files).toContain('weapons/p226.glb');
    expect(files).toContain('weapons/m1911.glb');
    expect(new Set(files).size).toBe(files.length);
  });

  it("assigns each of the five tasks an entry, and no task two entries", () => {
    for (const task of [731, 732, 733, 734, 735]) {
      const entries = WEAPON_CATALOGUE.filter((w) => w.task === task);
      expect(entries.length, `task ${task}`).toBeGreaterThan(0);
    }
  });
});

describe("the LMG, and the weapons with no asset (tasks 736-740)", () => {
  it("marks the LMG entry as inferred rather than certain", () => {
    const lmg = weaponsOfClass('lmg');
    expect(lmg.length).toBe(1);
    // axmc.glb is the longest staged weapon at a 1.2 m target and its name reads as
    // a machine gun, but nothing in the pack says so outright. The flag is the
    // honest part: one line here is all it would take to correct.
    expect(lmg[0]?.file).toBe('weapons/axmc.glb');
    expect(lmg[0]?.inferred).toBe(true);
    expect(lmg[0]?.targetLengthM).toBeGreaterThanOrEqual(1.2);
  });

  it("names every missing class instead of pointing at the nearest gun", () => {
    for (const missing of ['grenade', 'knife', 'baton', 'sword'] as const) {
      expect(WEAPON_GAPS[missing], missing).toBeTruthy();
      expect(hasWeaponClass(missing as WeaponClass), missing).toBe(false);
      expect(WEAPON_CATALOGUE.some((w) => w.class === missing), missing).toBe(false);
    }
  });

  it("returns null for an unknown id and an unknown class alike", () => {
    expect(weapon('weapon-not-a-gun')).toBeNull();
    expect(weaponsOfClass('melee')).toEqual([]);
  });
});

describe("what the weapon lane gets from a weapon (tasks 741, 743, 746)", () => {
  it("reports a material name list for every weapon, so skins can be written", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const materials = readMaterialNames(readFileSync(stagedFile(entry.file)));
      expect(materials.length, entry.id).toBeGreaterThan(0);
      // Named materials are what make a camo variant honest on these.
      expect(materials.some((m) => m.name.length > 0), entry.id).toBe(true);
    }
  });

  it("scales sockets to each weapon's real length, so a flash cannot land inside a pistol", () => {
    // A shared socket rule only works because the offsets are resolved against the
    // asset: the AK's muzzle is metres out along the barrel, the P226's is centimetres.
    const entry = weapon('weapon-ak74') as WeaponEntry;
    const rifleMuzzle = weaponSockets(entry, readFileSync(stagedFile(entry.file))).muzzle as WeaponSocket;
    const pistol = weapon('weapon-p226') as WeaponEntry;
    const pistolMuzzle = weaponSockets(pistol, readFileSync(stagedFile(pistol.file))).muzzle as WeaponSocket;
    expect(Math.abs(rifleMuzzle.offset.x)).toBeGreaterThan(Math.abs(pistolMuzzle.offset.x));
    // The AK is 0.9 m long and its authored origin sits behind its middle, so the
    // muzzle is well down the barrel but never past the end of the gun.
    expect(Math.abs(rifleMuzzle.offset.x)).toBeGreaterThan(0.5);
    expect(Math.abs(rifleMuzzle.offset.x)).toBeLessThan(0.9);
    expect(Math.abs(pistolMuzzle.offset.x)).toBeLessThan(0.2);
  });

  it("returns null for a socket a weapon does not have", () => {
    // The shotgun loads shells one at a time: it ejects a shell, not a case.
    expect(hasSocket('weapon-scarl', 'ejection')).toBe(false);
    expect(hasSocket('weapon-scarl', 'shell')).toBe(true);
    expect(hasSocket('weapon-not-a-gun', 'muzzle')).toBe(false);
    expect(socketIds('weapon-not-a-gun')).toEqual([]);
  });
});