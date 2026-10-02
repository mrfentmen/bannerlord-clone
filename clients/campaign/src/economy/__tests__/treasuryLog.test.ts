/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  logTreasury,
  treasuryBalance,
  treasuryLog,
  treasuryTotals,
} from "../treasuryLog.js";

beforeEach(() => localStorage.clear());

describe("treasury audit log (solo task 59)", () => {
  it("logs income and expenses with reasons", () => {
    logTreasury(1000, "harbor taxes");
    logTreasury(-300, "troop wages");
    const log = treasuryLog();
    expect(log).toHaveLength(2);
    expect(log[0]!.reason).toBe("troop wages");
    expect(log[0]!.amount).toBe(-300);
  });

  it("tracks the running balance", () => {
    logTreasury(1000, "harbor taxes");
    logTreasury(-300, "troop wages");
    expect(treasuryBalance()).toBe(700);
    expect(treasuryLog()[0]!.balance).toBe(700);
  });

  it("filters by direction", () => {
    logTreasury(1000, "taxes");
    logTreasury(-300, "wages");
    expect(treasuryLog("income")).toHaveLength(1);
    expect(treasuryLog("expense")).toHaveLength(1);
  });

  it("totals income and expense", () => {
    logTreasury(1000, "taxes");
    logTreasury(500, "tolls");
    logTreasury(-300, "wages");
    const t = treasuryTotals();
    expect(t.income).toBe(1500);
    expect(t.expense).toBe(-300);
    expect(t.net).toBe(1200);
  });

  it("requires a reason and a non-zero amount", () => {
    expect(() => logTreasury(100, "  ")).toThrow("need a reason");
    expect(() => logTreasury(0, "nothing")).toThrow("non-zero");
  });

  it("survives reload", () => {
    logTreasury(1000, "harbor taxes");
    expect(treasuryBalance()).toBe(1000);
  });
});
