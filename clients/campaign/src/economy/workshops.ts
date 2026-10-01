/**
 * Task 103: workshop management. Buy a workshop in a settlement, improve it
 * through tiers, and see its per-season income. Income scales with tier and
 * the settlement's prosperity — the campaign layer supplies prosperity.
 */

export type WorkshopType = "smithy" | "brewery" | "tannery" | "weaver" | "mill";

export const WORKSHOP_TYPES: WorkshopType[] = ["smithy", "brewery", "tannery", "weaver", "mill"];

const BASE_INCOME: Record<WorkshopType, number> = {
  smithy: 120,
  brewery: 100,
  tannery: 90,
  weaver: 110,
  mill: 80,
};

const BUY_COST: Record<WorkshopType, number> = {
  smithy: 3000,
  brewery: 2500,
  tannery: 2200,
  weaver: 2600,
  mill: 2000,
};

export const MAX_TIER = 3;

export interface Workshop {
  id: string;
  type: WorkshopType;
  settlementId: string;
  tier: number; // 1..MAX_TIER
}

let nextWorkshop = 1;

export function buyWorkshop(type: WorkshopType, settlementId: string): { workshop: Workshop; cost: number } {
  if (!WORKSHOP_TYPES.includes(type)) throw new Error(`unknown workshop type: ${type}`);
  return {
    workshop: { id: `ws-${nextWorkshop++}`, type, settlementId, tier: 1 },
    cost: BUY_COST[type],
  };
}

/** Cost to raise a workshop to the next tier. */
export function improveCost(workshop: Workshop): number | null {
  if (workshop.tier >= MAX_TIER) return null;
  return BUY_COST[workshop.type] * workshop.tier;
}

export function improveWorkshop(workshop: Workshop): { workshop: Workshop; cost: number } {
  const cost = improveCost(workshop);
  if (cost == null) throw new Error("workshop is already at max tier");
  return { workshop: { ...workshop, tier: workshop.tier + 1 }, cost };
}

/** Per-season income. `prosperity` 0..100 comes from the campaign layer. */
export function workshopIncome(workshop: Workshop, prosperity: number): number {
  const tierMult = 1 + (workshop.tier - 1) * 0.6;
  const prosMult = 0.5 + prosperity / 100;
  return Math.round(BASE_INCOME[workshop.type] * tierMult * prosMult);
}
