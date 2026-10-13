/**
 * Modernized Bannerlord trader system (del order 2026-10-03).
 *
 * In Bannerlord, caravans are player-founded enterprises: 15,000 denars, a
 * companion to lead, ~29 guards. They roam as AI parties buying low and
 * selling high, act as mobile traders the player can trade with, give trade
 * rumors, balance town economies, and can be attacked by bandits.
 *
 * Modernized for this game:
 * - Denars -> dollars ($15,000 founding cost)
 * - Companion -> hired driver (named from the ethnicity generator)
 * - Guards -> private security detail
 * - Towns -> the 12 Front Range settlements
 * - Goods -> grain, medicine, metal, fuel, arms, textiles, tools, lumber
 *
 * The fixture owns the live caravan parties; this module owns the data model,
 * founding rules, company names, and trade-rumor generation.
 */

import type { GoodId } from "./types.js";
import { createNameRng, titledName, type NameRng, type NpcRole } from "./names.js";

/** What it costs the player to found a trade convoy. Bannerlord: 15,000 denars. */
export const CARAVAN_FOUNDING_COST = 15000;

/** Security detail size. Bannerlord caravans ship with ~29 guards; modern convoys run leaner. */
export const CARAVAN_GUARD_COUNT = 12;

/** Days before a new convoy is expected to turn profitable (Bannerlord: "a few weeks"). */
export const CARAVAN_BREAK_EVEN_DAYS = 21;

/** Trading company names for player-founded convoys. */
const COMPANY_NAMES = [
  "Red Wagon Trading",
  "Blue Mule Co.",
  "Golden Wheel",
  "Front Range Freight",
  "Mile High Mercantile",
  "Rocky Mountain Traders",
  "Denver Dispatch Co.",
  "Continental Caravan",
  "High Plains Haulers",
  "Summit Supply Line",
  "Clear Creek Commerce",
  "Pikes Peak Provisions",
  "Boulder Basin Trading",
  "South Platte Supply",
  "Frontier Freight Co.",
  "Alpine Exchange",
  "Copper Corridor Co.",
  "Timberline Traders",
  "El Dorado Express",
  "Zephyr Trade Co.",
];

export function randomCompanyName(rng: NameRng): string {
  return COMPANY_NAMES[Math.floor(rng() * COMPANY_NAMES.length)]!;
}

/** A trade rumor: a price tip a caravan driver shares about town markets. */
export interface TradeRumor {
  /** e.g. "grain" */
  goodId: GoodId;
  goodName: string;
  /** Where it's cheap right now. */
  buyTownId: string;
  buyTownName: string;
  buyPrice: number;
  /** Where it sells high right now. */
  sellTownId: string;
  sellTownName: string;
  sellPrice: number;
  /** Expected profit per unit. */
  profitPerUnit: number;
  /** Plain-language tip, e.g. "Grain's cheap in Denver and Boulder pays double." */
  text: string;
}

export interface TownMarketPrice {
  townId: string;
  townName: string;
  goodId: GoodId;
  goodName: string;
  price: number;
}

/**
 * Generate trade rumors from current market prices — what Bannerlord caravan
 * drivers tell you when you talk to them. Finds the biggest buy-low/sell-high
 * spread per good across towns.
 */
export function getTradeRumors(
  prices: TownMarketPrice[],
  maxRumors = 3,
): TradeRumor[] {
  const byGood = new Map<GoodId, TownMarketPrice[]>();
  for (const p of prices) {
    const list = byGood.get(p.goodId) ?? [];
    list.push(p);
    byGood.set(p.goodId, list);
  }
  const rumors: TradeRumor[] = [];
  for (const [, towns] of byGood) {
    if (towns.length < 2) continue;
    let buy = towns[0]!;
    let sell = towns[0]!;
    for (const t of towns) {
      if (t.price < buy.price) buy = t;
      if (t.price > sell.price) sell = t;
    }
    if (sell.price <= buy.price) continue;
    const profitPerUnit = Math.round((sell.price - buy.price) * 100) / 100;
    rumors.push({
      goodId: buy.goodId,
      goodName: buy.goodName,
      buyTownId: buy.townId,
      buyTownName: buy.townName,
      buyPrice: buy.price,
      sellTownId: sell.townId,
      sellTownName: sell.townName,
      sellPrice: sell.price,
      profitPerUnit,
      text: `${buy.goodName}'s cheap in ${buy.townName} ($${buy.price}) and ${sell.townName} pays $${sell.price}.`,
    });
  }
  rumors.sort((a, b) => b.profitPerUnit - a.profitPerUnit);
  return rumors.slice(0, maxRumors);
}

/** Options the player picks when founding a convoy. */
export interface FoundCaravanOptions {
  /** Settlement id where the convoy is founded. */
  townId: string;
  /** Seed for the driver name + company name. */
  seed: number;
  /** Circuit of town ids the convoy will loop (from tradePaths.ts). */
  circuit: string[];
}

/** A player-founded trade convoy, ready to spawn as an NPC party. */
export interface FoundedCaravan {
  /** Company name, e.g. "Front Range Freight". */
  companyName: string;
  /** Driver name, e.g. "Marco Rossi". */
  driverName: string;
  driverTitle: string;
  /** Full display name: "Front Range Freight — Driver Marco Rossi". */
  displayName: string;
  guardCount: number;
  foundingCost: number;
  circuit: string[];
}

/**
 * Build a founded caravan spec. The caller (fixture) deducts the cost from
 * the player's purse and spawns the party. Pure: no side effects.
 */
export function foundCaravanSpec(options: FoundCaravanOptions): FoundedCaravan {
  const rng = createNameRng(options.seed);
  const companyName = randomCompanyName(rng);
  const driver = titledName("merchant" as NpcRole, rng);
  return {
    companyName,
    driverName: driver.fullName,
    driverTitle: driver.title,
    displayName: `${companyName} — ${driver.title} ${driver.fullName}`,
    guardCount: CARAVAN_GUARD_COUNT,
    foundingCost: CARAVAN_FOUNDING_COST,
    circuit: [...options.circuit],
  };
}

/**
 * Whether the player can afford to found a convoy.
 * Bannerlord gates caravans behind real money so they're a mid-game investment.
 */
export function canAffordCaravan(playerMoney: number): boolean {
  return playerMoney >= CARAVAN_FOUNDING_COST;
}
