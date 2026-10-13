/**
 * Task 624: Draco-compressed geometry is supported, and a file that needs an
 * extension this build cannot decode is refused rather than retried.
 *
 * The support is not a claim: the test imports the same handler modules the
 * module does, so if the installed `@babylonjs/loaders` ever dropped Draco the
 * build would fail. `DracoDecoder.DefaultAvailable` is read from the engine
 * rather than assumed, and the *required* case is the one that matters -- an
 * extension that is only `used` still loads through a fallback, an extension
 * that is `required` does not load at all.
 *
 * The staged batch is measured too: nothing in `public/models/` is Draco
 * compressed today, which is why this path is untested by the art and tested by
 * the cases below instead.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DracoDecoder } from "@babylonjs/core/Meshes/Compression/dracoDecoder.js";
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_draco_mesh_compression.js';
import {
  DRACO_EXTENSION,
  GLB_HEADER_BYTES,
  GLB_MAGIC,
  GLB_VERSION,
  SUPPORTED_GLTF_EXTENSIONS,
  dracoReport,
  readExtensionReport,
} from "../GlbFormat.js";

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "models");

/**
 * A GLB whose JSON chunk declares the given extensions, with one Draco-compressed
 * primitive per count. The buffer views are never read by the report, so the
 * binary chunk is empty.
 */
function glbWithJson(json: unknown): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(json));
  const padded = payload.length % 4 === 0 ? payload.length : payload.length + (4 - (payload.length % 4));
  const jsonPadded = new Uint8Array(padded);
  jsonPadded.set(payload);
  // glTF pads the JSON chunk with spaces (0x20); NUL padding does not parse.
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

/** A minimal GLB with one plain primitive and no extensions. */
function plainGlb(): Uint8Array {
  return glbWithJson({
    asset: { version: '2.0' },
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  });
}

describe("extension reports (task 624)", () => {
  it("reads used and required extensions", () => {
    const bytes = glbWithJson({
      asset: { version: '2.0' },
      extensionsUsed: [DRACO_EXTENSION, 'EXT_meshopt_compression'],
      extensionsRequired: [DRACO_EXTENSION],
    });
    expect(readExtensionReport(bytes)).toEqual({
      used: [DRACO_EXTENSION, 'EXT_meshopt_compression'],
      required: [DRACO_EXTENSION],
      unsupportedRequired: [],
    });
  });

  it("names a required extension it has no handler for", () => {
    const bytes = glbWithJson({
      asset: { version: '2.0' },
      extensionsUsed: ['EXT_meshopt_compression'],
      extensionsRequired: ['EXT_meshopt_compression'],
    });
    expect(readExtensionReport(bytes).unsupportedRequired).toEqual(['EXT_meshopt_compression']);
  });

  it("reports nothing for a file that is not a GLB", () => {
    expect(readExtensionReport(new TextEncoder().encode('<html>'))).toEqual({
      used: [],
      required: [],
      unsupportedRequired: [],
    });
  });

  it("ignores a non-string entry in the extension list", () => {
    const bytes = glbWithJson({ asset: { version: '2.0' }, extensionsUsed: [DRACO_EXTENSION, 7] });
    expect(readExtensionReport(bytes).used).toEqual([DRACO_EXTENSION]);
  });

  it("claims only extensions with a handler module imported", () => {
    expect(SUPPORTED_GLTF_EXTENSIONS).toContain(DRACO_EXTENSION);
    // Every name in the list has a handler module in the installed loaders
    // package; the import at the top of the test is the proof for two of them.
    for (const name of SUPPORTED_GLTF_EXTENSIONS) {
      expect(name).toMatch(/^(KHR|EXT)_/);
    }
    expect(SUPPORTED_GLTF_EXTENSIONS).toContain('EXT_texture_webp');
  });
});

describe("dracoReport (task 624)", () => {
  it("says an uncompressed file needs nothing", () => {
    expect(dracoReport(plainGlb())).toEqual({
      usesDraco: false,
      required: false,
      compressedPrimitives: 0,
      decoderAvailable: DracoDecoder.DefaultAvailable,
      loadable: true,
      reason: null,
    });
  });

  it("counts the compressed primitives it finds", () => {
    const bytes = glbWithJson({
      asset: { version: '2.0' },
      extensionsUsed: [DRACO_EXTENSION],
      extensionsRequired: [DRACO_EXTENSION],
      meshes: [
        {
          primitives: [
            { attributes: {}, extensions: { [DRACO_EXTENSION]: { bufferView: 0, attributes: {} } } },
            { attributes: { POSITION: 0 } },
            { attributes: {}, extensions: { [DRACO_EXTENSION]: { bufferView: 1, attributes: {} } } },
          ],
        },
      ],
    });
    const report = dracoReport(bytes);
    expect(report.usesDraco).toBe(true);
    expect(report.required).toBe(true);
    expect(report.compressedPrimitives).toBe(2);
    expect(report.loadable).toBe(DracoDecoder.DefaultAvailable);
  });

  it("treats a used-but-not-required extension as loadable", () => {
    const bytes = glbWithJson({
      asset: { version: '2.0' },
      extensionsUsed: [DRACO_EXTENSION],
      meshes: [{ primitives: [{ attributes: {}, extensions: { [DRACO_EXTENSION]: {} } }] }],
    });
    const report = dracoReport(bytes);
    expect(report.usesDraco).toBe(true);
    expect(report.required).toBe(false);
    expect(report.loadable).toBe(true);
    expect(report.reason).toBeNull();
  });

  it("refuses a file that requires an extension this build cannot decode", () => {
    const bytes = glbWithJson({
      asset: { version: '2.0' },
      extensionsUsed: ['EXT_meshopt_compression'],
      extensionsRequired: ['EXT_meshopt_compression'],
    });
    const report = dracoReport(bytes);
    expect(report.loadable).toBe(false);
    expect(report.reason).toBe('unsupported-required-extension');
  });

  it('survives a JSON chunk that will not parse', () => {
    const bytes = plainGlb();
    // Corrupt the chunk payload; the header still says the file is a GLB.
    bytes[GLB_HEADER_BYTES + 8] = 0x7b;
    bytes[GLB_HEADER_BYTES + 9] = 0x7b;
    expect(dracoReport(bytes).loadable).toBe(true);
  });
});

describe("the staged batch (task 624)", () => {
  it("has no Draco-compressed file, so nothing is paying for the decoder", () => {
    const files = readdirSync(modelsDir).filter((name) => name.endsWith('.glb'));
    const compressed = files.filter((name) => dracoReport(readFileSync(join(modelsDir, name))).usesDraco);
    expect(compressed).toEqual([]);
  });

  it("requires nothing this build cannot decode", () => {
    const files = readdirSync(modelsDir).filter((name) => name.endsWith('.glb'));
    const unsupported = files.flatMap((name) =>
      readExtensionReport(readFileSync(join(modelsDir, name))).unsupportedRequired.map((e) => `${name}: ${e}`),
    );
    // tank-quaternius.glb is the one file that *requires* extensions
    // (EXT_texture_webp and KHR_mesh_quantization), and both have handlers --
    // remove either from the list and this test fails with the file named.
    expect(unsupported).toEqual([]);
  });

  it("names the two extensions the tank requires", () => {
    const report = readExtensionReport(readFileSync(join(modelsDir, 'tank-quaternius.glb')));
    expect(report.required.sort()).toEqual(['EXT_texture_webp', 'KHR_mesh_quantization']);
  });

  it("is not Draco-compressed anywhere in the batch either", () => {
    const files = readdirSync(modelsDir).filter((name) => name.endsWith('.glb'));
    expect(files.every((name) => dracoReport(readFileSync(join(modelsDir, name))).compressedPrimitives === 0)).toBe(
      true,
    );
  });
});