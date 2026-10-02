/**
 * GLB container header validation.
 *
 * Task 612: a model file is validated before it reaches the engine. A `.glb`
 * that is actually an HTML 404 page, a truncated upload, or a file whose
 * declared length disagrees with what arrived otherwise fails deep inside
 * Babylon's loader with a message about buffers, which is useless when the
 * real problem is the network.
 *
 * The check is the 12-byte GLB header, which is cheap and total:
 *
 * ```text
 * 0..3   magic   'glTF' as a little-endian uint32 (0x46546C67)
 * 4..7   version 2
 * 8..11  length  total byte length of the file, header included
 * ```
 *
 * This module reads bytes; it never fetches. A caller that wants to validate a
 * download validates the ArrayBuffer it received, so the same function covers
 * a `fetch` body, a Node `readFile` and a Blob.
 */

/** Header length of a GLB container, in bytes. */
export const GLB_HEADER_BYTES = 12;

/** `'glTF'` read as a little-endian uint32. */
export const GLB_MAGIC = 0x46546c67;

/** The only GLB container version this client speaks. */
export const GLB_VERSION = 2;

/** A parsed, self-consistent GLB header. */
export interface GlbHeader {
  version: number;
  /** Byte length the file declares, header included. */
  declaredLength: number;
}

/** Why a byte buffer is not a loadable GLB. */
export type GlbRejection =
  /** Fewer than 12 bytes: an empty or truncated download. */
  | 'too-short'
  /** Wrong magic: usually an error page or a renamed file. */
  | 'bad-magic'
  /** `glTF` header but a version this client does not support. */
  | 'unsupported-version'
  /** The declared length does not match the bytes actually present. */
  | 'length-mismatch';

export interface GlbHeaderResult {
  /** Present only when the bytes are a loadable GLB. */
  header: GlbHeader | null;
  /** Present only when they are not. */
  rejection: GlbRejection | null;
}

/** The four bytes a GLB starts with, as ASCII, for an error message. */
export function readMagicAscii(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < Math.min(4, bytes.length); i++) {
    out += String.fromCharCode(bytes[i] as number);
  }
  return out;
}

/**
 * Parses and checks a GLB header.
 *
 * The length check is the one that earns its keep: a server that cuts a
 * transfer short still sends the original header, so `declaredLength` is
 * larger than the buffer. Loading that gives a mesh with missing buffers,
 * which is far worse to diagnose than a rejected file.
 */
export function parseGlbHeader(bytes: Uint8Array): GlbHeaderResult {
  if (bytes.length < GLB_HEADER_BYTES) {
    return { header: null, rejection: 'too-short' };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, GLB_HEADER_BYTES);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    return { header: null, rejection: 'bad-magic' };
  }
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) {
    return { header: null, rejection: 'unsupported-version' };
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.length) {
    return { header: null, rejection: 'length-mismatch' };
  }
  return { header: { version, declaredLength }, rejection: null };
}

/** True when the bytes are a GLB this client can load. */
export function isGlbContainer(bytes: Uint8Array): boolean {
  return parseGlbHeader(bytes).header !== null;
}

/**
 * Validates a download and explains the failure, or returns null when the file
 * is fine. The message is what a caller logs; it names the problem rather than
 * leaving it to be discovered inside the glTF parser.
 */
export function describeGlbRejection(bytes: Uint8Array, source = 'model'): string | null {
  const { header, rejection } = parseGlbHeader(bytes);
  if (header) return null;
  switch (rejection) {
    case 'too-short':
      return `${source}: only ${bytes.length} byte(s), a GLB needs at least ${GLB_HEADER_BYTES}`;
    case 'bad-magic':
      return `${source}: not a GLB (starts with "${readMagicAscii(bytes)}", expected "glTF")`;
    case 'unsupported-version':
      return `${source}: GLB version ${readVersion(bytes)} is not supported (expected ${GLB_VERSION})`;
    case 'length-mismatch':
      return `${source}: truncated or padded GLB (declares ${readDeclaredLength(bytes)} bytes, has ${bytes.length})`;
    default:
      return `${source}: not a loadable GLB`;
  }
}

/** Version field of a header that passed the magic check, else 0. */
function readVersion(bytes: Uint8Array): number {
  if (bytes.length < 8) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset, 8).getUint32(4, true);
}

/** Declared length field of a header that passed the magic check, else 0. */
function readDeclaredLength(bytes: Uint8Array): number {
  if (bytes.length < GLB_HEADER_BYTES) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset, GLB_HEADER_BYTES).getUint32(8, true);
}

/**
 * Range of the JSON chunk inside a GLB, from the 12-byte header. The chunk
 * starts at `CHUNK_HEADER_BYTES` after the container header: a uint32 length,
 * a four-character type, then the payload. Returns null when the file is not a
 * GLB or is too short to hold a chunk header.
 */
export function jsonChunkRange(
  bytes: Uint8Array,
): { start: number; length: number } | null {
  if (!isGlbContainer(bytes)) return null;
  const start = GLB_HEADER_BYTES + 8; // chunk header: uint32 length + 'JSON'
  if (bytes.length < start) return null;
  const chunkLength = new DataView(bytes.buffer, bytes.byteOffset, start).getUint32(
    GLB_HEADER_BYTES,
    true,
  );
  if (chunkLength <= 0 || start + chunkLength > bytes.length) return null;
  return { start, length: chunkLength };
}

/**
 * Task 613: assets over this size are worth a warning.
 *
 * 10 MB is the point where a model stops being a prop and starts being a
 * download the player waits for. It is a warning, not a refusal: a player
 * running on a fast connection is better served by the asset than by a
 * rejection nobody asked for.
 */
export const LARGE_ASSET_BYTES = 10 * 1024 * 1024;

/** One asset's size, judged against {@link LARGE_ASSET_BYTES}. */
export interface AssetSizeVerdict {
  /** Size that was measured, bytes. */
  bytes: number;
  /** The same size in mebibytes, rounded to one decimal for a log line. */
  mib: number;
  /** True when the asset is over the limit. */
  oversized: boolean;
}

/**
 * Judges a size given in bytes. Taking a number rather than the buffer is
 * deliberate: a caller knows `Content-Length` before the body arrives, and a
 * test does not have to allocate ten megabytes to check the boundary.
 */
export function classifyAssetSize(byteLength: number): AssetSizeVerdict {
  const bytes = Number.isFinite(byteLength) && byteLength > 0 ? byteLength : 0;
  return {
    bytes,
    mib: Math.round((bytes / (1024 * 1024)) * 10) / 10,
    oversized: bytes > LARGE_ASSET_BYTES,
  };
}

/** The warning text for an oversized asset, or null when it is fine. */
export function describeAssetSize(source: string, byteLength: number): string | null {
  const { mib, oversized } = classifyAssetSize(byteLength);
  if (!oversized) return null;
  return `${source}: ${mib} MiB is over the ${Math.round(
    LARGE_ASSET_BYTES / (1024 * 1024),
  )} MiB asset budget`;
}

/**
 * Task 613: warns once per asset, not once per frame.
 *
 * A retry loop or a preload pass can ask about the same file many times; a
 * warning that repeats is noise, and noise is how warnings get ignored. The
 * guard remembers what it has already said, and {@link AssetSizeGuard.reset}
 * lets a caller re-arm it when the content behind a name has changed.
 */
export class AssetSizeGuard {
  private readonly warned = new Set<string>();

  constructor(private readonly onWarn: (message: string) => void = (m) => console.warn(m)) {}

  /** Warns when `byteLength` is over budget; returns the message, or null. */
  check(source: string, byteLength: number): string | null {
    const message = describeAssetSize(source, byteLength);
    if (message === null) return null;
    if (this.warned.has(source)) return null;
    this.warned.add(source);
    this.onWarn(message);
    return message;
  }

  /** True when this guard has already warned about `source`. */
  hasWarned(source: string): boolean {
    return this.warned.has(source);
  }

  /** Forgets every warning, e.g. after a cache clear. */
  reset(): void {
    this.warned.clear();
  }
}


// Side-effect imports: each one registers its glTF extension handler with
// Babylon's loader, which is what makes the extension loadable at all. If the
// installed package ever dropped one of these, this module would fail to build
// rather than fail at the first Draco-compressed prop on the field.
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_draco_mesh_compression.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_basisu.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp.js';
import { DracoDecoder } from '@babylonjs/core/Meshes/Compression/dracoDecoder.js';

/** Draco mesh compression, the extension that shrinks geometry. */
export const DRACO_EXTENSION = 'KHR_draco_mesh_compression';

/**
 * Task 624: the extensions this build can actually decode.
 *
 * Every name here has a handler module imported at the top of this file, so the
 * list cannot drift from reality without breaking the build. It is deliberately
 * short: an extension nobody wired up must not be claimed as supported, because
 * "supported" in this game means "the file will load on the player's machine".
 */
export const SUPPORTED_GLTF_EXTENSIONS: readonly string[] = [
  DRACO_EXTENSION,
  'KHR_texture_basisu',
  'KHR_mesh_quantization',
  // Required by tank-quaternius.glb, so it is not optional: without this
  // handler the one animated vehicle in the batch does not load at all.
  'EXT_texture_webp',
];

/** What a file says about the extensions it uses. */
export interface ExtensionReport {
  /** Names in `extensionsUsed`. */
  used: string[];
  /** Names in `extensionsRequired`; a missing one makes the file unloadable. */
  required: string[];
  /** Required extensions this build has no handler for. */
  unsupportedRequired: string[];
}

/** Reads the extension lists out of a validated GLB's JSON chunk. */
export function readExtensionReport(bytes: Uint8Array): ExtensionReport {
  const chunk = jsonChunkRange(bytes);
  if (!chunk) return { used: [], required: [], unsupportedRequired: [] };
  let json: { extensionsUsed?: unknown; extensionsRequired?: unknown };
  try {
    json = JSON.parse(
      new TextDecoder().decode(bytes.subarray(chunk.start, chunk.start + chunk.length)),
    ) as { extensionsUsed?: unknown; extensionsRequired?: unknown };
  } catch {
    return { used: [], required: [], unsupportedRequired: [] };
  }
  const names = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((n): n is string => typeof n === 'string') : [];
  const used = names(json.extensionsUsed);
  const required = names(json.extensionsRequired);
  return {
    used,
    required,
    unsupportedRequired: required.filter((n) => !SUPPORTED_GLTF_EXTENSIONS.includes(n)),
  };
}

/** Task 624: what a file needs before it can be decoded. */
export interface DracoReport {
  /** The file uses Draco on at least one primitive. */
  usesDraco: boolean;
  /** Draco is in `extensionsRequired`, so the file cannot load without it. */
  required: boolean;
  /** Primitives carrying a Draco extension block. */
  compressedPrimitives: number;
  /** This build has the Draco handler and a decoder configuration. */
  decoderAvailable: boolean;
  /** The verdict: false means the file will not load here. */
  loadable: boolean;
  /** Why it will not load, when it will not. */
  reason: 'unsupported-required-extension' | 'no-draco-decoder' | null;
}

/**
 * Task 624: whether a Draco-compressed file can be decoded here.
 *
 * Draco is supported by the installed loader, so the interesting case is a
 * *required* extension with no handler: that file is not "a bit degraded", it
 * does not load, and the caller should fall back rather than retry. A file that
 * merely *uses* Draco without requiring it still loads through the fallback
 * path, so it is reported as loadable.
 *
 * The primitive count comes from the JSON chunk: each compressed primitive
 * carries an `extensions` block keyed by the Draco extension name.
 */
export function dracoReport(bytes: Uint8Array): DracoReport {
  const report = readExtensionReport(bytes);
  const chunk = jsonChunkRange(bytes);
  let compressedPrimitives = 0;
  if (chunk) {
    try {
      const json = JSON.parse(
        new TextDecoder().decode(bytes.subarray(chunk.start, chunk.start + chunk.length)),
      ) as { meshes?: Array<{ primitives?: Array<{ extensions?: Record<string, unknown> }> }> };
      for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
          if (primitive.extensions && DRACO_EXTENSION in primitive.extensions) compressedPrimitives++;
        }
      }
    } catch {
      compressedPrimitives = 0;
    }
  }
  const usesDraco = report.used.includes(DRACO_EXTENSION) || compressedPrimitives > 0;
  const required = report.required.includes(DRACO_EXTENSION);
  const decoderAvailable = DracoDecoder.DefaultAvailable;
  if (report.unsupportedRequired.length > 0) {
    return {
      usesDraco,
      required,
      compressedPrimitives,
      decoderAvailable,
      loadable: false,
      reason: 'unsupported-required-extension',
    };
  }
  if (usesDraco && required && !decoderAvailable) {
    return {
      usesDraco,
      required,
      compressedPrimitives,
      decoderAvailable,
      loadable: false,
      reason: 'no-draco-decoder',
    };
  }
  return { usesDraco, required, compressedPrimitives, decoderAvailable, loadable: true, reason: null };
}
