/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  exposureRisk,
  missedPayments,
  payInformant,
  totalPaid,
} from "../paymentLedger.js";

beforeEach(() => localStorage.clear());

describe("informant payment ledger (solo task 64)", () => {
  it("tracks payments per season", () => {
    payInformant("inf-1", 1, 50);
    payInformant("inf-1", 2, 50);
    expect(totalPaid("inf-1")).toBe(100);
  });

  it("is idempotent per season", () => {
    payInformant("inf-1", 1, 50);
    payInformant("inf-1", 1, 50);
    expect(totalPaid("inf-1")).toBe(50);
  });

  it("finds missed payments", () => {
    payInformant("inf-1", 1, 50);
    payInformant("inf-1", 3, 50);
    expect(missedPayments("inf-1", 1, 3)).toEqual([2]);
  });

  it("missed payments raise exposure risk", () => {
    payInformant("inf-1", 1, 50);
    expect(exposureRisk("inf-1", 1, 1)).toBe(0);
    expect(exposureRisk("inf-1", 1, 2)).toBe(25);
    expect(exposureRisk("inf-1", 1, 5)).toBe(100);
  });

  it("rejects non-positive payments", () => {
    expect(() => payInformant("inf-1", 1, 0)).toThrow("positive");
  });
});
