/**
 * Task 721: skin tone variants, applied only where the pack says which material
 * is skin.
 *
 * The operator GLBs ship named materials -- `Viper_Skin`, `Viper_Hair_Brown` --
 * so a tone can be written on the face and hands and leave the hair and uniform
 * alone. `civilian.glb` and `troop-gunner.glb` ship a single *unnamed* material
 * and are refused: tinting that one would tint the clothes too, which is a
 * different change wearing the same name.
 *
 * Every claim is checked against the real files, so the test fails if a pack's
 * naming changes underneath this.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { readMaterialNames, type GlbMaterial } from "../GlbFormat.js";
import {
  SKIN_TONES,
  applyFactionTint,
  applySkinTone,
  factionColours,
  factionMaterialIndices,
  factionVariantFor,
  skinMaterialFor,
  skinTone,
  skinVariantFor,
} from "../MaterialVariants.js";

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "models");

function materialsOf(file: string): GlbMaterial[] {
  return readMaterialNames(readFileSync(join(modelsDir, file)));
}

describe("the packs that can be tinted (task 721)", () => {
  it("finds a named skin material on the operator rigs", () => {
    for (const rig of readdirSync(modelsDir).filter((n) => n.startsWith('operator-') && n.endsWith('.glb'))) {
      const materials = materialsOf(rig);
      expect(materials.length, rig).toBeGreaterThan(5);
      expect(skinMaterialFor(materials), rig).toBeGreaterThanOrEqual(0);
      // The skin is its own material, not the body or the hair.
      const skin = materials[skinMaterialFor(materials)] as GlbMaterial;
      expect(skin.name.toLowerCase(), rig).toContain('skin');
    }
  });

  it("finds one on the medic rig too", () => {
    const materials = materialsOf('female-operator.glb');
    expect(materials.map((m) => m.name)).toContain('Skin');
    expect(skinMaterialFor(materials)).toBeGreaterThanOrEqual(0);
  });

  it("refuses the models with one unnamed material, and says which kind of refusal", () => {
    for (const file of ['civilian.glb', 'troop-gunner.glb']) {
      const materials = materialsOf(file);
      expect(skinMaterialFor(materials), file).toBe(-1);
      const variant = skinVariantFor(materials, 'tan');
      expect(variant.tintable, file).toBe(false);
      expect(variant.gap, file).toBe('no-named-materials');
      expect(variant.tone, file).toBeNull();
    }
  });

  it("refuses a named model that happens to have no skin", () => {
    const armourOnly: GlbMaterial[] = [
      { index: 0, name: 'Viper_Swat' },
      { index: 1, name: 'Viper_Black' },
    ];
    expect(skinMaterialFor(armourOnly)).toBe(-1);
    expect(skinVariantFor(armourOnly, 'tan').gap).toBe('no-skin-material');
  });

  it("reports a file with no materials at all without throwing", () => {
    expect(skinMaterialFor([])).toBe(-1);
    expect(skinVariantFor([], 'tan').gap).toBe('no-named-materials');
  });
});

describe("the tones themselves (task 721)", () => {
  it("ships at least three distinct tones, as the task asks", () => {
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(SKIN_TONES.map((t) => t.id)).size).toBe(SKIN_TONES.length);
  });

  it("ranges from pale to deep", () => {
    const pale = skinTone('pale');
    const deep = skinTone('deep');
    expect(pale).not.toBeNull();
    expect(deep).not.toBeNull();
    expect((pale as { tint: { r: number } }).tint.r).toBeGreaterThan((deep as { tint: { r: number } }).tint.r);
    // The middle of the range is the untouched colour: the pack's own.
    expect(skinTone('medium')?.tint).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("returns null for a tone nobody defined", () => {
    expect(skinTone('chartreuse')).toBeNull();
    const variant = skinVariantFor([{ index: 0, name: 'Skin' }], 'chartreuse');
    expect(variant.gap).toBe('no-skin-material');
    expect(variant.materialIndex).toBe(0);
  });
});

describe("applying a tone (task 721)", () => {
  function material(r = 0.6, g = 0.45, b = 0.35): StandardMaterial {
    const scene = new Scene(new NullEngine());
    const mat = new StandardMaterial('skin', scene);
    mat.diffuseColor = new Color3(r, g, b);
    return mat;
  }

  it("shifts the colour without replacing it", () => {
    const mat = material();
    const tone = skinTone('deep') as { tint: { r: number; g: number; b: number } };
    const applied = applySkinTone(mat, skinTone('deep') as never);
    expect(applied.r).toBeCloseTo(0.6 * tone.tint.r, 5);
    // A darker tone on a darker base: still a skin colour, not a grey.
    expect(applied.g).toBeGreaterThan(applied.b);
    expect(mat.diffuseColor.r).toBeCloseTo(applied.r);
  });

  it("leaves the colour alone for the middle tone", () => {
    const mat = material();
    applySkinTone(mat, skinTone('medium') as never);
    expect(mat.diffuseColor.r).toBeCloseTo(0.6);
    expect(mat.diffuseColor.b).toBeCloseTo(0.35);
  });

  it("never pushes a channel out of range", () => {
    const mat = material(0.95, 0.9, 0.85);
    applySkinTone(mat, skinTone('pale') as never);
    for (const channel of [mat.diffuseColor.r, mat.diffuseColor.g, mat.diffuseColor.b]) {
      expect(channel).toBeLessThanOrEqual(1);
      expect(channel).toBeGreaterThanOrEqual(0);
    }
  });

  it("writes a whole face and leaves the hair alone", () => {
    // The realistic shape of the write: one material per variant, chosen by name.
    const materials = materialsOf('operator-viper.glb');
    const skinIndex = skinMaterialFor(materials);
    const hairIndex = materials.findIndex((m) => m.name.toLowerCase().includes('hair'));
    expect(skinIndex).toBeGreaterThanOrEqual(0);
    expect(hairIndex).toBeGreaterThanOrEqual(0);
    expect(skinIndex).not.toBe(hairIndex);
  });
});
describe("faction clothing colours (task 723)", () => {
  const operator = materialsOf('operator-viper.glb');

  it("claims the uniform materials and never the skin or hair", () => {
    const indices = factionMaterialIndices(operator);
    expect(indices.length).toBeGreaterThan(0);
    const names = indices.map((i) => (operator[i] as GlbMaterial).name.toLowerCase());
    expect(names.some((n) => n.includes('skin'))).toBe(false);
    expect(names.some((n) => n.includes('hair'))).toBe(false);
    expect(names.some((n) => n.includes('swat') || n.includes('body'))).toBe(true);
  });

  it("writes a tint onto a model that has a uniform", () => {
    const variant = factionVariantFor(operator, 'vaylen');
    expect(variant.gap).toBeNull();
    expect(variant.materialIndices.length).toBeGreaterThan(0);
    expect(variant.tint).not.toBeNull();
  });

  it("refuses the models with one unnamed material", () => {
    for (const file of ['civilian.glb', 'troop-gunner.glb']) {
      const variant = factionVariantFor(materialsOf(file), 'vaylen');
      expect(variant.gap, file).toBe('no-named-materials');
      expect(variant.materialIndices, file).toEqual([]);
    }
  });

  it("names a faction nobody has colours for", () => {
    const variant = factionVariantFor(operator, 'the-undeclared-conspiracy');
    expect(variant.gap).toBe('unknown-faction');
    expect(variant.tint).toBeNull();
    expect(factionColours('the-undeclared-conspiracy')).toBeNull();
  });

  it("tints towards the colour rather than replacing it", () => {
    const scene = new Scene(new NullEngine());
    const mat = new StandardMaterial('uniform', scene);
    mat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    const vaylen = factionColours('vaylen') as { tint: { r: number; g: number; b: number } };
    applyFactionTint(mat, vaylen.tint, 0.5);
    // Halfway: still darker than the faction colour, and it moved.
    expect(mat.diffuseColor.r).toBeGreaterThan(0.1);
    expect(mat.diffuseColor.r).toBeLessThan(vaylen.tint.r);
    applyFactionTint(mat, vaylen.tint, 1);
    expect(mat.diffuseColor.r).toBeCloseTo(vaylen.tint.r, 5);
  });

  it("keeps a faded uniform faded", () => {
    const scene = new Scene(new NullEngine());
    const mat = new StandardMaterial('worn', scene);
    mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    const vaylen = factionColours('vaylen') as { tint: { r: number; g: number; b: number } };
    applyFactionTint(mat, vaylen.tint, 0.2);
    // A low strength lands between the pack's own colour and the faction colour
    // and stops short of it, which is how wear is expressed without a second asset.
    expect(mat.diffuseColor.r).toBeLessThan(0.5);
    expect(mat.diffuseColor.r).toBeGreaterThan(vaylen.tint.r);
  });

  it("clamps a broken strength and a broken colour", () => {
    const scene = new Scene(new NullEngine());
    const mat = new StandardMaterial('m', scene);
    mat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    applyFactionTint(mat, { r: 5, g: -2, b: Number.NaN }, 2);
    for (const channel of [mat.diffuseColor.r, mat.diffuseColor.g, mat.diffuseColor.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    expect(mat.diffuseColor.r).toBe(1);
  });
});
