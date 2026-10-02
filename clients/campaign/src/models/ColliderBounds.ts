/**
 * Colliders and pick tags derived from a model's own bounds.
 *
 * Task 616: a collider is generated from the mesh's world bounds rather than
 * authored by hand. For the staged GLBs this is exactly right -- they are
 * single convex blobs (a tank, a crate, a tower), and a box fitted to the
 * bounds is both cheaper and more stable than a mesh collider, which matters
 * because a mesh collider that is regenerated on every spawn shows up as
 * physics jitter.
 *
 * Nothing here imports Babylon: the maths takes plain numbers and the scene
 * write is a seam, so both are testable without an engine.
 */

/** Half-open box description in world units (metres, after scaling). */
export interface ColliderBox {
  /** Full width on X. */
  width: number;
  /** Full height on Y. */
  height: number;
  /** Full depth on Z. */
  depth: number;
  /** Centre of the box, relative to the mesh's own origin. */
  center: { x: number; y: number; z: number };
}

/** What a collider is for; a box is wrong for a trebuchet's arm. */
export type ColliderKind = 'box' | 'capsule' | 'none';

/** The generated collider and what it was built from. */
export interface ColliderBuild {
  kind: ColliderKind;
  box: ColliderBox | null;
  /**
   * False when the bounds were degenerate and the box is a fallback of 1 m on
   * every axis, so a caller can log it rather than ship an invisible wall.
   */
  fromBounds: boolean;
}

/**
 * A collider no bigger than this on every axis is a collapsed or untransformed
 * mesh. The generator returns a 1 m box instead so the object is still solid,
 * and says so through `fromBounds`.
 */
export const DEGENERATE_COLLIDER_M = 1;

/** Bounds in the shape this module consumes. */
export interface BoundsLike {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * Task 616: a box collider fitted to `bounds`.
 *
 * The box is centred on the mesh's own origin rather than on its geometry, and
 * its size is taken from the extent. Padding is applied to the size only, so a
 * collider can be made slightly forgiving for a soldier's stance without moving
 * it off the mesh.
 */
export function buildBoxCollider(
  bounds: BoundsLike,
  kind: ColliderKind = 'box',
  paddingM = 0,
): ColliderBuild {
  if (kind === 'none') return { kind, box: null, fromBounds: false };
  const raw = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  const finite = Object.values(raw).every((v) => Number.isFinite(v));
  const usable = finite && Math.max(...Object.values(raw)) > 0;
  // The centre comes from the same finite check: a NaN in a bound must not
  // become a NaN centre, which is a collider that silently misses everything.
  const centre = (a: number, b: number): number => (Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : 0);
  const size = usable
    ? {
        x: Math.max(0, raw.x + paddingM * 2),
        y: Math.max(0, raw.y + paddingM * 2),
        z: Math.max(0, raw.z + paddingM * 2),
      }
    : { x: DEGENERATE_COLLIDER_M, y: DEGENERATE_COLLIDER_M, z: DEGENERATE_COLLIDER_M };
  return {
    kind,
    box: {
      width: size.x,
      height: size.y,
      depth: size.z,
      center: {
        x: centre(bounds.min.x, bounds.max.x),
        y: centre(bounds.min.y, bounds.max.y),
        z: centre(bounds.min.z, bounds.max.z),
      },
    },
    fromBounds: usable,
  };
}

/**
 * Task 616: a capsule for a humanoid troop model -- a standing person is a
 * capsule, and a box collider on one catches a sword swing at the knees.
 *
 * The radius is half the model's own shoulder width -- measured, not assumed --
 * and the height is the full bound, so the capsule runs from the base to the
 * top of the head. Pass `radiusM` to override it; a broken value falls back to
 * the measured width rather than to zero.
 */
export function buildTroopCollider(bounds: BoundsLike, radiusM?: number): ColliderBuild {
  const raw = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  if (!Number.isFinite(raw.y) || raw.y <= 0) {
    return { kind: 'capsule', box: null, fromBounds: false };
  }
  const measured = raw.x / 2;
  const radius = Number.isFinite(radiusM) && (radiusM as number) > 0 ? (radiusM as number) : measured;
  return {
    kind: 'capsule',
    box: {
      width: radius * 2,
      depth: radius * 2,
      height: raw.y,
      center: { x: 0, y: raw.y / 2, z: 0 },
    },
    fromBounds: true,
  };
}
