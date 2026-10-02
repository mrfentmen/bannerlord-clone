/**
 * Task 105: market price history chart. Renders the last 30 price points
 * per good as an inline SVG line chart from the existing price-history
 * data (prices.ts) — min/max labeled, no canvas needed.
 */

import { h } from "../ui/dom.js";
import type { PricePoint } from "./types.js";

/** How many points the chart shows (the task's 30-day acceptance). */
export const CHART_POINTS = 30;

export function renderPriceChart(history: PricePoint[], good: string): SVGElement {
  const points = history.slice(-CHART_POINTS);
  const W = 300;
  const H = 80;
  const PAD = 6;
  const prices = points.map((p) => p.price);
  const min = prices.length > 0 ? Math.min(...prices) : 0;
  const max = prices.length > 0 ? Math.max(...prices) : 1;
  const span = max - min || 1;
  const xy = points.map((p, i) => {
    const x = PAD + (i / Math.max(1, points.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((p.price - min) / span) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "eco-price-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Price history for ${good}: ${min} to ${max}`);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", xy.join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "2");
  svg.appendChild(line);
  const minLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  minLabel.setAttribute("x", String(PAD));
  minLabel.setAttribute("y", String(H - 1));
  minLabel.setAttribute("class", "eco-chart-min");
  minLabel.textContent = String(min);
  const maxLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  maxLabel.setAttribute("x", String(PAD));
  maxLabel.setAttribute("y", String(PAD + 4));
  maxLabel.setAttribute("class", "eco-chart-max");
  maxLabel.textContent = String(max);
  svg.appendChild(minLabel);
  svg.appendChild(maxLabel);
  void h; // dom helper unused here; kept import for consistency
  return svg;
}
