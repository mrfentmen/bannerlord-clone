/**
 * Model scaling read out of the GLB file itself.
 *
 * Task 614: a model is authored at whatever scale its pack used and is placed
 * in metres on the field, so it has to be scaled. At runtime that happens from
 * the loaded mesh (`scene/models.ts`, outside this lane). What this module adds
 * is the same decision *before* the load, from the bytes that just arrived: a
 * manifest's `targetLengthM` can be checked against the geometry that is
 * actually in the file, and a file whose accessor bounds cannot be trusted can
 * be named instead of silently scaled by garbage.
 *
 * The bounds come from the glTF JSON chunk's POSITION accessors, which the spec
 * requires to carry `min` and `max`. That is cheap -- no buffer views are
 * touched -- but it is not always honest:
 *
 * - `KHR_mesh_quantization` stores positions in normalised integer space, so
 *   its accessor min/max are grid indices, not metres. `tank-quaternius.glb`
 *   is staged in that form and reports bounds around 65534 units.
 *
 * so `readAuthoredBounds` marks such a file untrustworthy and `autoScaleToMeters`
 * refuses it, leaving the runtime path to measure the real geometry. Scaling a
 * quantized model by its reported bounds would put it 65 km long.
 */

import { jsonChunkRange } from './GlbFormat.js';

/** An axis-aligned box in the model's own units. */
export interface Bounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** Extent along each axis, `max - min`. */
export interface Extents {
  x: number;
  y: number;
  z: number;
}

/** Bounds plus whether they may be used for scaling. */
export interface AuthoredBounds extends Bounds {
  /** Edge length per axis. */
  extents: Extents;
  /**
   * False when the file quantises positions or reports extents no real model
   * has; the bounds are then indices, not units.
   */
  trustworthy: boolean;
  /** Why the bounds are untrustworthy, for a log line. */
  reason: 'quantized-positions' | 'implausible-extent' | null;
  /** How many POSITION accessors contributed. */
  accessorCount: number;
}

/**
 * Largest extent a real-world-authored model may report. Past this the numbers
 * are integer grid indices (uint16 tops out at 65535), not units.
 */
export const IMPLAUSIBLE_EXTENT = 10_000;

/** The extension that makes accessor min/max meaningless as lengths. */
export const QUANTIZATION_EXTENSION = 'KHR_mesh_quantization';

/** Read the glTF JSON chunk of a validated GLB. Returns null when unusable. */
function readGltfJson(bytes: Uint8Array): Record<string, unknown> | null {
  const chunk = jsonChunkRange(bytes);
  if (!chunk) return null;
  const text = new TextDecoder().decode(bytes.subarray(chunk.start, chunk.start + chunk.length));
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isFiniteTriple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/**
 * The union of every accessor that carries `min`/`max`, which for a glTF 2.0
 * file is the POSITION set. Accessors without them (normals, colours, joints)
 * contribute nothing and are skipped.
 */
export function readAuthoredBounds(bytes: Uint8Array): AuthoredBounds {
  const empty: AuthoredBounds = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 0, y: 0, z: 0 },
    extents: { x: 0, y: 0, z: 0 },
    trustworthy: false,
    reason: 'implausible-extent',
    accessorCount: 0,
  };
  const json = readGltfJson(bytes);
  if (!json) return empty;

  const accessors = Array.isArray(json.accessors) ? (json.accessors as unknown[]) : [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const accessor of accessors) {
    if (typeof accessor !== 'object' || accessor === null) continue;
    const a = accessor as { min?: unknown; max?: unknown };
    if (!isFiniteTriple(a.min) || !isFiniteTriple(a.max)) continue;
    count++;
    minX = Math.min(minX, a.min[0]);
    minY = Math.min(minY, a.min[1]);
    minZ = Math.min(minZ, a.min[2]);
    maxX = Math.max(maxX, a.max[0]);
    maxY = Math.max(maxY, a.max[1]);
    maxZ = Math.max(maxZ, a.max[2]);
  }
  if (count === 0) return { ...empty, reason: 'implausible-extent' };

  const extents: Extents = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  const used = [
    ...(Array.isArray(json.extensionsUsed) ? (json.extensionsUsed as unknown[]) : []),
    ...(Array.isArray(json.extensionsRequired) ? (json.extensionsRequired as unknown[]) : []),
  ];
  const largest = Math.max(extents.x, extents.y, extents.z);
  const reason: AuthoredBounds['reason'] = used.includes(QUANTIZATION_EXTENSION)
    ? 'quantized-positions'
    : largest > IMPLAUSIBLE_EXTENT
      ? 'implausible-extent'
      : null;

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    extents,
    trustworthy: reason === null,
    reason,
    accessorCount: count,
  };
}

/** Edge lengths, or the long axis' length. Zero for an empty box. */
export function extentsOf(b: Bounds): Extents {
  return {
    x: b.max.x - b.min.x,
    y: b.max.y - b.min.y,
    z: b.max.z - b.min.z,
  };
}

/** The longest edge, i.e. the model's size if it is measured on that axis. */
export function longestAxisLength(b: Bounds): number {
  const e = extentsOf(b);
  return Math.max(e.x, e.y, e.z);
}

/** The result of deciding a model's scale factor. */
export interface AutoScaleVerdict {
  /**
   * Uniform scale to apply, or null when the bounds cannot be trusted. A
   * caller that gets null measures the loaded mesh instead.
   */
  scale: number | null;
  /** Longest edge the scale was derived from, in authored units. */
  authoredLength: number;
  /** Longest edge after scaling, metres. */
  scaledLengthM: number | null;
  /** Why no scale was produced, when one was not. */
  reason: 'quantized-positions' | 'implausible-extent' | 'no-accessor-bounds' | 'degenerate-target' | null;
}

/**
 * Task 614: the uniform scale that makes the model's longest axis `targetM`
 * metres.
 *
 * Returns null rather than a number whenever the inputs cannot support the
 * decision -- quantised positions, an implausible extent, accessor bounds that
 * were never present, or a target of zero. A wrong scale is invisible until a
 * model is 65 km long; a missing one makes the caller take the runtime path.
 */
export function autoScaleToMeters(
  bounds: AuthoredBounds,
  targetLengthM: number,
): AutoScaleVerdict {
  const authoredLength = longestAxisLength(bounds);
  // Checked before the trustworthiness flag so the reason names the real
  // problem: a file with no accessor bounds has none, not "implausible" ones.
  if (bounds.accessorCount === 0) {
    return { scale: null, authoredLength, scaledLengthM: null, reason: 'no-accessor-bounds' };
  }
  if (!bounds.trustworthy) {
    return { scale: null, authoredLength, scaledLengthM: null, reason: bounds.reason };
  }
  // Re-checked here as well as in `readAuthoredBounds`: a caller may hand this
  // function bounds it built itself, and a number this large is never a length.
  if (authoredLength > IMPLAUSIBLE_EXTENT) {
    return { scale: null, authoredLength, scaledLengthM: null, reason: 'implausible-extent' };
  }
  if (!Number.isFinite(targetLengthM) || targetLengthM <= 0) {
    return { scale: null, authoredLength, scaledLengthM: null, reason: 'degenerate-target' };
  }
  if (!Number.isFinite(authoredLength) || authoredLength <= 0) {
    return { scale: null, authoredLength: 0, scaledLengthM: null, reason: 'degenerate-target' };
  }
  const scale = targetLengthM / authoredLength;
  return { scale, authoredLength, scaledLengthM: authoredLength * scale, reason: null };
}
/**
 * Extents after a rotation about the X axis, radians.
 *
 * A quarter turn about X swaps the Y and Z extents; a smaller angle mixes them.
 * Only a rotation about X is modelled, because that is the only orientation fix
 * any staged model needs (one rotation, on one manifest entry).
 */
export function rotatedExtentsAroundX(extents: Extents, radians: number): Extents {
  if (!Number.isFinite(radians)) return extents;
  const c = Math.abs(Math.cos(radians));
  const s = Math.abs(Math.sin(radians));
  return {
    x: extents.x,
    y: extents.y * c + extents.z * s,
    z: extents.y * s + extents.z * c,
  };
}

/** Which axis of a model is its longest. */
export type LongestAxis = 'x' | 'y' | 'z';

/** The axis with the greatest extent; ties resolve to x, then y, then z. */
export function longestAxisOf(b: Bounds): LongestAxis {
  const e = extentsOf(b);
  if (e.x >= e.y && e.x >= e.z) return 'x';
  return e.y >= e.z ? 'y' : 'z';
}

/**
 * Task 615: what the authored geometry says about a model's orientation.
 *
 * 'upright' means its longest axis is Y, i.e. it stands on the ground plane as
 * authored. 'lying-down' means it does not, which is a *lead*, not a decision:
 * a helicopter, an APC and a prone sniper are all long in another axis and all
 * correct as authored. Only {@link upAxisRotationFor} decides, because that is
 * where the staging note recorded what was actually checked.
 */
export function describeUprightness(b: AuthoredBounds): 'upright' | 'lying-down' {
  if (!b.trustworthy || b.accessorCount === 0) return 'upright';
  return longestAxisOf(b) === 'y' ? 'upright' : 'lying-down';
}

/** A manifest-shaped entry, as far as orientation is concerned. */
export interface OrientationEntry {
  name: string;
  /** Radians of X rotation the staging note recorded, when one was needed. */
  rotateX?: number;
  /** True when the staging note estimated the rest of the entry. */
  estimated?: boolean;
}

/**
 * Task 615: the X rotation to apply to a model, radians.
 *
 * The staging note is the source of truth: `troop-officer.glb` is authored flat
 * along Z and the note records -90 degrees about X to stand it up, which the
 * accessor bounds confirm (0.63 x 0.44 x 1.00 becomes 0.63 x 1.00 x 0.44).
 * Everything else is 0. An untrustworthy entry gets 0 as well -- an orientation
 * guess for a quantised file is worse than no rotation at all.
 */
export function upAxisRotationFor(entry: OrientationEntry, bounds: AuthoredBounds): number {
  if (!Number.isFinite(entry.rotateX as number)) return 0;
  if (!bounds.trustworthy) return 0;
  return entry.rotateX as number;
}

/**
 * Task 626: move a model's pivot to its own centre.
 *
 * Models arrive with the origin wherever the pack put it -- a foot, a corner, a
 * wheel arch. That is fine for a model standing on the ground and wrong for
 * every model that has to be placed, rotated about itself or attached to
 * something: the crew of a rotating turret, a spinning wheel, a decal projected
 * onto a wall. Centring the pivot makes "rotate this" mean what it looks like.
 *
 * Two things this returns instead of deciding:
 *
 * - The offset is in the model's *own* units, so it must be applied after the
 *   task 614 scale. `centredPivotOffset` therefore takes the scale and gives
 *   back a world-space offset the caller can assign to `position`.
 * - A model that is already centred (its origin within a centimetre of its
 *   middle) gets a zero offset, so a re-centring pass is idempotent and does
 *   not drift a model that was fine.
 */

/** Below this, an offset is treated as no offset at all, metres. */
export const PIVOT_EPSILON_M = 0.01;

/** A pivot correction for one model. */
export interface PivotCorrection {
  /** Offset to add to the model's position, world metres. */
  offset: { x: number; y: number; z: number };
  /** False when the offset was under the epsilon and not worth applying. */
  needed: boolean;
  /** Half-extents used for the decision, world metres. */
  extents: Extents;
}

/**
 * Task 626: the offset that puts the model's bounds centre on its origin.
 *
 * `scale` is the factor task 614 decided on, so authored units become metres
 * here too. The vertical component is included: a model authored with its origin
 * at its feet is exactly the case where re-centring matters, and dropping Y
 * would leave it standing where it was.
 */
export function centredPivotOffset(
  bounds: Bounds,
  scale = 1,
  epsilonM = PIVOT_EPSILON_M,
): PivotCorrection {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const centre = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const raw = { x: -centre.x * factor, y: -centre.y * factor, z: -centre.z * factor };
  const needed = [raw.x, raw.y, raw.z].some((v) => Math.abs(v) > epsilonM);
  return {
    offset: needed ? raw : { x: 0, y: 0, z: 0 },
    needed,
    extents: {
      x: (bounds.max.x - bounds.min.x) * factor,
      y: (bounds.max.y - bounds.min.y) * factor,
      z: (bounds.max.z - bounds.min.z) * factor,
    },
  };
}

/**
 * Bounds after the pivot correction, in world metres.
 *
 * A scene uses this to check the correction did what it claimed: the centre of
 * the corrected bounds has to be on the origin. Kept separate from
 * {@link centredPivotOffset} because the correction is what a caller applies and
 * this is what a test -- or a placement check -- verifies.
 */
export function boundsAfterCentring(bounds: Bounds, scale = 1): Bounds {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const shift = centredPivotOffset(bounds, factor).offset;
  return {
    min: { x: bounds.min.x + shift.x / factor, y: bounds.min.y + shift.y / factor, z: bounds.min.z + shift.z / factor },
    max: { x: bounds.max.x + shift.x / factor, y: bounds.max.y + shift.y / factor, z: bounds.max.z + shift.z / factor },
  };
}

/**
 * Task 626: the lift that puts a model's base back on the ground.
 *
 * Take the bounds *after* centring, not before: re-centring moves the geometry
 * down by half its height, so a model that was standing on the ground is now
 * half-buried and needs a lift of half its height to be standing again. On the
 * original bounds this returns roughly zero, which is the correct answer for a
 * model authored with its origin at its feet.
 */
export function baseYOffset(bounds: Bounds, scale = 1): number {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (!Number.isFinite(bounds.min.y)) return 0;
  // `+ 0` keeps a model whose base is already at the origin from reporting -0,
  // which reads as a different number in a log and in a snapshot diff.
  return -bounds.min.y * factor + 0;
}
