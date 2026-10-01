/**
 * Task 101: dynamic price viewer data. Record per-season prices for any
 * good; report history, moving average, and trend direction.
 */

import type { Good, PricePoint } from "./types.js";

export type Trend = "rising" | "falling" | "flat";

export interface PriceHistory {
  record(good: Good, season: number, price: number): void;
  history(good: Good): PricePoint[];
  movingAverage(good: Good, window: number): number | null;
  trend(good: Good, window: number): Trend | null;
  latest(good: Good): number | null;
}

export function createPriceHistory(): PriceHistory {
  const series = new Map<Good, PricePoint[]>();
  const push = (good: Good, season: number, price: number) => {
    const list = series.get(good) ?? [];
    list.push({ season, price });
    list.sort((a, b) => a.season - b.season);
    series.set(good, list);
  };
  const last = (good: Good, window: number): PricePoint[] => {
    const list = series.get(good) ?? [];
    return list.slice(-window);
  };
  return {
    record: push,
    history: (good) => [...(series.get(good) ?? [])],
    latest: (good) => {
      const list = series.get(good) ?? [];
      return list.length > 0 ? list[list.length - 1]!.price : null;
    },
    movingAverage(good, window) {
      const pts = last(good, window);
      if (pts.length === 0) return null;
      return pts.reduce((s, p) => s + p.price, 0) / pts.length;
    },
    trend(good, window) {
      const pts = last(good, window);
      if (pts.length < 2) return null;
      const first = pts[0]!.price;
      const lastP = pts[pts.length - 1]!.price;
      if (first === 0) return "flat";
      const change = (lastP - first) / first;
      return change > 0.05 ? "rising" : change < -0.05 ? "falling" : "flat";
    },
  };
}
