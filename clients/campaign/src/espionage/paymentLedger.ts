/**
 * Informant payment ledger (Rowan solo task 64).
 *
 * Every informant payment is tracked by season. Miss a season's payment
 * and the informant's exposure risk rises — unpaid informants talk, or
 * sell you out. The ledger shows who is paid up and who is a risk.
 */

export interface PaymentRecord {
  informantId: string;
  season: number;
  amount: number;
  date: number;
}

const STORE_KEY = "campaign.informant-payments.v1";

function load(): PaymentRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(records: PaymentRecord[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  } catch {
    // Session-only ledger.
  }
}

/** Record a payment. Idempotent per informant+season. */
export function payInformant(informantId: string, season: number, amount: number): PaymentRecord[] {
  if (amount <= 0) throw new Error("payment must be positive");
  const records = load();
  if (!records.some((r) => r.informantId === informantId && r.season === season)) {
    records.push({ informantId, season, amount, date: Date.now() });
    save(records);
  }
  return records;
}

/** Seasons with no payment for an informant, from firstSeason through currentSeason. */
export function missedPayments(informantId: string, firstSeason: number, currentSeason: number): number[] {
  const paid = new Set(
    load()
      .filter((r) => r.informantId === informantId)
      .map((r) => r.season),
  );
  const missed: number[] = [];
  for (let s = firstSeason; s <= currentSeason; s++) {
    if (!paid.has(s)) missed.push(s);
  }
  return missed;
}

/**
 * Exposure risk 0..100: each missed season adds 25, capped at 100.
 * Paid-up informants are safe.
 */
export function exposureRisk(informantId: string, firstSeason: number, currentSeason: number): number {
  return Math.min(100, missedPayments(informantId, firstSeason, currentSeason).length * 25);
}

/** Total paid to an informant across all seasons. */
export function totalPaid(informantId: string): number {
  return load()
    .filter((r) => r.informantId === informantId)
    .reduce((s, r) => s + r.amount, 0);
}
