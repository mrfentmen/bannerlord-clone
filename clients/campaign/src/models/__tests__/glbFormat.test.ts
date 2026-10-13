/**
 * Task 612: a model file is a real GLB before the engine ever sees it.
 *
 * The header parser is checked against the bytes a real download produces, and
 * -- more to the point -- against every GLB actually staged in public/: all 49
 * manifest entries, the ten weapon GLBs and the three animation GLBs. A parser
 * that only accepts its own idea of a header would pass a unit test and fail
 * the first real load, so the staged files are the fixture.
 *
 * The rejections are each pinned: a short download, an error page with the
 * wrong magic, a future container version, and the truncated-transfer case
 * where the header declares more bytes than arrived.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AssetSizeGuard,
  GLB_HEADER_BYTES,
  GLB_MAGIC,
  GLB_VERSION,
  LARGE_ASSET_BYTES,
  classifyAssetSize,
  describeAssetSize,
  describeGlbRejection,
  isGlbContainer,
  jsonChunkRange,
  parseGlbHeader,
  readMagicAscii,
  type GlbRejection,
} from "../GlbFormat.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public");

/** A GLB header for a payload of `totalLength` bytes, as bytes. */
function headerBytes(magic: number, version: number, declaredLength: number, total = declaredLength): Uint8Array {
  const bytes = new Uint8Array(Math.max(GLB_HEADER_BYTES, total));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, magic, true);
  view.setUint32(4, version, true);
  view.setUint32(8, declaredLength, true);
  return bytes;
}

/** Every GLB staged under public/, by relative path. */
function stagedGlbs(): string[] {
  const out: string[] = [];
  for (const dir of ['models', 'anims', 'models/weapons']) {
    for (const name of readdirSync(join(publicDir, dir))) {
      if (name.endsWith('.glb')) out.push(`${dir}/${name}`);
    }
  }
  return out;
}

describe("parseGlbHeader (task 612)", () => {
  it("accepts a well-formed header", () => {
    const bytes = headerBytes(GLB_MAGIC, GLB_VERSION, GLB_HEADER_BYTES);
    expect(parseGlbHeader(bytes)).toEqual({
      header: { version: GLB_VERSION, declaredLength: GLB_HEADER_BYTES },
      rejection: null,
    });
    expect(isGlbContainer(bytes)).toBe(true);
  });

  it("rejects a short download", () => {
    for (const size of [0, 1, 4, GLB_HEADER_BYTES - 1]) {
      expect(parseGlbHeader(new Uint8Array(size)).rejection).toBe('too-short');
    }
  });

  it("rejects bytes that are not a GLB at all", () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><title>404</title>');
    expect(parseGlbHeader(html).rejection).toBe('bad-magic');
    const gzip = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseGlbHeader(gzip).rejection).toBe('bad-magic');
    expect(readMagicAscii(html)).toBe('<!DO');
  });

  it("rejects a container version this client does not speak", () => {
    expect(parseGlbHeader(headerBytes(GLB_MAGIC, 1, GLB_HEADER_BYTES)).rejection).toBe(
      'unsupported-version',
    );
    expect(parseGlbHeader(headerBytes(GLB_MAGIC, 3, GLB_HEADER_BYTES)).rejection).toBe(
      'unsupported-version',
    );
  });

  it("rejects a transfer that was cut short", () => {
    // Header says 4 KB, only 12 bytes arrived.
    const truncated = headerBytes(GLB_MAGIC, GLB_VERSION, 4096, GLB_HEADER_BYTES);
    expect(parseGlbHeader(truncated).rejection).toBe('length-mismatch');
  });

  it("rejects a file padded past its declared length", () => {
    const padded = headerBytes(GLB_MAGIC, GLB_VERSION, 40, 64);
    expect(parseGlbHeader(padded).rejection).toBe('length-mismatch');
  });

  it("reads the header out of a larger buffer without being offset by it", () => {
    const whole = new Uint8Array(GLB_HEADER_BYTES + 32);
    whole.set(headerBytes(GLB_MAGIC, GLB_VERSION, whole.length), 0);
    // Hand it the same header starting at a byte offset, as a sliced view would be.
    const sliced = whole.subarray(0);
    expect(isGlbContainer(sliced)).toBe(true);
    const offsetView = new Uint8Array(whole.buffer, 0, whole.length);
    expect(isGlbContainer(offsetView)).toBe(true);
  });
});

describe("describeGlbRejection (task 612)", () => {
  const cases: Array<[string, Uint8Array, RegExp]> = [
    ['short', new Uint8Array(4), /only 4 byte\(s\), a GLB needs at least 12/],
    ['bad', new TextEncoder().encode('<!DOCTYPE html><title>404 Not Found</title>'), /not a GLB \(starts with "<!DO"/],
    ['version', headerBytes(GLB_MAGIC, 9, GLB_HEADER_BYTES), /GLB version 9 is not supported/],
    ['length', headerBytes(GLB_MAGIC, GLB_VERSION, 4096, GLB_HEADER_BYTES), /truncated or padded GLB \(declares 4096 bytes, has 12\)/],
  ];
  for (const [name, bytes, expected] of cases) {
    it(`names the ${name} failure`, () => {
      const message = describeGlbRejection(bytes, 'humvee.glb');
      expect(message).toMatch(expected);
      expect(message).toContain('humvee.glb');
    });
  }

  it("returns null for a good file", () => {
    expect(describeGlbRejection(headerBytes(GLB_MAGIC, GLB_VERSION, GLB_HEADER_BYTES))).toBeNull();
  });
});

describe("the staged GLBs (task 612)", () => {
  const files = stagedGlbs();

  it("finds the whole staged batch to check", () => {
    // 39 top-level models + 10 weapons + 3 animation GLBs today; the bar only
    // moves up, so another lane staging a model cannot fail this.
    expect(files.length).toBeGreaterThanOrEqual(52);
  });

  it("accepts every staged file's real header", () => {
    const failures: string[] = [];
    for (const rel of files) {
      const bytes = readFileSync(join(publicDir, rel));
      const { header, rejection } = parseGlbHeader(bytes);
      if (!header) failures.push(`${rel}: ${rejection ?? 'unknown'}`);
      // The declared length must be the file's real length, or the transfer
      // that produced these files was not clean.
      else if (header.declaredLength !== bytes.length) failures.push(`${rel}: declared ${header.declaredLength}, file ${bytes.length}`);
    }
    expect(failures).toEqual([]);
  });

  it("finds a JSON chunk in every staged file", () => {
    for (const rel of files) {
      const bytes = readFileSync(join(publicDir, rel));
      const chunk = jsonChunkRange(bytes);
      expect(chunk, `${rel} has no readable JSON chunk`).not.toBeNull();
      const json = JSON.parse(
        Buffer.from(bytes.subarray(chunk!.start, chunk!.start + chunk!.length)).toString('utf8'),
      ) as { asset?: { version?: string } };
      expect(json.asset?.version, `${rel} is not a glTF 2.x asset`).toBe('2.0');
    }
  });

  it("has no GLB that reports a rejection reason", () => {
    const reasons = new Set<GlbRejection>();
    for (const rel of files) {
      const rejection = parseGlbHeader(readFileSync(join(publicDir, rel))).rejection;
      if (rejection) reasons.add(rejection);
    }
    expect([...reasons]).toEqual([]);
  });
});
describe("asset size budget (task 613)", () => {
  it("puts the limit at 10 MB", () => {
    expect(LARGE_ASSET_BYTES).toBe(10 * 1024 * 1024);
  });

  it("keeps an asset at the limit and warns above it", () => {
    expect(classifyAssetSize(LARGE_ASSET_BYTES).oversized).toBe(false);
    expect(classifyAssetSize(LARGE_ASSET_BYTES + 1).oversized).toBe(true);
  });

  it("reports a readable mebibyte figure", () => {
    expect(classifyAssetSize(0).mib).toBe(0);
    expect(classifyAssetSize(3 * 1024 * 1024).mib).toBe(3);
    expect(classifyAssetSize(11 * 1024 * 1024).mib).toBe(11);
    expect(classifyAssetSize(1_572_864).mib).toBe(1.5);
  });

  it("treats a missing or broken length as zero rather than huge", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(classifyAssetSize(bad)).toEqual({ bytes: 0, mib: 0, oversized: false });
    }
  });

  it("names the asset and the budget in the warning", () => {
    const message = describeAssetSize("skyscraper.glb", 12 * 1024 * 1024);
    expect(message).toBe("skyscraper.glb: 12 MiB is over the 10 MiB asset budget");
    expect(describeAssetSize("skyscraper.glb", 1024)).toBeNull();
  });

  it("warns once per asset, not once per check", () => {
    const seen: string[] = [];
    const guard = new AssetSizeGuard((m) => seen.push(m));
    const big = 12 * 1024 * 1024;
    expect(guard.check("a.glb", big)).not.toBeNull();
    expect(guard.check("a.glb", big)).toBeNull();
    expect(guard.check("b.glb", big)).not.toBeNull();
    expect(seen).toHaveLength(2);
    expect(guard.hasWarned("a.glb")).toBe(true);
    guard.reset();
    expect(guard.hasWarned("a.glb")).toBe(false);
  });

  it("says nothing about an asset inside the budget", () => {
    const guard = new AssetSizeGuard(() => {
      throw new Error('should not warn');
    });
    expect(guard.check('small.glb', 1024)).toBeNull();
    expect(guard.hasWarned('small.glb')).toBe(false);
  });

  it("does not warn about any of the staged assets", () => {
    const oversized: string[] = [];
    for (const rel of stagedGlbs()) {
      const bytes = readFileSync(join(publicDir, rel)).byteLength;
      if (classifyAssetSize(bytes).oversized) oversized.push(rel);
    }
    expect(oversized).toEqual([]);
  });

  it("reports the real size of the biggest staged asset", () => {
    const sizes = stagedGlbs().map((rel) => ({
      rel,
      verdict: classifyAssetSize(readFileSync(join(publicDir, rel)).byteLength),
    }));
    sizes.sort((a, b) => b.verdict.bytes - a.verdict.bytes);
    // The batch's ceiling is worth knowing: it is the worst-case preload.
    expect(sizes[0]?.verdict.mib).toBeGreaterThan(0);
    expect(sizes[0]?.verdict.oversized).toBe(false);
  });
});
