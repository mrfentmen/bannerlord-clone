/**
 * Campaign difficulty (Rowan solo task 6).
 *
 * Game-wide difficulty chosen at new-game time. Three levels modify the
 * numbers the player feels every day: troop wages, party morale, and enemy
 * damage. Pure modifier functions — the host applies them where wages are
 * paid, morale is computed, and damage is dealt.
 */

export type Difficulty = "easy" | "normal" | "hard";

export interface DifficultyModifiers {
  /** Troop wage multiplier. */
  wageMultiplier: number;
  /** Flat morale adjustment for the player's party. */
  moraleAdjust: number;
  /** Enemy damage multiplier. */
  enemyDamageMultiplier: number;
}

export const DIFFICULTY_MODIFIERS: Record<Difficulty, DifficultyModifiers> = {
  easy: { wageMultiplier: 0.8, moraleAdjust: 10, enemyDamageMultiplier: 0.85 },
  normal: { wageMultiplier: 1.0, moraleAdjust: 0, enemyDamageMultiplier: 1.0 },
  hard: { wageMultiplier: 1.25, moraleAdjust: -10, enemyDamageMultiplier: 1.15 },
};

export interface DifficultyOption {
  id: Difficulty;
  label: string;
  description: string;
}

export function difficultyOptions(): DifficultyOption[] {
  return [
    {
      id: "easy",
      label: "Story",
      description: "Lower wages, higher morale, softer enemies. For the tale.",
    },
    {
      id: "normal",
      label: "Bannerlord",
      description: "The intended balance. Wages, morale and damage as designed.",
    },
    {
      id: "hard",
      label: "Iron Tide",
      description: "Costly troops, brittle morale, brutal enemies. For veterans.",
    },
  ];
}

/** Troop wage cost after difficulty. */
export function wageCost(baseWage: number, difficulty: Difficulty): number {
  return Math.max(1, Math.round(baseWage * DIFFICULTY_MODIFIERS[difficulty]!.wageMultiplier));
}

/** Party morale after difficulty. Clamped 0-100. */
export function moraleWithDifficulty(baseMorale: number, difficulty: Difficulty): number {
  const adjusted = baseMorale + DIFFICULTY_MODIFIERS[difficulty]!.moraleAdjust;
  return Math.max(0, Math.min(100, adjusted));
}

/** Enemy damage after difficulty. */
export function enemyDamage(baseDamage: number, difficulty: Difficulty): number {
  return Math.max(1, Math.round(baseDamage * DIFFICULTY_MODIFIERS[difficulty]!.enemyDamageMultiplier));
}

/** Parse a stored difficulty value; unknown values fall back to normal. */
export function parseDifficulty(value: unknown): Difficulty {
  return value === "easy" || value === "normal" || value === "hard" ? value : "normal";
}
