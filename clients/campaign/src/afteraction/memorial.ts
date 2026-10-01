/**
 * Task 75: war memorial. Every named character who falls — allied heroes,
 * enemy heroes, clan dead — gets a stone here with an epitaph.
 *
 * Data-level only. Recording happens through {@link createMemorial}; the
 * battle layer feeds it through the same {@link FeedbackSource} hero-kill
 * events the kill feed renders (wired in feedback/index.ts via the optional
 * `memorial` option on createBattleFeedback), and clan deaths sync through
 * {@link syncClanDeaths}. The panel is memorialPanel.ts.
 *
 * The store persists in localStorage, capped at {@link MEMORIAL_CAP} stones
 * so a long campaign can't grow it without bound.
 */

import type { HeroKill } from "../feedback/types.js";
import type { ClanMember } from "../clan/types.js";

/** Who the stone remembers. */
export type FallenSide = "ally" | "enemy" | "clan";

/** One stone in the memorial. */
export interface FallenRecord {
  /** Dedupe key, e.g. `hero:Redfield:Mara Voss` or `clan:member-12`. */
  id: string;
  name: string;
  side: FallenSide;
  /** Where they fell, when known. */
  battleLabel?: string;
  /** Who struck the blow, when known. */
  killerName?: string;
  /** The epitaph carved on the stone. Generated when not supplied. */
  epitaph: string;
}

/** localStorage key for the persisted stones. */
export const MEMORIAL_STORE_KEY = "campaign.memorial.v1";

/** Hard cap on stones so a long campaign can't grow storage unbounded. */
export const MEMORIAL_CAP = 500;

// -- Epitaphs -----------------------------------------------------------------

const ALLY_EPITAPHS = [
  "Stood the line when it broke. The line holds because of them.",
  "Charged first, asked nothing, gave everything.",
  "Their banner never touched the ground.",
  "A shield for those behind them, to the very end.",
  "They laughed at death until death stopped laughing.",
  "Held the gate alone so the rest could live.",
  "No finer companion ever rode beside us.",
  "The bards will argue over this one for a hundred years.",
] as const;

const ENEMY_EPITAPHS = [
  "A worthy foe. We bury them with their sword.",
  "Fought well for the wrong cause.",
  "The field is quieter without their war-cry.",
  "Honour to a brave enemy. May their rest be earned.",
  "They died as they lived: refusing to yield.",
  "No shame in falling to this one. We say that plainly.",
] as const;

const CLAN_EPITAPHS = [
  "Gone to the ancestors. The hearth is colder.",
  "Their counsel outlived them; their kindness did too.",
  "Raised the clan, stone by stone. Now one of the stones.",
  "The old songs end where their story begins.",
  "Lived long enough to see the clan stand tall.",
  "Every family has one who holds it together. This was ours.",
] as const;

/** FNV-1a 32-bit — deterministic epitaph draw from the record's identity. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick the epitaph for a stone. Deterministic: the same record always draws
 * the same line, so stones never change their carving between sessions.
 */
export function epitaphFor(name: string, side: FallenSide): string {
  const pool = side === "ally" ? ALLY_EPITAPHS : side === "enemy" ? ENEMY_EPITAPHS : CLAN_EPITAPHS;
  return pool[hashSeed(`${side}:${name}`) % pool.length] as string;
}

// -- Store --------------------------------------------------------------------

export interface Memorial {
  /** Stones, newest first. */
  list(): FallenRecord[];
  count(): number;
  /**
   * Carve a stone. Returns false when a stone with the same id already
   * exists — the memorial never double-counts a death.
   */
  record(entry: Omit<FallenRecord, "epitaph"> & { epitaph?: string }): boolean;
  /** Record a hero kill from the battle feedback stream. */
  recordHeroKill(kill: HeroKill, battleLabel?: string): boolean;
  /**
   * Reconcile clan deaths into the memorial. Members with a deathYear get a
   * stone; the living are never recorded. Idempotent — safe to call every
   * time the clan roster changes.
   */
  syncClanDeaths(members: readonly ClanMember[]): number;
  /** Strike every stone. */
  clear(): void;
}

function load(): FallenRecord[] {
  try {
    const raw = localStorage.getItem(MEMORIAL_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is FallenRecord =>
        typeof r === "object" && r !== null && typeof (r as FallenRecord).id === "string" && typeof (r as FallenRecord).name === "string",
    );
  } catch {
    // Corrupted entry: start the memorial fresh rather than crashing.
    return [];
  }
}

export function createMemorial(): Memorial {
  // Newest first, so unshift on record and slice on cap.
  let stones: FallenRecord[] = load();
  const ids = new Set(stones.map((s) => s.id));

  function save(): void {
    try {
      localStorage.setItem(MEMORIAL_STORE_KEY, JSON.stringify(stones));
    } catch {
      // Storage full or blocked: keep the memorial in memory for the session.
    }
  }

  function carve(record: FallenRecord): boolean {
    if (ids.has(record.id)) return false;
    ids.add(record.id);
    stones.unshift(record);
    if (stones.length > MEMORIAL_CAP) {
      const dropped = stones.splice(MEMORIAL_CAP);
      for (const d of dropped) ids.delete(d.id);
    }
    save();
    return true;
  }

  return {
    list: () => [...stones],
    count: () => stones.length,

    record(entry) {
      return carve({
        ...entry,
        epitaph: entry.epitaph ?? epitaphFor(entry.name, entry.side),
      });
    },

    recordHeroKill(kill, battleLabel) {
      const side: FallenSide = kill.victimSide;
      return carve({
        id: `hero:${kill.victimName}`,
        name: kill.victimName,
        side,
        ...(battleLabel === undefined ? {} : { battleLabel }),
        killerName: kill.killerName,
        epitaph: epitaphFor(kill.victimName, side),
      });
    },

    syncClanDeaths(members) {
      let added = 0;
      for (const m of members) {
        if (m.deathYear === undefined) continue;
        const years = `${m.birthYear}–${m.deathYear}`;
        const ok = carve({
          id: `clan:${m.id}`,
          name: `${m.name} (${years})`,
          side: "clan",
          epitaph: epitaphFor(m.name, "clan"),
        });
        if (ok) added += 1;
      }
      return added;
    },

    clear() {
      stones = [];
      ids.clear();
      save();
    },
  };
}
