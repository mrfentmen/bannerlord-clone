/**
 * MASTER_PLAN task 28: the campaign is an installable fullscreen PWA. These
 * tests pin the installability contract: the manifest carries every field the
 * install prompt requires, the icons it names exist at the declared sizes,
 * and the service worker handles install/activate/fetch.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "public");

/** Reads PNG dimensions straight from the IHDR chunk; no image library needed. */
function readPngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("PWA manifest (task 28)", () => {
  const manifestPath = join(PUBLIC, "manifest.webmanifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  it("declares the fields the install prompt requires", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("fullscreen");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("ships 192 and 512 icons plus a maskable icon, at the declared sizes", () => {
    const icons: { src: string; sizes: string; purpose?: string }[] = manifest.icons;
    expect(icons.length).toBeGreaterThanOrEqual(3);
    const sizes = new Set<string>();
    for (const icon of icons) {
      const file = join(PUBLIC, icon.src.replace(/^\//, ""));
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = icon.sizes.split("x").map(Number);
      const actual = readPngSize(file);
      expect(actual.width, `${icon.src} width`).toBe(w);
      expect(actual.height, `${icon.src} height`).toBe(h);
      sizes.add(icon.sizes);
    }
    expect(sizes.has("192x192")).toBe(true);
    expect(sizes.has("512x512")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("is linked from index.html with a matching theme color", () => {
    const html = readFileSync(join(PUBLIC, "..", "index.html"), "utf8");
    expect(html).toContain('rel="manifest"');
    expect(html).toContain("/manifest.webmanifest");
    expect(html).toContain(`content="${manifest.theme_color}"`);
  });
});

describe("service worker (task 28)", () => {
  const sw = readFileSync(join(PUBLIC, "sw.js"), "utf8");

  it("precaches the app shell on install and purges old caches on activate", () => {
    expect(sw).toContain('addEventListener("install"');
    expect(sw).toContain('addEventListener("activate"');
    expect(sw).toContain("/manifest.webmanifest");
    expect(sw).toContain("skipWaiting");
  });

  it("serves hashed assets from cache and falls back to cache for the rest", () => {
    expect(sw).toContain('addEventListener("fetch"');
    expect(sw).toContain("/assets/");
    expect(sw).toContain("caches.match");
  });
});
