/**
 * Four Bannerlord campaign systems missing from the game, modernized.
 *
 * 1. Forced march: Bannerlord lets a party push harder at a morale cost.
 *    Toggle it, march 30% faster, pay in morale and rations every day.
 * 2. Food variety: Bannerlord rewards a varied diet with morale. One food
 *    type keeps the party alive; three keep them happy.
 * 3. Prison break: Bannerlord's roguery lets you break allies out of enemy
 *    captivity. Success scales with roguery skill; failure wounds the team
 *    and angers the settlement.
 * 4. Smithing: Bannerlord's crafting, modernized to a workshop bench. Smelt
 *    captured weapons for metal, forge melee weapons and gun mods.
 *
 * All pure logic. The fixture wires the daily effects into upkeep.
 */

/** Food-type goods. The abstract `food` stock counts as one more type. */
export const FOOD_GOOD_IDS = ['grain', 'meat', 'fish', 'produce', 'canned'] as const;

/**
 * Spoilage: fresh food rots. Each food good loses this fraction per day
 * unless preserved. Canned goods never spoil; grain barely does.
 */
export const SPOILAGE_RATES: Record<string, number> = {
  meat: 0.15,
  fish: 0.2,
  produce: 0.12,
  grain: 0.02,
  canned: 0,
};

/** Apply one day of spoilage to the party's food goods. Returns what rotted. */
export function spoilFood(
  goods: { goodId: string; quantity: number }[],
): { goodId: string; lost: number }[] {
  const rotted: { goodId: string; lost: number }[] = [];
  for (const g of goods) {
    const rate = SPOILAGE_RATES[g.goodId];
    if (rate === undefined || rate <= 0 || g.quantity <= 0) continue;
    const lost = Math.min(g.quantity, Math.max(1, Math.floor(g.quantity * rate)));
    g.quantity -= lost;
    rotted.push({ goodId: g.goodId, lost });
  }
  return rotted;
}

/** Distinct food types the party carries (1-3+). */
export function foodVariety(
  goods: { goodId: string; quantity: number }[],
  foodStock: number,
): number {
  let types = foodStock > 0 ? 1 : 0;
  for (const id of FOOD_GOOD_IDS) {
    if (goods.some((g) => g.goodId === id && g.quantity > 0)) types++;
  }
  return types;
}

/**
 * Daily morale delta from diet variety. Bannerlord's rule: a varied diet
 * keeps morale up; the same gruel every day does not.
 */
export function foodVarietyMoraleDelta(variety: number): number {
  if (variety >= 3) return 0.02;
  if (variety === 2) return 0.01;
  return 0;
}

/** Forced march: +30% march speed while active. */
export const FORCED_MARCH_SPEED_MULT = 1.3;
/** Daily morale cost of pushing the party. */
export const FORCED_MARCH_MORALE_COST = 0.03;
/** Food consumption multiplier while force-marching. */
export const FORCED_MARCH_FOOD_MULT = 1.5;

// --- Prison break -----------------------------------------------------------

export interface PrisonBreakRequest {
  /** Player's roguery skill points. */
  roguery: number;
  /** Troops committed to the break (fewer is sneakier, up to a point). */
  teamSize: number;
  /** Settlement garrison strength. */
  garrison: number;
  /** Prisoners held there that belong to the player. */
  prisonersHeld: number;
}

export interface PrisonBreakOdds {
  /** 0-1 chance the break succeeds. */
  success: number;
  /** 0-1 chance of being caught if it fails. */
  caught: number;
}

/**
 * Bannerlord's prison break, modernized. A small skilled team slips in; a
 * big team gets noticed. Roguery is the skill that matters.
 */
export function prisonBreakOdds(req: PrisonBreakRequest): PrisonBreakOdds {
  const skill = 0.2 + Math.min(0.6, req.roguery * 0.06);
  const stealth = req.teamSize <= 5 ? 1.15 : req.teamSize <= 10 ? 1.0 : 0.8;
  const garrisonFactor = 1 / (1 + req.garrison / 50);
  const success = Math.min(0.95, Math.max(0.05, skill * stealth * (0.5 + garrisonFactor)));
  const caught = Math.min(0.9, Math.max(0.1, (1 - success) * 0.7 + req.teamSize / 100));
  return { success, caught };
}

export interface PrisonBreakResult {
  success: boolean;
  /** Prisoners freed (0 on failure). */
  freed: number;
  /** Team members wounded in the attempt. */
  wounded: number;
  /** Caught: the settlement turns hostile. */
  caught: boolean;
}

export function resolvePrisonBreak(
  req: PrisonBreakRequest,
  random: () => number = Math.random,
): PrisonBreakResult {
  const odds = prisonBreakOdds(req);
  const roll = random();
  if (roll < odds.success) {
    return { success: true, freed: req.prisonersHeld, wounded: 0, caught: false };
  }
  const caught = random() < odds.caught;
  const wounded = Math.max(1, Math.floor(req.teamSize * 0.2 * random()));
  return { success: false, freed: 0, wounded, caught };
}

// --- Smithing ----------------------------------------------------------------

export interface SmithingRecipe {
  id: string;
  name: string;
  /** Metal units required. */
  metal: number;
  /** Fuel units required. */
  fuel: number;
  /** What it makes. */
  result: string;
}

/**
 * Quality tiers, Bannerlord-style. A masterwork blade isn't just sharper —
 * it's worth triple, and nobles pay accordingly. Quality is rolled at the
 * forge from the smith's skill: higher skill, better odds of fine work.
 */
export type SmithingQuality = 'crude' | 'fine' | 'masterwork';

export const QUALITY_MULTIPLIERS: Record<SmithingQuality, { value: number; label: string }> = {
  crude: { value: 0.7, label: 'Crude' },
  fine: { value: 1.0, label: 'Fine' },
  masterwork: { value: 2.5, label: 'Masterwork' },
};

/** Roll quality from smithing skill 0..10. */
export function rollQuality(
  skill: number,
  random: () => number = Math.random,
): SmithingQuality {
  const roll = random();
  // Masterwork needs skill 6+ and luck; crude haunts the unskilled.
  const masterChance = Math.max(0, (skill - 5) * 0.06);
  const crudeChance = Math.max(0.05, 0.45 - skill * 0.04);
  if (roll < masterChance) return 'masterwork';
  if (roll < masterChance + crudeChance) return 'crude';
  return 'fine';
}

/** The workshop bench. Modern: blades and gun mods, not broadswords. */
export const SMITHING_RECIPES: readonly SmithingRecipe[] = [
  { id: 'knife', name: 'Combat knife', metal: 2, fuel: 1, result: 'weapon-knife' },
  { id: 'machete', name: 'Machete', metal: 4, fuel: 2, result: 'weapon-machete' },
  { id: 'bat', name: 'Reinforced bat', metal: 3, fuel: 1, result: 'weapon-bat' },
  { id: 'suppressor', name: 'Suppressor', metal: 5, fuel: 3, result: 'mod-suppressor' },
  { id: 'ext-mag', name: 'Extended magazine', metal: 3, fuel: 2, result: 'mod-ext-mag' },
];

/**
 * Smelt a captured weapon for metal. Higher-tier weapons yield more --
 * Bannerlord's smelting rewards looting the good stuff.
 */
export function smeltYield(tier: number): number {
  return Math.max(1, tier);
}

export interface ForgeResult {
  ok: boolean;
  reason?: string;
}

/** Can this recipe be forged with these stocks? */
export function canForge(recipe: SmithingRecipe, metal: number, fuel: number): ForgeResult {
  if (metal < recipe.metal) return { ok: false, reason: `needs ${recipe.metal} metal` };
  if (fuel < recipe.fuel) return { ok: false, reason: `needs ${recipe.fuel} fuel` };
  return { ok: true };
}
