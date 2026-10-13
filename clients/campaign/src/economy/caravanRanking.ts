/**
 * Caravan profitability ranking (Rowan solo task 72).
 *
 * Routes ranked by profit per day: takes candidate routes, prices them via
 * the shared caravan planner, and produces a ranked leaderboard — rank,
 * route name, profit per day, total profit, and a verdict on each route.
 */

import { analyzeRoutes, type CaravanPlanner, type RouteStop } from "./caravans.js";
import type { Good } from "./types.js";

export interface RouteRanking {
  rank: number;
  name: string;
  stops: string[];
  profit: number;
  profitPerDay: number;
  /** Profit per day rounded for display. */
  profitPerDayLabel: string;
  verdict: string;
}

function routeName(stops: RouteStop[]): string {
  return stops.map((s) => s.settlementName).join(" → ");
}

function verdict(profitPerDay: number): string {
  if (profitPerDay >= 50) return "Excellent route — run it often.";
  if (profitPerDay >= 20) return "Solid route.";
  if (profitPerDay >= 0) return "Marginal — watch the road risks.";
  return "Loses money — do not run.";
}

/**
 * Rank candidate routes by profit per day. `cargo`/`units`/`guards` apply
 * to every candidate. Returns best-first, with ranks starting at 1.
 */
export function rankCaravanRoutes(
  candidates: { name?: string; stops: RouteStop[] }[],
  cargo: Good,
  units: number,
  guards: number,
  planner: CaravanPlanner,
): RouteRanking[] {
  const analyzed = analyzeRoutes(
    candidates.map((c) => c.stops),
    cargo,
    units,
    guards,
    planner,
  );
  return analyzed.map((a, i) => {
    const candidate = candidates.find((c) => c.stops === a.stops);
    return {
      rank: i + 1,
      name: candidate?.name ?? routeName(a.stops),
      stops: a.stops.map((s) => s.settlementName),
      profit: Math.round(a.profit),
      profitPerDay: Math.round(a.profitPerDay * 100) / 100,
      profitPerDayLabel: `${a.profitPerDay.toFixed(1)}/day`,
      verdict: verdict(a.profitPerDay),
    };
  });
}
