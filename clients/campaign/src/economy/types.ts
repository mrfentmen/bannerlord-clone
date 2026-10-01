/**
 * Economy (MASTER_PLAN 3D, tasks 101-108): price history, caravans, workshops,
 * trade routes, tax policy, tribute, loans, and the realm ledger dashboard.
 *
 * Market simulation stays the campaign layer's job — this module records
 * prices, projects profits, and computes policy effects.
 */

export type Good =
  | "grain"
  | "iron"
  | "timber"
  | "horses"
  | "salt"
  | "silk"
  | "ale"
  | "leather";

export const GOODS: Good[] = ["grain", "iron", "timber", "horses", "salt", "silk", "ale", "leather"];

export interface PricePoint {
  season: number;
  price: number;
}

export interface TaxPolicy {
  fiefId: string;
  /** 0..50 percent. */
  rate: number;
}

export interface Loan {
  id: string;
  lender: string;
  principal: number;
  balance: number;
  /** Per-season interest rate, e.g. 0.1 = 10%. */
  interest: number;
  seasonsLeft: number;
}
