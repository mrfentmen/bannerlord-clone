/**
 * Rival tracking (Rowan solo task 48).
 *
 * Named enemies who escape a battle are tracked across battles: their
 * grudges grow, and the log notes each encounter. When the player finally
 * defeats a rival, the saga closes. Persists in localStorage.
 */

export interface Rival {
  id: string;
  name: string;
  faction: string;
  /** Battles escaped. */
  escapes: number;
  /** Battles faced (escaped or not). */
  encounters: number;
  firstSeen: number;
  lastSeen: number;
  defeated: boolean;
}

const STORE_KEY = "campaign.rivals.v1";

function load(): Rival[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(rivals: Rival[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(rivals));
  } catch {
    // Session-only rivals.
  }
}

/** Record a named enemy sighting. escaped=true when they got away. */
export function trackRival(id: string, name: string, faction: string, escaped: boolean): Rival {
  const rivals = load();
  const now = Date.now();
  let rival = rivals.find((r) => r.id === id);
  if (!rival) {
    rival = { id, name, faction, escapes: 0, encounters: 0, firstSeen: now, lastSeen: now, defeated: false };
    rivals.push(rival);
  }
  rival.encounters += 1;
  rival.lastSeen = now;
  if (escaped) {
    rival.escapes += 1;
  } else {
    rival.defeated = true;
  }
  save(rivals);
  return { ...rival };
}

/** Rivals still at large, most escapes first. */
export function activeRivals(): Rival[] {
  return load()
    .filter((r) => !r.defeated)
    .sort((a, b) => b.escapes - a.escapes);
}

/** One-line grudge summary, e.g. "escaped you 3 times". */
export function rivalGrudge(rival: Rival): string {
  if (rival.defeated) return `${rival.name} was defeated after ${rival.encounters} encounters.`;
  if (rival.escapes === 0) return `${rival.name} has faced you ${rival.encounters} time(s).`;
  return `${rival.name} has escaped you ${rival.escapes} time${rival.escapes === 1 ? "" : "s"}.`;
}
