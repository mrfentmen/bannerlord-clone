/**
 * Death and succession, ported from Bannerlord.
 *
 * In Bannerlord nobody lives forever: every year past middle age the reaper
 * rolls, and when the player character dies the heir takes over the clan.
 * Battle death already exists (`killCharacter`); this module owns the quiet
 * killer -- old age -- with Bannerlord's rising curve.
 */

/**
 * Annual chance of dying of old age. Zero before 45, then quadratic:
 * ~1% at 50, ~9% at 60, ~25% at 70, ~49% at 80. Nobody is immortal, but
 * nobody drops dead at 46 either.
 */
export function annualDeathChance(age: number): number {
  if (age < 45) return 0;
  const over = age - 45;
  return Math.min(0.9, over * over * 0.0004);
}

/** Roll one character's year. True when they die of old age. */
export function rollAnnualDeath(age: number, random: () => number = Math.random): boolean {
  return random() < annualDeathChance(age);
}
