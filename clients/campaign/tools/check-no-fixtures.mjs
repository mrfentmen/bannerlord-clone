#!/usr/bin/env node
/**
 * Fails the build if test fixtures can reach a production bundle.
 *
 * `agents/README.md` section 4: "Fixtures are allowed only as test fixtures and
 * clearly named as such. A fixture is never wired into a production path." Section 5
 * says the agent must prove it. This is the proof, and it runs as part of
 * `npm run build` before the bundle is even written.
 *
 * Three independent failures, because any one alone would be a promise:
 *  1. The production config must not resolve VITE_SIMULATION_SOURCE to `fixture`.
 *  2. The built output must not contain the fixture's marker strings.
 *  3. No built sourcemap may list a fixture module as a source, which is the
 *     structural form of the same promise and covers the fixture's whole body
 *     rather than a handful of literals.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "dist");

/**
 * Strings that exist only inside the real fixture module. The build-time stub that
 * replaces it deliberately uses different wording, so a hit here means real fixture
 * code reached the output rather than the stub that was supposed to.
 *
 * `createFixtureSimulationProvider` is deliberately NOT a marker: the stub has to
 * export the same name for provider.ts to resolve, and a sourcemap of the stub
 * therefore contains it. Every marker here is a name or a string that appears only in
 * the fixture's own body, which is what the rule is about.
 *
 * `daysPerRealSecond` used to be in this list and was removed on 2026-10-01: it is
 * not fixture-only. It is the wire field the live provider posts to the simulation's
 * time-scale endpoint (`src/data/provider.ts`, `POST /v1/time-scale`), and the HUD
 * time dial calls it in production (`src/main.ts`). The bundle therefore contained it
 * with no fixture code anywhere near it, and the check refused honest builds. The
 * coverage it was standing in for is now held by FIXTURE_SOURCES below, which is
 * structural and cannot be satisfied by a name that merely looks fixture-ish.
 */
const MARKERS = [
  "AGENT-3 TEST FIXTURE",
  "TEST FIXTURE DATA",
  "FixtureState",
  "mulberry32",
  "TOWN_SPECS",
];

/**
 * The real fixture module, by path, as a sourcemap `sources` entry.
 *
 * String markers only prove the absence of a few literals. A sourcemap, by contrast,
 * embeds the full original text of every module that went into the bundle, so a single
 * hit here proves the fixture's code, constants and comments all shipped -- which is
 * the actual rule, and strictly stronger than any marker could be.
 *
 * The one permitted entry is the build-time stub. It is the module that *replaces* the
 * fixture in a non-development build, and it is supposed to be there: its job is to be
 * the thing that throws if a production path ever reaches for the fixture.
 */
const FIXTURE_SOURCES = [/src[/\\]data[/\\]fixture[/\\]/];
const FIXTURE_SOURCE_ALLOW = [/src[/\\]data[/\\]fixture[/\\]forbiddenInProduction\.ts$/];

const SCANNABLE = new Set([".js", ".mjs", ".css", ".html", ".map"]);

const failures = [];

async function collect(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collect(full)));
    } else if (SCANNABLE.has(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  // 1. The environment must not ask for fixtures.
  const envFiles = [".env", ".env.production", ".env.local", ".env.production.local"];
  for (const name of envFiles) {
    let text;
    try {
      text = await readFile(join(ROOT, name), "utf8");
    } catch {
      continue;
    }
    const line = text.split("\n").find((l) => /^\s*VITE_SIMULATION_SOURCE\s*=/.test(l));
    if (line && /=\s*fixture\b/.test(line)) {
      failures.push(`${name} sets VITE_SIMULATION_SOURCE=fixture. A production build must read the live simulation.`);
    }
  }

  // 2. The built output must not contain fixture code.
  let distExists = false;
  try {
    distExists = (await stat(DIST)).isDirectory();
  } catch {
    distExists = false;
  }
  if (!distExists) {
    failures.push("dist/ does not exist. Run this after `vite build`, not before.");
  } else {
    const files = await collect(DIST);
    if (files.length === 0) {
      failures.push("dist/ contains no buildable files. The build did not run.");
    }
    for (const file of files) {
      const text = await readFile(file, "utf8");
      const rel = file.slice(ROOT.length + 1);
      for (const marker of MARKERS) {
        if (text.includes(marker)) {
          // The stub module in the fixture folder is fine: it is the module that
          // replaces the fixture, and its message is how the build failure explains
          // itself if it is ever reached at runtime.
          if (marker === "AGENT-3 TEST FIXTURE" && rel.includes("forbiddenInProduction")) continue;
          failures.push(`fixture marker ${JSON.stringify(marker)} found in ${rel}`);
        }
      }
      if (extname(file) !== ".map") continue;

      // A sourcemap names every module that went into the bundle and carries its
      // original source text. A fixture module in that list is the fixture shipping,
      // whatever the minified output happens to look like. A malformed map is not
      // silently skipped: an unparseable sourcemap cannot be used as evidence, and
      // this check exists to produce evidence.
      let map;
      try {
        map = JSON.parse(text);
      } catch (err) {
        failures.push(`could not parse sourcemap ${rel} to check it for fixture code: ${err.message}`);
        continue;
      }
      for (const source of map.sources ?? []) {
        if (!FIXTURE_SOURCES.some((re) => re.test(source))) continue;
        if (FIXTURE_SOURCE_ALLOW.some((re) => re.test(source))) continue;
        failures.push(`fixture source ${JSON.stringify(source)} was bundled into ${rel}. Fixture code is in the production graph.`);
      }
    }
    console.log(`scanned ${files.length} built files in dist/ for fixture code`);
  }

  if (failures.length > 0) {
    console.error("\nBUILD REFUSED — test fixtures can reach a production path:\n");
    for (const f of failures) console.error(`  x ${f}`);
    console.error("\nSee agents/README.md section 4 and tools/check-no-fixtures.mjs.");
    process.exitCode = 1;
    return;
  }

  console.log("no fixture code in the production build");
}

main().catch((err) => {
  console.error(`CHECK FAILED TO RUN: ${err.message}`);
  process.exitCode = 1;
});
