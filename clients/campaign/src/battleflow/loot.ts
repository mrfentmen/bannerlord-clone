/**
 * Loot appraisal (Rowan solo task 43).
 *
 * Before the spoils are distributed, the quartermaster appraises them:
 * each lot gets an estimated value, and the appraisal lists the total.
 * Values are estimates — the actual sale price depends on the market.
 */

export interface LootLot {
  id: string;
  description: string;
  category: "weapons" | "armor" | "supplies" | "valuables" | "horses";
  quantity: number;
  /** Estimated value per item, in the campaign currency. */
  unitValue: number;
}

export interface AppraisedLot extends LootLot {
  estimatedValue: number;
}

export interface LootAppraisal {
  lots: AppraisedLot[];
  total: number;
  note: string;
}

/** Appraise loot lots: per-lot estimates and a grand total. */
export function appraiseLoot(lots: LootLot[]): LootAppraisal {
  const appraised = lots.map((lot) => ({
    ...lot,
    estimatedValue: Math.round(lot.quantity * lot.unitValue),
  }));
  const total = appraised.reduce((s, l) => s + l.estimatedValue, 0);
  return {
    lots: appraised.sort((a, b) => b.estimatedValue - a.estimatedValue),
    total,
    note: "Estimates from the quartermaster — the market may pay more or less.",
  };
}

/** One-line summary, e.g. "3 lots worth ~1,250". */
export function appraisalSummary(a: LootAppraisal): string {
  return `${a.lots.length} lot${a.lots.length === 1 ? "" : "s"} worth ~${a.total.toLocaleString("en-US")}`;
}
