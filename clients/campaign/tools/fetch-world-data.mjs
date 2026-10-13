#!/usr/bin/env node
// Fetches the real V1 world data for the campaign map client.
//
// CONSTITUTION.md section 1.1: geography, roads, settlements and elevation are
// imported from real public datasets, never hand-typed. Every fetch here is loud
// on failure (section 1.3) - a missing tile or a truncated Overpass response is an
// error, not a warning.
//
// Sources and licences are recorded in public/world/DATA-MANIFEST.md.
//
// ---------------------------------------------------------------------------
// READ THE REGION FILE FIRST. IT IS THE AUTHORITY.
// ---------------------------------------------------------------------------
// `public/world/region.json` is written by the world-data pipeline
// (services/world-data, `python -m worlddata wire`) and names the region, its
// bounding box, and every elevation tile the client is allowed to ask for. This
// script reads it and fetches exactly that. Nothing here decides which region
// the game is.
//
// That is not a style preference. This file used to carry its own hardcoded
// "Northern Colorado Front Range" bbox and write region.json back from it, which
// meant `npm run fetch:world` - a documented, obvious thing to run - silently
// replaced the pipeline's Ohio River Valley data with Colorado OpenStreetMap
// data: a different bbox, a different settlement list, a different road network,
// and ODbL obligations the real data does not carry. The region file is now read
// rather than written.
//
// The OpenStreetMap passes below are still here, because OSM is a real
// alternative source and comparing the two is legitimate. They write to
// `osm/` and never to the files the client loads. To put OSM data in the client,
// pass --install-osm and understand that you are replacing the pipeline export.

import { mkdir, writeFile, readFile, readdir, access, cp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = join(ROOT, "public", "world");
// Where the OpenStreetMap comparison fetch writes. Never loaded by the client.
const OUT_OSM = join(OUT, "osm");

// ---------------------------------------------------------------------------
// The authoritative region, read from the pipeline's export.
// ---------------------------------------------------------------------------
/**
 * Read public/world/region.json. Throws if it is missing or malformed.
 *
 * The client itself reads this file rather than a constant (see
 * src/world/load.ts), so a fetch tool that disagreed with it would produce a
 * directory the client cannot load. There is nothing to reconcile: one file.
 */
async function loadRegion() {
  const path = join(OUT, "region.json");
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(
      `cannot read ${path}: ${err.message}\n` +
        "The world-data pipeline's export is the authority for the region. " +
        "Regenerate it with: cd services/world-data && python -m worlddata wire --out exports/wire",
    );
  }
  let region;
  try {
    region = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
  const { bbox, elevation } = region;
  if (!bbox || ![bbox.south, bbox.west, bbox.north, bbox.east].every(Number.isFinite)) {
    throw new Error(`${path} has no usable bbox`);
  }
  if (bbox.south >= bbox.north || bbox.west >= bbox.east) {
    throw new Error(`${path} bbox is not a valid box: ${JSON.stringify(bbox)}`);
  }
  if (!elevation || elevation.encoding !== "terrarium" || !Array.isArray(elevation.tiles)) {
    throw new Error(`${path} has no terrarium tile list`);
  }
  if (elevation.tiles.length === 0) {
    throw new Error(`${path} lists zero elevation tiles`);
  }
  return region;
}

const ELEVATION_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

// U.S. Census Bureau sub-county population estimates, Vintage 2024. A plain CSV over
// plain HTTPS, no API key, and the 2020 base column is an authoritative real figure.
//
// The Census *API* (api.census.gov) now redirects keyless requests to a "Missing
// Key" page, so the static file is the route that still works without a secret in
// the repo.
//
// Vintage 2024 is the vintage the OpenStreetMap comparison path matches against by
// name. The pipeline's own settlements carry Vintage 2023, imported at source; the
// two are separate real series and the export states which one it used.
const CENSUS_ESTIMATES_URL =
  "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv";
// Summary levels that denote a named place rather than a county or a state total.
const PLACE_SUMLEV = new Set(["157", "162", "170", "172"]);

// The global Overpass instance is a shared volunteer resource and is regularly
// saturated. Rotating a list and retrying patiently beats hammering one host.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];
const OVERPASS_UA = "campaign-map-client/0.1 (Phase 2 world data fetch)";
// Shared volunteer infrastructure: ask in small pieces and pause between requests.
const OVERPASS_CELL_ROWS = 3;
const OVERPASS_CELL_COLS = 3;
const OVERPASS_PATIENCE_MS = 900_000;

// `--only=trunk roads,rail` restricts which network passes run, so one throttled
// pass can be retried later without re-fetching the others.
const ONLY = (() => {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  if (!arg) return null;
  const wanted = arg.slice("--only=".length).split(",").map((s) => s.trim());
  if (wanted.includes("elevation") || wanted.includes("settlements")) return wanted;
  return wanted;
})();

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchWithRetry(url, { attempts = 4, as = "buffer", init = {}, userAgent = UA } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": userAgent, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const body = as === "text" ? await res.text() : Buffer.from(await res.arrayBuffer());
      if (as === "text" && body.trim().startsWith("<")) {
        throw new Error(`server returned HTML, not data: ${body.slice(0, 120).replace(/\s+/g, " ")}`);
      }
      return body;
    } catch (err) {
      lastError = err;
      const wait = attempt * 2500;
      console.error(`  ! attempt ${attempt}/${attempts} failed (${err.message}); retrying in ${wait}ms`);
      if (attempt < attempts) await sleep(wait);
    }
  }
  throw new Error(`giving up on ${url.slice(0, 120)}: ${lastError.message}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, label) {
  const deadline = Date.now() + OVERPASS_PATIENCE_MS;
  const seen = new Set();
  let lastError = "no attempt was made";

  while (Date.now() < deadline) {
    const endpoint = OVERPASS_ENDPOINTS[seen.size % OVERPASS_ENDPOINTS.length];
    if (seen.size >= OVERPASS_ENDPOINTS.length) {
      seen.clear();
      // Back all the way off before trying the pool again, so a saturated
      // Overpass is not kept in a tight retry loop.
      await sleep(15_000);
    }
    seen.add(endpoint);
    try {
      const text = await fetchWithRetry(endpoint, {
        attempts: 1,
        as: "text",
        // overpass-api.de answers 406 to browser-shaped User-Agents, so identify
        // honestly here rather than spoofing a browser.
        userAgent: OVERPASS_UA,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
        },
      });
      const json = JSON.parse(text);
      if (!Array.isArray(json.elements)) {
        throw new Error("response had no elements array");
      }
      return { json, endpoint };
    } catch (err) {
      lastError = err.message;
      console.error(`  ! ${label}: ${new URL(endpoint).host} -> ${err.message}`);
      await sleep(6_000);
    }
  }
  throw new Error(`no Overpass endpoint answered within the patience window: ${lastError}`);
}

/** Split a bbox into a grid of small bboxes. Small queries get served. */
function cells(bbox) {
  const { south, west, north, east } = bbox;
  const out = [];
  for (let r = 0; r < OVERPASS_CELL_ROWS; r += 1) {
    for (let c = 0; c < OVERPASS_CELL_COLS; c += 1) {
      out.push({
        s: south + ((north - south) * r) / OVERPASS_CELL_ROWS,
        n: south + ((north - south) * (r + 1)) / OVERPASS_CELL_ROWS,
        w: west + ((east - west) * c) / OVERPASS_CELL_COLS,
        e: west + ((east - west) * (c + 1)) / OVERPASS_CELL_COLS,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

/**
 * Fetch exactly the elevation tiles region.json lists, and no others.
 *
 * Iterating the file's tile list rather than recomputing a range from the bbox
 * is the whole point. The client loads a heightfield by asking for each path in
 * that list and throwing on the first one that 404s, so a tile set that is
 * computed here and a tile list written there can disagree and leave the map
 * unloadable. That is not hypothetical: 272 committed tiles for a previous
 * region shared no column with the 2,236 the region file asked for, so not one
 * tile the client wanted was on disk.
 */
async function fetchElevation(region) {
  const { tiles: wanted, zoom: z, encoding } = region.elevation;
  if (encoding !== "terrarium") {
    throw new Error(`region.json asks for elevation encoding ${encoding}, this tool only fetches terrarium`);
  }

  let present = 0;
  let downloaded = 0;
  let bytes = 0;
  const missing = [];

  for (const tile of wanted) {
    const { x, y } = tile;
    const rel = tile.path ?? join("elevation", String(tile.z), String(x), `${y}.png`);
    const dest = join(OUT, rel);
    const url = `${ELEVATION_URL}/${tile.z}/${x}/${y}.png`;
    if (await exists(dest)) {
      present += 1;
      continue;
    }
    const buf = await fetchWithRetry(url, { attempts: 5 });
    // A terrarium tile is a PNG. Check the signature so an error page saved as
    // .png can never be mistaken for elevation.
    const isPng =
      buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isPng) {
      throw new Error(`tile ${tile.z}/${x}/${y} is not a PNG (${buf.length} bytes)`);
    }
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    downloaded += 1;
    bytes += buf.length;
    missing.push(rel);
  }

  console.log(
    `elevation: ${wanted.length} tiles at z${z}, ${present} already on disk, ` +
      `${downloaded} fetched (${(bytes / 1024 / 1024).toFixed(2)} MB)`,
  );
  return { total: wanted.length, present, downloaded, bytes };
}

/**
 * Report on the elevation directory against region.json without fetching.
 *
 * This is the check that would have caught the region mismatch before it shipped.
 * `--check` runs it and nothing else.
 */
async function checkElevation(region) {
  const wanted = region.elevation.tiles;
  const missing = [];
  for (const tile of wanted) {
    const rel = tile.path ?? join("elevation", String(tile.z), String(tile.x), `${tile.y}.png`);
    if (!(await exists(join(OUT, rel)))) missing.push(rel);
  }
  // Tiles on disk that region.json never asked for: leftovers from a previous
  // region. They cost repository size and they are the reason it is worth naming.
  const wantedSet = new Set(
    wanted.map((t) => t.path ?? join("elevation", String(t.z), String(t.x), `${t.y}.png`)),
  );
  const stray = [];
  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(next, rel);
      else if (!wantedSet.has(rel)) stray.push(rel);
    }
  };
  await walk(join(OUT, "elevation"), "elevation");

  console.log(`region: ${region.name}`);
  console.log(`elevation: ${wanted.length} tiles declared, ${wanted.length - missing.length} on disk`);
  if (missing.length) {
    console.log(`  missing ${missing.length}, first few: ${missing.slice(0, 5).join(", ")}`);
    console.log(`  run: npm run fetch:world -- --only=elevation`);
  }
  if (stray.length) {
    console.log(`  ${stray.length} tile(s) on disk are not in region.json, first few: ${stray.slice(0, 5).join(", ")}`);
    console.log(`  they are from a different region and the client will never request them`);
  }
  return { missing, stray, ok: missing.length === 0 && stray.length === 0 };
}

/**
 * The state names the region file says the region covers.
 *
 * region.json records this as a comma-separated list of real state names
 * ("Indiana, Kentucky, Ohio, Virginia, West Virginia"), derived by the pipeline
 * from the states that actually contain settlements inside the bbox. Matching
 * Census rows on that name list means no numeric identifier is typed by hand
 * anywhere in this file, which is the point of CONSTITUTION.md section 1.1. The
 * previous version hardcoded "08" for Colorado and matched on the CSV's numeric
 * STATE column, which is how a tool written for one region quietly stayed
 * written for it.
 */
function regionStateNames(region) {
  const declared = region.stateCoverage?.region;
  if (typeof declared !== "string" || declared.trim() === "") {
    throw new Error(
      "region.json has no stateCoverage.region, so there is no way to tell which states the " +
        "Census file should be filtered to. Refusing to guess one.",
    );
  }
  return declared
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => name.toLowerCase());
}

/**
 * Place populations for the region's states, from the Census Bureau's
 * sub-county estimates file.
 *
 * OSM nodes carry a `population` tag that is often a decade out of date and
 * unsourced. CONSTITUTION.md section 1.1 says real data wins and gaps get logged, so
 * the Census figure is authoritative and the OSM tag is kept alongside it purely as
 * provenance, letting a disagreement be visible instead of hidden.
 *
 * The `ESTIMATESBASE2020` column is the estimates programme's 2020 base. It is not
 * byte-identical to the 2020 decennial count for every place: the Census revises the
 * base when it corrects a geography. The spot check records where they differ.
 */
async function fetchCensusPlaces(region) {
  const wanted = regionStateNames(region);
  const wantedSet = new Set(wanted);
  const text = await fetchWithRetry(CENSUS_ESTIMATES_URL, {
    attempts: 5,
    as: "text",
  });
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const header = lines[0].split(",");
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) {
      throw new Error(
        `Census estimates file is missing the ${name} column. Header: ${header.join(",")}`,
      );
    }
    return i;
  };
  const iSumlev = col("SUMLEV");
  const iStateName = col("STNAME");
  const iName = col("NAME");
  const iBase = col("ESTIMATESBASE2020");
  const iEst = col("POPESTIMATE2020");

  const byName = new Map();
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    // STNAME is the Census Bureau's own spelling of the state, so matching on it
    // needs no code table in this file.
    if (!wantedSet.has(f[iStateName]?.trim().toLowerCase())) continue;
    if (!PLACE_SUMLEV.has(f[iSumlev])) continue;
    // "Thornton city" -> "Thornton". Also handles CDPs and the few
    // incorporations whose name contains a space before the suffix.
    const bare = f[iName].replace(
      / (city|town|village|CDP|borough|municipality)$/i,
      "",
    );
    const population = Number(f[iBase]);
    if (!Number.isFinite(population)) continue;
    byName.set(bare.toLowerCase(), {
      name: bare,
      censusName: f[iName],
      state: f[iStateName]?.trim() ?? null,
      population,
      estimate2020: Number(f[iEst]),
    });
  }
  if (byName.size === 0) {
    throw new Error(
      `Census estimates file produced zero places for ${wanted.join(", ")}. Refusing to continue.`,
    );
  }
  console.log(`census: ${byName.size} places in ${wanted.join(", ")} from the Vintage 2024 estimates file`);
  return byName;
}

async function fetchSettlements(region) {
  const census = await fetchCensusPlaces(region);
  const seen = new Map();
  const hosts = new Set();
  let matched = 0;
  const unmatched = [];

  for (const [i, cell] of cells(region.bbox).entries()) {
    const bboxStr = `${round(cell.s, 4)},${round(cell.w, 4)},${round(cell.n, 4)},${round(cell.e, 4)}`;
    // Settlements in this region are mapped as nodes; querying ways too makes the
    // scan far more expensive and the regional instance times out on it.
    const query =
      `[out:json][timeout:120];node["place"~"^(city|town|village)$"](${bboxStr});out body;`;
    const { json, endpoint } = await overpass(query, `settlements cell ${i + 1}/9`);
    hosts.add(new URL(endpoint).host);

    for (const el of json.elements) {
      const tags = el.tags ?? {};
      if (!tags.name || typeof el.lat !== "number" || typeof el.lon !== "number") continue;
      // A place on a cell border comes back from two cells. Keep one.
      const key = `${tags.name}|${el.lat.toFixed(3)}|${el.lon.toFixed(3)}`;
      if (seen.has(key)) continue;

      const rawPop = tags.population;
      const osmPopulation = /^\d+$/.test(rawPop ?? "") ? Number(rawPop) : null;
      const tagState = tags["addr:state"] ?? null;
      const hit = census.get(tags.name.toLowerCase());
      if (hit) {
        matched += 1;
      } else {
        unmatched.push({ name: tags.name, place: tags.place, osmPopulation });
      }

      seen.set(key, {
        osmId: `node/${el.id}`,
        name: tags.name,
        place: tags.place,
        lat: round(el.lat, 6),
        lon: round(el.lon, 6),
        // Authoritative figure. `null` means no real source covered this place,
        // which the client shows as such rather than guessing a number.
        population: hit ? hit.population : null,
        populationSource: hit ? CENSUS_POPULATION_SOURCE : null,
        populationEstimate2020: hit ? hit.estimate2020 : null,
        populationCensusName: hit ? hit.censusName : null,
        // Kept for provenance, never used as the displayed value.
        osmPopulation,
        osmPopulationDate: tags["population:date"] ?? null,
        wikidata: tags.wikidata ?? null,
        // No default. A settlement with no state tag gets null, and the client says
        // "state not recorded" rather than guessing.
        state: tags["addr:state"] ?? null,
        stateCode: null,
      });
    }
    console.log(`  settlements cell ${i + 1}/9: ${json.elements.length} nodes`);
  }

  const list = [...seen.values()].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  console.log(
    `settlements: ${list.length} total, ${matched} matched to the 2020 Census, ` +
      `${unmatched.length} not covered by a Census place (via ${[...hosts].join(", ")})`,
  );
  if (unmatched.length) {
    console.log("  not covered by a Census place: " + unmatched.map((u) => u.name).join(", "));
  }
  return { list, hosts: [...hosts], unmatched };
}

async function fetchNetwork(region) {
  const roads = new Map();
  const rail = new Map();
  const hosts = new Set();

  // Each pass is written to disk the moment it completes. A shared volunteer API
  // throttling the rail pass must not cost us the road network we already have.
  const passes = [
    {
      key: "roads",
      label: "trunk roads",
      query: (b) => `[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary)$"](${b});out geom tags;`,
      sink: roads,
    },
    {
      key: "roads",
      label: "secondary roads",
      query: (b) => `[out:json][timeout:180];way["highway"="secondary"](${b});out geom tags;`,
      sink: roads,
    },
    {
      key: "rail",
      label: "rail",
      query: (b) => `[out:json][timeout:180];way["railway"="rail"](${b});out geom tags;`,
      sink: rail,
    },
  ];

  for (const pass of passes) {
    if (ONLY && !ONLY.includes(pass.label)) {
      console.log(`skipping pass "${pass.label}" (--only filter)`);
      continue;
    }
    for (const [i, cell] of cells(region.bbox).entries()) {
      const bboxStr = `${round(cell.s, 4)},${round(cell.w, 4)},${round(cell.n, 4)},${round(cell.e, 4)}`;
      const { json, endpoint } = await overpass(pass.query(bboxStr), `${pass.label} cell ${i + 1}/9`);
      hosts.add(new URL(endpoint).host);

      for (const el of json.elements) {
        if (!Array.isArray(el.geometry) || el.geometry.length < 2) continue;
        const tags = el.tags ?? {};
        if (pass.sink === rail) {
          rail.set(el.id, {
            osmId: `way/${el.id}`,
            name: tags.name ?? null,
            coords: el.geometry.map((p) => [round(p.lat, 6), round(p.lon, 6)]),
          });
        } else {
          roads.set(el.id, {
            osmId: `way/${el.id}`,
            highway: tags.highway,
            name: tags.name ?? null,
            ref: tags.ref ?? null,
            surface: tags.surface ?? null,
            lanes: tags.lanes ? Number(tags.lanes) : null,
            coords: el.geometry.map((p) => [round(p.lat, 6), round(p.lon, 6)]),
          });
        }
      }
      console.log(`  ${pass.label} cell ${i + 1}/9: ${json.elements.length} ways`);
    }
    writeNetwork({ roads: [...roads.values()], rail: [...rail.values()], hosts: [...hosts] });
    console.log(`  persisted: ${roads.size} roads, ${rail.size} rail so far`);
  }

  console.log(`roads: ${roads.size} ways, rail: ${rail.size} ways (via ${[...hosts].join(", ")})`);
  return {
    roads: [...roads.values()],
    rail: [...rail.values()],
    hosts: [...hosts],
  };
}

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

let RETRIEVED = null;

// ---------------------------------------------------------------------------
// Where the OpenStreetMap comparison fetch writes.
//
// Everything below this line is the OSM path. It writes into public/world/osm/,
// which the client never loads. That is the second half of the fix for the
// region mismatch: the OSM passes are kept, because OSM is a real alternative
// source worth comparing against, but they are no longer one flag away from
// replacing the pipeline's export.
// ---------------------------------------------------------------------------
let OSM_OUT = OUT_OSM;

async function writeOsmSettlements(list) {
  await writeFile(
    join(OSM_OUT, "settlements.json"),
    JSON.stringify(
      {
        source: "OpenStreetMap via Overpass API",
        licence: "ODbL 1.0",
        retrieved: RETRIEVED,
        settlements: list,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

async function writeNetwork({ roads, rail }) {
  // No indentation here. With ~22,000 polylines the pretty-printed form is more than
  // twice the size of the compact one and it is a machine file, not a document.
  await writeFile(
    join(OSM_OUT, "network.json"),
    JSON.stringify({
      source: "OpenStreetMap via Overpass API",
      licence: "ODbL 1.0",
      retrieved: RETRIEVED,
      roads,
      rail,
    }),
    "utf8",
  );
}

/**
 * --install-osm: put the OpenStreetMap fetch where the client will load it.
 *
 * Off by default. Without it the OSM pass writes to public/world/osm/ and the
 * client keeps loading the pipeline's export. With it, the OSM settlements and
 * network are copied over the pipeline's, which is a real change of data source
 * and a real change of licence (ODbL 1.0 instead of US public domain), so it has
 * to be asked for by name. region.json is left alone either way: the bbox and
 * the elevation tile list come from the pipeline, and replacing them with an OSM
 * fetch's own idea of the region is what caused this in the first place.
 */
async function installOsm() {
  const region = await loadRegion();
  for (const file of ["settlements.json", "network.json"]) {
    const from = join(OUT_OSM, file);
    if (!(await exists(from))) {
      throw new Error(
        `${file} was not written to ${OUT_OSM}, so there is nothing to install. ` +
          "Run the OSM fetch first.",
      );
    }
    await cp(from, join(OUT, file));
    console.log(`installed osm/${file} over ${file}`);
  }
  console.log(
    "The client now loads OpenStreetMap geometry. Update public/world/DATA-MANIFEST.md " +
      "and the credits: ODbL 1.0 attribution is owed for it, and the TIGER/Line " +
      "attribution no longer applies.",
  );
  console.log(`region.json still describes ${region.name}; the client reads its bbox from there.`);
}

// The OSM spot-check list below was transcribed for the previous region. It is
// kept so the shape of the check is preserved, but it is not run against the
// current region: a spot check of places the client does not render proves
// nothing. `--only=spotcheck` refuses instead of producing a green wrong answer.
const LEGACY_SPOT_CHECK_REGION = "Northern Colorado Front Range";

async function main() {
  await mkdir(OUT, { recursive: true });
  RETRIEVED = new Date().toISOString().slice(0, 10);

  if (process.argv.includes("--check")) {
    const region = await loadRegion();
    const result = await checkElevation(region);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  const region = await loadRegion();
  OSM_OUT = OUT_OSM;
  await mkdir(OSM_OUT, { recursive: true });
  console.log(`region: ${region.name} (from region.json, the world-data pipeline's export)`);

  if (ONLY && ONLY.includes("elevation")) {
    await fetchElevation(region);
    return;
  }

  if (ONLY && ONLY.includes("spotcheck")) {
    throw new Error(
      "the spot-check list in this tool is transcribed for " +
        `${LEGACY_SPOT_CHECK_REGION} and does not apply to ${region.name}. ` +
        "services/world-data/docs/SPOT_CHECK.md holds the pipeline's spot check, which is " +
        "built from the real export rather than transcribed by hand.",
    );
  }

  if (process.argv.includes("--install-osm")) {
    await installOsm();
    return;
  }

  if (!ONLY) {
    await fetchElevation(region);
  }

  const { list, unmatched } = await fetchSettlements(region);
  await writeOsmSettlements(list);

  const network = await fetchNetwork(region);
  await writeNetwork(network);

  // The OSM pass's own population-gap list, written beside the OSM data it
  // describes. It used to be written to public/world/, where it outlived the
  // region it was about: the file on main until this change listed eleven
  // Colorado mountain communities - Evergreen, Tolland, Gold Hill, Zuni and the
  // rest - as gaps in a region that contains none of them.
  await writeFile(
    join(OSM_OUT, "gaps.json"),
    JSON.stringify(
      {
        retrieved: RETRIEVED,
        note:
          "OpenStreetMap places in this region with no matching Census place row. " +
          "CONSTITUTION.md section 1.1: recorded, not filled in with a guess.",
        gaps: unmatched.map((u) => ({
          field: "population",
          entity: u.name,
          reason: "no incorporated place or Census-designated place of that name in the Census estimates file",
          handling: "client shows the settlement with no population and no derived class",
        })),
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `\nwrote osm/settlements.json, osm/network.json and osm/gaps.json to ` +
      `clients/campaign/public/world/osm/`,
  );
  console.log(
    "The client was NOT modified. It still loads the world-data pipeline's export from " +
      "public/world/. Pass --install-osm to replace it with the OpenStreetMap fetch.",
  );
}

const CENSUS_POPULATION_SOURCE =
  "U.S. Census Bureau, Vintage 2024 sub-county population estimates, ESTIMATESBASE2020";

main().catch((err) => {
  console.error(`\nWORLD DATA FETCH FAILED: ${err.message}`);
  process.exitCode = 1;
});
