/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { recordWorkshopSeason, workshopPL } from "../workshopPL.js";

beforeEach(() => localStorage.clear());

describe("workshop P&L statements (solo task 71)", () => {
  it("totals income and costs over seasons", () => {
    recordWorkshopSeason("ws-1", 1, 500, 100);
    recordWorkshopSeason("ws-1", 2, 600, 120);
    const pl = workshopPL("ws-1");
    expect(pl.totalIncome).toBe(1100);
    expect(pl.totalCosts).toBe(220);
    expect(pl.profit).toBe(880);
    expect(pl.seasonsCount).toBe(2);
  });

  it("verdicts on profitability", () => {
    recordWorkshopSeason("ws-1", 1, 500, 100);
    expect(workshopPL("ws-1").line).toContain("Profitable");
    recordWorkshopSeason("ws-2", 1, 100, 500);
    expect(workshopPL("ws-2").line).toContain("Losing money");
  });

  it("re-recording a season updates it", () => {
    recordWorkshopSeason("ws-1", 1, 500, 100);
    recordWorkshopSeason("ws-1", 1, 700, 100);
    expect(workshopPL("ws-1").totalIncome).toBe(700);
  });

  it("tracks workshops independently", () => {
    recordWorkshopSeason("ws-1", 1, 500, 100);
    recordWorkshopSeason("ws-2", 1, 900, 50);
    expect(workshopPL("ws-1").profit).toBe(400);
    expect(workshopPL("ws-2").profit).toBe(850);
  });

  it("empty workshops report no seasons", () => {
    const pl = workshopPL("ws-9");
    expect(pl.profit).toBe(0);
    expect(pl.line).toContain("No seasons");
  });
});
