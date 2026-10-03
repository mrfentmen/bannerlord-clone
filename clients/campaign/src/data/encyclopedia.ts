/**
 * The encyclopedia index (mandate §9).
 *
 * Built from the real snapshot: settlements (towns), factions (sides) and characters
 * (rulers). Every entry links to related entries — character → clan/faction/holdings,
 * settlement → holder/faction, faction → rulers — forming the connected information
 * network the mandate asks for.
 *
 * Joins are by id equality only: `TownState.holderId` → `RulerState.id`,
 * `RulerState.factionId` → `SideState.id`, `RulerState.holdings[].settlementId` →
 * `TownState.settlementId`. A join that does not resolve produces no link rather than
 * a link to a guess.
 *
 * Pure, so it is unit-tested without a GPU.
 */

import type { SimSnapshot } from "./types.js";

export type EncyclopediaKind = "settlement" | "faction" | "character";

export interface EncyclopediaLink {
  label: string;
  entryId: string;
}

export interface EncyclopediaEntry {
  /** The source entity's own id (`town-1`, `leader-2`, `side-1`) — unique across kinds. */
  id: string;
  kind: EncyclopediaKind;
  name: string;
  subtitle: string;
  /** Lowercase searchable text: name, subtitle and kind. */
  keywords: string;
  links: EncyclopediaLink[];
}

export interface Encyclopedia {
  entries: EncyclopediaEntry[];
  byId: Map<string, EncyclopediaEntry>;
}

const KIND_LABEL: Record<EncyclopediaKind, string> = {
  settlement: "settlement",
  faction: "faction",
  character: "character",
};

function keywordsFor(kind: EncyclopediaKind, name: string, subtitle: string): string {
  return `${KIND_LABEL[kind]} ${name} ${subtitle}`.toLowerCase();
}

/**
 * Build the full index from a snapshot.
 *
 * Two passes: entries first, then links, because a settlement's holder link needs the
 * character entry to exist and a faction's ruler links need every ruler indexed.
 */
export function buildEncyclopedia(snapshot: SimSnapshot): Encyclopedia {
  const entries: EncyclopediaEntry[] = [];
  const rulerById = new Map(snapshot.rulers.map((r) => [r.id, r] as const));
  const townBySettlementId = new Map(snapshot.towns.map((t) => [t.settlementId, t] as const));

  for (const town of snapshot.towns) {
    entries.push({
      id: town.id,
      kind: "settlement",
      name: town.name,
      subtitle: `${town.klass} · held by ${town.holderName}`,
      keywords: keywordsFor("settlement", town.name, `${town.klass} ${town.holderName}`),
      links: [],
    });
  }
  for (const side of snapshot.sides) {
    entries.push({
      id: side.id,
      kind: "faction",
      name: side.name,
      subtitle: `faction · ${side.memberStates.length} states`,
      keywords: keywordsFor("faction", side.name, side.memberStates.join(" ")),
      links: [],
    });
  }
  for (const ruler of snapshot.rulers) {
    entries.push({
      id: ruler.id,
      kind: "character",
      name: ruler.name,
      subtitle: `${ruler.tier} · ${ruler.factionName}`,
      keywords: keywordsFor("character", ruler.name, `${ruler.tier} ${ruler.factionName}`),
      links: [],
    });
  }

  const byId = new Map(entries.map((e) => [e.id, e] as const));

  for (const entry of entries) {
    if (entry.kind === "settlement") {
      const town = snapshot.towns.find((t) => t.id === entry.id)!;
      const holder = town.holderId ? rulerById.get(town.holderId) : undefined;
      if (holder) {
        entry.links.push({ label: `Holder: ${holder.name}`, entryId: holder.id });
        const faction = byId.get(holder.factionId);
        if (faction) entry.links.push({ label: `Faction: ${faction.name}`, entryId: faction.id });
      }
    } else if (entry.kind === "character") {
      const ruler = rulerById.get(entry.id)!;
      const faction = byId.get(ruler.factionId);
      if (faction) entry.links.push({ label: `Faction: ${faction.name}`, entryId: faction.id });
      for (const holding of ruler.holdings) {
        const town = townBySettlementId.get(holding.settlementId);
        if (town) entry.links.push({ label: `Holds: ${town.name}`, entryId: town.id });
      }
    } else {
      for (const ruler of snapshot.rulers) {
        if (ruler.factionId === entry.id) {
          entry.links.push({ label: `Ruler: ${ruler.name}`, entryId: ruler.id });
        }
      }
    }
  }

  return { entries, byId };
}

/**
 * Case-insensitive substring search over names, subtitles and kinds.
 *
 * An empty query returns everything (of the requested kinds): the encyclopedia is also
 * a browser, not only a search box.
 */
export function searchEncyclopedia(
  encyclopedia: Encyclopedia,
  query: string,
  kinds?: ReadonlySet<EncyclopediaKind>,
): EncyclopediaEntry[] {
  const q = query.trim().toLowerCase();
  return encyclopedia.entries.filter(
    (entry) =>
      (!kinds || kinds.has(entry.kind)) && (q === "" || entry.keywords.includes(q)),
  );
}
