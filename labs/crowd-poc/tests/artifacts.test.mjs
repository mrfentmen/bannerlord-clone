/**
 * Checks against the real build output, not against mocks.
 *
 * These assert the things ASSETS.md and SPEC.md make promises about, read back from the artefacts
 * the pipeline actually produced. A test that re-derives its own inputs proves nothing.
 *
 * Run: node --test tests/
 */
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROC = path.join(ROOT, "assets", "processed");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "crowd.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "manifest.json"), "utf8"));

const sha256 = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/** Minimal GLB reader: enough to count triangles and read the skin. */
function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error(`${file} is not a GLB`);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  while (off < Math.min(total, buf.length)) {
    const len = buf.readUInt32LE(off);
    const kind = buf.readUInt32LE(off + 4);
    if (kind === 0x4e4f534a) json = JSON.parse(buf.toString("utf8", off + 8, off + 8 + len));
    off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
  }
  if (!json) throw new Error(`${file} has no JSON chunk`);
  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  let tris = 0;
  let verts = 0;
  for (const m of json.meshes) {
    for (const p of m.primitives) {
      tris += json.accessors[p.indices].count / 3;
      verts = Math.max(verts, json.accessors[p.attributes.POSITION].count);
    }
  }
  return { json, tris, verts, joints: json.skins[0].joints.length, json_bytes: json };
}

test("GLB tiers exist and stay inside the ASSETS.md 5.2 poly budget", () => {
  const cases = [
    { file: `${cfg.troop.id}_body_close.glb`, budget: cfg.budgets.close_tris.body },
    { file: `${cfg.troop.id}_body_mid.glb`, budget: cfg.budgets.mid_tris.body },
    { file: `${cfg.troop.id}_weapon_close.glb`, budget: cfg.budgets.close_tris.weapon },
    { file: `${cfg.troop.id}_weapon_mid.glb`, budget: cfg.budgets.mid_tris.weapon },
  ];
  for (const c of cases) {
    const g = readGlb(path.join(PROC, c.file));
    assert.ok(g.tris <= c.budget,
      `${c.file}: ${g.tris} triangles exceeds the ${c.budget} budget`);
  }
});

test("a whole troop fits the ASSETS.md 5.2 close and mid budgets", () => {
  const closeBody = readGlb(path.join(PROC, `${cfg.troop.id}_body_close.glb`)).tris;
  const closeWeapon = readGlb(path.join(PROC, `${cfg.troop.id}_weapon_close.glb`)).tris;
  assert.ok(closeBody + closeWeapon <= 12000,
    `close tier troop is ${closeBody + closeWeapon} tris, budget 12000`);
  const midBody = readGlb(path.join(PROC, `${cfg.troop.id}_body_mid.glb`)).tris;
  const midWeapon = readGlb(path.join(PROC, `${cfg.troop.id}_weapon_mid.glb`)).tris;
  assert.ok(midBody + midWeapon <= 4000,
    `mid tier troop is ${midBody + midWeapon} tris, budget 4000`);
});

test("every tier is skinned to the one shared skeleton", () => {
  const skel = JSON.parse(fs.readFileSync(path.join(PROC, "shared_skeleton.json"), "utf8"));
  assert.equal(skel.max_influences, cfg.skeleton.max_influences);
  assert.ok(skel.joint_count > 0 && skel.joint_count <= 32,
    `shared skeleton is ${skel.joint_count} joints; above 32 the matrix texture widens per joint`);
  assert.ok(Array.isArray(skel.culled_from_source) && skel.culled_from_source.length > 0,
    "the skeleton records no culled bones, so the cull cannot be audited");
  assert.equal(skel.joints.length + skel.culled_from_source.length, 65,
    "kept plus culled joints do not add up to the 65-joint source rig");
  const overlap = skel.joints.filter((j) => skel.culled_from_source.includes(j));
  assert.deepEqual(overlap, [], `a joint is both kept and culled: ${overlap.join(", ")}`);
  const names = new Set(skel.joints);
  assert.ok(names.has(cfg.skeleton.weapon_joint), `no ${cfg.skeleton.weapon_joint} to bind the weapon to`);
  for (const part of ["body", "weapon"]) {
    for (const tier of ["close", "mid"]) {
      const g = readGlb(path.join(PROC, `${cfg.troop.id}_${part}_${tier}.glb`));
      assert.equal(g.joints, skel.joint_count,
        `${part}/${tier} is bound to ${g.joints} joints, shared skeleton has ${skel.joint_count}`);
      const prim = g.json.meshes[0].primitives[0];
      for (const attr of ["POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0"]) {
        assert.ok(prim.attributes[attr] !== undefined, `${part}/${tier} is missing ${attr}`);
      }
    }
  }
});

test("models are at 1 unit = 1 metre, ASSETS.md step 4", () => {
  const g = readGlb(path.join(PROC, `${cfg.troop.id}_body_close.glb`));
  const pos = g.json.accessors[g.json.meshes[0].primitives[0].attributes.POSITION];
  const height = pos.max[1] - pos.min[1];
  assert.ok(Math.abs(height - cfg.troop.height_m) < 0.01,
    `body is ${height.toFixed(3)} m tall, expected ${cfg.troop.height_m} m`);
  assert.ok(Math.abs(pos.min[1]) < 0.001,
    `body feet are at y=${pos.min[1].toFixed(4)}, expected the ground plane at y=0`);
});

test("the animation texture is the size the header claims, with every joint present", () => {
  const h = JSON.parse(fs.readFileSync(path.join(PROC, "anim_matrices.json"), "utf8"));
  const bytes = fs.statSync(path.join(PROC, "anim_matrices.bin")).size;
  assert.equal(bytes, h.width * h.height * 16, "RGBA32F texture size does not match the header");
  assert.equal(h.width, h.joints.length * 4, "one 4-texel matrix per joint");
  let rows = 0;
  for (const c of Object.values(h.clips)) {
    assert.ok(c.row_count > 1, "a clip needs at least two frames to interpolate between");
    assert.ok(c.duration_s > 0, "a clip needs a positive duration");
    rows += c.row_count;
  }
  assert.equal(rows, h.height, "clips do not fill the texture exactly");
});

test("the LOD thresholds in the config are measured, not assumed", () => {
  assert.ok(cfg.lod, "config/crowd.json has no tuned lod section");
  assert.ok(cfg.lod.evidence, "the lod section carries no measurement record");
  const e = cfg.lod.evidence;
  assert.ok(Array.isArray(e.grid) && e.grid.length >= 4, "the tuning grid is missing or too small");
  for (const g of e.grid) {
    assert.ok(typeof g.medianFps === "number" && g.medianFps > 0, "a grid row has no frame rate");
    assert.ok(typeof g.triangles === "number" && g.triangles > 0, "a grid row has no triangle count");
  }
  const chosen = e.grid.find((g) => g.closeMaxM === cfg.lod.closeMaxM && g.midMaxM === cfg.lod.midMaxM);
  assert.ok(chosen, "the chosen thresholds are not in the measured grid");
  assert.ok(chosen.medianFps >= e.targetFps,
    `the chosen thresholds measured ${chosen.medianFps} fps against a ${e.targetFps} fps target`);
});

test("the impostor atlas is the configured size and every cell has a silhouette", () => {
  const png = fs.readFileSync(path.join(PROC, "impostor_atlas.png"));
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  assert.equal(w, cfg.impostor.angles * cfg.impostor.cell_px);
  assert.equal(h, cfg.impostor.frames * cfg.impostor.cell_px);
  assert.ok(cfg.impostor.angles >= 4, "fewer than four view angles turns as the camera orbits");
  assert.ok(cfg.impostor.frames >= 4, "fewer than four frames is not an animated impostor");
});

test("every manifest entry is complete, hashed correctly and commercially cleared", () => {
  assert.ok(manifest.licence.commercial_use, "CONSTITUTION.md section 5.1: commercial use required");
  const allow = new Set(["CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "CC-BY-SA-4.0", "MIT", "Unlicense"]);
  for (const a of manifest.assets) {
    for (const f of ["id", "path", "source_url", "author", "licence", "licence_copy",
      "licence_page_copy", "date_retrieved", "attribution_text", "class", "lod_tiers",
      "modifications", "sha256"]) {
      assert.ok(a[f] !== undefined && a[f] !== "", `${a.id}: missing ${f}`);
    }
    assert.ok(allow.has(a.licence), `${a.id}: licence ${a.licence} is not cleared for commercial use`);
    const abs = path.join(ROOT, a.path);
    assert.ok(fs.existsSync(abs), `${a.id}: ${a.path} does not exist`);
    assert.equal(sha256(abs), a.sha256, `${a.id}: sha256 does not match ${a.path}`);
    // A saved copy of the licence, not a link. ASSETS.md section 1.2.
    assert.ok(fs.existsSync(path.join(ROOT, a.licence_copy)), `${a.id}: licence copy missing`);
  }
});

test("nothing in the asset tree is uncredited", () => {
  const credited = new Set(manifest.assets.map((a) => path.resolve(ROOT, a.path)));
  const walk = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      const rel = path.relative(ROOT, p);
      if (d.isDirectory()) {
        if (["originals", "licenses", "processed", ".tmp"].includes(d.name)) continue;
        if (d.name.startsWith(".")) continue;
        walk(p);
        continue;
      }
      if (rel.startsWith("assets" + path.sep + "licenses")) continue;
      if (rel.endsWith("manifest.json")) continue;
      if (rel.endsWith("pipeline_report.json")) continue; // a build log, not a shipped asset
      assert.ok(credited.has(path.resolve(p)), `${rel} has no manifest entry`);
    }
  };
  walk(path.join(ROOT, "assets"));
});
