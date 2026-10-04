/**
 * Smithing stamina, ported from Bannerlord's forge.
 *
 * Recipes, quality rolls, and smelting existed — but the smith could work
 * forever. Bannerlord's smith gets tired: every action spends stamina,
 * and the pool refills each dawn. The pool grows with the Crafting skill.
 */

export interface StaminaTerms {
  /** Player's Crafting skill. */
  crafting: number;
  /** Stamina remaining. */
  stamina: number;
}

/** Max stamina: 100 base, +2 per Crafting point. */
export function maxStamina(crafting: number): number {
  return 100 + Math.max(0, crafting) * 2;
}

/** Stamina cost to smelt one arms. */
export const SMELT_STAMINA_PER_ARMS = 8;

/** Stamina cost to forge: base plus the recipe's tier weight. */
export function forgeStaminaCost(recipeTier: number): number {
  return 20 + Math.max(1, recipeTier) * 10;
}

export type StaminaCheck = { ok: true } | { ok: false; reason: string };

/** Can the smith afford this action? */
export function checkStamina(terms: StaminaTerms, cost: number): StaminaCheck {
  if (terms.stamina >= cost) return { ok: true };
  return {
    ok: false,
    reason: `The smith is exhausted (${Math.floor(terms.stamina)}/${maxStamina(terms.crafting)} stamina, needs ${cost}). Rest until dawn.`,
  };
}

/** Spend stamina, floored at zero. */
export function spendStamina(terms: StaminaTerms, cost: number): number {
  return Math.max(0, terms.stamina - cost);
}

/** Dawn refill. */
export function recoverStamina(crafting: number): number {
  return maxStamina(crafting);
}
