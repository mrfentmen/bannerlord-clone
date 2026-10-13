/**
 * Mid-battle rally action (Rowan solo task 23).
 *
 * Once per battle (with a cooldown), the commander can rally: a morale
 * boost to the player's side. The module owns the cooldown math and the
 * boost amount; the battle HUD (milo's lane) mounts the button and applies
 * the boost to the sim. Everything here is pure and tested so the HUD
 * wiring is a thin call.
 */

export interface RallyState {
  /** When the rally was last used, ms epoch. Null if never. */
  lastUsedAt: number | null;
  /** How many rallies remain this battle. */
  usesLeft: number;
}

/** Morale boost from a rally, as a 0..1 fraction added to side morale. */
export const RALLY_MORALE_BOOST = 0.15;
/** Cooldown between rallies. */
export const RALLY_COOLDOWN_MS = 90_000;
/** Rallies available per battle. */
export const RALLY_USES_PER_BATTLE = 2;

export function createRallyState(): RallyState {
  return { lastUsedAt: null, usesLeft: RALLY_USES_PER_BATTLE };
}

/** Ms until the rally is ready again; 0 when ready. */
export function rallyCooldownRemaining(state: RallyState, nowMs: number): number {
  if (state.usesLeft <= 0) return Infinity;
  if (state.lastUsedAt === null) return 0;
  return Math.max(0, state.lastUsedAt + RALLY_COOLDOWN_MS - nowMs);
}

export function canRally(state: RallyState, nowMs: number): boolean {
  return rallyCooldownRemaining(state, nowMs) === 0;
}

/**
 * Use a rally. Returns the morale boost, or null when not ready.
 * Mutates the state (usesLeft--, lastUsedAt=now).
 */
export function useRally(state: RallyState, nowMs: number): number | null {
  if (!canRally(state, nowMs)) return null;
  state.lastUsedAt = nowMs;
  state.usesLeft--;
  return RALLY_MORALE_BOOST;
}

/** Human-readable cooldown, e.g. "1:23" or "Ready". */
export function rallyCooldownLabel(state: RallyState, nowMs: number): string {
  const remaining = rallyCooldownRemaining(state, nowMs);
  if (remaining === 0) return state.usesLeft > 0 ? "Ready" : "Spent";
  if (!Number.isFinite(remaining)) return "Spent";
  const s = Math.ceil(remaining / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
