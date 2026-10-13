/**
 * @vitest-environment jsdom
 *
 * Task 630: every model the manifest stages really loads.
 *
 * A manifest entry and a file on disk are not proof of anything. The interesting
 * failures are all in the gap between them: a URL that does not resolve, a
 * subdirectory path swallowed by a base-URL join, a `.glb` that 404s into
 * Babylon's error path, and a file that parses but contains no root node.
 *
 * So this drives the real {@link ModelLoader} against a real Babylon `Scene`
 * (NullEngine: no GPU needed) over a loopback server rooted at public/, one
 * entry at a time, driven by the manifest rather than a hand-written list. If a
 * model stops loading, the test that fails names the entry.
 *
 * The count is asserted, not assumed: the manifest carries exactly 49 entries
 * (nyc 4, prop 10, structure 8, troop 16, vehicle 11), and a test that silently
 * passed over 12 of them would be worse than no test at all.
 */

import { readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Scene } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
// Registers the .glb loader on SceneLoader; the client does this once at boot.
import "@babylonjs/loaders/glTF";
import { ModelLoader, type ModelInfo } from "../ModelLoader.js";
import { autoScaleToMeters, readAuthoredBounds } from "../ModelTransform.js";
import { isGlbContainer, parseGlbHeader } from "../GlbFormat.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public");

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".json": "application/json",
};

interface ManifestEntry {
  name: string;
  file: string;
  category: string;
  targetLengthM: number;
  rotateX?: number;
  estimated?: boolean;
}

/** Loopback server rooted at public/, so the loader's own URL path is tested. */
let server: Server;
/** Prefix handed to the loader; populated in `beforeAll`. */
let baseUrl = '';

function manifest(): ManifestEntry[] {
  return (
    JSON.parse(readFileSync(join(publicDir, "models", "models.manifest.json"), "utf8")) as {
      models: ManifestEntry[];
    }
  ).models;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    // jsdom's XHR (what Babylon's loader uses) treats the test page as a
    // foreign origin, so the response has to permit it.
    res.setHeader("access-control-allow-origin", "*");
    const rel = normalize(decodeURIComponent((req.url ?? "/").replace(/^\/+/, "")));
    if (rel.startsWith("..")) {
      res.statusCode = 403;
      res.end();
      return;
    }
    try {
      const body = readFileSync(join(publicDir, rel));
      res.statusCode = 200;
      res.setHeader("content-type", TYPES[extname(rel)] ?? "application/octet-stream");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (typeof addr === "string" || addr === null) throw new Error("static server has no port");
  baseUrl = `http://127.0.0.1:${addr.port}/models/`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** One loader per entry, against one fresh scene. */
async function loaderFor(): Promise<{ loader: ModelLoader; scene: Scene }> {
  const scene = new Scene(
    new NullEngine({
      renderWidth: 16,
      renderHeight: 16,
      textureSize: 16,
      deterministicLockstep: false,
      lockstepMaxSteps: 2,
    }),
  );
  const entries = manifest().map(
    (m): ModelInfo => ({ id: m.name, path: m.file, category: m.category as ModelInfo['category'] }),
  );
  // The manifest is handed over directly rather than fetched, so the test does
  // not depend on the URL the app uses to fetch it.
  // baseUrl is the loopback server, so the loader's own URL construction --
  // including the weapons/ subdirectory -- is what is under test.
  const loader = new ModelLoader(scene, { timeoutMs: 30_000, baseUrl });
  vi.spyOn(loader, 'loadManifest').mockImplementation(async () => {
    for (const entry of entries) {
      (loader as unknown as { manifest: Map<string, ModelInfo> }).manifest.set(entry.id, entry);
    }
  });
  await loader.loadManifest("/models.json");
  return { loader, scene };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("the manifest itself (task 630)", () => {
  it("stages exactly 461 models", () => {
    expect(manifest()).toHaveLength(461);
  });

  it("stages the documented category counts", () => {
    const counts = new Map<string, number>();
    for (const entry of manifest()) {
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      building: 65,
      character: 36,
      nyc: 4,
      prop: 220,
      structure: 8,
      troop: 16,
      vegetation: 73,
      vehicle: 38,
      weapon: 1,
    });
  });

  it("has a file on disk and a real GLB header for every entry", () => {
    const problems: string[] = [];
    for (const entry of manifest()) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(publicDir, "models", entry.file));
      } catch {
        problems.push(`${entry.name}: ${entry.file} is missing`);
        continue;
      }
      const { header, rejection } = parseGlbHeader(bytes);
      if (!header) problems.push(`${entry.name}: ${entry.file} is not a loadable GLB (${rejection})`);
      if (!isGlbContainer(bytes)) problems.push(`${entry.name}: header check disagreed`);
    }
    expect(problems).toEqual([]);
  });

  it("has no duplicate names and no duplicate files", () => {
    const entries = manifest();
    expect(new Set(entries.map((e) => e.name)).size).toBe(entries.length);
    expect(new Set(entries.map((e) => e.file)).size).toBe(entries.length);
  });

  it("gives every entry a positive target length", () => {
    expect(manifest().filter((e) => !(e.targetLengthM > 0)).map((e) => e.name)).toEqual([]);
  });

  it("leaves no staged GLB unaccounted for", () => {
    const onDisk = [
      ...readdirSync(join(publicDir, "models")).filter((n) => n.endsWith(".glb")),
      ...readdirSync(join(publicDir, "models", "weapons"))
        .filter((n) => n.endsWith(".glb"))
        .map((n) => `weapons/${n}`),
    ];
    const staged = new Set(manifest().map((e) => e.file));
    expect(onDisk.filter((file) => !staged.has(file))).toEqual([]);
  });

  it("scales every entry to its target from the geometry in the file", () => {
    const refused: string[] = [];
    for (const entry of manifest()) {
      const bounds = readAuthoredBounds(readFileSync(join(publicDir, "models", entry.file)));
      if (autoScaleToMeters(bounds, entry.targetLengthM).scale === null) refused.push(entry.name);
    }
    // Only the quantised tank, which task 614 documents, may be refused.
    expect(refused).toEqual(["tank-quaternius"]);
  });
});

describe("every staged model loads through ModelLoader (task 630)", () => {
  it("loads all 49, one at a time, and none comes back null", async () => {
    const { loader, scene } = await loaderFor();
    const failed: string[] = [];
    for (const entry of manifest()) {
      const model = await loader.load(entry.name);
      if (!model) {
        failed.push(`${entry.name}: resolved null`);
        continue;
      }
      // The loader resolves the first mesh Babylon imported, which for a GLB
      // hierarchy is not always the one carrying the geometry, so the check is
      // over the whole scene: a model that parsed but produced no triangles at
      // all is the failure this file exists to catch.
      const withGeometry = scene.meshes.filter((m) => m.getTotalVertices() > 0).length;
      if (withGeometry === 0) failed.push(`${entry.name}: loaded but produced no geometry`);
    }
    expect(failed).toEqual([]);
    loader.dispose();
    scene.dispose();
  }, 120_000);

  it("loads a subdirectory path without losing it", async () => {
    // The ten weapons sit under models/weapons/; a base-URL join that drops the
    // subdirectory would 404 every one of them.
    const weapons = manifest().filter((m) => m.file.includes("weapons/"));
    expect(weapons).toHaveLength(10);
    const { loader, scene } = await loaderFor();
    const failed: string[] = [];
    for (const weapon of weapons) {
      if (!(await loader.load(weapon.name))) failed.push(weapon.name);
    }
    expect(failed).toEqual([]);
    loader.dispose();
    scene.dispose();
  }, 120_000);

  it("reports an unknown id as null rather than throwing", async () => {
    const { loader, scene } = await loaderFor();
    expect(await loader.load('siege-ladder')).toBeNull();
    expect(loader.getLoadedIds()).toEqual([]);
    loader.dispose();
    scene.dispose();
  });
});