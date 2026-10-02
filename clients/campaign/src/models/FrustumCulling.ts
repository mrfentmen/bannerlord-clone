/**
 * Camera-facing culling for staged models.
 *
 * Task 609: a model behind the camera is not drawn. "Behind" is a dot product
 * between the camera's forward vector and the vector to the model, which
 * means the test works for an orbiting campaign camera and for a
 * first-person aiming camera without either of them telling this module what
 * kind of camera it is.
 *
 * The interesting part is not the dot product, it is not popping. An object
 * straddling the camera plane must not blink out one frame and back the next,
 * so the test has a margin: only models a clear distance *behind* the plane
 * are culled, and a model whose distance to the camera cannot be trusted (an
 * untransformed node, a zero-length forward vector) is left visible.
 *
 * Task 610: a model further than the far-field limit -- 500 m by default -- is
 * culled too, and it gets a hysteresis band so a model sitting exactly on the
 * limit does not blink on and off as the camera breathes.
 *
 * {@link CameraCuller} owns the write discipline: it only calls back when an
 * object's visibility actually changed, so a scene never pays a `setEnabled`
 * for the hundreds of objects that did not move.
 */

/** Minimal 3D point/vector shape, so this module needs no engine import. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Where the camera is and which way it looks. */
export interface CameraPose {
  /** Camera world position. */
  position: Vec3;
  /**
   * Unit forward vector. Any length works -- the comparison normalises it --
   * but a zero vector means the camera has no orientation and cannot cull.
   */
  forward: Vec3;
}

/**
 * Metres a model must sit behind the camera plane before it is culled.
 *
 * A model straddling the plane is within this distance of it, so a wide
 * building or a horse's flank never vanishes while its front is still on
 * screen. Sized to the near-plane range of a battlefield camera.
 */
export const DEFAULT_BACK_MARGIN_M = 2;

/** True when `a` is a usable vector (finite, non-zero). */
function isUsable(v: Vec3 | undefined): v is Vec3 {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Length of a vector, 0 for a degenerate one. */
export function lengthOf(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Dot product of two vectors. No normalisation: the sign is what matters for
 * "which side of the plane", and the magnitude is used for the margin test.
 */
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Task 609: true when `point` is behind the camera and far enough behind to be
 * worth culling.
 *
 * The margin is applied in metres along the camera's forward axis, so a camera
 * with a non-unit forward vector still gets the same world-space band. A pose
 * or point with a NaN/zero component returns false: an object that cannot be
 * classified stays on screen rather than blinking out on a bad frame.
 */
export function isBehindCamera(
  camera: CameraPose,
  point: Vec3,
  marginM: number = DEFAULT_BACK_MARGIN_M,
): boolean {
  if (!isUsable(camera?.forward) || !isUsable(camera?.position) || !isUsable(point)) return false;
  const forwardLength = lengthOf(camera.forward);
  if (forwardLength <= 0) return false;

  // Vector from the camera to the model, projected onto the forward axis.
  const along = dot(point, camera.forward) - dot(camera.position, camera.forward);
  const alongMetres = along / forwardLength;
  return alongMetres < -Math.max(0, marginM);
}

/** One model the culler decides about. */
export interface Cullable {
  /** Stable id, used in the culler's bookkeeping and debug output. */
  id: string;
  /** Current world position; the scene updates this each frame. */
  position: Vec3;
  /**
   * Called only when visibility *changes*, with the new value. This is the
   * seam a scene owner wires to `mesh.setEnabled`.
   */
  onVisibleChange?: (visible: boolean) => void;
  /**
   * Per-object override of {@link DEFAULT_BACK_MARGIN_M}; a very large model
   * (a building straddling the plane) can ask for a wider band.
   */
  backMarginM?: number;
  /**
   * Per-object override of {@link DEFAULT_FAR_CULL_M}; a landmark the player
   * can see from across the map (a city wall) can ask for a longer reach.
   */
  farCullM?: number;
}

/** A cull decision for one object this frame. */
export interface CullResult {
  id: string;
  visible: boolean;
  /** Why it was culled; null when it is drawn. */
  reason: 'behind-camera' | 'too-far' | null;
}

/**
 * Task 610: the far-field view distance, in metres. Past this a model is not
 * drawn at all: at 500 m a soldier is under two pixels tall, so the triangles
 * are spent on nothing. Matches the campaign map's draw distance.
 */
export const DEFAULT_FAR_CULL_M = 500;

/**
 * Task 610: hysteresis band, metres. A model has to move this far past the far
 * limit before it is dropped, and this far inside it before it comes back. A
 * camera orbiting a distant model would otherwise toggle it every frame at the
 * boundary.
 */
export const DEFAULT_FAR_CULL_HYSTERESIS_M = 15;

/** Metres between `a` and `b`, or `NaN` when either point is unusable. */
export function distanceBetween(a: Vec3, b: Vec3): number {
  if (!isUsable(a) || !isUsable(b)) return Number.NaN;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Task 610: true when `distanceM` is past the far-field limit.
 *
 * `inside` is the object's current visibility: an already-drawn model has to
 * cross the limit by the hysteresis band before it is dropped, while a hidden
 * one stays hidden until it comes back inside the band. A distance that cannot
 * be trusted returns false (draw it) for the same reason task 609 does.
 */
export function isBeyondFarCull(
  distanceM: number,
  limitM: number = DEFAULT_FAR_CULL_M,
  hysteresisM: number = DEFAULT_FAR_CULL_HYSTERESIS_M,
  inside = true,
): boolean {
  if (!Number.isFinite(distanceM)) return false;
  const limit = Number.isFinite(limitM) && limitM > 0 ? limitM : DEFAULT_FAR_CULL_M;
  const hysteresis = Number.isFinite(hysteresisM) && hysteresisM > 0 ? hysteresisM : 0;
  return inside ? distanceM > limit + hysteresis : distanceM > limit - hysteresis;
}

/**
 * Per-frame camera culling: behind-camera (task 609) and far-field (task 610).
 *
 * Holds the last written value per object so `onVisibleChange` fires on the
 * edge and never on a steady frame — the difference between one call for the
 * 300 models that turned and zero calls for the 300 that did not.
 */
export class CameraCuller {
  private readonly written = new Map<string, boolean>();

  constructor(
    private readonly camera: CameraPose,
    private readonly marginM: number = DEFAULT_BACK_MARGIN_M,
    private farCullM: number = DEFAULT_FAR_CULL_M,
    private readonly hysteresisM: number = DEFAULT_FAR_CULL_HYSTERESIS_M,
  ) {}

  /** Task 610: move the far-field limit, e.g. from the draw-distance slider. */
  setFarCullM(limitM: number): void {
    if (Number.isFinite(limitM) && limitM > 0) this.farCullM = limitM;
  }

  /** The far-field limit in metres. */
  getFarCullM(): number {
    return this.farCullM;
  }

  /** Decide one object and write the change if there was one. */
  update(target: Cullable): CullResult {
    const behind = isBehindCamera(
      this.camera,
      target.position,
      target.backMarginM ?? this.marginM,
    );
    // A model only gets the wide "already drawn" band once the culler has
    // actually written it visible; a fresh spawn has to come inside the band
    // immediately instead of popping in at the limit.
    const inside = this.written.get(target.id) === true;
    const distance = distanceBetween(this.camera.position, target.position);
    const tooFar =
      !behind && isBeyondFarCull(distance, target.farCullM ?? this.farCullM, this.hysteresisM, inside);
    const visible = !behind && !tooFar;
    if (this.written.get(target.id) !== visible) {
      this.written.set(target.id, visible);
      target.onVisibleChange?.(visible);
    }
    return { id: target.id, visible, reason: behind ? 'behind-camera' : tooFar ? 'too-far' : null };
  }

  /**
   * Decide a batch. Returns one result per object in input order, so a caller
   * can log the culls for a debug overlay.
   */
  updateAll(targets: readonly Cullable[]): CullResult[] {
    return targets.map((t) => this.update(t));
  }

  /** Forget an object's last written value, e.g. after it is respawned. */
  forget(id: string): void {
    this.written.delete(id);
  }

  /** True when the object has been written as visible by this culler. */
  isVisible(id: string): boolean {
    return this.written.get(id) === true;
  }
}