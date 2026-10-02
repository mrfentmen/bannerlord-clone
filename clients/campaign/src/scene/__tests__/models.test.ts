/**
 * Model registry tests.
 *
 * The pure helpers are checked against hand-computed values and the real
 * accessor bounds measured from the staged GLBs. The manifest is checked
 * against the files actually on disk, so a renamed or dropped GLB fails
 * loudly instead of silently breaking the convoy upgrade. Every staged GLB is structurally
 * validated (glTF 2.0 container, POSITION accessor bounds) — the bounds are what the loader's
 * auto-scale depends on, so the staging note's orientation claims are re-verified here too.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  longestAxisScale,
  modelByName,
  validateModelsManifest,
  type ModelsManifest,
} from "../models.js";

const here = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(here, "..", "..", "..", "public", "models");

function readManifest(): ModelsManifest {
  return JSON.parse(readFileSync(join(modelsDir, "models.manifest.json"), "utf8"));
}

/**
 * Every staged model file, as manifest-relative POSIX paths, recursing into
 * subdirectories (the weapon set lives under `weapons/`). `readdirSync` on
 * its own is non-recursive, which previously made those ten entries look like
 * missing files.
 */
function listModelFiles(dir = modelsDir, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listModelFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

describe("longestAxisScale", () => {
  it("scales the longest axis to the target length", () => {
    expect(longestAxisScale({ x: 2, y: 4, z: 10 }, 10)).toBe(1);
    expect(longestAxisScale({ x: 1, y: 1, z: 1 }, 5)).toBe(5);
    // troop-officer.glb lies flat along Z: real accessor bounds (0.63, 0.43, 1.0).
    expect(longestAxisScale({ x: 0.63, y: 0.43, z: 1.0 }, 1.8)).toBeCloseTo(1.8, 6);
  });

  it("returns 1 for degenerate input instead of NaN or Infinity", () => {
    expect(longestAxisScale({ x: 0, y: 0, z: 0 }, 6)).toBe(1);
    expect(longestAxisScale({ x: 1, y: 1, z: 1 }, 0)).toBe(1);
    expect(longestAxisScale({ x: 1, y: 1, z: 1 }, -3)).toBe(1);
  });
});

describe("validateModelsManifest", () => {
  it("flags a missing file and an unlisted file", () => {
    const manifest: ModelsManifest = {
      version: 1,
      models: [
        { name: "humvee", file: "humvee.glb", category: "vehicle", targetLengthM: 6 },
        { name: "ghost", file: "ghost.glb", category: "vehicle", targetLengthM: 6 },
      ],
    };
    const errors = validateModelsManifest(manifest, ["humvee.glb", "stray.glb"]);
    expect(errors).toContain("manifest entry ghost -> missing file ghost.glb");
    expect(errors).toContain("on-disk stray.glb has no manifest entry");
  });

  it("flags duplicates and non-positive target lengths", () => {
    const manifest: ModelsManifest = {
      version: 1,
      models: [
        { name: "humvee", file: "humvee.glb", category: "vehicle", targetLengthM: 6 },
        { name: "humvee", file: "humvee.glb", category: "vehicle", targetLengthM: 0 },
      ],
    };
    const errors = validateModelsManifest(manifest, ["humvee.glb"]);
    expect(errors.some((e) => e.startsWith("duplicate model name"))).toBe(true);
    expect(errors.some((e) => e.includes("non-positive targetLengthM"))).toBe(true);
  });
});

describe("staged models manifest", () => {
  it("is consistent with the GLB files on disk", () => {
    const manifest = readManifest();
    const files = listModelFiles();
    // Manifest entries and on-disk GLBs must correspond exactly, in both
    // directions. `validateModelsManifest` checks each mapping, so the count
    // is asserted from disk rather than hardcoded — adding an asset updates
    // the manifest and this test follows it instead of failing on a literal.
    expect(validateModelsManifest(manifest, files)).toEqual([]);
    const glbOnDisk = files.filter((f) => f.endsWith(".glb"));
    expect(manifest.models).toHaveLength(glbOnDisk.length);
  });

  it("keeps the troop-officer upright fix and the sandbags estimate documented", () => {
    const manifest = readManifest();
    const officer = modelByName(manifest, "troop-officer");
    expect(officer?.rotateX).toBeCloseTo(-Math.PI / 2, 10);
    const sandbags = modelByName(manifest, "sandbags");
    expect(sandbags?.estimated).toBe(true);
    expect(sandbags?.targetLengthM).toBeGreaterThan(0);
  });

  it("has the convoy vehicles the scene wires up", () => {
    const manifest = readManifest();
    expect(modelByName(manifest, "humvee")?.targetLengthM).toBe(6);
    expect(modelByName(manifest, "pickup-truck")?.targetLengthM).toBe(7);
  });
});

describe("staged GLB files", () => {
  interface GlbInfo {
    json: {
      meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number> }> }>;
      accessors?: Array<{ min?: number[]; max?: number[] }>;
    };
  }

  /** Parse the GLB container (not the glTF scene): magic, version, JSON chunk. */
  function parseGlb(path: string): GlbInfo {
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    const jsonLength = bytes.readUInt32LE(12);
    expect(bytes.subarray(16, 20).toString("ascii")).toBe("JSON");
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    return { json };
  }

  /** Union of POSITION accessor bounds across every mesh primitive. */
  function positionBounds(json: GlbInfo["json"]): { min: number[]; max: number[] } {
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    let found = false;
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives ?? []) {
        const ai = prim.attributes?.POSITION;
        if (ai === undefined) continue;
        const acc = json.accessors?.[ai];
        // The loader's auto-scale needs these bounds; a missing min/max is a
        // broken staging, not a client bug.
        expect(Array.isArray(acc?.min) && acc.min.length === 3).toBe(true);
        expect(Array.isArray(acc?.max) && acc.max.length === 3).toBe(true);
        found = true;
        const lo = acc!.min!;
        const hi = acc!.max!;
        for (let i = 0; i < 3; i++) {
          mins[i] = Math.min(mins[i]!, lo[i]!);
          maxs[i] = Math.max(maxs[i]!, hi[i]!);
        }
      }
    }
    expect(found).toBe(true);
    return { min: mins, max: maxs };
  }

  it("every staged GLB is valid glTF 2.0 with POSITION bounds", () => {
    const manifest = readManifest();
    expect(manifest.models.length).toBeGreaterThan(0);
    for (const entry of manifest.models) {
      const { json } = parseGlb(join(modelsDir, entry.file));
      positionBounds(json);
    }
  });

  it("troop-officer really does lie flat along Z (the rotateX fix)", () => {
    const manifest = readManifest();
    const officer = modelByName(manifest, "troop-officer")!;
    const { json } = parseGlb(join(modelsDir, officer.file));
    const { min, max } = positionBounds(json);
    const extents = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
    const longest = extents.indexOf(Math.max(...extents));
    // A standing figure's longest axis is Y; the officer's is Z, hence the fix.
    expect(longest).toBe(2);
    expect(officer.rotateX).toBeCloseTo(-Math.PI / 2, 10);
  });

  it("the regen officer.glb stands upright with no rotateX fix", () => {
    const manifest = readManifest();
    const officer = modelByName(manifest, "officer")!;
    expect(officer.rotateX).toBeUndefined();
    const { json } = parseGlb(join(modelsDir, officer.file));
    const { min, max } = positionBounds(json);
    const extents = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
    expect(extents.indexOf(Math.max(...extents))).toBe(1);
  });
});
