/**
 * MASTER_PLAN task 18: faction palettes stay mutually distinguishable under
 * deuteranopia, protanopia, and tritanopia.
 *
 * Each mode's ACTIVE palette (the remap the game actually shows) is run
 * through a Machado et al. (2009) deficiency simulation, and every one of the
 * 15 faction pairs must reach CIE76 ΔE >= 10 — roughly 4x the just-noticeable
 * difference. Ink-on-banner contrast is checked separately against WCAG AA
 * (4.5:1) in the normal-vision palette.
 */
import { describe, expect, it } from "vitest";
import {
  factionPalette,
  perceivedDistance,
  hexToRgb,
  rgbToLab,
  PLAYABLE_SIDE_IDS,
} from "../factions.js";
import type { ColorblindMode } from "../../settings/schema.js";

const MIN_DE = 10;
const MODES: ColorblindMode[] = ["off", "deuteranopia", "protanopia", "tritanopia"];

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("faction palettes (task 18)", () => {
  for (const mode of MODES) {
    it(`all 15 pairs distinguishable under ${mode}`, () => {
      const pal = factionPalette(mode);
      const failures: string[] = [];
      for (let i = 0; i < PLAYABLE_SIDE_IDS.length; i++) {
        for (let j = i + 1; j < PLAYABLE_SIDE_IDS.length; j++) {
          const a = PLAYABLE_SIDE_IDS[i]!;
          const b = PLAYABLE_SIDE_IDS[j]!;
          const d = perceivedDistance(pal[a]!.color, pal[b]!.color, mode);
          if (d < MIN_DE) failures.push(`${a} vs ${b}: ΔE ${d.toFixed(2)}`);
        }
      }
      expect(failures, `indistinguishable pairs under ${mode}`).toEqual([]);
    });
  }

  it("every mode covers exactly the six playable sides", () => {
    for (const mode of MODES) {
      expect(Object.keys(factionPalette(mode)).sort()).toEqual([...PLAYABLE_SIDE_IDS].sort());
    }
  });

  it("ink on banner meets WCAG AA in every mode", () => {
    for (const mode of MODES) {
      const pal = factionPalette(mode);
      for (const id of PLAYABLE_SIDE_IDS) {
        const sw = pal[id]!;
        expect(
          contrast(sw.color, sw.ink),
          `${id} ink contrast under ${mode}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("rgbToLab sanity: black vs white is far, identical is zero", () => {
    const black = rgbToLab(hexToRgb("#000000"));
    const white = rgbToLab(hexToRgb("#ffffff"));
    expect(perceivedDistance("#000000", "#ffffff", "off")).toBeGreaterThan(90);
    expect(perceivedDistance("#123456", "#123456", "deuteranopia")).toBeCloseTo(0, 6);
    expect(black[0]).toBeLessThan(white[0]);
  });
});
