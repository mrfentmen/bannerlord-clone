/**
 * Tasks 125-126: banner oaths and the chronicle.
 *
 * Oaths: the player writes a custom oath; it is shown at coronations and
 * stored with the clan.
 *
 * Chronicle: the campaign's event log is digested into story paragraphs —
 * an auto-generated history of the player's deeds, season by season.
 */

export interface Oath {
  text: string;
  swornSeason: number;
}

export function swearOath(text: string, season: number): Oath {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("an oath cannot be empty");
  if (trimmed.length > 500) throw new Error("an oath cannot exceed 500 characters");
  return { text: trimmed, swornSeason: season };
}

export interface ChronicleEvent {
  season: number;
  kind: "battle" | "marriage" | "birth" | "death" | "treaty" | "edict" | "building" | "other";
  text: string;
}

const KIND_VERB: Record<ChronicleEvent["kind"], string> = {
  battle: "warred",
  marriage: "wed",
  birth: "welcomed",
  death: "mourned",
  treaty: "treated",
  edict: "decreed",
  building: "built",
  other: "did",
};

/** Digest events into a season-by-season story. */
export function writeChronicle(events: ChronicleEvent[]): string[] {
  const bySeason = new Map<number, ChronicleEvent[]>();
  for (const e of [...events].sort((a, b) => a.season - b.season)) {
    bySeason.set(e.season, [...(bySeason.get(e.season) ?? []), e]);
  }
  const chapters: string[] = [];
  for (const [season, list] of bySeason) {
    const deeds = list.map((e) => e.text).join(" ");
    chapters.push(`Season ${season}: ${deeds}`);
  }
  return chapters;
}

/** One-line epitaph for a season, for the chronicle sidebar. */
export function seasonEpithet(events: ChronicleEvent[], season: number): string {
  const list = events.filter((e) => e.season === season);
  if (list.length === 0) return `Season ${season}: a quiet season.`;
  const kinds = [...new Set(list.map((e) => KIND_VERB[e.kind]))];
  return `Season ${season}: the season they ${kinds.join(" and ")}.`;
}
