/**
 * Treasury audit log (Rowan solo task 59).
 *
 * Every coin in and out of the treasury is logged with a reason, a
 * timestamp, and the running balance. The log persists in localStorage;
 * the campaign layer records entries as it moves coin.
 */

export interface TreasuryEntry {
  id: string;
  date: number;
  /** Positive for income, negative for expense. */
  amount: number;
  reason: string;
  /** Running balance after this entry. */
  balance: number;
}

const STORE_KEY = "campaign.treasury-log.v1";
const MAX_ENTRIES = 500;

function load(): TreasuryEntry[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(entries: TreasuryEntry[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Session-only log.
  }
}

/** Current balance: the last entry's balance, or 0. */
export function treasuryBalance(): number {
  const entries = load();
  return entries.length > 0 ? entries[0]!.balance : 0;
}

/**
 * Record coin movement. Returns the entry. Throws when the reason is
 * empty — every entry must say why.
 */
export function logTreasury(amount: number, reason: string): TreasuryEntry {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("treasury entries need a reason");
  if (!Number.isFinite(amount) || amount === 0) throw new Error("amount must be a non-zero number");
  const entry: TreasuryEntry = {
    id: `tx-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    date: Date.now(),
    amount: Math.round(amount),
    reason: trimmed,
    balance: treasuryBalance() + Math.round(amount),
  };
  const entries = load();
  entries.unshift(entry);
  save(entries);
  return entry;
}

/** Entries newest first, optionally filtered by sign. */
export function treasuryLog(filter?: "income" | "expense"): TreasuryEntry[] {
  const entries = load();
  if (filter === "income") return entries.filter((e) => e.amount > 0);
  if (filter === "expense") return entries.filter((e) => e.amount < 0);
  return entries;
}

/** Totals for a period summary. */
export function treasuryTotals(): { income: number; expense: number; net: number } {
  let income = 0;
  let expense = 0;
  for (const e of load()) {
    if (e.amount > 0) income += e.amount;
    else expense += e.amount;
  }
  return { income, expense, net: income + expense };
}
