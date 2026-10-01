/**
 * Task 61: tournament system. Single-elimination bracket for 16 fighters,
 * persisted to localStorage across rounds so a tournament survives reloads.
 * The bracket is data; the UI renders it from `rounds()`. Winners are
 * reported by id — who actually won the bout is the sim's (or the player's)
 * business, not this module's.
 */

export interface TournamentFighter {
  id: string;
  name: string;
  /** Elo-like rating; higher wins more often in simmed bouts. */
  rating: number;
}

export interface BracketMatch {
  id: string;
  round: number;
  a: TournamentFighter | null;
  b: TournamentFighter | null;
  winnerId: string | null;
}

const STORE_KEY = "campaign.tournament.v1";
const SIZE = 16;

export interface Tournament {
  rounds(): BracketMatch[][];
  reportWinner(matchId: string, winnerId: string): void;
  champion(): TournamentFighter | null;
  isComplete(): boolean;
  reset(): void;
}

function matchId(round: number, index: number): string {
  return `r${round}m${index}`;
}

export function createTournament(fighters: TournamentFighter[]): Tournament {
  if (fighters.length !== SIZE) throw new Error(`tournament needs ${SIZE} fighters`);
  const byId = new Map(fighters.map((f) => [f.id, f]));
  let rounds: BracketMatch[][] = load() ?? seed(fighters);

  function seed(fs: TournamentFighter[]): BracketMatch[][] {
    // Standard seeding: 1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11.
    const sorted = [...fs].sort((a, b) => b.rating - a.rating);
    const order = [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10];
    const first: BracketMatch[] = [];
    for (let i = 0; i < 8; i++) {
      first.push({
        id: matchId(0, i),
        round: 0,
        a: sorted[order[i * 2]!]!,
        b: sorted[order[i * 2 + 1]!]!,
        winnerId: null,
      });
    }
    const rest: BracketMatch[][] = [first];
    let count = 4;
    for (let r = 1; r < 4; r++) {
      const round: BracketMatch[] = [];
      for (let i = 0; i < count; i++) {
        round.push({ id: matchId(r, i), round: r, a: null, b: null, winnerId: null });
      }
      rest.push(round);
      count /= 2;
    }
    return rest;
  }

  function save(): void {
    try {
      const slim = rounds.map((round) =>
        round.map((m) => ({
          ...m,
          a: m.a ? m.a.id : null,
          b: m.b ? m.b.id : null,
        })),
      );
      localStorage.setItem(STORE_KEY, JSON.stringify(slim));
    } catch {
      // Session-only tournament.
    }
  }

  function load(): BracketMatch[][] | null {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BracketMatch[][];
      if (!Array.isArray(parsed) || parsed[0]?.length !== 8) return null;
      // Rehydrate fighter objects from the registry by id.
      for (const round of parsed) {
        for (const m of round) {
          m.a = typeof m.a === "string" ? (byId.get(m.a) ?? null) : m.a;
          m.b = typeof m.b === "string" ? (byId.get(m.b) ?? null) : m.b;
        }
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function find(matchId: string): BracketMatch | null {
    for (const round of rounds) {
      const m = round.find((x) => x.id === matchId);
      if (m) return m;
    }
    return null;
  }

  return {
    rounds: () => rounds.map((r) => r.map((m) => ({ ...m }))),
    reportWinner(mid, winnerId) {
      const m = find(mid);
      if (!m || m.winnerId) return;
      const winner = m.a?.id === winnerId ? m.a : m.b?.id === winnerId ? m.b : null;
      if (!winner) throw new Error(`fighter ${winnerId} is not in match ${mid}`);
      m.winnerId = winnerId;
      if (m.round < 3) {
        const next = rounds[m.round + 1]![Math.floor(rounds[m.round]!.indexOf(m) / 2)]!;
        if (!next.a) next.a = winner;
        else if (!next.b) next.b = winner;
      }
      // Persist fighter references as ids so reloads rehydrate cleanly.
      save();
    },
    champion() {
      const final = rounds[3]![0]!;
      return final.winnerId ? (byId.get(final.winnerId) ?? null) : null;
    },
    isComplete() {
      return rounds[3]![0]!.winnerId !== null;
    },
    reset() {
      rounds = seed(fighters);
      try {
        localStorage.removeItem(STORE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

/** The 16 default fighters when the player doesn't bring their own. */
export function defaultFighters(): TournamentFighter[] {
  const names = [
    "Ash", "Bram", "Cinder", "Dov", "Ember", "Flint", "Gale", "Harrow",
    "Ivo", "Juno", "Kestrel", "Lark", "Moss", "Nyx", "Orin", "Pike",
  ];
  return names.map((name, i) => ({
    id: `fighter-${i}`,
    name,
    rating: 1500 + ((i * 137) % 400) - 200,
  }));
}
