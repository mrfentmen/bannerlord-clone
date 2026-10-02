/**
 * Battle comparison (Rowan solo task 50).
 *
 * Compares the latest battle's results against the previous one:
 * kills, losses, loot, and duration, with deltas and a verdict on
 * whether the clan is trending better or worse.
 */

export interface BattleStats {
  battleName: string;
  date: number;
  playerWon: boolean;
  playerKills: number;
  playerLosses: number;
  loot: number;
  ticks: number;
}

export interface BattleDelta {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  /** True when the change favors the player. */
  better: boolean;
  line: string;
}

export interface BattleComparison {
  current: BattleStats;
  previous: BattleStats;
  deltas: BattleDelta[];
  verdict: string;
}

function delta(
  metric: string,
  previous: number,
  current: number,
  lowerIsBetter: boolean,
): BattleDelta {
  const d = current - previous;
  const better = lowerIsBetter ? d < 0 : d > 0;
  const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "—";
  return {
    metric,
    previous,
    current,
    delta: d,
    better,
    line: `${metric}: ${previous} → ${current} (${arrow}${Math.abs(d)})`,
  };
}

/** Compare two battles. Throws when given the same battle twice. */
export function compareBattles(previous: BattleStats, current: BattleStats): BattleComparison {
  if (previous.date === current.date && previous.battleName === current.battleName) {
    throw new Error("cannot compare a battle with itself");
  }
  const deltas = [
    delta("Kills", previous.playerKills, current.playerKills, false),
    delta("Losses", previous.playerLosses, current.playerLosses, true),
    delta("Loot", previous.loot, current.loot, false),
    delta("Duration (ticks)", previous.ticks, current.ticks, true),
  ];
  const betterCount = deltas.filter((d) => d.better).length;
  const verdict =
    betterCount >= 3
      ? "Trending better — the clan fights sharper than last time."
      : betterCount === 2
        ? "Mixed — some things improved, some slipped."
        : "Trending worse — review what changed since last battle.";
  return { current, previous, deltas, verdict };
}
