/**
 * The post-processing recipe, locked in ART_DIRECTION.md section 9.
 *
 * One recipe for the whole game. The single most important number in this file is
 * `saturation: -0.22`. `SPEC.md` section 7 says explicitly: not neon.
 */

import { tokens } from "./tokens.js";

export interface GradeSettings {
  toneMapping: "ACES";
  contrast: number;
  exposure: number;
  /** Negative desaturates. Never positive in V1. */
  saturation: number;
  shadowLift: { color: string; amount: number };
  highlightTint: { color: string; amount: number };
  vignette: { weight: number; stretch: number; color: string };
  fxaa: boolean;
  grain: { intensity: number; animated: boolean; monochrome: boolean; size: number };
}

export const grade: GradeSettings = {
  toneMapping: "ACES",
  contrast: 1.18,
  // 0.95. The terrain ramp is deliberately low-chroma, and at unity exposure the ACES
  // curve lifts it toward the sky colour until the relief disappears. This was found
  // by reading pixels off a screenshot, not by taste.
  exposure: 0.95,
  saturation: -0.22,
  shadowLift: { color: "#1A2228", amount: 0.06 },
  highlightTint: { color: "#F2E4C8", amount: 0.05 },
  vignette: { weight: 1.6, stretch: 0.35, color: tokens.ink[900] },
  fxaa: true,
  grain: { intensity: 0.045, animated: true, monochrome: true, size: 1.6 },
};

/**
 * Era grades, ART_AND_AUDIO.md section 4. Multipliers on the base grade, not
 * absolutes, so a change to `grade` does not silently desync all four tiers.
 */
export interface EraGrade {
  tier: 1 | 2 | 3 | 4;
  years: string;
  saturation: number;
  contrast: number;
  warmth: number;
  grain: number;
}

export const eraGrades: EraGrade[] = [
  { tier: 1, years: "1950s", saturation: 0.9, contrast: 1.26, warmth: 0.06, grain: 0.062 },
  { tier: 2, years: "1960s to 1970s", saturation: 0.94, contrast: 1.22, warmth: 0.04, grain: 0.056 },
  { tier: 3, years: "1980s", saturation: 1.0, contrast: 1.18, warmth: 0.02, grain: 0.05 },
  { tier: 4, years: "1990s to 2000s", saturation: 1.06, contrast: 1.14, warmth: 0.0, grain: 0.045 },
];

/** The era a V1 campaign starts in. `ERA.md` section 7 lets the player pick the year. */
export const START_YEAR = 2005;

export function eraGradeForYear(year: number): EraGrade {
  if (year < 1960) return eraGrades[0]!;
  if (year < 1980) return eraGrades[1]!;
  if (year < 1990) return eraGrades[2]!;
  return eraGrades[3]!;
}

export type QualityLevel = "high" | "low";

/**
 * `ART_AND_AUDIO.md` section 10 and `ASSETS.md` section 5.4 both require
 * post-processing to be switchable off. Low drops grain, vignette and FXAA but
 * keeps the colour grade, because the grade is the art direction and the effects
 * are decoration.
 */
export function resolveGrade(level: QualityLevel, year: number): GradeSettings {
  const era = eraGradeForYear(year);
  if (level === "low") {
    return {
      ...grade,
      contrast: grade.contrast * era.contrast,
      saturation: grade.saturation * era.saturation,
      fxaa: false,
      grain: { ...grade.grain, intensity: 0, animated: false },
      vignette: { ...grade.vignette, weight: 0 },
    };
  }
  return {
    ...grade,
    contrast: grade.contrast * era.contrast,
    saturation: grade.saturation * era.saturation,
    grain: { ...grade.grain, intensity: era.grain },
  };
}

/** UI-side paper treatment, ART_DIRECTION.md section 9.5. Lighter than the 3D grade. */
export const paperTreatment = {
  fibreOpacity: 0.035,
  fibreTile: "180px",
  wellInset: "inset 0 1px 2px rgba(23, 20, 15, 0.06)",
} as const;

/** The stamp rotation, fixed (ART_DIRECTION.md section 6, motif 2). */
export const STAMP_ROTATION_DEG = -4.5;
