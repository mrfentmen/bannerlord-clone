/**
 * New Game+ (MASTER_PLAN task 142): carry a campaign's legacy into the next one.
 *
 * This module owns the legacy record and the carryover rules. It does not own
 * the save format (PAX's lane: IndexedDB slots) and it does not touch the
 * simulation — renown and influence are sim-side values with no client write
 * path (`SimulationProvider` exposes none), so the record is explicit about
 * what actually transfers:
 *
 * - gold: 25% of the banked campaign's liquid wealth (player money + gold +
 *   party money), rounded down, added to the heir's starting cash;
 * - training: +2 focus points in the character maker, labeled "legacy
 *   training" — the heir of a legend starts better taught. This used to say
 *   "attribute points" and did not have attributes to spend: the maker's point
 *   allocator was a list of skills wearing an attribute's label. The maker now
 *   has both, and the pool an heir adds to is the focus budget, which is the
 *   same knob under an honest name;
 * - renown and gear: RECORDED, not transferred. The banked renown is shown in
 *   the start-screen carryover list (the task's acceptance criterion) and
 *   written into the heir's biography as a legacy line. Gear names ride along
 *   for when the campaign layer tracks won tournament prizes — `modes/prizes.ts`
 *   notes that awarding prizes to a campaign inventory is the campaign layer's
 *   job, and nothing reports wins yet, so the panel banks an empty gear list
 *   today rather than inventing prizes.
 *
 * Storage is localStorage under a namespaced key (like the achievements and
 * ironman stores). A corrupt record is discarded, never fatal.
 */

export interface NewGamePlusRecord {
  version: 1;
  /** ISO timestamp of when the campaign was banked. */
  createdAt: string;
  /** Display name of the ruler whose legacy this is. */
  rulerName: string;
  /** Banked renown, shown in the carryover list and biography. */
  renown: number;
  /** Gold the heir starts with on top of their background cash. */
  gold: number;
  /** Named gear carried forward (empty until the campaign layer reports wins). */
  gear: string[];
  /** Extra character-maker bonus points for the heir. */
  bonusPoints: number;
  /** Whole seasons the banked campaign ran, for the carryover list. */
  seasonsPlayed: number;
  /** Battles won in the banked campaign, for the carryover list. */
  battlesWon: number;
}

/** Share of liquid wealth that survives into the next campaign. */
export const GOLD_CARRYOVER_RATE = 0.25;
/** Extra character-maker focus points granted to an NG+ heir. */
export const LEGACY_BONUS_POINTS = 2;
/** In-game days per season, matching the chronicle and ironman season math. */
export const SEASON_DAYS = 90;

const STORAGE_KEY = "fentmen.newgameplus.v1";

export interface BankInput {
  rulerName: string;
  renown: number;
  /** Player-hold liquid wealth. */
  playerMoney: number;
  playerGold: number;
  /** Party purse. */
  partyMoney: number;
  /** Named gear the ruler owned (may be empty — see header). */
  gearNames: string[];
  /** Current in-game day, for season math. */
  day: number;
  battlesWon: number;
}

function cleanNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Bank a campaign as a legacy record. Pure: computes the record, does not
 * persist it (call `saveRecord` to persist). Negative or non-finite inputs
 * are clamped to zero rather than rejected — a hostile snapshot must not
 * break the bank action.
 */
export function bankCampaign(input: BankInput): NewGamePlusRecord {
  const liquid = cleanNumber(input.playerMoney) + cleanNumber(input.playerGold) + cleanNumber(input.partyMoney);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    rulerName: input.rulerName.trim() === "" ? "a forgotten ruler" : input.rulerName.trim().slice(0, 80),
    renown: cleanNumber(input.renown),
    gold: Math.floor(liquid * GOLD_CARRYOVER_RATE),
    gear: input.gearNames.map((g) => g.trim()).filter((g) => g !== "").slice(0, 20),
    bonusPoints: LEGACY_BONUS_POINTS,
    seasonsPlayed: Math.floor(cleanNumber(input.day) / SEASON_DAYS),
    battlesWon: cleanNumber(input.battlesWon),
  };
}

/** Lines for the start-screen carryover list (the task's acceptance criterion). */
export function carryoverLines(record: NewGamePlusRecord): string[] {
  const lines = [
    `Heir of ${record.rulerName} — ${record.seasonsPlayed} seasons, ${record.battlesWon} battles won, ${record.renown} renown`,
    `Inheritance: ${record.gold.toLocaleString("en-US")} gold (${Math.round(GOLD_CARRYOVER_RATE * 100)}% of the old treasury)`,
    `Legacy training: +${record.bonusPoints} focus points in the character maker`,
  ];
  if (record.gear.length > 0) {
    lines.push(`Heirlooms: ${record.gear.join(", ")}`);
  }
  return lines;
}

/** One line appended to the heir's biography, naming the legacy. */
export function legacyBiographyLine(record: NewGamePlusRecord): string {
  return `Scion of ${record.rulerName}, whose ${record.renown} renown across ${record.seasonsPlayed} seasons still opens doors.`;
}

function resolveStorage(provided?: Storage): Storage | null {
  if (provided) return provided;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is NewGamePlusRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    r.version === 1 &&
    typeof r.createdAt === "string" &&
    typeof r.rulerName === "string" &&
    typeof r.renown === "number" &&
    typeof r.gold === "number" &&
    Array.isArray(r.gear) &&
    typeof r.bonusPoints === "number" &&
    typeof r.seasonsPlayed === "number" &&
    typeof r.battlesWon === "number"
  );
}

/**
 * Read the banked legacy. Null when there is none, when storage is blocked,
 * or when the stored bytes are corrupt — a corrupt record must never lock
 * the player out of a fresh campaign.
 */
export function loadNewGamePlusRecord(provided?: Storage): NewGamePlusRecord | null {
  const storage = resolveStorage(provided);
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveNewGamePlusRecord(record: NewGamePlusRecord, provided?: Storage): boolean {
  const storage = resolveStorage(provided);
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearNewGamePlusRecord(provided?: Storage): void {
  const storage = resolveStorage(provided);
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface HeirCharacter {
  startingCash: number;
  biography: string;
  bonusPointsTotal: number;
}

export interface HeirCharacterApplied extends HeirCharacter {}

/**
 * Apply a banked legacy record to a new heir character. Pure and therefore
 * unit-testable — main.ts calls this instead of inlining the math.
 */
export function applyNewGamePlusRecord(
  character: HeirCharacter,
  record: NewGamePlusRecord | null,
): HeirCharacterApplied {
  if (!record) return { ...character };
  return {
    startingCash: character.startingCash + Math.max(0, record.gold),
    biography: `${character.biography}\n\n${legacyBiographyLine(record)}`,
    bonusPointsTotal: character.bonusPointsTotal + Math.max(0, record.bonusPoints),
  };
}
