/**
 * Tasks 105-107: tax policy, tribute, and loans.
 *
 * Taxes: set a rate per fief and preview the loyalty effect before it
 * applies. High taxes pay coin and cost loyalty — the curve is shown, the
 * campaign layer applies it.
 *
 * Tribute: track who pays whom, how much, and when it's due. Overdue
 * tributes are flagged.
 *
 * Loans: borrow from moneylenders; interest accrues per season; repay in
 * full or in part. The numbers are the ledger — the treasury moves the
 * actual coin.
 */

import type { Loan, TaxPolicy } from "./types.js";

/** Loyalty delta per season for a tax rate: gentle below 15%, punishing above. */
export function taxLoyaltyEffect(rate: number): number {
  if (rate < 0 || rate > 50) throw new Error("tax rate must be 0..50");
  if (rate <= 15) return 1;
  if (rate <= 25) return -(rate - 15) * 0.6;
  return -6 - (rate - 25) * 1.2;
}

/** Income per season for a fief with base output. */
export function taxIncome(baseOutput: number, rate: number): number {
  return Math.round(baseOutput * (rate / 100));
}

export function setTaxRate(policy: TaxPolicy[], fiefId: string, rate: number): TaxPolicy[] {
  if (rate < 0 || rate > 50) throw new Error("tax rate must be 0..50");
  const rest = policy.filter((p) => p.fiefId !== fiefId);
  return [...rest, { fiefId, rate }];
}

// --- Tribute ---

export interface Tribute {
  id: string;
  from: string;
  to: string;
  amount: number;
  /** Seasons remaining until due. */
  dueIn: number;
  paid: boolean;
}

let nextTribute = 1;

export function levyTribute(from: string, to: string, amount: number, dueIn: number): Tribute {
  if (amount <= 0) throw new Error("tribute must be positive");
  return { id: `trib-${nextTribute++}`, from, to, amount, dueIn, paid: false };
}

export function tickTributes(tributes: Tribute[]): { tributes: Tribute[]; overdue: Tribute[] } {
  const next = tributes.map((t) => (t.paid ? t : { ...t, dueIn: t.dueIn - 1 }));
  return { tributes: next, overdue: next.filter((t) => !t.paid && t.dueIn < 0) };
}

// --- Loans ---

let nextLoan = 1;

export function takeLoan(lender: string, principal: number, interest: number, seasons: number): Loan {
  if (principal <= 0) throw new Error("principal must be positive");
  if (interest < 0) throw new Error("interest cannot be negative");
  if (seasons < 1) throw new Error("loan must last at least one season");
  return { id: `loan-${nextLoan++}`, lender, principal, balance: principal, interest, seasonsLeft: seasons };
}

/** Accrue one season of interest. */
export function tickLoan(loan: Loan): Loan {
  if (loan.seasonsLeft <= 0) return loan;
  return {
    ...loan,
    balance: Math.round(loan.balance * (1 + loan.interest)),
    seasonsLeft: loan.seasonsLeft - 1,
  };
}

/** Repay part or all of a loan; returns the updated loan and the amount applied. */
export function repayLoan(loan: Loan, amount: number): { loan: Loan; applied: number } {
  if (amount <= 0) throw new Error("repayment must be positive");
  const applied = Math.min(amount, loan.balance);
  return { loan: { ...loan, balance: loan.balance - applied }, applied };
}
