/**
 * Task 71: war stats. Lifetime totals across every battle, persisted in
 * localStorage: battles fought, won, kills, losses, best streak.
 */

const STORE_KEY = "campaign.warstats.v1";

export interface WarStats {
  battles: number;
  wins: number;
  kills: number;
  losses: number;
  bestStreak: number;
  currentStreak: number;
}

const EMPTY: WarStats = { battles: 0, wins: 0, kills: 0, losses: 0, bestStreak: 0, currentStreak: 0 };

function load(): WarStats {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<WarStats>) };
  } catch {
    return { ...EMPTY };
  }
}

export interface WarStatsTracker {
  stats(): WarStats;
  recordBattle(won: boolean, kills: number, losses: number): void;
  reset(): void;
}

export function createWarStats(): WarStatsTracker {
  let s = load();

  function save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch {
      // Session-only stats.
    }
  }

  return {
    stats: () => ({ ...s }),
    recordBattle(won, kills, losses) {
      s.battles += 1;
      s.kills += kills;
      s.losses += losses;
      if (won) {
        s.wins += 1;
        s.currentStreak += 1;
        s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
      } else {
        s.currentStreak = 0;
      }
      save();
    },
    reset() {
      s = { ...EMPTY };
      save();
    },
  };
}
