/**
 * Tasks 102 & 104: caravans and trade-route planning.
 *
 * Caravan setup: fund a caravan, pick a route, and see the profit
 * projection before it leaves. The projection uses recorded prices and
 * distance costs — the actual trading is the campaign layer's.
 *
 * Route planner: multi-stop routes with distance-vs-profit analysis so the
 * player can compare alternatives.
 */

import type { Good } from "./types.js";

export interface RouteStop {
  settlementId: string;
  settlementName: string;
}

export interface Caravan {
  id: string;
  name: string;
  stops: RouteStop[];
  /** Good carried. */
  cargo: Good;
  /** Units of cargo. */
  units: number;
  guards: number;
}

export interface CaravanProjection {
  buyPrice: number;
  sellPrice: number;
  revenue: number;
  costs: { cargo: number; guards: number; distance: number };
  profit: number;
  /** Seasons until it returns. */
  duration: number;
}

let nextCaravan = 1;

export interface CaravanPlanner {
  /** Per-unit price of a good at a settlement (from recorded prices). */
  priceAt: (good: Good, settlementId: string) => number | null;
  /** Distance in "days" between two settlements. */
  distance: (from: string, to: string) => number;
}

export function planCaravan(
  name: string,
  stops: RouteStop[],
  cargo: Good,
  units: number,
  guards: number,
  planner: CaravanPlanner,
): { caravan: Caravan; projection: CaravanProjection } {
  if (stops.length < 2) throw new Error("a caravan needs at least two stops");
  if (units <= 0) throw new Error("caravan needs cargo");
  const buyPrice = planner.priceAt(cargo, stops[0]!.settlementId);
  const sellPrice = planner.priceAt(cargo, stops[stops.length - 1]!.settlementId);
  if (buyPrice == null || sellPrice == null) {
    throw new Error("missing price data for the route endpoints");
  }
  let distance = 0;
  for (let i = 1; i < stops.length; i++) {
    distance += planner.distance(stops[i - 1]!.settlementId, stops[i]!.settlementId);
  }
  const cargoCost = buyPrice * units;
  const guardCost = guards * 20 * Math.ceil(distance / 10);
  const distanceCost = distance * 2;
  const revenue = sellPrice * units;
  const profit = revenue - cargoCost - guardCost - distanceCost;
  const caravan: Caravan = {
    id: `caravan-${nextCaravan++}`,
    name,
    stops,
    cargo,
    units,
    guards,
  };
  return {
    caravan,
    projection: {
      buyPrice,
      sellPrice,
      revenue,
      costs: { cargo: cargoCost, guards: guardCost, distance: distanceCost },
      profit,
      duration: Math.ceil(distance / 20),
    },
  };
}

/** Compare candidate routes: profit per day of travel. */
export function analyzeRoutes(
  routes: RouteStop[][],
  cargo: Good,
  units: number,
  guards: number,
  planner: CaravanPlanner,
): { stops: RouteStop[]; profit: number; profitPerDay: number }[] {
  return routes
    .map((stops) => {
      const { projection } = planCaravan("analysis", stops, cargo, units, guards, planner);
      const days = Math.max(1, projection.duration * 20);
      return { stops, profit: projection.profit, profitPerDay: projection.profit / days };
    })
    .sort((a, b) => b.profitPerDay - a.profitPerDay);
}
