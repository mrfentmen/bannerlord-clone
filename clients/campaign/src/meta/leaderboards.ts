/**
 * Local leaderboards (MASTER_PLAN task 141): best results on this machine
 * for quick battles, arena bouts, and tournaments.
 *
 * One board per mode, top 10 entries each, highest score first. Storage is
 * localStorage under a namespaced key (same pattern as the other meta
 * stores); a corrupt record is discarded, never fatal. Every function
 * accepts an optional Storage so tests can inject an in-memory stand-in.
 *
 * Score semantics: higher is better. `battleScore` computes the canonical
 * quick-battle/arena score from a finished bout (kills weighted, a win
 * bonus, losses penalized); tournaments submit the champion's final rating
 * or round points via `tournamentScore`. Callers that track their own
 * scoring can submit any non-negative number directly.
 */

export type LeaderboardMode = "quick-battle" | "arena" | "tournament";

export const LEADERBOARD_MODES: LeaderboardMode[] = ["quick-battle", "arena", "tournament"];

export const LEADERBOARD_LABEL: Record<LeaderboardMode, string> = {
  "quick-battle": "Quick battles",
  arena: "Arena",
  tournament: "Tournaments",
};

export interface BoardEntry {
  /** Display name: ruler, gladiator, or champion. */
  name: string;
  /** Higher is better. */
  score: number;
  /** In-game season the result was set, when known. */
  season: number;
  /** ISO timestamp of when the result was recorded. */
  dateISO: string;
  /** Free-text detail, e.g. "12 kills · flawless victory". */
  detail?: string;
}

/** Entries kept per board. The task's acceptance criterion is top 10. */
export const MAX_BOARD_ENTRIES = 10;

const STORAGE_KEY = "fentmen.leaderboards.v1";

type BoardStore = Record<LeaderboardMode, BoardEntry[]>;

function resolveStorage(provided?: Storage): Storage | null {
  if (provided) return provided;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function cleanEntry(raw: unknown): BoardEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Partial<BoardEntry>;
  if (typeof e.name !== "string" || e.name.length === 0) return null;
  if (typeof e.score !== "number" || !Number.isFinite(e.score) || e.score < 0) return null;
  return {
    name: e.name.slice(0, 48),
    score: Math.floor(e.score),
    season: typeof e.season === "number" && Number.isFinite(e.season) && e.season >= 0 ? Math.floor(e.season) : 0,
    dateISO: typeof e.dateISO === "string" ? e.dateISO : new Date(0).toISOString(),
    ...(typeof e.detail === "string" && e.detail.length > 0 ? { detail: e.detail.slice(0, 120) } : {}),
  };
}

function loadStore(provided?: Storage): BoardStore {
  const storage = resolveStorage(provided);
  const fresh = (): BoardStore => ({ "quick-battle": [], arena: [], tournament: [] });
  if (!storage) return fresh();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<Record<LeaderboardMode, unknown[]>>;
    const store = fresh();
    for (const mode of LEADERBOARD_MODES) {
      const list = parsed[mode];
      if (!Array.isArray(list)) continue;
      store[mode] = list
        .map(cleanEntry)
        .filter((e): e is BoardEntry => e !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_BOARD_ENTRIES);
    }
    return store;
  } catch {
    return fresh();
  }
}

function saveStore(store: BoardStore, provided?: Storage): void {
  const storage = resolveStorage(provided);
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: boards live in memory for the session.
  }
}

export interface SubmitInput {
  name: string;
  score: number;
  season?: number;
  detail?: string;
}

/**
 * Submit a result to a mode's board. Returns the 0-based rank the entry
 * took, or -1 when it did not make the top 10.
 */
export function submitScore(mode: LeaderboardMode, input: SubmitInput, provided?: Storage): number {
  const entry = cleanEntry({
    name: input.name,
    score: input.score,
    season: input.season ?? 0,
    dateISO: new Date().toISOString(),
    detail: input.detail,
  });
  if (!entry) return -1;
  const store = loadStore(provided);
  const board = [...store[mode], entry].sort((a, b) => b.score - a.score).slice(0, MAX_BOARD_ENTRIES);
  store[mode] = board;
  saveStore(store, provided);
  return board.indexOf(entry);
}

/** Top entries for a mode, highest score first (at most 10). */
export function topScores(mode: LeaderboardMode, provided?: Storage): BoardEntry[] {
  return loadStore(provided)[mode];
}

/** Best entry for a mode, or null when the board is empty. */
export function bestScore(mode: LeaderboardMode, provided?: Storage): BoardEntry | null {
  const first = loadStore(provided)[mode][0];
  return first ?? null;
}

/** Discard one board (two-step confirmed in the UI). */
export function clearBoard(mode: LeaderboardMode, provided?: Storage): void {
  const store = loadStore(provided);
  store[mode] = [];
  saveStore(store, provided);
}

/**
 * Canonical score for a finished quick battle or arena bout:
 * 10 per kill, 100 for the win, minus 5 per own loss, floored at 0.
 */
export function battleScore(playerKills: number, playerLosses: number, won: boolean): number {
  const kills = Math.max(0, Math.floor(playerKills));
  const losses = Math.max(0, Math.floor(playerLosses));
  return Math.max(0, kills * 10 + (won ? 100 : 0) - losses * 5);
}

/**
 * Canonical tournament score: 25 per round won plus the champion's rating,
 * so deeper runs with stronger fields outrank shallow ones.
 */
export function tournamentScore(roundsWon: number, rating: number): number {
  return Math.max(0, Math.floor(roundsWon) * 25 + Math.max(0, Math.floor(rating)));
}
