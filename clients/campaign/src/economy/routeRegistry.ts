/**
 * Caravan registry + weekly books (MASTER_PLAN tasks 102/103).
 *
 * Task 103 (caravan management): found caravans, set their routes, and see
 * profit/loss per route per week. Task 102 (trade route visualizer) draws
 * these routes on the campaign map; see routeVisualizer.ts.
 *
 * The sim owns real trade. This registry is the client's books for the
 * caravans the player founds: which settlements they loop, what they carry,
 * and a weekly projected profit/loss ledger. Prices come from the caller's
 * snapshot markets, distances from the caller's road graph, guard wages from
 * the player's party troops. Nothing here invents world data; when a price
 * is missing the week books with `dataMissing: true` instead of a guess.
 */

import type { GoodId } from "../data/types.js";

export interface CaravanStop {
  settlementId: string;
  name: string;
}

export interface WeekLedger {
  weekStartDay: number;
  weekEndDay: number;
  /** Fractional circuits completed this week (7 days / circuit days). */
  legsCompleted: number;
  /** Sale proceeds, from live market prices. */
  revenue: number;
  /** What the cargo cost at the buying end. */
  costOfGoods: number;
  guardWages: number;
  distanceCost: number;
  profit: number;
  /** True when a price was missing, so revenue/costOfGoods are partial. */
  dataMissing: boolean;
  notes: string[];
}

export interface TradeCaravan {
  id: string;
  name: string;
  /** The loop: the last stop returns to the first, closing the circuit. */
  stops: CaravanStop[];
  goodId: GoodId;
  goodName: string;
  units: number;
  guards: number;
  foundedDay: number;
  /** Days per leg, same order as `stops` (leg i: stops[i] -> stops[i+1 mod n]). */
  legDays: number[];
  /** Road kilometres per leg, for the distance-cost line. */
  legKm: number[];
  lastSettledDay: number;
  weeks: WeekLedger[];
}

export interface FoundInput {
  name: string;
  stops: CaravanStop[];
  goodId: GoodId;
  goodName: string;
  units: number;
  guards: number;
}

export interface FoundDeps {
  /** Road kilometres between two settlements; null when no road path exists. */
  distanceKm: (fromId: string, toId: string) => number | null;
  /** Kilometres a caravan covers per day (the player's party speed). */
  kmPerDay: number;
}

export interface SettleDeps {
  /** Sim price of a good at a settlement; null when the sim reports none. */
  priceAt: (goodId: GoodId, settlementId: string) => number | null;
  /** Guard wage per guard per day, from the player's party troops. */
  guardWagePerDay: number;
}

/** Cap on founded caravans; Bannerlord caravans are a handful, not a fleet. */
export const MAX_CARAVANS = 20;
/** Weeks of books kept per caravan — a full campaign year. */
export const MAX_LEDGER_WEEKS = 52;
/**
 * Bookkeeping rate for wear, tolls and bribes per road kilometre. This is a
 * client-side ledger assumption (the sim does not price caravan wear), and it
 * is shown on the ledger as an estimate, not a sim figure.
 */
export const DISTANCE_COST_PER_KM = 0.5;

/** Storage key for the persisted caravan registry. Exported so the
 * per-campaign reset (meta/campaignReset.ts) can clear it by name. */
export const TRADE_ROUTES_STORAGE_KEY = "campaign.tradeRoutes.v1";
const STORE_KEY = TRADE_ROUTES_STORAGE_KEY;

let nextId = 1;

function sanitizeCaravan(raw: unknown): TradeCaravan | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c["id"] !== "string" || typeof c["name"] !== "string") return null;
  if (!Array.isArray(c["stops"]) || c["stops"].length < 2) return null;
  if (typeof c["goodId"] !== "string" || typeof c["goodName"] !== "string") return null;
  if (!Number.isFinite(c["units"]) || (c["units"] as number) <= 0) return null;
  if (!Number.isFinite(c["guards"]) || (c["guards"] as number) < 0) return null;
  if (!Array.isArray(c["legDays"]) || !Array.isArray(c["legKm"])) return null;
  if (!Array.isArray(c["weeks"])) return null;
  return {
    id: c["id"] as string,
    name: c["name"] as string,
    stops: c["stops"] as CaravanStop[],
    goodId: c["goodId"] as GoodId,
    goodName: c["goodName"] as string,
    units: c["units"] as number,
    guards: c["guards"] as number,
    foundedDay: typeof c["foundedDay"] === "number" ? c["foundedDay"] : 0,
    legDays: c["legDays"] as number[],
    legKm: c["legKm"] as number[],
    lastSettledDay: typeof c["lastSettledDay"] === "number" ? c["lastSettledDay"] : 0,
    weeks: c["weeks"] as WeekLedger[],
  };
}

export interface RouteRegistry {
  list(): TradeCaravan[];
  found(input: FoundInput, day: number, deps: FoundDeps): TradeCaravan;
  retire(id: string): boolean;
  /** Settle every full 7-day week up to `day`. Idempotent. */
  advance(day: number, deps: SettleDeps): void;
  /**
   * Drop every caravan and its persisted books. Used by the per-campaign
   * reset (meta/campaignReset.ts): a new campaign starts with no trade
   * routes, and the old campaign's profit history must not bleed across.
   */
  clear(): void;
}

export function createRouteRegistry(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): RouteRegistry {
  let caravans: TradeCaravan[] = load();

  function load(): TradeCaravan[] {
    let raw: string | null = null;
    try {
      raw = storage.getItem(STORE_KEY);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(sanitizeCaravan)
        .filter((c): c is TradeCaravan => c !== null);
    } catch {
      // Corrupt store: start empty rather than crash the economy panel.
      return [];
    }
  }

  function persist(): void {
    try {
      storage.setItem(STORE_KEY, JSON.stringify(caravans));
    } catch {
      // Blocked storage must not break the game; the registry keeps working
      // in memory for the session.
    }
  }

  function settleWeek(caravan: TradeCaravan, weekStart: number, deps: SettleDeps): WeekLedger {
    const weekEnd = weekStart + 7;
    const notes: string[] = [];
    const circuitDays = caravan.legDays.reduce((s, d) => s + Math.max(d, 0.25), 0);
    const legsCompleted = 7 / Math.max(circuitDays, 0.25);
    let revenue = 0;
    let costOfGoods = 0;
    let dataMissing = false;
    const n = caravan.stops.length;
    for (let i = 0; i < n; i += 1) {
      const from = caravan.stops[i]!;
      const to = caravan.stops[(i + 1) % n]!;
      const legFraction = legsCompleted / n;
      const buy = deps.priceAt(caravan.goodId, from.settlementId);
      const sell = deps.priceAt(caravan.goodId, to.settlementId);
      if (buy === null || sell === null) {
        dataMissing = true;
        notes.push(
          `${from.name}→${to.name}: no market price for ${caravan.goodName}; margin skipped`,
        );
        continue;
      }
      revenue += legFraction * caravan.units * sell;
      costOfGoods += legFraction * caravan.units * buy;
    }
    const guardWages = caravan.guards * deps.guardWagePerDay * 7;
    const totalKm = caravan.legKm.reduce((s, k) => s + k, 0);
    const distanceCost = legsCompleted * totalKm * DISTANCE_COST_PER_KM;
    const profit = revenue - costOfGoods - guardWages - distanceCost;
    return {
      weekStartDay: weekStart,
      weekEndDay: weekEnd,
      legsCompleted,
      revenue,
      costOfGoods,
      guardWages,
      distanceCost,
      profit,
      dataMissing,
      notes,
    };
  }

  return {
    list(): TradeCaravan[] {
      return [...caravans];
    },

    found(input: FoundInput, day: number, deps: FoundDeps): TradeCaravan {
      const name = input.name.trim().slice(0, 40);
      if (!name) throw new Error("name your caravan");
      if (caravans.length >= MAX_CARAVANS) {
        throw new Error(`caravan limit reached (${MAX_CARAVANS})`);
      }
      if (input.stops.length < 2) throw new Error("a route needs at least two stops");
      const ids = input.stops.map((s) => s.settlementId);
      if (new Set(ids).size !== ids.length) throw new Error("stops must not repeat");
      if (!Number.isInteger(input.units) || input.units < 1) {
        throw new Error("cargo units must be a whole number of at least 1");
      }
      if (!Number.isInteger(input.guards) || input.guards < 0) {
        throw new Error("guards must be a whole number of 0 or more");
      }
      if (!(deps.kmPerDay > 0)) throw new Error("caravan speed must be positive");
      const legKm: number[] = [];
      const legDays: number[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        const from = ids[i]!;
        const to = ids[(i + 1) % ids.length]!;
        const km = deps.distanceKm(from, to);
        if (km === null) {
          const fromName = input.stops[i]!.name;
          const toName = input.stops[(i + 1) % ids.length]!.name;
          throw new Error(`no surveyed road from ${fromName} to ${toName}`);
        }
        legKm.push(km);
        legDays.push(Math.max(km / deps.kmPerDay, 0.25));
      }
      const caravan: TradeCaravan = {
        id: `caravan-${nextId++}-${Math.floor(day)}`,
        name,
        stops: input.stops.map((s) => ({ settlementId: s.settlementId, name: s.name })),
        goodId: input.goodId,
        goodName: input.goodName,
        units: input.units,
        guards: input.guards,
        foundedDay: day,
        legDays,
        legKm,
        lastSettledDay: day,
        weeks: [],
      };
      caravans = [...caravans, caravan];
      persist();
      return caravan;
    },

    retire(id: string): boolean {
      const before = caravans.length;
      caravans = caravans.filter((c) => c.id !== id);
      if (caravans.length === before) return false;
      persist();
      return true;
    },

    advance(day: number, deps: SettleDeps): void {
      if (!Number.isFinite(day)) return;
      let changed = false;
      for (const caravan of caravans) {
        while (caravan.lastSettledDay + 7 <= day) {
          const week = settleWeek(caravan, caravan.lastSettledDay, deps);
          caravan.weeks = [...caravan.weeks, week].slice(-MAX_LEDGER_WEEKS);
          caravan.lastSettledDay += 7;
          changed = true;
        }
      }
      if (changed) persist();
    },

    clear(): void {
      if (caravans.length === 0) return;
      caravans = [];
      persist();
    },
  };
}

/** Sum of weekly profits across the caravan's kept books. */
export function totalProfit(caravan: TradeCaravan): number {
  return caravan.weeks.reduce((s, w) => s + w.profit, 0);
}
