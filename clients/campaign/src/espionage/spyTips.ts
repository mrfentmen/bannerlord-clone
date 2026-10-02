/**
 * Espionage tutorial tips (Rowan solo task 70).
 *
 * First-time tips for each spy action: shown once per action, then
 * dismissed forever. Persists in localStorage.
 */

export type SpyAction =
  | "place-spy"
  | "assign-mission"
  | "sweep"
  | "recruit-informant"
  | "plan-scheme"
  | "infiltrate"
  | "craft-kit"
  | "interrogate-secret";

export const SPY_ACTIONS: SpyAction[] = [
  "place-spy",
  "assign-mission",
  "sweep",
  "recruit-informant",
  "plan-scheme",
  "infiltrate",
  "craft-kit",
  "interrogate-secret",
];

export const SPY_TIPS: Record<SpyAction, string> = {
  "place-spy": "Place a spy at an enemy post. High cover keeps them safe; heat burns them.",
  "assign-mission": "Give your spy a mission. Sabotage hurts, intel pays, laying low rebuilds cover.",
  sweep: "Sweep a post to expose enemy spies. More heat means better odds — but it warns them too.",
  "recruit-informant": "Bribe an informant for steady intel. Bigger bribes buy reliability — and bigger seasonal costs.",
  "plan-scheme": "Schemes take seasons. Watch discovery odds: heat up, cover down, and the scheme is blown.",
  infiltrate: "Infiltration gathers intel fast but raises suspicion. Lay low to rebuild cover before it hits zero.",
  "craft-kit": "A good disguise kit buys cover. Masterwork kits cost rare resources — save them for hard posts.",
  "interrogate-secret": "Uncovered secrets are leverage: spend them on favors, but a spent secret is gone.",
};

const STORE_KEY = "campaign.spy-tips.v1";

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(seen: string[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(seen));
  } catch {
    // Session-only tips.
  }
}

/** The tip for an action, or null when already seen. */
export function spyTip(action: SpyAction): string | null {
  if (!(SPY_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`unknown spy action: ${action}`);
  }
  return load().includes(action) ? null : SPY_TIPS[action];
}

/** Dismiss a tip forever. */
export function dismissSpyTip(action: SpyAction): void {
  const seen = load();
  if (!seen.includes(action)) {
    seen.push(action);
    save(seen);
  }
}

/** Reset all tips (settings). */
export function resetSpyTips(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
