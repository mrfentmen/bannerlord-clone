/**
 * Task 746: weapon skins.
 *
 * The staged weapons all ship *named* materials -- `Metal`, `DarkMetal`,
 * `LightMetal`, `Wood`, `Black`, `Grey`, and `Glass` on the rifles with a sight --
 * which is what makes a camo variant possible at all: it can be written on the
 * metal and left off the lens, the wood and the polymer.
 *
 * What this is, honestly: a tint per scheme, written onto the materials a scheme
 * claims. What it is not: a camouflage *pattern*. A real multi-tone pattern needs
 * a texture or vertex colours, and none of these files have either -- the packs
 * are texture-mapped but carry no masks to drive. So a scheme here darkens and
 * shifts the metal rather than painting blotches on it, and {@link WeaponSkin.gap}
 * says so if a caller wants to know why a skin looks like a colour wash.
 *
 * The alternative -- faking a pattern with a generated texture -- is the thing this
 * file exists not to do.
 */

import { findMaterial, readMaterialNames, type GlbMaterial } from './GlbFormat.js';

/** A camo scheme. */
export interface WeaponSkin {
  id: string;
  label: string;
  /** Tint on the claimed materials, RGB 0..1. */
  tint: { r: number; g: number; b: number };
  /** How much of the packed colour survives, 0..1. */
  strength: number;
  /**
   * How much of a pattern this carries: 0 is a flat wash, 1 is a real pattern.
   * Always 0 for now, and a property rather than a comment so a caller can check
   * instead of assuming.
   */
  patternComplexity: number;
}

/** The schemes. */
export const WEAPON_SKINS: readonly WeaponSkin[] = [
  { id: 'issue', label: 'issue black', tint: { r: 0.14, g: 0.14, b: 0.15 }, strength: 0.85, patternComplexity: 0 },
  { id: 'desert', label: 'desert', tint: { r: 0.72, g: 0.63, b: 0.44 }, strength: 0.8, patternComplexity: 0 },
  { id: 'woodland', label: 'woodland', tint: { r: 0.34, g: 0.38, b: 0.24 }, strength: 0.8, patternComplexity: 0 },
  { id: 'urban', label: 'urban grey', tint: { r: 0.42, g: 0.43, b: 0.45 }, strength: 0.85, patternComplexity: 0 },
  { id: 'snow', label: 'snow', tint: { r: 0.86, g: 0.88, b: 0.9 }, strength: 0.7, patternComplexity: 0 },
  { id: 'rust', label: 'rust', tint: { r: 0.45, g: 0.26, b: 0.16 }, strength: 0.75, patternComplexity: 0 },
];

/** A skin by id, or null. */
export function weaponSkin(id: string): WeaponSkin | null {
  return WEAPON_SKINS.find((s) => s.id === id) ?? null;
}

/** Material names a camo may be written to. */
export const SKINNABLE_MATERIAL_PATTERNS: readonly string[] = [
  'metal',
  'main',
  'wood',
  'grey',
  'gray',
  'black',
];

/**
 * Material names a camo must never touch.
 *
 * A lens is the important one: tinting a sight's glass reads as a broken sight
 * rather than as a skin, and it is the kind of change nobody notices until a
 * screenshot review.
 */
export const UNSKINNABLE_MATERIAL_PATTERNS: readonly string[] = ['glass', 'lens', 'optic'];

/**
 * Which materials a skin may be written to.
 *
 * Excluded materials are checked first, so a pack that calls its sight glass
 * `Glass_Lens_Metal` gets the glass behaviour and not the metal one.
 */
export function skinnableMaterialIndices(materials: readonly GlbMaterial[]): number[] {
  const named = materials.filter((m) => m.name.length > 0);
  if (named.length === 0) return [];
  const excluded = new Set<number>();
  for (const pattern of UNSKINNABLE_MATERIAL_PATTERNS) {
    const index = findMaterial(named, pattern);
    if (index >= 0) excluded.add(index);
  }
  const out: number[] = [];
  for (const pattern of SKINNABLE_MATERIAL_PATTERNS) {
    const index = findMaterial(named, pattern);
    if (index >= 0 && !excluded.has(index) && !out.includes(index)) out.push(index);
  }
  return out.sort((a, b) => a - b);
}

/** The part of a material this module writes. */
export interface SkinTarget {
  diffuseColor: { r: number; g: number; b: number };
}

/** What to write, and on which materials. */
export interface WeaponSkinVariant {
  skinId: string;
  materialIndices: number[];
  skin: WeaponSkin | null;
  /** Materials deliberately left alone, and why. */
  excludedIndices: number[];
  gap: 'no-named-materials' | 'no-skin-materials' | 'unknown-skin' | null;
}

/** Task 746: what a skin means for one weapon. */
export function weaponSkinVariantFor(
  materials: readonly GlbMaterial[],
  skinId: string,
): WeaponSkinVariant {
  const skin = weaponSkin(skinId);
  const indices = skinnableMaterialIndices(materials);
  const excluded = UNSKINNABLE_MATERIAL_PATTERNS.map((pattern) => findMaterial(materials, pattern))
    .filter((index) => index >= 0);
  if (materials.every((m) => m.name.length === 0)) {
    return { skinId, materialIndices: indices, skin, excludedIndices: excluded, gap: 'no-named-materials' };
  }
  if (indices.length === 0) {
    return { skinId, materialIndices: [], skin, excludedIndices: excluded, gap: 'no-skin-materials' };
  }
  return {
    skinId,
    materialIndices: indices,
    skin,
    excludedIndices: excluded,
    gap: skin ? null : 'unknown-skin',
  };
}

/** Writes a skin's tint onto a material, blending by the skin's own strength. */
export function applyWeaponSkin(material: SkinTarget, skin: WeaponSkin): { r: number; g: number; b: number } {
  const base = material.diffuseColor;
  const strength = Number.isFinite(skin.strength) ? Math.min(1, Math.max(0, skin.strength)) : 1;
  const clamp = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const next = {
    r: clamp(base.r + (clamp(skin.tint.r) - base.r) * strength),
    g: clamp(base.g + (clamp(skin.tint.g) - base.g) * strength),
    b: clamp(base.b + (clamp(skin.tint.b) - base.b) * strength),
  };
  material.diffuseColor = next;
  return next;
}

/** Reads the material names of a staged weapon, for a caller deciding a skin. */
export function weaponMaterialNames(bytes: Uint8Array): GlbMaterial[] {
  return readMaterialNames(bytes);
}