#!/usr/bin/env node
/**
 * Fails the build if test fixtures can reach a production bundle.
 *
 * `agents/README.md` section 4: "Fixtures are allowed only as test fixtures and
 * clearly named as such. A fixture is never wired into a production path." Section 5
 * says the agent must prove it. This is the proof, and it runs as part of
 * `npm run build` before the bundle is even written.
 *
 * Two independent failures, because either one alone would be a promise:
 *  1. The production config must not resolve VITE_SIMULATION_SOURCE to `fixture`.
 *  2. The built output must not contain the fixture's marker strings.
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
 * Each one is checked against production code before it is listed, because a marker that
 * production also uses cannot detect anything: it stops the build for a bundle that is
 * clean. `daysPerRealSecond` used to be here and was one of them —
 * `HttpSimulationProvider.setTimeScale` posts a body of `{ daysPerRealSecond }`, which is
 * a property name and so survives minification, and the refused build was that line and
 * not the fixture. The price-response constant below replaces it: it appears nowhere
 * outside `src/data/fixture/fixtureProvider.ts`.
 */
const MARKERS = [
  "AGENT-3 TEST FIXTURE",
  "TEST FIXTURE DATA",
  "FixtureState",
  "mulberry32",
  "TOWN_SPECS",
  "priceElasticity",
];

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
      for (const marker of MARKERS) {
        if (text.includes(marker)) {
          const rel = file.slice(ROOT.length + 1);
          // The stub module in the fixture folder is fine: it is the module that
          // replaces the fixture, and its message is how the build failure explains
          // itself if it is ever reached at runtime.
          if (marker === "AGENT-3 TEST FIXTURE" && rel.includes("forbiddenInProduction")) continue;
          failures.push(`fixture marker ${JSON.stringify(marker)} found in ${rel}`);
        }
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
