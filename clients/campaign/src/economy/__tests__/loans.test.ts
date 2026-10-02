/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { accrueLoanInterest, activeLoans, borrow, defaultLoan, payLoan } from "../loans.js";

beforeEach(() => localStorage.clear());

describe("loan system (solo task 79)", () => {
  it("borrows coin", () => {
    const loan = borrow("Shylock", 1000, 0.1);
    expect(loan.balance).toBe(1000);
    expect(activeLoans()).toHaveLength(1);
  });

  it("interest accrues per season", () => {
    borrow("Shylock", 1000, 0.1);
    accrueLoanInterest();
    const active = activeLoans()[0]!;
    expect(active.balance).toBe(1100);
    expect(active.seasonsTaken).toBe(1);
  });

  it("repayment reduces the balance", () => {
    const loan = borrow("Shylock", 1000, 0.1);
    payLoan(loan.id, 400);
    expect(activeLoans()[0]!.balance).toBe(600);
  });

  it("full repayment settles the loan", () => {
    const loan = borrow("Shylock", 1000, 0);
    const { change } = payLoan(loan.id, 1200);
    expect(change).toBe(200);
    expect(activeLoans()).toHaveLength(0);
  });

  it("one outstanding loan at a time", () => {
    borrow("Shylock", 1000, 0.1);
    expect(() => borrow("Fagin", 500, 0.1)).toThrow("outstanding loan");
  });

  it("default has consequences", () => {
    const loan = borrow("Shylock", 1000, 0.1);
    const { seized, line } = defaultLoan(loan.id);
    expect(seized).toBe(500);
    expect(line).toContain("no lender will touch you");
    expect(activeLoans()).toHaveLength(0);
  });

  it("rejects bad terms", () => {
    expect(() => borrow("Shylock", 0, 0.1)).toThrow("positive");
    expect(() => borrow("Shylock", 1000, 2)).toThrow("0..1");
  });
});
