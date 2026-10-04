/**
 * Crafting orders, ported from Bannerlord's smithing.
 *
 * Nobles and notables post orders: "forge me a weapon with these traits."
 * Fulfill an order with a matching forged piece for gold and relations.
 * Orders expire — a noble kept waiting becomes a noble insulted.
 */

export interface CraftingOrder {
  id: string;
  /** Who wants it. */
  patron: string;
  patronTitle: string;
  /** What they want: a recipe id from the smithing bench. */
  recipeId: string;
  recipeName: string;
  /** Days until the order expires. */
  daysLeft: number;
  /** Gold on delivery. */
  reward: number;
  /** Relation gain on delivery. */
  relationReward: number;
}

const PATRONS: { name: string; title: string }[] = [
  { name: "Marcus Webb", title: "Militia Captain" },
  { name: "Elena Vasquez", title: "Caravan Master" },
  { name: "James Okafor", title: "Town Sheriff" },
  { name: "Sarah Lindqvist", title: "Clan Elder" },
  { name: "Tom Beckett", title: "Ranch Foreman" },
  { name: "Aisha Rahman", title: "Quartermaster" },
];

/** Generate a new crafting order from the available recipes. */
export function generateOrder(
  recipes: { id: string; name: string }[],
  id: string,
  random: () => number = Math.random,
): CraftingOrder | null {
  if (recipes.length === 0) return null;
  const recipe = recipes[Math.floor(random() * recipes.length)]!;
  const patron = PATRONS[Math.floor(random() * PATRONS.length)]!;
  return {
    id,
    patron: patron.name,
    patronTitle: patron.title,
    recipeId: recipe.id,
    recipeName: recipe.name,
    daysLeft: 14 + Math.floor(random() * 14),
    reward: 400 + Math.floor(random() * 600),
    relationReward: 5,
  };
}

/** One day passes on all orders. Returns the expired ones. */
export function tickOrders(orders: CraftingOrder[]): { kept: CraftingOrder[]; expired: CraftingOrder[] } {
  const kept: CraftingOrder[] = [];
  const expired: CraftingOrder[] = [];
  for (const o of orders) {
    const left = o.daysLeft - 1;
    if (left <= 0) expired.push(o);
    else kept.push({ ...o, daysLeft: left });
  }
  return { kept, expired };
}

export type FulfillResult =
  | { ok: true; reward: number; relationReward: number; line: string }
  | { ok: false; reason: string };

/**
 * Fulfill an order with a forged piece. The piece must match the recipe;
 * it is consumed.
 */
export function fulfillOrder(
  order: CraftingOrder,
  stockpile: { recipeId: string; count: number }[],
): FulfillResult {
  const stock = stockpile.find((s) => s.recipeId === order.recipeId);
  if (!stock || stock.count <= 0) {
    return { ok: false, reason: `You have no forged ${order.recipeName} to deliver.` };
  }
  return {
    ok: true,
    reward: order.reward,
    relationReward: order.relationReward,
    line: `${order.patron} accepts the ${order.recipeName}. ${order.reward} gold, and a friend in ${order.patronTitle.toLowerCase()} ${order.patron.split(" ")[1] ?? ""}.`.trim(),
  };
}
