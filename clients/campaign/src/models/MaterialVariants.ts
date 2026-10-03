/**
 * Task 721: skin tone variants.
 *
 * This is only honest where the pack says which material is skin. The Quaternius
 * operator GLBs ship ten named materials -- `Viper_Skin`, `Viper_Hair_Brown`,
 * `Viper_Swat`, `Viper_Black_Body` -- so a skin tone can be changed on the face
 * and hands without touching the hair or the uniform. `civilian.glb` and
 * `troop-gunner.glb` ship a *single unnamed* material, and on those
 * {@link skinMaterialFor} returns -1: tinting it would tint the clothes too, which
 * is a different thing entirely and looks like a bug.
 *
 * So a variant is data (which tones exist, and what they are worth) plus a
 * decision per model (can this model's skin be tinted at all). Nothing here
 * invents a material or a mask.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { findMaterial, readMaterialNames, type GlbMaterial } from "./GlbFormat.js";

/** A skin tone, as the multiplier it applies to the packed skin colour. */
export interface SkinTone {
  id: string;
  /** Multipliers on the packed skin's RGB, in 0..2. */
  tint: { r: number; g: number; b: number };
}

/**
 * The tones this game uses.
 *
 * Multipliers rather than absolute colours, because the packed skin colour is the
 * pack's decision: a tone that overrode it absolutely would have to know what
 * Quaternius' skin looked like. Each is a shift in value and warmth, applied to
 * whatever the file ships.
 */
export const SKIN_TONES: readonly SkinTone[] = [
  { id: 'pale', tint: { r: 1.18, g: 1.14, b: 1.1 } },
  { id: 'light', tint: { r: 1.08, g: 1.03, b: 0.97 } },
  { id: 'medium', tint: { r: 1, g: 1, b: 1 } },
  { id: 'olive', tint: { r: 0.96, g: 0.98, b: 0.86 } },
  { id: 'tan', tint: { r: 0.92, g: 0.84, b: 0.72 } },
  { id: 'deep', tint: { r: 0.74, g: 0.64, b: 0.56 } },
];

/** A tone by id, or null when there is no such tone. */
export function skinTone(id: string): SkinTone | null {
  return SKIN_TONES.find((tone) => tone.id === id) ?? null;
}

/** Name fragments that mean "this is skin". */
export const SKIN_MATERIAL_PATTERNS: readonly string[] = ['skin', 'face', 'hand'];

/**
 * Which material in a file is the skin.
 *
 * Returns -1 when there is none to find, and -1 for a file with a single
 * unnamed material even if it happens to be a face -- because a one-material
 * model has no way to be tinted on the skin alone.
 */
export function skinMaterialFor(materials: readonly GlbMaterial[]): number {
  const named = materials.filter((m) => m.name.length > 0);
  if (named.length === 0) return -1;
  for (const pattern of SKIN_MATERIAL_PATTERNS) {
    const index = findMaterial(named, pattern);
    if (index >= 0) return index;
  }
  return -1;
}

/** The tone decision for one model. */
export interface SkinVariant {
  /** Which tone, or null when the model has none applied. */
  tone: SkinTone | null;
  /** Material to tint, or -1 when the model cannot be tinted. */
  materialIndex: number;
  /** True when the model has a named skin material to work on. */
  tintable: boolean;
}

/** Why a model cannot take a skin variant. */
export type SkinGap = 'no-named-materials' | 'no-skin-material';

/**
 * Task 721: which tone a model gets, and whether it can take one at all.
 *
 * A caller asks with the model's own material list; the answer names the material
 * to write and the tone to write on it, or says why there is none.
 */
export function skinVariantFor(
  materials: readonly GlbMaterial[],
  toneId: string,
): SkinVariant & { gap: SkinGap | null } {
  const materialIndex = skinMaterialFor(materials);
  const tone = skinTone(toneId);
  if (materialIndex < 0) {
    return {
      tone: null,
      materialIndex,
      tintable: false,
      gap: materials.some((m) => m.name.length > 0) ? 'no-skin-material' : 'no-named-materials',
    };
  }
  return { tone, materialIndex, tintable: true, gap: tone ? null : 'no-skin-material' };
}

/** The part of a material this module writes; a StandardMaterial satisfies it. */
export interface SkinMaterial {
  diffuseColor: Color3;
}

/**
 * Applies a tone to a material's colour.
 *
 * Multiplies rather than assigns, and clamps each channel: a tone is a shift, and
 * a channel that ran past 1.0 would read as a blown-out highlight on the face.
 */
export function applySkinTone(material: SkinMaterial, tone: SkinTone): Color3 {
  const base = material.diffuseColor;
  const scaled = new Color3(
    clamp01(base.r * tone.tint.r),
    clamp01(base.g * tone.tint.g),
    clamp01(base.b * tone.tint.b),
  );
  material.diffuseColor = scaled;
  return scaled;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Reads the material names of a staged GLB, for a caller deciding a variant. */
export function materialNamesOf(bytes: Uint8Array): GlbMaterial[] {
  return readMaterialNames(bytes);
}

/**
 * Task 723: clothing colours per faction.
 *
 * Same mechanism as the skin tone and for the same reason -- the operator rigs
 * name their uniform materials, so a faction colour can be written on the jacket
 * without touching the skin, the hair or the webbing. Two rules keep it honest:
 *
 * - The faction colour is a *tint*, not a replacement. A faction that wears grey
 *   webbing keeps grey webbing; only the materials a faction actually claims are
 *   written. A replacement would recolour everything the model has.
 * - A model with no named materials gets no faction colour at all, and says so,
 *   for the same reason task 721 refuses one.
 */

/** Materials a faction colour is allowed to claim. */
export const FACTION_MATERIAL_PATTERNS: readonly string[] = [
  'swat',
  'body',
  'cloth',
  'jacket',
  'shirt',
  'uniform',
];

/** A faction and the colour it wears. */
export interface FactionColours {
  factionId: string;
  /** Tint on the claimed materials, RGB 0..1. */
  tint: { r: number; g: number; b: number };
}

/**
 * The factions in this game, by the colour they wear.
 *
 * Plain numbers rather than CSS strings: these reach a 3D material, where the
 * design tokens do not, and the same reason the model's own colours are read
 * rather than assumed.
 */
export const FACTION_COLOURS: readonly FactionColours[] = [
  { factionId: 'vaylen', tint: { r: 0.29, g: 0.36, b: 0.45 } },
  { factionId: 'sable', tint: { r: 0.42, g: 0.24, b: 0.2 } },
  { factionId: 'marrow', tint: { r: 0.35, g: 0.4, b: 0.32 } },
  { factionId: 'neutral', tint: { r: 0.45, g: 0.45, b: 0.46 } },
];

/** A faction's colours, or null for one nobody has defined. */
export function factionColours(factionId: string): FactionColours | null {
  return FACTION_COLOURS.find((f) => f.factionId === factionId) ?? null;
}

/**
 * Material indices a faction colour may be written to.
 *
 * Hair and skin never appear in the result, whatever the faction: a faction does
 * not dye a character's hair, and a uniform colour that reached the face would be
 * the obvious mistake here.
 */
export function factionMaterialIndices(materials: readonly GlbMaterial[]): number[] {
  const named = materials.filter((m) => m.name.length > 0);
  if (named.length === 0) return [];
  const out: number[] = [];
  for (const pattern of FACTION_MATERIAL_PATTERNS) {
    const index = findMaterial(named, pattern);
    if (index >= 0 && !out.includes(index)) out.push(index);
  }
  return out.sort((a, b) => a - b);
}

/** What to write, and on which materials. */
export interface FactionVariant {
  factionId: string;
  /** Materials to write, by index; empty when the model has no uniform. */
  materialIndices: number[];
  /** Tint to write, or null when the faction has no colours defined. */
  tint: { r: number; g: number; b: number } | null;
  /** Why nothing was written. */
  gap: 'no-named-materials' | 'no-uniform-materials' | 'unknown-faction' | null;
}

/** Task 723: what a faction's colour means for one model. */
export function factionVariantFor(
  materials: readonly GlbMaterial[],
  factionId: string,
): FactionVariant {
  const colours = factionColours(factionId);
  const indices = factionMaterialIndices(materials);
  if (materials.every((m) => m.name.length === 0)) {
    return { factionId, materialIndices: indices, tint: colours?.tint ?? null, gap: 'no-named-materials' };
  }
  if (indices.length === 0) {
    return { factionId, materialIndices: [], tint: colours?.tint ?? null, gap: 'no-uniform-materials' };
  }
  if (!colours) {
    return { factionId, materialIndices: indices, tint: null, gap: 'unknown-faction' };
  }
  return { factionId, materialIndices: indices, tint: colours.tint, gap: null };
}

/**
 * Blends a material towards the faction tint.
 *
 * `strength` is 0..1: a faction colour at full strength repaints the uniform, and
 * a lower one is how a worn or faded uniform is expressed without a second asset.
 */
export function applyFactionTint(material: SkinMaterial, tint: { r: number; g: number; b: number }, strength = 1): Color3 {
  const amount = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 1;
  const base = material.diffuseColor;
  const next = new Color3(
    clamp01(base.r + (clamp01(tint.r) - base.r) * amount),
    clamp01(base.g + (clamp01(tint.g) - base.g) * amount),
    clamp01(base.b + (clamp01(tint.b) - base.b) * amount),
  );
  material.diffuseColor = next;
  return next;
}
