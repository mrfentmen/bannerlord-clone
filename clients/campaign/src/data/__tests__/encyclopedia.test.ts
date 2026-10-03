/**
 * The encyclopedia index (mandate §9): built from the real snapshot, searched and
 * linked without inventing entities.
 */

import { describe, expect, it } from "vitest";
import { buildEncyclopedia, searchEncyclopedia } from "../encyclopedia.js";
import { createFixtureSimulationProvider } from "../fixture/index.js";
import type { SimSnapshot } from "../types.js";

async function encyclopedia() {
  const provider = createFixtureSimulationProvider();
  const snapshot: SimSnapshot = await provider.getSnapshot();
  return { encyclopedia: buildEncyclopedia(snapshot), snapshot };
}

describe("buildEncyclopedia", () => {
  it("indexes every town, side and ruler", async () => {
    const { encyclopedia: enc, snapshot } = await encyclopedia();
    expect(enc.entries.filter((e) => e.kind === "settlement")).toHaveLength(snapshot.towns.length);
    expect(enc.entries.filter((e) => e.kind === "faction")).toHaveLength(snapshot.sides.length);
    expect(enc.entries.filter((e) => e.kind === "character")).toHaveLength(snapshot.rulers.length);
    // Entry ids are the source ids, unique across kinds.
    expect(new Set(enc.entries.map((e) => e.id)).size).toBe(enc.entries.length);
  });

  it("links settlements to their holders, characters to factions and holdings", async () => {
    const { encyclopedia: enc, snapshot } = await encyclopedia();
    const town = snapshot.towns.find((t) => t.holderId);
    if (!town) return; // fixture without holders: nothing to link, nothing to assert
    const entry = enc.byId.get(town.id)!;
    const holderLink = entry.links.find((l) => l.label.startsWith("Holder:"));
    expect(holderLink).toBeDefined();
    const holder = enc.byId.get(holderLink!.entryId)!;
    expect(holder.kind).toBe("character");
    // And back: the character links to this settlement as a holding.
    expect(holder.links.some((l) => l.entryId === town.id)).toBe(true);
  });

  it("links factions to their rulers", async () => {
    const { encyclopedia: enc, snapshot } = await encyclopedia();
    const side = snapshot.sides[0]!;
    const entry = enc.byId.get(side.id)!;
    const expected = snapshot.rulers.filter((r) => r.factionId === side.id).length;
    expect(entry.links.filter((l) => l.label.startsWith("Ruler:"))).toHaveLength(expected);
  });

  it("never links to an entry that does not exist", async () => {
    const { encyclopedia: enc } = await encyclopedia();
    for (const entry of enc.entries) {
      for (const link of entry.links) {
        expect(enc.byId.has(link.entryId), `${entry.id} -> ${link.entryId}`).toBe(true);
      }
    }
  });
});

describe("searchEncyclopedia", () => {
  it("finds entries by name substring, case-insensitively", async () => {
    const { encyclopedia: enc, snapshot } = await encyclopedia();
    const town = snapshot.towns[0]!;
    const needle = town.name.slice(0, 4).toLowerCase();
    const hits = searchEncyclopedia(enc, needle);
    expect(hits.some((e) => e.id === town.id)).toBe(true);
  });

  it("filters by kind and returns everything on an empty query", async () => {
    const { encyclopedia: enc } = await encyclopedia();
    const factions = searchEncyclopedia(enc, "", new Set(["faction"]));
    expect(factions.length).toBeGreaterThan(0);
    expect(factions.every((e) => e.kind === "faction")).toBe(true);
    expect(searchEncyclopedia(enc, "")).toHaveLength(enc.entries.length);
  });

  it("returns nothing for a query that matches nothing", async () => {
    const { encyclopedia: enc } = await encyclopedia();
    expect(searchEncyclopedia(enc, "zzz-no-such-place")).toEqual([]);
  });
});
