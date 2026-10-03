/**
 * Cape flutter.
 *
 * Task 646: a cape is the cheapest character animation that reads as cloth. It
 * needs no bone, no mesh generation and no baking -- a strip of points held to
 * the shoulders and solved with a Verlet integration is enough to get the
 * silhouette moving behind a walking character, which is the whole effect.
 *
 * Why Verlet rather than a spring per point: position-based integration cannot
 * go unstable when the frame is long. A stiff spring with a 200 ms frame
 * explodes; the same cloth with Verlet just hangs. On a browser tab that has been
 * backgrounded for ten seconds and comes back with one enormous delta, that
 * difference is the whole feature working or not working.
 *
 * The strip is a column of points from the collar down. Each frame: integrate,
 * satisfy the distance constraints, pin the top row to the shoulders, and push
 * the whole thing out of the wearer's own body.
 */

/** A point in the cape. */
export interface ClothPoint {
  x: number;
  y: number;
  z: number;
  /** Previous position, for the Verlet step. */
  px: number;
  py: number;
  pz: number;
  /** Pinned to a bone; a pinned point does not integrate. */
  pinned: boolean;
}

/** How the cloth behaves. */
export interface CapeSettings {
  /** Distance from one point to the next down the strip, metres. */
  spacingM: number;
  /** How strongly the cloth follows the wearer, 0..1. Higher is stiffer. */
  stiffness: number;
  /** Fraction of the velocity kept each step, 0..1. Lower damps more. */
  damping: number;
  /** Gravity, m/s^2. Zero lets a cape hang flat in a horizontal wind. */
  gravity: number;
  /** Constraint passes per frame. One is stretchy, four is close to inextensible. */
  iterations: number;
  /** Metres the cloth is pushed out of the wearer's body. */
  bodyClearanceM: number;
}

/** A light cape on a 1.8 m character: eight rows at 8 cm. */
export const DEFAULT_CAPE_SETTINGS: CapeSettings = {
  spacingM: 0.08,
  stiffness: 0.35,
  damping: 0.92,
  gravity: 9.81,
  iterations: 4,
  bodyClearanceM: 0.06,
};

/** Rows in a full cape. */
export const DEFAULT_CAPE_ROWS = 8;

/** Builds a strip hanging straight down from a collar point. */
export function makeCape(
  collar: { x: number; y: number; z: number },
  rows = DEFAULT_CAPE_ROWS,
  settings: CapeSettings = DEFAULT_CAPE_SETTINGS,
): ClothPoint[] {
  const count = Number.isFinite(rows) && rows > 1 ? Math.floor(rows) : DEFAULT_CAPE_ROWS;
  const spacing = Number.isFinite(settings.spacingM) && settings.spacingM > 0 ? settings.spacingM : DEFAULT_CAPE_SETTINGS.spacingM;
  const points: ClothPoint[] = [];
  for (let i = 0; i < count; i++) {
    const y = collar.y - i * spacing;
    points.push({ x: collar.x, y, z: collar.z, px: collar.x, py: y, pz: collar.z, pinned: i === 0 });
  }
  return points;
}

/** Wind and motion as the cloth sees it. */
export interface CapeForces {
  /** Wind in world space, m/s. */
  wind: { x: number; y: number; z: number };
  /**
   * How fast the wearer is moving, m/s, and in which direction. A character
   * walking forwards pushes its cape backwards; that is most of the effect and it
   * costs nothing.
   */
  wearerVelocity: { x: number; y: number; z: number };
  /**
   * How many seconds of simulation this frame represents, and whether it is
   * trustworthy. A delta of a second and a half is not simulated: the cloth is
   * simply stepped by the usual amount.
   */
  deltaS: number;
}

/** Nothing moving, no wind. */
export const STILL: CapeForces = {
  wind: { x: 0, y: 0, z: 0 },
  wearerVelocity: { x: 0, y: 0, z: 0 },
  deltaS: 1 / 60,
};

/** Longest delta the cloth will simulate, seconds. Anything longer is clamped. */
export const MAX_CAPE_DELTA_S = 1 / 30;

/**
 * How strongly a wind speed pushes the cloth, as an acceleration per m/s of
 * wind. Low on purpose: a cape is heavy, and cloth that responds like a flag is
 * the giveaway that a simulation is running rather than a cape.
 */
export const WIND_DRAG = 0.4;

/**
 * Task 646: step the cape.
 *
 * The order is the classic one and each part is load-bearing: integrate with the
 * wind and the wearer's motion, then pull every constraint to its target length,
 * then re-pin the shoulders, then push the cloth out of the body. Solving the
 * constraints *after* integrating is what makes it Verlet, and it is what keeps
 * the strip from stretching when the frame is long.
 *
 * The cape is in world space, and `collar` moves with the shoulders, so a
 * character turning on the spot whips its cape round.
 */
export function stepCape(
  points: ClothPoint[],
  collar: { x: number; y: number; z: number },
  settings: CapeSettings = DEFAULT_CAPE_SETTINGS,
  forces: CapeForces = STILL,
): ClothPoint[] {
  if (points.length < 2) return points;
  const spacing = Number.isFinite(settings.spacingM) && settings.spacingM > 0 ? settings.spacingM : DEFAULT_CAPE_SETTINGS.spacingM;
  const stiffness = clamp01(settings.stiffness, DEFAULT_CAPE_SETTINGS.stiffness);
  const damping = clamp01(settings.damping, DEFAULT_CAPE_SETTINGS.damping);
  const gravity = Number.isFinite(settings.gravity) ? settings.gravity : 9;
  const iterations =
    Number.isFinite(settings.iterations) && settings.iterations > 0
      ? Math.min(16, Math.floor(settings.iterations))
      : 4;
  const clearance = Number.isFinite(settings.bodyClearanceM) ? settings.bodyClearanceM : 0.06;
  // A frame that carried no time is not simulated at all: damping would still
  // move the points, and a cape that flutters while the game is paused is worse
  // than one that waits.
  if (!Number.isFinite(forces.deltaS) || forces.deltaS <= 0) return points;
  const delta = Math.min(MAX_CAPE_DELTA_S, forces.deltaS);
  const wind = usable(forces.wind) ? forces.wind : { x: 0, y: 0, z: 0 };
  const wearer = usable(forces.wearerVelocity) ? forces.wearerVelocity : { x: 0, y: 0, z: 0 };

  // 1. Integrate.
  for (const point of points) {
    if (point.pinned) {
      point.px = point.x;
      point.py = point.y;
      point.pz = point.z;
      continue;
    }
    const vx = (point.x - point.px) * damping;
    const vy = (point.y - point.py) * damping;
    const vz = (point.z - point.pz) * damping;
    point.px = point.x;
    point.py = point.y;
    point.pz = point.z;
    // Wind pushes the cloth; the wearer's own motion pushes it backwards, which
    // is the drag term. Gravity is applied as an acceleration of the position.
    point.x += vx + (wind.x * WIND_DRAG - wearer.x) * delta * delta;
    point.y += vy - gravity * delta * delta;
    point.z += vz + (wind.z * WIND_DRAG - wearer.z) * delta * delta;
  }

  // 2. Satisfy the distance constraints, top down so the pinned row wins.
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 1; i < points.length; i++) {
      const upper = points[i - 1] as ClothPoint;
      const lower = points[i] as ClothPoint;
      let dx = lower.x - upper.x;
      let dy = lower.y - upper.y;
      let dz = lower.z - upper.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len <= 1e-6) continue;
      const correction = ((len - spacing) / len) * stiffness;
      dx *= correction;
      dy *= correction;
      dz *= correction;
      if (!upper.pinned) {
        upper.x += dx * 0.5;
        upper.y += dy * 0.5;
        upper.z += dz * 0.5;
      }
      if (!lower.pinned) {
        lower.x -= dx * 0.5;
        lower.y -= dy * 0.5;
        lower.z -= dz * 0.5;
      }
    }
    // 3. Re-pin the collar every pass, so the cloth is attached to the body and
    // not merely near it.
    for (const point of points) {
      if (!point.pinned) continue;
      point.x = collar.x;
      point.y = collar.y;
      point.z = collar.z;
    }
    // 4. Keep the cloth out of the body. Pushing along the row's own outward
    // direction is enough for a strip that hangs behind the shoulders.
    for (let i = 1; i < points.length; i++) {
      const point = points[i] as ClothPoint;
      const awayZ = point.z - collar.z;
      if (Math.abs(awayZ) < clearance) {
        point.z = collar.z + (awayZ >= 0 ? clearance : -clearance);
      }
    }
  }
  return points;
}

/** Total length of the strip, for a sanity check. */
export function capeLength(points: readonly ClothPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as ClothPoint;
    const b = points[i] as ClothPoint;
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

/** The point furthest from the collar, i.e. the hem. */
export function capeHem(points: readonly ClothPoint[]): ClothPoint | null {
  if (points.length === 0) return null;
  const collar = points[0] as ClothPoint;
  let hem = collar;
  let best = -1;
  for (const point of points) {
    const d = Math.hypot(point.x - collar.x, point.y - collar.y, point.z - collar.z);
    if (d > best) {
      best = d;
      hem = point;
    }
  }
  return hem;
}

function clamp01(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function usable(v: { x: number; y: number; z: number } | undefined): boolean {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}