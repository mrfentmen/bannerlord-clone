/**
 * @vitest-environment jsdom
 *
 * Runtime wiring for the staged weapon GLBs.
 *
 * Ten Quaternius weapons sit under public/models/weapons/ with manifest entries,
 * but a manifest entry and a file on disk are not proof that anything loads them.
 * The interesting failure here is a URL: the loader is handed
 * `MODELS_BASE_URL + entry.file`, so a subdirectory path has to survive that join
 * and actually resolve over HTTP, and a `.glb` has to parse as a real glTF
 * container rather than 404 into Babylon's error path.
 *
 * So this drives the real {@link ModelLibrary} against a real Babylon `Scene`
 * (NullEngine: no GPU needed) over a static server rooted at public/models, and
 * asserts each weapon spawns a node scaled to its manifest length. A weapon that
 * is staged but unreachable fails here rather than as a silent procedural
 * fallback at runtime.
 */

import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Scene } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
// Registers the .glb loader on SceneLoader. The client does this once at boot;
// here it has to be imported for the same reason.
import "@babylonjs/loaders/glTF";
import { LoadTimer } from "../../models/LoadTiming.js";
import { ModelLibrary, type ModelsManifest } from "../models.js";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "..", "..", "public");

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".json": "application/json",
};

/** Serve public/ over loopback so the loader's own URL path is what is tested. */
let server: Server;
let baseUrl: string;

function manifest(): ModelsManifest {
  return JSON.parse(
    readFileSync(join(publicDir, "models", "models.manifest.json"), "utf8"),
  ) as ModelsManifest;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    // jsdom's XMLHttpRequest (what Babylon's loader uses) treats the test page as a
    // foreign origin, so the response needs to permit it.
    res.setHeader("access-control-allow-origin", "*");
    const rel = normalize(decodeURIComponent((req.url ?? "/").replace(/^\/+/, "")));
    // Keep the static server inside public/ regardless of what is asked for.
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

function newScene(): Scene {
  return new Scene(
    new NullEngine({
      renderWidth: 32,
      renderHeight: 32,
      deterministicLockstep: false,
      textureSize: 32,
      lockstepMaxSteps: 2,
    }),
  );
}

const weapons = manifest().models.filter((m) => m.file.includes("weapons/"));

describe("staged weapon GLBs load through ModelLibrary", () => {
  it("the manifest still stages exactly ten weapons", () => {
    // Guards the filter itself: an empty list would make every case below pass
    // vacuously, which is the failure mode this file exists to prevent.
    expect(weapons).toHaveLength(10);
    expect(weapons.map((w) => w.name).sort()).toEqual([
      "weapon-ak74",
      "weapon-awm",
      "weapon-axmc",
      "weapon-m1911",
      "weapon-m24",
      "weapon-m3a1",
      "weapon-mp5a5",
      "weapon-p226",
      "weapon-scarl",
      "weapon-vss",
    ]);
  });

  it.each(weapons.map((w) => [w.name, w.file, w.targetLengthM] as const))(
    "%s spawns a node at its manifest length",
    async (name: string, file: string, targetLengthM: number) => {
      const scene = newScene();
      const library = new ModelLibrary(scene, baseUrl);
      const entry = weapons.find((w) => w.name === name)!;

      const root = await library.spawn(entry, `test_${name}`);

      expect(root, `${file} produced no root node`).not.toBeNull();
      // spawn() returns null rather than throwing when a load fails, so a null
      // here is the signature of an unreachable or unparseable file.
      expect(root, `${file} failed to load`).not.toBeNull();

      const min = root!.getHierarchyBoundingVectors().min;
      const max = root!.getHierarchyBoundingVectors().max;
      const longest = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
      expect(
        longest,
        `${file} longest axis should match targetLengthM ${targetLengthM}`,
      ).toBeCloseTo(targetLengthM, 3);

      // Auto-scale assumes the base sits at y = 0, so nothing should hang below
      // the ground plane after spawn.
      expect(min.y, `${file} sits below y=0`).toBeGreaterThanOrEqual(-1e-3);

      root!.dispose();
      scene.dispose();
    },
  );

  it("serves every weapon over HTTP without a 404", async () => {
    // The loader builds its URL as base + entry.file. If the subdirectory were
    // dropped or double-slashed, spawn() would return null; this pins the exact
    // URL the manifest implies.
    for (const w of weapons) {
      const res = await fetch(`${baseUrl}${w.file}`);
      expect(res.status, `${baseUrl}${w.file} should be served`).toBe(200);
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(buf.byteLength, `${w.file} should not be empty`).toBeGreaterThan(1024);
      // glTF 2.0 binary magic.
      expect(
        String.fromCharCode(...([...buf.slice(0, 4)] as [number, number, number, number])),
        `${w.file} should be a glTF binary container`,
      ).toBe("glTF");
    }
  });

  it("caches a container per entry and times only the real load once", async () => {
    const scene = newScene();
    let now = 0;
    const timer = new LoadTimer({ now: () => now, onWarn: () => {} });
    const library = new ModelLibrary(scene, baseUrl, timer);
    const entry = weapons[0]!;
    const a = library.container(entry);
    const b = library.container(entry);
    expect(a, "a second request should reuse the cached promise").toBe(b);
    now = 125;
    await a;
    expect(timer.all()).toEqual([{ id: entry.name, durationMs: 125 }]);
    scene.dispose();
  });

  it("records the time for a failed load before allowing retry", async () => {
    const scene = newScene();
    let now = 0;
    const timer = new LoadTimer({ now: () => now, onWarn: () => {} });
    const library = new ModelLibrary(scene, baseUrl, timer);
    const missing = { ...weapons[0]!, file: "weapons/__does_not_exist__.glb" };
    const pending = library.container(missing);
    now = 250;
    await expect(pending).rejects.toThrow();
    expect(timer.all()).toEqual([{ id: missing.name, durationMs: 250 }]);
    scene.dispose();
  });

  it("evicts a failed entry so a later retry can succeed", async () => {
    // A bad path must not poison the cache for that name forever.
    const scene = newScene();
    const library = new ModelLibrary(scene, baseUrl);
    const missing = { ...weapons[0]!, file: "weapons/__does_not_exist__.glb" };
    await expect(library.container(missing)).rejects.toThrow();
    // The name is the cache key; a good load under the same name must still work.
    await expect(library.container(weapons[0]!)).resolves.toBeTruthy();
    scene.dispose();
  });
});