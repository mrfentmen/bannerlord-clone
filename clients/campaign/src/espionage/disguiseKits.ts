/**
 * Disguise kit crafting (Rowan solo task 63).
 *
 * Craft disguise kits from resources in three quality tiers. Better kits
 * grant a bigger cover bonus when starting an infiltration. Resources are
 * abstract stockpiles the campaign layer tracks; this module does the
 * recipes and the crafting.
 */

export type KitQuality = "crude" | "good" | "masterwork";

export const KIT_QUALITIES: KitQuality[] = ["crude", "good", "masterwork"];

export interface KitRecipe {
  quality: KitQuality;
  /** Resource -> amount. */
  cost: Record<string, number>;
  /** Cover bonus when infiltrating with this kit. */
  coverBonus: number;
  description: string;
}

export const KIT_RECIPES: Record<KitQuality, KitRecipe> = {
  crude: {
    quality: "crude",
    cost: { cloth: 2, dye: 1 },
    coverBonus: 10,
    description: "A rough disguise: borrowed clothes and a new walk. +10 cover.",
  },
  good: {
    quality: "good",
    cost: { cloth: 4, dye: 2, papers: 1 },
    coverBonus: 25,
    description: "Tailored clothes and forged papers. +25 cover.",
  },
  masterwork: {
    quality: "masterwork",
    cost: { cloth: 6, dye: 4, papers: 2, cosmetics: 2 },
    coverBonus: 45,
    description: "A second skin: prosthetics, perfect papers, a lived-in backstory. +45 cover.",
  },
};

export interface DisguiseKit {
  id: string;
  quality: KitQuality;
  coverBonus: number;
}

export interface CraftResult {
  ok: boolean;
  kit?: DisguiseKit;
  /** Remaining resources after crafting. */
  stock?: Record<string, number>;
  reason?: string;
}

/**
 * Craft a kit from a resource stockpile. Returns the kit and the
 * remaining stock, or a reason when resources are short. Pure.
 */
export function craftKit(quality: KitQuality, stock: Record<string, number>): CraftResult {
  const recipe = KIT_RECIPES[quality];
  if (!recipe) return { ok: false, reason: `unknown kit quality: ${quality}` };
  const missing: string[] = [];
  for (const [res, need] of Object.entries(recipe.cost)) {
    if ((stock[res] ?? 0) < need) missing.push(`${res} (need ${need})`);
  }
  if (missing.length > 0) {
    return { ok: false, reason: `not enough resources: ${missing.join(", ")}` };
  }
  const remaining = { ...stock };
  for (const [res, need] of Object.entries(recipe.cost)) {
    remaining[res] = (remaining[res] ?? 0) - need;
  }
  return {
    ok: true,
    kit: {
      id: `kit-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      quality,
      coverBonus: recipe.coverBonus,
    },
    stock: remaining,
  };
}

/** Can the stockpile afford this kit? */
export function canCraft(quality: KitQuality, stock: Record<string, number>): boolean {
  return craftKit(quality, stock).ok;
}
