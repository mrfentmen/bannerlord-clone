/**
 * Task 625: KTX2 / Basis Universal textures are supported.
 *
 * The support is a fact about the build, not a claim: the handler module is
 * imported by the module under test, so removing it breaks the build rather
 * than quietly degrading the first Basis-compressed model on the field. The
 * report also counts the compressed textures against the file's total, because
 * "uses KTX2" and "one texture out of forty is Basis" call for different
 * fallbacks.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_basisu.js';
import {
  GLB_HEADER_BYTES,
  GLB_MAGIC,
  GLB_VERSION,
  KTX2_EXTENSION,
  ktx2Report,
} from '../GlbFormat.js';

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "models");

/** A GLB whose JSON chunk is the given object; the binary chunk is empty. */
function glbWithJson(json: unknown): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(json));
  const padded = payload.length % 4 === 0 ? payload.length : payload.length + (4 - (payload.length % 4));
  const jsonPadded = new Uint8Array(padded);
  jsonPadded.set(payload);
  jsonPadded.fill(0x20, payload.length);
  const total = GLB_HEADER_BYTES + 8 + padded;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);
  view.setUint32(GLB_HEADER_BYTES, padded, true);
  bytes.set(new TextEncoder().encode('JSON'), GLB_HEADER_BYTES + 4);
  bytes.set(jsonPadded, GLB_HEADER_BYTES + 8);
  return bytes;
}

/** A file with two Basis textures and one ordinary PNG. */
function ktx2Glb(required: boolean): Uint8Array {
  return glbWithJson({
    asset: { version: '2.0' },
    extensionsUsed: [KTX2_EXTENSION],
    ...(required ? { extensionsRequired: [KTX2_EXTENSION] } : {}),
    images: [{ uri: 'a.ktx2' }, { uri: 'b.ktx2' }, { uri: 'c.png' }],
    textures: [
      { extensions: { [KTX2_EXTENSION]: { source: 0 } } },
      { extensions: { [KTX2_EXTENSION]: { source: 1 } } },
      { source: 2 },
    ],
  });
}

describe("ktx2Report (task 625)", () => {
  it("says a file with no textures needs nothing", () => {
    expect(ktx2Report(glbWithJson({ asset: { version: '2.0' } }))).toEqual({
      usesKtx2: false,
      required: false,
      ktx2Textures: 0,
      totalTextures: 0,
      handlerAvailable: true,
      loadable: true,
      reason: null,
    });
  });

  it("counts the Basis textures against the file's total", () => {
    const report = ktx2Report(ktx2Glb(false));
    expect(report.usesKtx2).toBe(true);
    expect(report.required).toBe(false);
    expect(report.ktx2Textures).toBe(2);
    expect(report.totalTextures).toBe(3);
    expect(report.loadable).toBe(true);
  });

  it("loads a required KTX2 file, because this build has the handler", () => {
    const report = ktx2Report(ktx2Glb(true));
    expect(report.required).toBe(true);
    expect(report.handlerAvailable).toBe(true);
    expect(report.loadable).toBe(true);
    expect(report.reason).toBeNull();
  });

  it("refuses a file that requires an extension with no handler here", () => {
    const report = ktx2Report(
      glbWithJson({
        asset: { version: '2.0' },
        extensionsUsed: ['EXT_meshopt_compression'],
        extensionsRequired: ['EXT_meshopt_compression'],
      }),
    );
    expect(report.loadable).toBe(false);
    expect(report.reason).toBe('unsupported-required-extension');
  });

  it("reports nothing for bytes that are not a GLB", () => {
    const report = ktx2Report(new TextEncoder().encode('<html>404</html>'));
    expect(report.totalTextures).toBe(0);
    expect(report.usesKtx2).toBe(false);
  });

  it("survives a JSON chunk it cannot parse", () => {
    const bytes = glbWithJson({ asset: { version: '2.0' }, textures: [{ source: 0 }] });
    bytes[GLB_HEADER_BYTES + 8] = 0x7b;
    bytes[GLB_HEADER_BYTES + 9] = 0x7b;
    expect(ktx2Report(bytes).totalTextures).toBe(0);
  });
});

describe("the staged batch (task 625)", () => {
  const files = readdirSync(modelsDir).filter((name) => name.endsWith('.glb'));

  it("has no Basis-compressed file today", () => {
    const compressed = files.filter((name) => ktx2Report(readFileSync(join(modelsDir, name))).usesKtx2);
    expect(compressed).toEqual([]);
  });

  it("has no file whose textures cannot be decoded here", () => {
    const broken = files.filter((name) => !ktx2Report(readFileSync(join(modelsDir, name))).loadable);
    expect(broken).toEqual([]);
  });

  it("does declare textures, so the counting is reading real files", () => {
    const withTextures = files.filter(
      (name) => ktx2Report(readFileSync(join(modelsDir, name))).totalTextures > 0,
    );
    // 32 of the 42 top-level models declare at least one texture; the rest are
    // materialless (the weapons, mostly), which is why the count is not 42.
    expect(withTextures.length).toBeGreaterThan(30);
  });
});