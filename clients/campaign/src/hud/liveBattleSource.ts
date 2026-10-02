/**
 * Battle HUD's live readouts, fed from `BattleFlow.liveView()`.
 *
 * Tasks 22-25, 37: the two troop counts, the two morale figures, and the two
 * faction names.
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
 * Tasks 23-25: the enemy's troop count, then the two morale figures. Each is
 * pushed here, not invented at the call site.
 */

import type { LiveBattleView } from "../battleflow/flow.js";

/**
 * The one method of `BattleFlow` this module reads. Typed as a function so a
 * caller passes `() => flow.liveView()` and this module never has to know what
 * a `BattleFlow` is.
 */
export type LiveBattleReader = () => LiveBattleView | null;

export type Unsubscribe = () => void;

/** The two armies in a battle, named. */
export interface BattleFactions {
  player: string;
  enemy: string;
}

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
  /** The enemy's living troop count. Replays the current value on subscribe. */
  onEnemyTroops(fn: (troops: number) => void): Unsubscribe;
  /** The player's morale as a fraction of a full force, 0..1. */
  onPlayerMorale(fn: (fraction: number) => void): Unsubscribe;
  /** The enemy's morale as a fraction of a full force, 0..1. */
  onEnemyMorale(fn: (fraction: number) => void): Unsubscribe;
  /** The two sides' names, as the encounter knows them. */
  onFactions(fn: (factions: BattleFactions) => void): Unsubscribe;
  /** Stops polling. The caller owns this; listeners only unsubscribe. */
  destroy(): void;
}

const DEFAULT_POLL_MS = 250;

/**
 * One live figure: a set of listeners, the last value pushed, and the rule that
 * an unchanged poll is not a change. Each figure gets its own, so a casualty on
 * one side never wakes the readout for the other.
 *
 * `same` decides what "unchanged" means. The default suits the numbers; a figure
 * built fresh on every read needs a field-by-field comparison of its own, because
 * identity would call every poll a change.
 */
function liveFigure<T>(same: (a: T, b: T) => boolean = (a, b) => a === b) {
  const listeners = new Set<(value: T) => void>();
  let last: T | null = null;
  return {
    push(value: T): void {
      if (last !== null && same(last, value)) return;
      last = value;
      for (const fn of listeners) fn(value);
    },
    subscribe(fn: (value: T) => void): Unsubscribe {
      listeners.add(fn);
      // Replay what is already true, so a HUD mounted after the first poll is
      // not blank until the next one.
      if (last !== null) fn(last);
      return () => {
        listeners.delete(fn);
      };
    },
    clear(): void {
      listeners.clear();
      last = null;
    },
  };
}

export function createLiveBattleSource(
  read: LiveBattleReader,
  opts: LiveBattleSourceOptions = {},
): LiveBattleSource {
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const set = opts.setInterval ?? ((fn, ms) => window.setInterval(fn, ms));
  const clear = opts.clearInterval ?? ((handle) => window.clearInterval(handle));

  const playerTroops = liveFigure<number>();
  const enemyTroops = liveFigure<number>();
  const playerMorale = liveFigure<number>();
  const enemyMorale = liveFigure<number>();
  const factions = liveFigure<BattleFactions>(
    (a, b) => a.player === b.player && a.enemy === b.enemy,
  );
  let handle = 0;

  function publish(): void {
    const view = read();
    if (!view) return;
    playerTroops.push(view.playerSide.troops);
    enemyTroops.push(view.enemySide.troops);
    playerMorale.push(view.playerSide.morale);
    enemyMorale.push(view.enemySide.morale);
    factions.push({ player: view.playerSide.name, enemy: view.enemySide.name });
  }

  handle = set(publish, pollMs);

  return {
    onPlayerTroops: playerTroops.subscribe,
    onEnemyTroops: enemyTroops.subscribe,
    onPlayerMorale: playerMorale.subscribe,
    onEnemyMorale: enemyMorale.subscribe,
    // The names are handed over as a copy, so a listener cannot write back into
    // the source's own last value.
    onFactions: (fn) => factions.subscribe((value) => fn({ ...value })),
    destroy() {
      clear(handle);
      handle = 0;
      playerTroops.clear();
      enemyTroops.clear();
      playerMorale.clear();
      enemyMorale.clear();
      factions.clear();
    },
  };
}