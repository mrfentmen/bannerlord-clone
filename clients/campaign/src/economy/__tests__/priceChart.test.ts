/**
 * Task 105: 30-day price chart per good.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { CHART_POINTS, renderPriceChart } from "../priceChart.js";

function series(n: number, base = 100) {
  return Array.from({ length: n }, (_, i) => ({ season: i, price: base + i }));
}

describe("price chart (task 105)", () => {
  it("renders the last 30 points", () => {
    const svg = renderPriceChart(series(45), "grain");
    const line = svg.querySelector("polyline")!;
    expect(line.getAttribute("points")!.split(" ")).toHaveLength(CHART_POINTS);
    expect(svg.getAttribute("aria-label")).toContain("grain");
  });

  it("labels min and max", () => {
    const svg = renderPriceChart(series(30, 50), "iron");
    expect(svg.querySelector(".eco-chart-min")!.textContent).toBe("50");
    expect(svg.querySelector(".eco-chart-max")!.textContent).toBe("79");
  });

  it("handles a flat series without dividing by zero", () => {
    const svg = renderPriceChart(series(30, 100).map((p) => ({ ...p, price: 100 })), "salt");
    expect(svg.querySelector("polyline")).not.toBeNull();
  });
});
