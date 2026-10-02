/**
 * Diplomatic reputation meter (Rowan solo task 87).
 *
 * A visible 0..100 meter of your diplomatic standing: honorable acts
 * raise it, betrayals tank it, and it drifts toward neutral over time.
 * The meter feeds a title — from Oathbreaker to Honored. Persists in
 * localStorage.
 */

export type ReputationAction =
  | "kept-treaty"
  | "honored-deal"
  | "paid-tribute"
  | "freed-prisoners"
  | "broke-treaty"
  | "betrayed-ally"
  | "sacked-town"
  | "executed-envoy";

export const REPUTATION_EFFECTS: Record<ReputationAction, number> = {
  "kept-treaty": 4,
  "honored-deal": 3,
  "paid-tribute": 2,
  "freed-prisoners": 3,
  "broke-treaty": -12,
  "betrayed-ally": -20,
  "sacked-town": -8,
  "executed-envoy": -15,
};

export const REPUTATION_ACTIONS = Object.keys(REPUTATION_EFFECTS) as ReputationAction[];

/** Drift toward 50 each season when nothing happens. */
export const REPUTATION_DRIFT = 1;

const STORE_KEY = "campaign.diplomatic-reputation.v1";

function load(): number {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw == null ? 50 : Math.max(0, Math.min(100, Number(raw)));
  } catch {
    return 50;
  }
}

function save(value: number): void {
  try {
    localStorage.setItem(STORE_KEY, String(value));
  } catch {
    // Session-only reputation.
  }
}

/** Current reputation 0..100. */
export function diplomaticReputation(): number {
  return load();
}

/** Title for a reputation value. */
export function reputationTitle(value: number): string {
  if (value >= 80) return "Honored";
  if (value >= 60) return "Trustworthy";
  if (value >= 40) return "Unremarkable";
  if (value >= 20) return "Shifty";
  return "Oathbreaker";
}

/** Record an action; returns the new reputation. */
export function recordReputationAction(action: ReputationAction): number {
  if (!(REPUTATION_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`unknown reputation action: ${action}`);
  }
  const next = Math.max(0, Math.min(100, load() + REPUTATION_EFFECTS[action]));
  save(next);
  return next;
}

/** One quiet season: drift toward neutral. */
export function driftReputation(): number {
  const current = load();
  const next = current === 50 ? 50 : current > 50 ? Math.max(50, current - REPUTATION_DRIFT) : Math.min(50, current + REPUTATION_DRIFT);
  save(next);
  return next;
}

export function reputationMeterLine(): string {
  const value = load();
  return `Diplomatic reputation: ${value}/100 — ${reputationTitle(value)}.`;
}
