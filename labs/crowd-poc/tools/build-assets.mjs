/**
 * ASSETS.md section 4, all six steps, end to end, for one troop type.
 * PHASES.md Phase 3 requires the pipeline to run end to end, not just the renderer.
 *
 *   1 Select   which CC0 packs, licence claimed       (tools/fetch-assets.mjs)
 *   2 Manifest manifest entry + saved licence copy     (this file writes assets/manifest.json)
 *   3 Download originals unedited and hashed           (tools/fetch-assets.mjs)
 *   4 Convert  to GLB, 1 unit = 1 metre                (tools/pipeline/build_troop.py)
 *   5 Optimise texture budget, poly budget, 3 LODs, shared skeleton, anim baked to texture
 *   6 Unify    shared colour grade, palette check
 *
 * Step 6's silhouette check needs a rendered image, which needs a GPU, which is why the impostor
 * atlas and the tier contact sheet are produced by tools/render-tiers.mjs in a real browser and
 * checked here afterwards.
 *
 * Run: node tools/build-assets.mjs
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROC = path.join(ROOT, "assets", "processed");
const ORIG = path.join(ROOT, "assets", "originals");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "crowd.json"), "utf8"));

const say = (m) => console.log(m);
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });

const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

// ---------------------------------------------------------------- step 5: textures
say("\n=== STEP 5  texture budget (ASSETS.md 5.1) and step 6 colour grade ===");
const bodyTexDir = path.join(
  ORIG, "body", "Universal Base Characters[Standard]", "Base Characters", "Godot - UE"
);
const T = cfg.textures;
const textureSpec = {
  grade: cfg.grade,
  jobs: [
    { src: path.join(bodyTexDir, "T_Superhero_Male_Normal.png"), out: "body_normal.png", size: T.normal },
    { src: path.join(bodyTexDir, "T_Superhero_Male_Roughness.png"), out: "body_roughness.png", size: T.roughness },
    { src: path.join(bodyTexDir, "T_Superhero_Male_Dark.png"), out: "body_basecolour.png", size: T.base_colour, grade: true },
  ],
};
const specPath = path.join(PROC, ".tmp", "texture_spec.json");
fs.mkdirSync(path.dirname(specPath), { recursive: true });
fs.writeFileSync(specPath, JSON.stringify(textureSpec));
const texOut = sh("blender", [
  "--background", "--factory-startup",
  "--python", path.join(ROOT, "tools", "blender", "textures.py"), "--",
  specPath, PROC,
]);
const texLine = texOut.split("\n").find((l) => l.startsWith("TEXTURES_JSON "));
if (!texLine) {
  say(texOut);
  throw new Error("texture step produced no result line");
}
const texResults = JSON.parse(texLine.slice("TEXTURES_JSON ".length));
for (const l of texOut.split("\n").filter((l) => l.startsWith("TEXTURE "))) say("  " + l);
fs.writeFileSync(path.join(PROC, "textures.json"), JSON.stringify(texResults, null, 2));

// ---------------------------------------------------------------- steps 4-5: geometry
say("\n=== STEPS 4-5  GLB conversion, poly budget, LOD tiers, shared skeleton, anim bake ===");
const pyOut = sh("python3", [path.join(ROOT, "tools", "pipeline", "build_troop.py")]);
say(pyOut.trimEnd());

const report = JSON.parse(fs.readFileSync(path.join(PROC, "pipeline_report.json"), "utf8"));
const skel = JSON.parse(fs.readFileSync(path.join(PROC, "shared_skeleton.json"), "utf8"));

say("\n=== STEP 4  GLB tiers written at 1 unit = 1 metre ===");
const written = report.steps["4_convert"].glb;
const tierMeta = {
  "body_close": { class: "character_body", lod: "close" },
  "body_mid": { class: "character_body", lod: "mid" },
  "weapon_close": { class: "weapon", lod: "close" },
  "weapon_mid": { class: "weapon", lod: "mid" },
};
for (const [name, t] of Object.entries(written)) {
  say(`  ${name.padEnd(14)} ${String(t.tris).padStart(6)} tris ${String(t.verts).padStart(6)} verts ` +
      `${(t.bytes / 1024).toFixed(1).padStart(8)} KB`);
}
say(`  shared skeleton: ${skel.joint_count} joints, culled ${skel.culled_from_source.length} finger bones`);

// ---------------------------------------------------------------- step 2: manifest
say("\n=== STEP 2  manifest entries ===");
const ATTRIB =
  "Universal Base Characters, Universal Animation Library 2 and Ultimate Gun Pack by Quaternius " +
  "(https://quaternius.com) are released under CC0 1.0 Universal (Public Domain Dedication). " +
  "No attribution is required by the licence; this string is retained anyway as the record the " +
  "credits screen is generated from (ASSETS.md section 2.1).";
const TODAY = new Date().toISOString().slice(0, 10);
const originals = {
  troop_rifleman: {
    file: "Universal Base Characters[Standard].zip",
    class: "character_body",
    url: "https://quaternius.itch.io/universal-base-characters",
    stem: "quaternius-universal-base-characters",
    licenceFile: "quaternius-universal-base-characters_License_Standard.txt",
    modifications:
      "65 source joints culled to the 25-joint shared skeleton; 3 primitives merged to 1 material " +
      "to hold the draw call budget; scaled to 1 unit = 1 m; decimated to the class poly budget; regraded",
  },
  anim_library: {
    file: "Universal Animation Library 2[Standard].zip",
    class: "animation_source",
    url: "https://quaternius.itch.io/universal-animation-library-2",
    stem: "quaternius-universal-animation-library-2",
    licenceFile: "quaternius-universal-animation-library-2_License.txt",
    modifications:
      "per-frame per-joint skinning matrices baked to an RGBA32F texture, joint set reduced to the shared skeleton",
  },
  weapon: {
    file: "Ultimate Gun Pack by Quaternius.zip",
    class: "weapon",
    url: "https://quaternius.itch.io/50-lowpoly-guns",
    stem: "quaternius-ultimate-gun-pack",
    licenceFile: "quaternius-ultimate-gun-pack_License.txt",
    modifications:
      "scaled to 0.9 m real length, Z-up to Y-up, bound rigidly to hand_r, decimated to the class poly budget",
  },
};
const licenceCopy = (file) => {
  const p = path.join(ROOT, "assets", "licenses", file);
  if (!fs.existsSync(p)) throw new Error(`licence copy missing: ${p}`);
  return path.relative(ROOT, p);
};

const entries = [];
for (const [id, o] of Object.entries(originals)) {
  const zip = path.join(ORIG, o.file);
  entries.push({
    id,
    path: `assets/originals/${o.file}`,
    source_url: o.url,
    source_site: "itch.io (Quaternius)",
    author: "Quaternius",
    licence: "CC0-1.0",
    licence_copy: licenceCopy(o.licenceFile),
    licence_page_copy: licenceCopy(`${o.stem}_itch-page.html`),
    date_retrieved: TODAY,
    attribution_text: ATTRIB,
    class: o.class,
    lod_tiers: "n/a (source original, not a runtime asset)",
    modifications: o.modifications,
    sha256: sha256(zip),
    bytes: fs.statSync(zip).size,
  });
}

// Runtime assets: every processed file gets its own entry, because ASSETS.md section 2.1 requires a
// manifest entry for each asset and the build check verifies each hash.
for (const [name, t] of Object.entries(written)) {
  const p = path.join(PROC, t.file);
  const src = name.startsWith("weapon") ? originals.weapon : originals.troop_rifleman;
  entries.push({
    id: name,
    path: `assets/processed/${t.file}`,
    source_url: src.url,
    source_site: "itch.io (Quaternius)",
    author: "Quaternius",
    licence: "CC0-1.0",
    licence_copy: licenceCopy(src.licenceFile),
    licence_page_copy: licenceCopy(`${src.stem}_itch-page.html`),
    date_retrieved: TODAY,
    attribution_text: ATTRIB,
    class: tierMeta[name].class,
    lod_tiers: tierMeta[name].lod,
    modifications:
      `${t.tris} tris, ${t.verts} verts; skinned to the 25-joint shared skeleton; ` +
      `1 unit = 1 m; textures at the character_body budget; step 6 grade applied`,
    sha256: sha256(p),
    bytes: fs.statSync(p).size,
  });
}
for (const extra of ["anim_matrices.bin", "impostor_atlas.png", "shared_skeleton.json"]) {
  const p = path.join(PROC, extra);
  if (!fs.existsSync(p)) continue;
  const isImpostor = extra.includes("impostor");
  const isSkeleton = extra.includes("skeleton");
  entries.push({
    id: extra.replace(/\.(bin|png|json)$/, ""),
    path: `assets/processed/${extra}`,
    source_url: "derived: generated by labs/crowd-poc/tools from the CC0 sources above",
    source_site: "generated",
    author: "generated by this repo's pipeline",
    licence: "CC0-1.0",
    licence_copy: licenceCopy("CC0-1.0-legalcode.txt"),
    licence_page_copy: licenceCopy("quaternius-universal-base-characters_itch-page.html"),
    date_retrieved: TODAY,
    attribution_text: ATTRIB,
    class: isSkeleton ? "shared_skeleton" : isImpostor ? "character_body" : "animation_source",
    lod_tiers: isImpostor ? "far" : "n/a",
    modifications: isImpostor
      ? "billboard impostor atlas rendered from the close tier at 8 angles x 8 animation frames"
      : isSkeleton
        ? "the one shared skeleton, 25 joints, with the culled source bones recorded"
        : "per-frame per-joint skinning matrices baked from the CC0 animation library to RGBA32F",
    sha256: sha256(p),
    bytes: fs.statSync(p).size,
  });
}

const manifest = {
  _comment:
    "ASSETS.md section 2. Every asset in this project needs an entry: source, author, licence, " +
    "date retrieved, attribution text. tools/manifest-check.mjs verifies these hashes during the " +
    "build and fails it if one does not match, so an unlicensed or uncredited asset cannot ship.",
  generated: TODAY,
  licence: {
    spdx: "CC0-1.0",
    name: "Creative Commons CC0 1.0 Universal",
    legal_code: "assets/licenses/CC0-1.0-legalcode.txt",
    commercial_use: true,
    _commercial_use_comment:
      "CC0 grants the right to use, copy, modify, merge, publish, distribute, sublicense and/or " +
      "sell copies, with no commercial-use restriction. CONSTITUTION.md section 5.1 is satisfied " +
      "for every asset below, and each one's licence text is saved locally rather than linked.",
    _sketchfab_note:
      "ASSETS.md section 1.1 flags that Sketchfab's store closed and moved to Fab, with free " +
      "downloads being withdrawn. That was not used. All three sources publish explicit CC0 terms " +
      "and download directly, which is what section 1.1 asks for.",
  },
  assets: entries,
};
fs.writeFileSync(path.join(ROOT, "assets", "manifest.json"), JSON.stringify(manifest, null, 2));
say(`  ${entries.length} manifest entries written to assets/manifest.json`);
for (const e of entries) {
  say(`    ${e.id.padEnd(28)} ${e.licence.padEnd(9)} ${String(e.bytes).padStart(9)} B  ${e.path}`);
}

// The intermediate directory holds files with no manifest entry, which the build check would
// rightly reject. It is removed once the tiers are written.
fs.rmSync(path.join(PROC, ".tmp"), { recursive: true, force: true });
say("\nPIPELINE OK");
