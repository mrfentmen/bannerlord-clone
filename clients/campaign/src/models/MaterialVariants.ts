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