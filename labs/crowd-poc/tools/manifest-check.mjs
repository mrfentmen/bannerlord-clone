/**
 * ASSETS.md section 2.2 build check.
 *
 * "An asset file with no manifest entry, or a manifest entry whose hash does not match the file,
 * FAILS THE BUILD. It does not warn. Shipping an unlicensed asset must be impossible, not
 * discouraged."
 *
 * So this exits non-zero, and it runs as part of `npm run build`.
 *
 * It checks both directions, which is the part that matters:
 *   - every manifest entry points at a file that exists and hashes to the recorded value
 *   - every asset file in the tree HAS an entry, so nothing slips in uncredited
 * and it enforces the commercial-use rule from CONSTITUTION.md section 5.1, plus that the saved
 * licence copy and the saved licence page both exist for every source.
 *
 * Run: node tools/manifest-check.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "assets");
const errors = [];
const warnings = [];

const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

// CONSTITUTION.md section 5.1: "Only assets cleared for commercial use are allowed in the repo."
// An allowlist, not a denylist, so a new licence has to be reviewed before it can ship.
const COMMERCIAL_OK = new Set(["CC0-1.0", "CC0-1.0-URL", "CC-BY-4.0", "CC-BY-3.0", "CC-BY-SA-4.0",
  "CC-BY-SA-3.0", "MIT", "Unlicense", "ODbL-1.0"]);

const manifestPath = path.join(ASSETS, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("FAIL  assets/manifest.json is missing. Run tools/build-assets.mjs.");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (!manifest.assets || !Array.isArray(manifest.assets)) {
  console.error("FAIL  manifest has no assets array");
  process.exit(1);
}

// ---- the licence itself
const lic = manifest.licence ?? {};
if (!lic.commercial_use) {
  errors.push("manifest.licence.commercial_use is not true (CONSTITUTION.md section 5.1)");
}
if (lic.legal_code && !fs.existsSync(path.join(ROOT, lic.legal_code))) {
  errors.push(`manifest.licence.legal_code points at a missing file: ${lic.legal_code}`);
}

// ---- every entry must be complete, hashed correctly, and commercially cleared
const seenIds = new Set();
const coveredPaths = new Set();

for (const a of manifest.assets) {
  const where = `entry "${a.id ?? "<no id>"}"`;
  for (const field of ["id", "path", "source_url", "source_site", "author", "licence",
    "licence_copy", "licence_page_copy", "date_retrieved", "attribution_text", "class",
    "lod_tiers", "modifications", "sha256"]) {
    if (a[field] === undefined || a[field] === null || a[field] === "") {
      errors.push(`${where}: missing required field "${field}" (ASSETS.md section 2.1)`);
    }
  }
  if (seenIds.has(a.id)) errors.push(`${where}: duplicate id`);
  seenIds.add(a.id);

  if (!COMMERCIAL_OK.has(a.licence)) {
    errors.push(`${where}: licence "${a.licence}" is not on the commercial-use allowlist`);
  }

  const abs = path.join(ROOT, a.path ?? "");
  if (!fs.existsSync(abs)) {
    errors.push(`${where}: path does not exist: ${a.path}`);
    continue;
  }
  coveredPaths.add(path.resolve(abs));

  const got = sha256(abs);
  if (got !== a.sha256) {
    errors.push(`${where}: sha256 mismatch on ${a.path}\n        manifest ${a.sha256}\n        on disk  ${got}`);
  }

  for (const f of [a.licence_copy, a.licence_page_copy]) {
    if (f && !fs.existsSync(path.join(ROOT, f))) {
      errors.push(`${where}: saved licence copy is missing: ${f} (ASSETS.md section 1.2)`);
    }
  }
  if (typeof a.date_retrieved === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(a.date_retrieved)) {
    errors.push(`${where}: date_retrieved is not an ISO date: ${a.date_retrieved}`);
  }
}

// ---- nothing in the tree may be uncredited. This is the direction that catches a new file.
const SKIP_DIRS = new Set(["originals", "licenses", "processed", ".tmp"]);
const SKIP_FILES = new Set(["manifest.json"]); // the manifest is the record, not a recorded asset
function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (SKIP_DIRS.has(d.name) || d.name.startsWith(".")) continue;
      walk(p);
    } else {
      const rel = path.relative(ROOT, p);
      if (rel.startsWith("assets/licenses/")) continue;
      if (SKIP_FILES.has(path.basename(rel))) continue;
      if (!coveredPaths.has(path.resolve(p))) {
        errors.push(`UNLICENSED FILE: ${rel} has no manifest entry (CONSTITUTION.md section 5.2)`);
      }
    }
  }
}
walk(ASSETS);

// ---- originals are kept unedited, and each downloaded archive has a recorded hash.
// The .sha256 sidecars are named by pack id, not by archive name, so match on their contents.
const origDir = path.join(ASSETS, "originals");
const recorded = new Set();
for (const f of fs.readdirSync(origDir)) {
  if (!f.endsWith(".sha256")) continue;
  for (const line of fs.readFileSync(path.join(origDir, f), "utf8").split("\n")) {
    const m = line.trim().match(/^[0-9a-f]{64}\s+(.+)$/);
    if (m) recorded.add(m[1]);
  }
}
for (const f of fs.readdirSync(origDir)) {
  if (f.endsWith(".zip") && !recorded.has(f)) {
    errors.push(`original ${f} has no recorded sha256 (ASSETS.md section 2.3)`);
  }
}

// ---- report
console.log(`manifest: ${manifest.assets.length} entries, licence ${lic.spdx} (commercial use: ${lic.commercial_use})`);
for (const a of manifest.assets) {
  console.log(`  ok  ${a.licence.padEnd(9)} ${String(a.bytes ?? "?").padStart(9)}  ${a.id}`);
}
for (const w of warnings) console.log(`  warn  ${w}`);
if (errors.length) {
  console.error(`\nMANIFEST CHECK FAILED (${errors.length} problem(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nMANIFEST CHECK PASSED");
