/**
 * Ownable businesses and fronts — the modernized workshop system.
 *
 * Extends the `economy/workshops.ts` shape (buy / improve / collect
 * income, income scaling with tier and settlement prosperity) with the
 * modern business types from §23 of the pull list:
 *
 * - **Legit:** liquor store, jewelry store, pawn shop, restaurant,
 *   garage, car wash, dispensary, warehouse.
 * - **Fronts** (gang-tied): chop shop (stolen cars→parts), underground
 *   casino, grow house. Fronts earn more but the police can raid them
 *   (raid risk scales with the crew's heat) and rivals can torch them.
 *
 * Each business has a production chain (inputs in, product out): income
 * scales with input availability, so a jewelry store needs gold supply
 * and a chop shop needs boosted cars — the economy ties together.
 * The property purchase layer (`Safehouse`) is the buy/upgrade/stash
 * core the code-hunt agent specified when no permissively-licensed
 * end-to-end property system turned up.
 */
import { TURF_CONFIG } from "./config.js";

const B = TURF_CONFIG.business;

export type BusinessType =
  | "liquor_store"
  | "jewelry_store"
  | "pawn_shop"
  | "restaurant"
  | "garage"
  | "car_wash"
  | "dispensary"
  | "warehouse"
  | "chop_shop"
  | "casino"
  | "grow_house";

export const BUSINESS_TYPES: readonly BusinessType[] = [
  "liquor_store",
  "jewelry_store",
  "pawn_shop",
  "restaurant",
  "garage",
  "car_wash",
  "dispensary",
  "warehouse",
  "chop_shop",
  "casino",
  "grow_house",
];

export interface BusinessDef {
  type: BusinessType;
  name: string;
  buyCost: number;
  /** Base income per day at tier 1, full prosperity, full supply. */
  baseIncome: number;
  inputs: string[];
  outputs: string[];
  /** Illegal: higher income, police raids, rival torching. */
  front: boolean;
}

export const BUSINESS_DEFS: Record<BusinessType, BusinessDef> = {
  liquor_store: { type: "liquor_store", name: "Liquor Store", buyCost: 25000, baseIncome: 320, inputs: ["alcohol"], outputs: ["retail"], front: false },
  jewelry_store: { type: "jewelry_store", name: "Jewelry Store", buyCost: 60000, baseIncome: 700, inputs: ["gold", "gems"], outputs: ["retail"], front: false },
  pawn_shop: { type: "pawn_shop", name: "Pawn Shop", buyCost: 18000, baseIncome: 240, inputs: ["goods"], outputs: ["retail"], front: false },
  restaurant: { type: "restaurant", name: "Restaurant", buyCost: 35000, baseIncome: 420, inputs: ["produce", "meat"], outputs: ["food"], front: false },
  garage: { type: "garage", name: "Garage", buyCost: 22000, baseIncome: 300, inputs: ["parts"], outputs: ["repairs"], front: false },
  car_wash: { type: "car_wash", name: "Car Wash", buyCost: 15000, baseIncome: 200, inputs: ["water", "supplies"], outputs: ["service"], front: false },
  dispensary: { type: "dispensary", name: "Dispensary", buyCost: 40000, baseIncome: 550, inputs: ["product"], outputs: ["retail"], front: false },
  warehouse: { type: "warehouse", name: "Warehouse", buyCost: 30000, baseIncome: 350, inputs: ["goods"], outputs: ["storage"], front: false },
  chop_shop: { type: "chop_shop", name: "Chop Shop", buyCost: 28000, baseIncome: 650, inputs: ["stolen_cars"], outputs: ["parts"], front: true },
  casino: { type: "casino", name: "Underground Casino", buyCost: 50000, baseIncome: 900, inputs: ["cash"], outputs: ["winnings"], front: true },
  grow_house: { type: "grow_house", name: "Grow House", buyCost: 20000, baseIncome: 500, inputs: ["supplies", "power"], outputs: ["product"], front: true },
};

export interface Business {
  id: string;
  type: BusinessType;
  ownerId: string;
  settlementId: string;
  tier: number; // 1..B.maxTier
  /** Uncollected income, in dollars. */
  stash: number;
}

let nextBusiness = 1;

export function buyBusiness(
  type: BusinessType,
  ownerId: string,
  settlementId: string,
): { business: Business; cost: number } {
  const def = BUSINESS_DEFS[type];
  if (!def) throw new Error(`unknown business type: ${type}`);
  return {
    business: { id: `biz-${nextBusiness++}`, type, ownerId, settlementId, tier: 1, stash: 0 },
    cost: def.buyCost,
  };
}

/** Cost to raise a business to the next tier, or null at max. */
export function improveCost(business: Business): number | null {
  if (business.tier >= B.maxTier) return null;
  return BUSINESS_DEFS[business.type]!.buyCost * business.tier;
}

export function improveBusiness(business: Business): { business: Business; cost: number } {
  const cost = improveCost(business);
  if (cost == null) throw new Error("business is already at max tier");
  return { business: { ...business, tier: business.tier + 1 }, cost };
}

/**
 * Income per day. `prosperity` 0..100 comes from the campaign layer;
 * `supplyFactor` 0..1 is input availability (starved inputs starve income).
 */
export function businessIncomePerDay(
  business: Business,
  prosperity: number,
  supplyFactor = 1,
): number {
  const def = BUSINESS_DEFS[business.type]!;
  const tierMult = 1 + (business.tier - 1) * B.tierMult;
  const prosMult = 0.5 + prosperity / 100;
  const frontMult = def.front ? B.frontMult : 1;
  return Math.round(def.baseIncome * tierMult * prosMult * supplyFactor * frontMult);
}

/** Accrue one day's income into the stash; returns the amount accrued. */
export function accrueDay(business: Business, prosperity: number, supplyFactor = 1): { business: Business; accrued: number } {
  const accrued = businessIncomePerDay(business, prosperity, supplyFactor);
  return { business: { ...business, stash: business.stash + accrued }, accrued };
}

/** Collect the stash. */
export function collectStash(business: Business): { business: Business; amount: number } {
  return { business: { ...business, stash: 0 }, amount: business.stash };
}

/**
 * Daily police-raid probability for a front. Legit businesses are never
 * raided. Scales with the crew's heat (0..100).
 */
export function raidRisk(business: Business, heat: number): number {
  if (!BUSINESS_DEFS[business.type]!.front) return 0;
  return B.raidBase * (1 + heat / 25);
}

/** A raid shuts the front down to tier 1 and seizes the stash. */
export function applyRaid(business: Business): { business: Business; seized: number } {
  return { business: { ...business, tier: 1, stash: 0 }, seized: business.stash };
}

/** A rival torching destroys the business (it must be rebought). */
export function applyTorching(business: Business): { destroyed: Business } {
  return { destroyed: { ...business, tier: 0, stash: 0 } };
}

// --- Safehouses: the property purchase layer ---------------------------------

export interface Safehouse {
  id: string;
  ownerId: string;
  settlementId: string;
  tier: number; // 1..3, gates stash size and income
  stashCash: number;
  stashItems: string[];
}

const SAFEHOUSE_COST = [0, 12000, 30000, 75000];
const SAFEHOUSE_CAPACITY = [0, 50000, 200000, 1000000];

let nextSafehouse = 1;

export function buySafehouse(ownerId: string, settlementId: string): { safehouse: Safehouse; cost: number } {
  return {
    safehouse: {
      id: `sh-${nextSafehouse++}`,
      ownerId,
      settlementId,
      tier: 1,
      stashCash: 0,
      stashItems: [],
    },
    cost: SAFEHOUSE_COST[1]!,
  };
}

export function upgradeSafehouseCost(sh: Safehouse): number | null {
  if (sh.tier >= 3) return null;
  return SAFEHOUSE_COST[sh.tier + 1]!;
}

export function upgradeSafehouse(sh: Safehouse): { safehouse: Safehouse; cost: number } {
  const cost = upgradeSafehouseCost(sh);
  if (cost == null) throw new Error("safehouse is already at max tier");
  return { safehouse: { ...sh, tier: sh.tier + 1 }, cost };
}

/** Stash cash, capped at the tier capacity. Returns the amount actually stashed. */
export function stashCash(sh: Safehouse, amount: number): { safehouse: Safehouse; stashed: number } {
  const capacity = SAFEHOUSE_CAPACITY[sh.tier]!;
  const room = Math.max(0, capacity - sh.stashCash);
  const stashed = Math.min(room, amount);
  return { safehouse: { ...sh, stashCash: sh.stashCash + stashed }, stashed };
}

export function takeCash(sh: Safehouse, amount: number): { safehouse: Safehouse; taken: number } {
  const taken = Math.min(sh.stashCash, amount);
  return { safehouse: { ...sh, stashCash: sh.stashCash - taken }, taken };
}

/** Safehouse income per day: higher tiers launder more. */
export function safehouseIncomePerDay(sh: Safehouse): number {
  return [0, 50, 150, 400][sh.tier] ?? 0;
}
