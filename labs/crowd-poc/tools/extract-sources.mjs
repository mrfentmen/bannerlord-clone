/**
 * Unpack the downloaded originals into the layout the pipeline expects, without editing anything.
 *
 * ASSETS.md section 2.3: originals are stored as downloaded. The zips stay untouched in
 * assets/originals/; this extracts the few files the pipeline reads into the same directory, so
 * every byte the pipeline consumes is still traceable to a hashed original.
 *
 * Run: node tools/extract-sources.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIG = path.join(ROOT, "assets", "originals");

const JOBS = [
  { zip: "Universal Base Characters[Standard].zip", into: "body" },
  { zip: "Universal Animation Library 2[Standard].zip", into: "body" },
  { zip: "Ultimate Gun Pack by Quaternius.zip", into: "guns" },
];

for (const job of JOBS) {
  const zip = path.join(ORIG, job.zip);
  if (!fs.existsSync(zip)) {
    console.error(`missing original: ${job.zip} -- run tools/fetch-assets.mjs`);
    process.exit(1);
  }
  const dest = path.join(ORIG, job.into);
  fs.mkdirSync(dest, { recursive: true });
  execFileSync("unzip", ["-qo", zip, "-d", dest], { stdio: "inherit" });
  console.log(`extracted ${job.zip} -> assets/originals/${job.into}/`);
}

// Report what the pipeline will read, so a missing or renamed source is obvious.
const expect = [
  "body/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf",
  "body/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.bin",
  "body/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb",
  "guns/OBJ/AssaultRifle_1.obj",
];
let bad = 0;
for (const e of expect) {
  const p = path.join(ORIG, e);
  const ok = fs.existsSync(p);
  if (!ok) bad++;
  console.log(`${ok ? "ok     " : "MISSING"} ${e}${ok ? `  ${fs.statSync(p).size} bytes` : ""}`);
}
if (bad) {
  console.error(`\n${bad} expected source file(s) missing. The zips may have changed layout.`);
  process.exit(1);
}
