/**
 * Hint cooldown system (Rowan solo task 92).
 *
 * Hints don't repeat within 10 minutes: each hint records when it was
 * last shown, and `shouldShowHint` returns false until the cooldown
 * expires. Persists in localStorage so the cooldown survives reloads.
 */

/** Cooldown between repeats of the same hint, in milliseconds. */
export const HINT_COOLDOWN_MS = 10 * 60 * 1000;

const STORE_KEY = "campaign.hint-cooldowns.v1";

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? v : {};
  } catch {
    return {};
  }
}

function save(shown: Record<string, number>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(shown));
  } catch {
    // Session-only cooldowns.
  }
}

/**
 * True when the hint may be shown now. `now` defaults to Date.now()
 * (injectable for tests).
 */
export function shouldShowHint(hintId: string, now: number = Date.now()): boolean {
  const last = load()[hintId];
  if (last == null) return true;
  return now - last >= HINT_COOLDOWN_MS;
}

/** Record that a hint was shown. */
export function markHintShown(hintId: string, now: number = Date.now()): void {
  const shown = load();
  shown[hintId] = now;
  save(shown);
}

/** Milliseconds until the hint may show again (0 when ready). */
export function hintCooldownRemaining(hintId: string, now: number = Date.now()): number {
  const last = load()[hintId];
  if (last == null) return 0;
  return Math.max(0, HINT_COOLDOWN_MS - (now - last));
}
