/**
 * Task 746: camo skins, written only where the pack names its materials.
 *
 * The claim this suite exists to hold: a skin darkens metal and leaves a sight's
 * glass alone, and nothing here pretends to paint a camouflage pattern on a file
 * that has no masks to drive one with.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  UNSKINNABLE_MATERIAL_PATTERNS,
  WEAPON_SKINS,
  applyWeaponSkin,
  skinnableMaterialIndices,
  weaponSkin,
  weaponSkinVariantFor,
  weaponMaterialNames,
} from '../WeaponSkins.js';
import { WEAPON_CATALOGUE, type WeaponEntry } from '../WeaponCatalogue.js';

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'models');

function materialsFor(entry: WeaponEntry) {
  return weaponMaterialNames(readFileSync(join(modelsDir, entry.file)));
}

describe("the schemes (task 746)", () => {
  it("ships several distinct skins", () => {
    expect(WEAPON_SKINS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(WEAPON_SKINS.map((s) => s.id)).size).toBe(WEAPON_SKINS.length);
    expect(weaponSkin('desert')?.label).toBe('desert');
    expect(weaponSkin('chartreuse-blobs')).toBeNull();
  });

  it("admits it carries no pattern, as a number rather than a comment", () => {
    // These packs have no masks to drive a camouflage pattern with, so every scheme
    // is a tint. Saying so in a field means a caller can check rather than assume.
    for (const skin of WEAPON_SKINS) {
      expect(skin.patternComplexity, skin.id).toBe(0);
      expect(skin.strength, skin.id).toBeGreaterThan(0);
      expect(skin.strength, skin.id).toBeLessThanOrEqual(1);
    }
  });
});

describe("which materials a skin may write (task 746)", () => {
  it("has something to write on every staged weapon", () => {
    for (const entry of WEAPON_CATALOGUE) {
      const variant = weaponSkinVariantFor(materialsFor(entry), 'desert');
      expect(variant.materialIndices.length, entry.id).toBeGreaterThan(0);
      expect(variant.gap, entry.id).toBeNull();
    }
  });

  it("never touches a sight's glass", () => {
    // A lens tinted with a camo reads as a broken sight, and it is exactly the
    // change nobody notices until a screenshot review does.
    for (const entry of WEAPON_CATALOGUE) {
      const materials = materialsFor(entry);
      const claimed = skinnableMaterialIndices(materials);
      const glass = UNSKINNABLE_MATERIAL_PATTERNS.map((p) =>
        materials.findIndex((m) => m.name.toLowerCase().includes(p)),
      ).filter((i) => i >= 0);
      for (const index of glass) {
        expect(claimed, `${entry.id}: material ${index}`).not.toContain(index);
      }
    }
  });

  it("writes on the metal and leaves out the glass on a gun that has a sight", () => {
    // Not every weapon carries glass: the AK's five materials are metal, wood and
    // polymer, while the sniper and the LMG ship a `Glass` material for their optic.
    const withSight = WEAPON_CATALOGUE.find((w) => w.id === 'weapon-m24') as WeaponEntry;
    const variant = weaponSkinVariantFor(materialsFor(withSight), 'woodland');
    expect(variant.materialIndices.length).toBeGreaterThan(0);
    expect(variant.excludedIndices.length).toBeGreaterThan(0);

    const ironOnly = WEAPON_CATALOGUE.find((w) => w.id === 'weapon-ak74') as WeaponEntry;
    expect(weaponSkinVariantFor(materialsFor(ironOnly), 'woodland').excludedIndices).toEqual([]);
  });

  it("refuses a file with one unnamed material", () => {
    const variant = weaponSkinVariantFor([{ index: 0, name: '' }], 'urban');
    expect(variant.gap).toBe('no-named-materials');
    expect(variant.materialIndices).toEqual([]);
  });

  it("refuses a named file with nothing skinnable, and names an unknown scheme", () => {
    expect(weaponSkinVariantFor([{ index: 0, name: 'Glass' }], 'urban').gap).toBe('no-skin-materials');
    const entry = WEAPON_CATALOGUE.find((w) => w.id === 'weapon-ak74') as WeaponEntry;
    const variant = weaponSkinVariantFor(materialsFor(entry), 'no-such-skin');
    expect(variant.gap).toBe('unknown-skin');
    expect(variant.skin).toBeNull();
    // ...but it still knows where it would have been written.
    expect(variant.materialIndices.length).toBeGreaterThan(0);
  });
});

describe("writing a skin (task 746)", () => {
  it("moves the colour towards the scheme without replacing it", () => {
    const material = { diffuseColor: { r: 0.1, g: 0.1, b: 0.12 } };
    const desert = weaponSkin('desert');
    if (!desert) throw new Error('expected a scheme');
    const applied = applyWeaponSkin(material, desert);
    expect(applied.r).toBeGreaterThan(0.1);
    expect(applied.r).toBeLessThan(desert.tint.r);
    expect(material.diffuseColor).toEqual(applied);
  });

  it("gets closer to the scheme as strength rises", () => {
    const weak = applyWeaponSkin({ diffuseColor: { r: 0.1, g: 0.1, b: 0.12 } }, {
      id: 'weak', label: 'weak', tint: { r: 0.8, g: 0.7, b: 0.5 }, strength: 0.3, patternComplexity: 0,
    });
    const strong = applyWeaponSkin({ diffuseColor: { r: 0.1, g: 0.1, b: 0.12 } }, {
      id: 'strong', label: 'strong', tint: { r: 0.8, g: 0.7, b: 0.5 }, strength: 1, patternComplexity: 0,
    });
    expect(strong.r).toBeGreaterThan(weak.r);
  });

  it("clamps a broken scheme instead of writing a broken colour", () => {
    const material = { diffuseColor: { r: 0.5, g: 0.5, b: 0.5 } };
    const applied = applyWeaponSkin(material, {
      id: 'broken', label: 'broken', tint: { r: 9, g: -4, b: Number.NaN }, strength: 5, patternComplexity: 0,
    });
    for (const channel of [applied.r, applied.g, applied.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    expect(applied.r).toBe(1);
  });
});
