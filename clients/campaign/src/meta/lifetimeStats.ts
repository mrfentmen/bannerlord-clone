/**
 * Lifetime statistics (MASTER_PLAN task 138): cross-campaign totals that
 * accumulate on this machine no matter how many campaigns are started,
 * abandoned, or lost.
 *
 * Tracked: kills, gold earned, battles fought/won/lost, hours played,
 * campaigns started, seasons played, treaties signed, schemes completed.
 *
 * Storage is localStorage under a namespaced key (same pattern as the
 * achievements, ironman, and New Game+ stores). A corrupt record is
 * discarded, never fatal. Every function accepts an optional Storage so
 * tests can inject an in-memory stand-in.
 *
 * Honest boundary: the campaign battle hook in main.ts reports won/lost.
 * Kill counts and gold earned are recorded through the optional fields of
 * `recordLifetimeBattle` — today the battle scene does not report
 * per-battle casualties or loot to the campaign layer (after-action reports
 * carry `playerKills`, but nothing outside the afteraction module consumes
 * them yet), so those stay zero until the battle layer reports them. The
 * page renders whatever has accumulated and labels the source of each row.
 */

export interface LifetimeStatsRecord {
  version: 1;
  /** Enemies slain across every campaign (0 until the battle layer reports kills). */
  kills: number;
  /** Gold earned across every campaign (0 until income sources report it). */
  goldEarned: number;
  battlesFought: number;
  battlesWon: number;
  battlesLost: number;
  /** Seconds the game has been played while visible, across campaigns. */
  playSeconds: number;
  campaignsStarted: number;
  seasonsPlayed: number;
  treatiesSigned: number;
  schemesCompleted: number;
}

const STORAGE_KEY = "fentmen.lifetimestats.v1";

const EMPTY: LifetimeStatsRecord = {
  version: 1,
  kills: 0,
  goldEarned: 0,
  battlesFought: 0,
  battlesWon: 0,
  battlesLost: 0,
  playSeconds: 0,
  campaignsStarted: 0,
  seasonsPlayed: 0,
  treatiesSigned: 0,
  schemesCompleted: 0,
};

function resolveStorage(provided?: Storage): Storage | null {
  if (provided) return provided;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function cleanNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** Load the lifetime record. Never throws; falls back to an empty record. */
export function loadLifetimeStats(provided?: Storage): LifetimeStatsRecord {
  const storage = resolveStorage(provided);
  if (!storage) return { ...EMPTY };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<LifetimeStatsRecord>;
    return {
      ...EMPTY,
      kills: cleanNumber(parsed.kills),
      goldEarned: cleanNumber(parsed.goldEarned),
      battlesFought: cleanNumber(parsed.battlesFought),
      battlesWon: cleanNumber(parsed.battlesWon),
      battlesLost: cleanNumber(parsed.battlesLost),
      playSeconds: cleanNumber(parsed.playSeconds),
      campaignsStarted: cleanNumber(parsed.campaignsStarted),
      seasonsPlayed: cleanNumber(parsed.seasonsPlayed),
      treatiesSigned: cleanNumber(parsed.treatiesSigned),
      schemesCompleted: cleanNumber(parsed.schemesCompleted),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveLifetimeStats(record: LifetimeStatsRecord, provided?: Storage): boolean {
  const storage = resolveStorage(provided);
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    // Storage full or blocked: keep the record in memory for the session.
    return false;
  }
}

export interface BattleReport {
  won: boolean;
  /** Enemies slain, when the battle layer reports it. */
  kills?: number;
  /** Gold looted/earned, when the battle layer reports it. */
  goldEarned?: number;
  /** Own troops lost, when the battle layer reports it. Feeds bout scoring. */
  losses?: number;
}

/**
 * The subset of the battle layer's after-action view that the lifetime
 * accumulator needs. Declared structurally so `meta` does not depend on
 * `battleflow`: anything exposing these fields can feed the stats.
 */
export interface AfterActionLike {
  playerWon: boolean;
  playerIsAttacker: boolean;
  attackerLosses: number;
  defenderLosses: number;
  loot: number;
}

/**
 * Translate a finished battle's after-action view into a lifetime report.
 *
 * The battle layer already reports both sides' losses and the loot taken, so
 * kills and gold are real measurements, not guesses:
 *   - kills  = the losses suffered by the side the player was *not* on,
 *   - losses = the losses suffered by the player's own side,
 *   - gold   = loot, counted only on a win (a defeat yields no spoils).
 *
 * Returns null for a view missing the fields, so a caller that has no
 * after-action data simply skips the record rather than writing zeros.
 */
export function battleReportFromAfterAction(view: AfterActionLike): BattleReport | null {
  if (
    typeof view?.playerWon !== "boolean" ||
    typeof view?.playerIsAttacker !== "boolean" ||
    !Number.isFinite(view?.attackerLosses) ||
    !Number.isFinite(view?.defenderLosses) ||
    !Number.isFinite(view?.loot)
  ) {
    return null;
  }
  const enemyLosses = view.playerIsAttacker ? view.defenderLosses : view.attackerLosses;
  const ownLosses = view.playerIsAttacker ? view.attackerLosses : view.defenderLosses;
  return {
    won: view.playerWon,
    kills: Math.max(0, Math.floor(enemyLosses)),
    losses: Math.max(0, Math.floor(ownLosses)),
    goldEarned: view.playerWon ? Math.max(0, Math.floor(view.loot)) : 0,
  };
}

/**
 * Fold one finished battle into the lifetime record. Returns the updated
 * record (also persisted).
 */
export function recordLifetimeBattle(report: BattleReport, provided?: Storage): LifetimeStatsRecord {
  const s = loadLifetimeStats(provided);
  s.battlesFought += 1;
  if (report.won) s.battlesWon += 1;
  else s.battlesLost += 1;
  s.kills += cleanNumber(report.kills);
  s.goldEarned += cleanNumber(report.goldEarned);
  saveLifetimeStats(s, provided);
  return s;
}

/** Add seconds of visible play time (called on a timer while playing). */
export function addPlaySeconds(seconds: number, provided?: Storage): LifetimeStatsRecord {
  const s = loadLifetimeStats(provided);
  s.playSeconds += cleanNumber(seconds);
  saveLifetimeStats(s, provided);
  return s;
}

function bump(key: Exclude<keyof LifetimeStatsRecord, "version">, by = 1, provided?: Storage): LifetimeStatsRecord {
  const s = loadLifetimeStats(provided);
  s[key] = cleanNumber(s[key]) + cleanNumber(by);
  saveLifetimeStats(s, provided);
  return s;
}

export const recordCampaignStart = (provided?: Storage): LifetimeStatsRecord =>
  bump("campaignsStarted", 1, provided);
export const recordLifetimeSeasons = (n: number, provided?: Storage): LifetimeStatsRecord =>
  bump("seasonsPlayed", n, provided);
export const recordLifetimeTreaty = (provided?: Storage): LifetimeStatsRecord =>
  bump("treatiesSigned", 1, provided);
export const recordLifetimeScheme = (provided?: Storage): LifetimeStatsRecord =>
  bump("schemesCompleted", 1, provided);
export const recordLifetimeGold = (n: number, provided?: Storage): LifetimeStatsRecord =>
  bump("goldEarned", n, provided);
export const recordLifetimeKills = (n: number, provided?: Storage): LifetimeStatsRecord =>
  bump("kills", n, provided);

/** Discard the lifetime record (two-step confirmed in the UI). */
export function resetLifetimeStats(provided?: Storage): LifetimeStatsRecord {
  const s = { ...EMPTY };
  saveLifetimeStats(s, provided);
  return s;
}

/** Whole + fractional hours, for the statistics page. */
export function lifetimeHours(record: LifetimeStatsRecord): number {
  return record.playSeconds / 3600;
}

/** Win share of finished battles, 0..1 (null when no battles yet). */
export function lifetimeWinRate(record: LifetimeStatsRecord): number | null {
  if (record.battlesFought === 0) return null;
  return record.battlesWon / record.battlesFought;
}

/** "1,234" grouping for big counters. */
export function formatCount(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

/** "12.5h" / "3h" / "45m" compact play-time label. */
export function formatPlayTime(playSeconds: number): string {
  const minutes = Math.floor(playSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}
