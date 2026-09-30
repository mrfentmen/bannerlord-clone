#!/usr/bin/env node
// Fetches the real V1 world data for the campaign map client.
//
// CONSTITUTION.md section 1.1: geography, roads, settlements and elevation are
// imported from real public datasets, never hand-typed. Every fetch here is loud
// on failure (section 1.3) - a missing tile or a truncated Overpass response is an
// error, not a warning.
//
// Sources and licences are recorded in public/world/DATA-MANIFEST.md.

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = join(ROOT, "public", "world");

// ---------------------------------------------------------------------------
// V1 region. Northern Colorado Front Range.
//
// Chosen because it exercises everything the campaign map has to render: real
// 1500 m to 4400 m relief, a genuine river valley, interstate plus rail, and a
// city/town/village spread from 700,000 down to under 500. It also straddles a
// side boundary, since Colorado is Mountain Alliance and Nebraska to the east is
// Great Lakes Union (FACTIONS.md section 4).
//
// PHASES.md Phase 0 assigns the V1 region to the world-data pipeline. Until that
// lands this is the client's own working region; it is recorded here so the two
// are reconciled rather than silently diverging.
// ---------------------------------------------------------------------------
const REGION = {
  name: "Northern Colorado Front Range",
  bbox: { south: 39.6, west: -105.6, north: 40.1, east: -104.8 },
  elevationZoom: 12,
};

const ELEVATION_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
// U.S. Census Bureau sub-county population estimates, Vintage 2024. A plain CSV over
// plain HTTPS, no API key, and the 2020 base column is an authoritative real figure.
//
// The Census *API* (api.census.gov) now redirects keyless requests to a "Missing
// Key" page, so the static file is the route that still works without a secret in
// the repo.
const CENSUS_ESTIMATES_URL =
  "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv";
const CENSUS_STATE = "08"; // Colorado
// Real state names to FIPS codes, for the states the V1 region touches. Anything
// outside this table resolves to null rather than to a guess.
const FIPS = {
  Colorado: "CO",
  Nebraska: "NE",
  Wyoming: "WY",
  Kansas: "KS",
  "New Mexico": "NM",
  Utah: "UT",
};
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

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z,
  );
}

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

/** Split the region into a grid of small bboxes. Small queries get served. */
function cells() {
  const { south, west, north, east } = REGION.bbox;
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

async function fetchElevation() {
  const { south, west, north, east } = REGION.bbox;
  const z = REGION.elevationZoom;
  const x0 = lonToTileX(west, z);
  const x1 = lonToTileX(east, z);
  // Tile rows increase southward, so north maps to the lower row index.
  const y0 = latToTileY(north, z);
  const y1 = latToTileY(south, z);

  const tiles = [];
  let downloaded = 0;
  let bytes = 0;

  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const rel = join("elevation", String(z), String(x), `${y}.png`);
      const dest = join(OUT, rel);
      const url = `${ELEVATION_URL}/${z}/${x}/${y}.png`;
      if (await exists(dest)) {
        // Already fetched on a previous run. Reuse it rather than re-hammering AWS.
      } else {
        const buf = await fetchWithRetry(url, { attempts: 5 });
        // A terrarium tile is a PNG. Check the signature so an error page saved as
        // .png can never be mistaken for elevation.
        const isPng =
          buf.length > 8 &&
          buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        if (!isPng) {
          throw new Error(`tile ${z}/${x}/${y} is not a PNG (${buf.length} bytes)`);
        }
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, buf);
        downloaded += 1;
        bytes += buf.length;
      }
      // Relative to region.json, which sits in the same directory. A "world/" prefix
      // here would make the client resolve /world/world/... when joined.
      tiles.push({ z, x, y, path: rel.replace(/\\/g, "/") });
    }
  }
  console.log(
    `elevation: ${tiles.length} tiles at z${z} (${x1 - x0 + 1}x${y1 - y0 + 1}), ` +
      `${downloaded} new, ${(bytes / 1024 / 1024).toFixed(2)} MB downloaded`,
  );
  return tiles;
}

/**
 * Place populations for Colorado from the Census Bureau's sub-county estimates file.
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
async function fetchCensusPlaces() {
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
  const iState = col("STATE");
  const iName = col("NAME");
  const iBase = col("ESTIMATESBASE2020");
  const iEst = col("POPESTIMATE2020");

  const byName = new Map();
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f[iState] !== CENSUS_STATE) continue;
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
      population,
      estimate2020: Number(f[iEst]),
    });
  }
  if (byName.size === 0) {
    throw new Error("Census estimates file produced zero Colorado places. Refusing to continue.");
  }
  console.log(`census: ${byName.size} Colorado places from the Vintage 2024 estimates file`);
  return byName;
}

async function fetchSettlements() {
  const census = await fetchCensusPlaces();
  const seen = new Map();
  const hosts = new Set();
  let matched = 0;
  const unmatched = [];

  for (const [i, cell] of cells().entries()) {
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
        stateCode: FIPS[tagState] ?? null,
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

async function fetchNetwork() {
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
    for (const [i, cell] of cells().entries()) {
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

async function writeRegion(tiles) {
  await writeFile(
    join(OUT, "region.json"),
    JSON.stringify(
      {
        name: REGION.name,
        bbox: REGION.bbox,
        elevation: {
          encoding: "terrarium",
          formula: "elevation_metres = R * 256 + G + B / 256 - 32768",
          zoom: REGION.elevationZoom,
          tileSize: 256,
          tiles: tiles.map((t) => ({ z: t.z, x: t.x, y: t.y, path: t.path })),
        },
        retrieved: RETRIEVED,
        stateCoverage: {
          // OSM nodes in this region carry no `addr:state` tag, so per-settlement state
          // is null in the export rather than defaulted. What can be stated as fact is
          // that the region as a whole sits inside one state: the bounding box
          // 39.60-40.10 N, -105.60 to -104.80 W lies within Colorado's published
          // extent and does not reach the Nebraska, Kansas or Wyoming lines.
          region: "Colorado",
          regionCode: "CO",
          basis: "bounding box containment against the published state extent",
          settlementTagsPresent: 0,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

async function writeSettlements(list) {
  await writeFile(
    join(OUT, "settlements.json"),
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
    join(OUT, "network.json"),
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

async function main() {
  await mkdir(OUT, { recursive: true });
  RETRIEVED = new Date().toISOString().slice(0, 10);

  if (ONLY && ONLY.includes("elevation")) {
    const tiles = await fetchElevation();
    await writeRegion(tiles);
    console.log("wrote region.json");
    return;
  }

  if (ONLY && ONLY.includes("settlements")) {
    const { list } = await fetchSettlements();
    await writeSettlements(list);
    console.log("wrote settlements.json");
    return;
  }

  const tiles = await fetchElevation();
  await writeRegion(tiles);

  const { list, unmatched } = await fetchSettlements();
  await writeSettlements(list);

  const network = await fetchNetwork();
  await writeNetwork(network);

  // PHASES.md Phase 0 requires spot checks against real published figures. The
  // figures below are transcribed by hand from the published 2020 Census decennial
  // place counts (as quoted in Census QuickFacts), NOT from any dataset this script
  // downloaded, so the check is genuinely independent of what it is checking.
  //
  // Note on agreement: the client displays the Census estimates programme's 2020 base
  // (ESTIMATESBASE2020), which the Census revises when it corrects a geography. It is
  // therefore not always byte-identical to the published decennial count, so the check
  // is recorded as a signed delta and a relative error, not a boolean.
  const SPOT_CHECKS = [
    ["Denver", 715522],
    ["Lakewood", 155984],
    ["Thornton", 141867],
    ["Arvada", 124402],
    ["Westminster", 116317],
    ["Boulder", 108250],
    ["Longmont", 98885],
    ["Englewood", 32453],
    ["Littleton", 45652],
    ["Broomfield", 74112],
    ["Golden", 19475],
    ["Nederland", 1561],
  ];
  const spotRows = SPOT_CHECKS.map(([name, published]) => {
    const hit = list.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (!hit) {
      return {
        name,
        inRegion: false,
        ours: null,
        published,
        delta: null,
        relativeError: null,
        source: SPOT_SOURCE,
        note: "outside the V1 region bbox, so the client does not render it",
      };
    }
    if (hit.population === null) {
      return {
        name,
        inRegion: true,
        ours: null,
        published,
        delta: null,
        relativeError: null,
        source: SPOT_SOURCE,
        note: "no Census estimates row matched this OSM place name",
      };
    }
    const delta = hit.population - published;
    return {
      name,
      inRegion: true,
      ours: hit.population,
      published,
      delta,
      relativeError: Number((delta / published).toFixed(5)),
      source: SPOT_SOURCE,
      note: Math.abs(delta) === 0 ? "exact match" : "estimates-programme base vs decennial count",
    };
  });
  const comparable = spotRows.filter((r) => r.delta !== null);
  const exact = comparable.filter((r) => r.delta === 0).length;
  const worst = comparable.reduce((a, r) => Math.max(a, Math.abs(r.relativeError ?? 0)), 0);
  console.log(
    `spot check: ${comparable.length} places in region, ${exact} exact, ` +
      `worst relative error ${(worst * 100).toFixed(2)}%`,
  );
  await writeFile(
    join(OUT, "spot-check.json"),
    JSON.stringify(
      {
        note:
          "Client-side spot check of the settlements the client renders. Independent of " +
          "the downloaded dataset: these are published 2020 Census figures transcribed by hand.",
        source: SPOT_SOURCE,
        retrieved: RETRIEVED,
        rows: spotRows,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(OUT, "gaps.json"),
    JSON.stringify(
      {
        retrieved: RETRIEVED,
        note:
          "Datasets with no real coverage in this region, per CONSTITUTION.md section 1.1. " +
          "The client renders these as unknown rather than substituting a guess.",
        gaps: [
          ...unmatched.map((u) => ({
            field: `population`,
            entity: u.name,
            reason: "no incorporated place or Census-designated place of that name in the Census estimates file",
            handling: "client shows the settlement with no population and no derived class",
          })),
        ],
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `\nwrote region.json, settlements.json, network.json, spot-check.json, gaps.json ` +
      `to clients/campaign/public/world/`,
  );
}

const SPOT_SOURCE =
  "U.S. Census Bureau, 2020 Census Redistricting Data (P.L. 94-171) published place counts, " +
  "as quoted in Census QuickFacts";
const CENSUS_POPULATION_SOURCE =
  "U.S. Census Bureau, Vintage 2024 sub-county population estimates, ESTIMATESBASE2020";

main().catch((err) => {
  console.error(`\nWORLD DATA FETCH FAILED: ${err.message}`);
  process.exitCode = 1;
});
