/**
 * Browser smoke test: the staged weapon GLBs resolve and load over HTTP through
 * the real Babylon loader in the real browser.
 *
 * The vitest in scene/__tests__/weaponModels.test.ts drives ModelLibrary against a
 * Node static server and a NullEngine. That proves the manifest, the paths, and
 * the glTF containers. This proves the other half: that the files are actually
 * served from public/ by the app's own bundler at the URL the loader builds, and
 * that Babylon's browser XHR path parses them — jsdom's XHR is not the same
 * code, and a file that 404s under `vite preview` would not be caught there.
 *
 * It also pins the thing the vitest cannot: `ModelLibrary.container()` joins
 * `MODELS_BASE_URL` with a subdirectory `entry.file`, so `/models/` +
 * `weapons/ak74.glb` has to be a real served URL.
 */

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelEntry, ModelsManifest } from "../../src/scene/models";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "..", "public");

function weapons(): ModelEntry[] {
  const manifest = JSON.parse(
    readFileSync(join(publicDir, "models", "models.manifest.json"), "utf8"),
  ) as ModelsManifest;
  return manifest.models.filter((m) => m.file.includes("weapons/"));
}

test("every staged weapon is served and parses as glTF", async ({ page, baseURL }) => {
  await page.goto("/");

  const results = await page.evaluate(async (entries) => {
    const out: { name: string; status: number; bytes: number; magic: string; contentType: string }[] = [];
    for (const e of entries) {
      // Exactly how ModelLibrary builds it: base + entry.file.
      const res = await fetch(`/models/${e.file}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      out.push({
        name: e.name,
        status: res.status,
        bytes: buf.byteLength,
        magic: String.fromCharCode(...([...buf.slice(0, 4)] as [number, number, number, number])),
        contentType: res.headers.get("content-type") ?? "",
      });
    }
    return out;
  }, weapons());

  expect(results).toHaveLength(10);
  for (const r of results) {
    expect(r.status, `${r.name} should be served from public/models`).toBe(200);
    expect(r.bytes, `${r.name} should not be an empty response`).toBeGreaterThan(1024);
    expect(r.magic, `${r.name} should be a glTF binary container`).toBe("glTF");
    expect(r.contentType, `${r.name} should be served as a binary model`).toContain("gltf");
  }
  expect(baseURL).toBeTruthy();
});

test("the model's own manifest URL is reachable from the page", async ({ page }) => {
  await page.goto("/");
  // This is loadModelsManifest's URL; if it moved, the whole library is dead.
  const res = await page.evaluate(async () => {
    const r = await fetch("/models/models.manifest.json");
    return { status: r.status, count: ((await r.json()) as { models: unknown[] }).models.length };
  });
  expect(res.status).toBe(200);
  expect(res.count).toBeGreaterThanOrEqual(48);
});