/**
 * Bannerlord's luck systems: persuasion, child traits, battle death.
 *
 * Bannerlord runs these on pseudorandom seeds tied to the save. The doc
 * notes three behaviors this module reproduces:
 *
 * - Persuasion: charm vs difficulty, shown as a percentage. The roll is
 *   honest here — what the UI shows is what the dice do.
 * - Child traits: flat, unweighted random. Parental stats do not skew it,
 *   per community research.
 * - Battle death: a hero downed in battle has a ~10% base chance to die
 *   instead of being wounded.
 */

/** Personality traits a child can be born with. Flat distribution. */
export const CHILD_TRAITS = [
  "brave",
  "cautious",
  "generous",
  "calculating",
  "merciful",
  "ruthless",
  "honorable",
  "cunning",
  "loyal",
  "ambitious",
  "patient",
  "hot-headed",
] as const;

export type ChildTrait = (typeof CHILD_TRAITS)[number];

/** Roll 1-2 traits for a newborn. Flat random — parents don't skew it. */
export function rollChildTraits(random: () => number = Math.random): ChildTrait[] {
  const first = CHILD_TRAITS[Math.floor(random() * CHILD_TRAITS.length)]!;
  let second = CHILD_TRAITS[Math.floor(random() * CHILD_TRAITS.length)]!;
  if (second === first) {
    second = CHILD_TRAITS[(CHILD_TRAITS.indexOf(first) + 1) % CHILD_TRAITS.length]!;
  }
  return random() < 0.4 ? [first, second] : [first];
}

export interface PersuasionRoll {
  /** The percentage the UI shows. */
  chance: number;
  success: boolean;
  /** How far the roll beat/missed the target, for flavor text. */
  margin: number;
}

/**
 * Charm persuasion check. Chance = 50% + (charm - difficulty) * 7%,
 * clamped 5-95. The roll is a single honest die — no hidden logic.
 */
export function rollPersuasion(
  charm: number,
  difficulty: number,
  random: () => number = Math.random,
): PersuasionRoll {
  const chance = Math.min(0.95, Math.max(0.05, 0.5 + (charm - difficulty) * 0.07));
  const roll = random();
  return { chance, success: roll < chance, margin: chance - roll };
}

/**
 * A hero downed in battle dies outright ~10% of the time (Bannerlord's
 * baseline); otherwise they pull through wounded.
 */
export function rollBattleDeath(random: () => number = Math.random): boolean {
  return random() < 0.1;
}
