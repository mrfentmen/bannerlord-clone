/**
 * Battle HUD's live readouts, fed from `BattleFlow.liveView()`.
 *
 * Task 22: the player's troop count.
 *
 * `BattleFlow` exposes its live state through a getter rather than an event, so
 * the source polls that getter and re-notifies a listener only when the figure
 * it reports has actually changed. The poll is a read, never a source of
 * numbers: everything pushed to a listener came out of `liveView()` on the
 * frame it was read, so nothing on the HUD can drift from the simulation.
 *
 * Subscribing delivers the current value immediately when the battle already has
 * a view, so a HUD built after the first tick still shows the truth rather than
 * waiting for the next poll.
 *
 * Tasks 23-25 add the enemy's count and the two morale figures to the same
 * source; each is pushed here, not invented at the call site.
 */

import type { LiveBattleView } from "../battleflow/flow.js";

/**
 * The one method of `BattleFlow` this module reads. Typed as a function so a
 * caller passes `() => flow.liveView()` and this module never has to know what
 * a `BattleFlow` is.
 */
export type LiveBattleReader = () => LiveBattleView | null;

export type Unsubscribe = () => void;

export interface LiveBattleSourceOptions {
  /** How often the reader is polled; defaults to 250ms. */
  pollMs?: number;
  /** Injected for tests; defaults to `setInterval`. */
  setInterval?: (fn: () => void, ms: number) => number;
  /** Injected for tests; defaults to `clearInterval`. */
  clearInterval?: (handle: number) => void;
}

export interface LiveBattleSource {
  /** The player's living troop count. Replays the current value on subscribe. */
  onPlayerTroops(fn: (troops: number) => void): Unsubscribe;
  /** Stops polling. The caller owns this; listeners only unsubscribe. */
  destroy(): void;
}

const DEFAULT_POLL_MS = 250;

export function createLiveBattleSource(
  read: LiveBattleReader,
  opts: LiveBattleSourceOptions = {},
): LiveBattleSource {
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const set = opts.setInterval ?? ((fn, ms) => window.setInterval(fn, ms));
  const clear = opts.clearInterval ?? ((handle) => window.clearInterval(handle));

  const listeners = new Set<(troops: number) => void>();
  /** Last value pushed, so an unchanged poll notifies nobody. */
  let last: number | null = null;
  let handle = 0;

  function publish(): void {
    const view = read();
    if (!view) return;
    const troops = view.playerSide.troops;
    if (last === troops) return;
    last = troops;
    for (const fn of listeners) fn(troops);
  }

  function subscribe(fn: (troops: number) => void): Unsubscribe {
    listeners.add(fn);
    // Replay what is already true, so a HUD mounted after the first tick is not
    // blank until the next poll.
    if (last !== null) fn(last);
    return () => {
      listeners.delete(fn);
    };
  }

  handle = set(publish, pollMs);

  return {
    onPlayerTroops: subscribe,
    destroy() {
      clear(handle);
      handle = 0;
      listeners.clear();
      last = null;
    },
  };
}