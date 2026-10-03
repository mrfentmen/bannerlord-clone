/**
 * `npm run fetch:world` must not be able to replace the deployed region.
 *
 * The client does not build its map from a constant: it reads
 * `public/world/region.json`, `settlements.json`, `network.json` and
 * `boundaries.json`, and those files are the world-data pipeline's export. The
 * pipeline is the only thing that decides which region the game is.
 *
 * `tools/fetch-world-data.mjs` is the OpenStreetMap comparison fetch, and it used to
 * carry its own hardcoded "Northern Colorado Front Range" bbox and *write*
 * `region.json`, `settlements.json` and `network.json` back from it. That made
 * `npm run fetch:world` - a documented, obvious command - silently swap the Ohio
 * River Valley region for Colorado OSM data: a different bbox, a different
 * settlement list, a different road network, and ODbL 1.0 obligations the real
 * US-public-domain data does not carry. Nothing failed. The damage was only visible
 * afterwards, as a map of the wrong place.
 *
 * Nothing else guards this. `test_exports_bundle.py` in `services/world-data`
 * notices the *aftermath* - that the client's files no longer match the export -
 * but only once the files are already wrong, and it is a Python suite that a client
 * change does not run. This test is the cheap, in-language guard that runs with the
 * client's own suite, before anyone fetches anything.
 *
 * It reads the tool as text rather than executing it. Every path that would matter
 * needs the network - Overpass, AWS, the Census Bureau - so running it here would
 * either be slow and flaky or be a mock that proves nothing about which paths write
 * where. What is being asserted is a property of the source: which directory the
 * tool writes into, and whether it names a region of its own.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TOOL = readFileSync(
  fileURLToPath(new URL("../../tools/fetch-world-data.mjs", import.meta.url)),
  "utf8",
);

/** Strip comments, so prose about the old behaviour cannot fail or satisfy a check. */
function code(): string {
  return TOOL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const SRC = code();

describe("the OSM comparison fetch cannot replace the deployed region", () => {
  it("writes its settlements and network under world/osm/, which the client never loads", () => {
    // The OSM passes are kept: OSM is a real alternative source and comparing the
    // two is legitimate. What must not happen is them landing where the client reads.
    expect(SRC).toContain('join(OUT, "osm")');
    expect(SRC).toMatch(/writeOsmSettlements[\s\S]*?join\(OSM_OUT,/);
    expect(SRC).toMatch(/writeNetwork[\s\S]*?join\(OSM_OUT,/);
    expect(SRC).toMatch(/join\(OSM_OUT, "gaps\.json"\)/);
  });

  it("never writes region.json, which the pipeline owns", () => {
    // region.json names the region, its bbox, and every elevation tile the client is
    // allowed to ask for. `loadHeightfield` throws on the first tile it cannot fetch,
    // so a tile list and a tile directory that disagree leave the map undrawable.
    expect(SRC).not.toMatch(/writeFile\(\s*join\(\s*OUT,\s*"region\.json"/);
    expect(SRC).not.toMatch(/writeFile\(\s*join\(\s*OUT,\s*"settlements\.json"/);
    expect(SRC).not.toMatch(/writeFile\(\s*join\(\s*OUT,\s*"network\.json"/);
  });

  it("reads the region from region.json instead of deciding one", () => {
    expect(SRC).toContain('join(OUT, "region.json")');
    expect(SRC).toContain("async function loadRegion(");
    // The elevation list is iterated from the file rather than recomputed from a
    // bbox, so the two cannot drift.
    expect(SRC).toContain("region.elevation");
  });

  it("names no region, state, or bounding box of its own", () => {
    // Any hardcoded geography here is a region this tool would fetch instead of the
    // one the pipeline built. Colorado's state code is the regression that actually
    // happened, so it is named alongside the general shape of the check.
    expect(SRC).not.toMatch(/CENSUS_STATE/);
    expect(SRC).not.toMatch(/const REGION\s*=/);
    expect(SRC).not.toMatch(/bbox:\s*\{\s*south:/);
  });

  it("keeps the old region name only as the spot-check it refuses to run", () => {
    // The spot-check list was transcribed for Colorado by hand, so against any other
    // region it would be a green wrong answer. The tool refuses instead. That refusal
    // needs the old name, so the ban is on the name being a *fetch target*, not on the
    // string existing: it may appear in the constant and in the message and nowhere else.
    const occurrences = SRC.match(/Northern Colorado Front Range/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(SRC).toMatch(/const LEGACY_SPOT_CHECK_REGION = "Northern Colorado Front Range"/);
    expect(SRC).toMatch(/\$\{LEGACY_SPOT_CHECK_REGION\} and does not apply to \$\{region\.name\}/);
  });

  it("only puts OSM data where the client loads it when asked for it by name", () => {
    // Replacing the export is a real change of data source and of licence
    // (ODbL 1.0 rather than US public domain), so it has to be requested by name and
    // has to say so.
    expect(SRC).toContain("--install-osm");
    expect(SRC).toContain("async function installOsm(");
    expect(SRC).toContain("ODbL");
  });
});

describe("the shipped gap list describes the region the client ships", () => {
  // `gaps.json` records settlements that have no real figure for some field, so the
  // client can say "unknown" rather than invent one. It once listed eleven Colorado
  // Front Range places in a region that contains none of them, which is the same
  // failure as the tool above: a file in `public/world/` describing somewhere other
  // than the deployed region. Nothing read it, so nothing complained.

  const gaps = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../public/world/gaps.json", import.meta.url)), "utf8"),
  ) as { region?: string; gaps: { entity: string }[] };
  const settlements = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../public/world/settlements.json", import.meta.url)), "utf8"),
  ) as { settlements: { name: string; population: number | null }[] };

  it("names the region it is about", () => {
    expect(gaps.region).toBe("Ohio River Valley (OH/KY metro cluster)");
  });

  it("names only settlements this region actually ships", () => {
    const names = new Set(settlements.settlements.map((s) => s.name.toLowerCase()));
    const strangers = gaps.gaps
      .map((g) => g.entity)
      .filter((entity) => !names.has(entity.toLowerCase()));
    expect(strangers).toEqual([]);
  });

  it("is empty, because every settlement here has a real population", () => {
    // Stated rather than assumed: this is the check that makes the empty list above a
    // finding instead of a guess.
    expect(settlements.settlements.filter((s) => s.population === null)).toEqual([]);
    expect(gaps.gaps).toEqual([]);
  });
});