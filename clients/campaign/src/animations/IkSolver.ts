/**
 * Procedural inverse kinematics for the staged character models.
 *
 * The Quaternius packs these characters ship have upper bodies and legs but no
 * leg rig -- there is no IK to re-target and no foot bone to pin. Everything in
 * this module is therefore *procedural*: the maths a rig would do, expressed on
 * the joint transforms a scene owns, so the feet stop sliding and the hands hold
 * a weapon without an animation that does not exist.
 *
 * Task 639: feet plant on the ground. A walking character whose feet slide is
 * the single most obvious sign of a cheap character animation, so the foot target
 * is placed on the ground plane under the hip and is held there until the hip has
 * moved far enough that the foot must step -- a foot plants, waits, lifts, moves
 * and plants again, rather than being dragged along at the character's speed.
 * How far it has to wait is measured along the ground, because the length of the
 * leg is not travel.
 *
 * Everything here is pure maths over plain numbers. Nothing imports Babylon: a
 * scene applies the resulting angles to its own bones, which is also what lets
 * the whole thing be tested without a scene.
 */

/** A 3D point or vector. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A point, with helpers to keep the arithmetic readable. */
export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(b, a));
}

/** Dot product of two vectors. */
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Unit vector, or {@link ZERO} for a degenerate one.
 *
 * A zero-length direction has no orientation, and normalising it would produce
 * NaN rotations that a scene would apply silently.
 */
export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (!Number.isFinite(len) || len <= 0) return { x: 0, y: 0, z: 0 };
  return scale(v, 1 / len);
}

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** A unit vector pointing along +X, used when a direction cannot be resolved. */
const FALLBACK_AXIS: Vec3 = { x: 1, y: 0, z: 0 };

/** Any unit vector perpendicular to `v`; the sign is arbitrary. */
export function perpendicular(v: Vec3): Vec3 {
  const n = normalize(v);
  // Cross with whichever world axis is least aligned with n, so the cross
  // product is never near zero.
  const axis: Vec3 =
    Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const cross = {
    x: n.y * axis.z - n.z * axis.y,
    y: n.z * axis.x - n.x * axis.z,
    z: n.x * axis.y - n.y * axis.x,
  };
  return normalize(cross);
}

/** What a two-bone solve produced. */
export interface TwoBoneSolution {
  /** True when the target is out of reach and the chain has been straightened. */
  clamped: boolean;
  /** Distance from the root to the target. */
  reach: number;
  /** Bend angle of the first joint, radians. */
  upperAngle: number;
  /** Angle between the upper joint's direction and the root-target line. */
  rootAngle: number;
  /** Bend angle of the second joint, radians. */
  lowerAngle: number;
}

/**
 * The law of cosines solve for a two-bone chain: hip to knee to foot.
 *
 * `upper` and `lower` are bone lengths, `root` and `target` are world points.
 * Out of reach is not an error -- a leg reaching for a step it cannot take has
 * to straighten towards it, which is exactly what `clamped` reports -- but a
 * target *inside* the chain's minimum reach (closer to the hip than the lower
 * bone is long) would otherwise ask for an impossible bend and produce NaN.
 */
export function solveTwoBone(
  root: Vec3,
  target: Vec3,
  upper: number,
  lower: number,
): TwoBoneSolution {
  const a = Number.isFinite(upper) && upper > 0 ? upper : 0;
  const b = Number.isFinite(lower) && lower > 0 ? lower : 0;
  const delta = sub(target, root);
  const rawReach = length(delta);
  const maxReach = a + b;
  const minReach = Math.abs(a - b);
  const clamped = rawReach > maxReach;
  // Inside the minimum reach the chain folds back on itself; clamping to the
  // minimum keeps the knee pointing the same way instead of inverting.
  const reach = Math.min(maxReach, Math.max(minReach, rawReach));

  const cosRoot =
    a === 0 ? 1 : Math.min(1, Math.max(-1, (a * a + reach * reach - b * b) / (2 * a * reach)));
  const rootAngle = Math.acos(cosRoot);
  const cosUpper =
    a === 0 || b === 0 ? 1 : Math.min(1, Math.max(-1, (a * a + b * b - reach * reach) / (2 * a * b)));
  const knee = Math.acos(cosUpper);

  return {
    clamped,
    reach: rawReach,
    rootAngle,
    // The knee's interior angle is the supplement of the cosine result.
    upperAngle: rootAngle,
    lowerAngle: Math.PI - knee,
  };
}

/** Task 639: what the ground is at a point. */
export interface GroundPlane {
  /** Height of the ground at the origin, metres. */
  height: number;
  /** Ground slope, rise over run, along +X. */
  slopeX: number;
  /** Ground slope along +Z. */
  slopeZ: number;
}

/** Flat ground at y = 0. */
export const FLAT_GROUND: GroundPlane = { height: 0, slopeX: 0, slopeZ: 0 };

/** Height of a {@link GroundPlane} at a point. */
export function groundHeightAt(ground: GroundPlane, at: Vec3): number {
  const base = Number.isFinite(ground.height) ? ground.height : 0;
  const sx = Number.isFinite(ground.slopeX) ? ground.slopeX : 0;
  const sz = Number.isFinite(ground.slopeZ) ? ground.slopeZ : 0;
  return base + at.x * sx + at.z * sz;
}

/** Where a foot wants to be, and whether it is planted there. */
export interface FootTarget {
  /** World position the foot should be at. */
  position: Vec3;
  /** True while the foot is in contact with the ground. */
  planted: boolean;
  /** How far the hip has moved from this foot's plant, along the ground. */
  travelM: number;
  /**
   * How far through its step the foot is, 0 while planted and 1 as it lands.
   * Derived from travel rather than from a caller's clock: a step lasts as long
   * as the hip takes to cover the step length, so a character that speeds up
   * takes shorter steps automatically instead of moonwalking.
   */
  progress: number;
  /** The bone angles from the hip to this position. */
  solution: TwoBoneSolution;
}

/** Tuning for one foot. */
export interface FootGaitOptions {
  /** Length of the thigh, metres. */
  thighM: number;
  /** Length of the shin, metres. */
  shinM: number;
  /** Stride half-length: how far ahead of the hip a foot may reach, metres. */
  strideM: number;
  /**
   * How far the hip must move from the foot's plant before it lifts, metres.
   * Small values make a character shuffle; large ones make it moonwalk.
   */
  stepThresholdM: number;
  /** Vertical clearance a moving foot gets at the top of its step, metres. */
  stepHeightM: number;
  /** Height the hip is above the foot when standing, metres. */
  hipHeightM: number;
  /** Hip travel per step; defaults to the threshold plus the stride. */
  stepLengthM?: number;
}

/** A leg at walking pace for a 1.8 m character. */
export const DEFAULT_FOOT_GAIT: FootGaitOptions = {
  thighM: 0.45,
  shinM: 0.45,
  strideM: 0.35,
  stepThresholdM: 0.12,
  stepHeightM: 0.08,
  hipHeightM: 0.9,
};

/** Hip travel per step for a set of options. */
export function stepLengthFor(options: FootGaitOptions): number {
  const declared = options.stepLengthM;
  if (typeof declared === 'number' && Number.isFinite(declared) && declared > 0) return declared;
  const threshold = Math.max(0, options.stepThresholdM);
  const stride = Math.max(0, options.strideM);
  const derived = threshold + stride * 2;
  return derived > 0 ? derived : Number.POSITIVE_INFINITY;
}

/**
 * Task 639: one foot's target for this frame.
 *
 * The foot is planted where it first touched down and stays there until the hip
 * has moved `stepThresholdM` past it -- then it lifts, travels towards the point
 * under the hip, and lands. That is the difference between a character walking
 * and a character sliding, and it is all the caller has to supply: the position
 * the foot was last planted at.
 *
 * `travel` is measured along the ground between the foot's plant and the point
 * under the hip. The leg's own length is not travel, and counting it would lift
 * a foot that is standing still.
 */
export function footTargetFor(
  hip: Vec3,
  plantedAt: Vec3 | null,
  ground: GroundPlane = FLAT_GROUND,
  options: FootGaitOptions = DEFAULT_FOOT_GAIT,
  plantOffsetM = 0,
): FootTarget {
  const underHip = vec(hip.x + plantOffsetM, groundHeightAt(ground, hip), hip.z);
  const thigh = options.thighM;
  const shin = options.shinM;

  if (plantedAt === null) {
    // The first frame is a plant, not a step in progress: a character that
    // spawned mid-stride still starts with its feet on the ground.
    return {
      position: underHip,
      planted: true,
      travelM: 0,
      progress: 0,
      solution: solveTwoBone(hip, underHip, thigh, shin),
    };
  }

  const travel = distance(plantedAt, underHip);
  if (!Number.isFinite(travel)) {
    // The hip cannot be placed, so neither can the foot: hold it where it is
    // rather than lerping towards a NaN and leaving the leg undefined.
    return {
      position: plantedAt,
      planted: true,
      travelM: 0,
      progress: 0,
      solution: solveTwoBone(hip, plantedAt, thigh, shin),
    };
  }
  const threshold = Math.max(0, options.stepThresholdM);
  if (travel <= threshold) {
    return {
      position: plantedAt,
      planted: true,
      travelM: travel,
      progress: 0,
      solution: solveTwoBone(hip, plantedAt, thigh, shin),
    };
  }

  // Mid-step: how far through it, from the hip's travel alone.
  const stepLength = stepLengthFor(options);
  const raw = stepLength > 0 ? (travel - threshold) / stepLength : 1;
  const progress = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 1));
  // Half a sine: no lift at either end, maximum in the middle.
  const lift = Math.sin(progress * Math.PI) * Math.max(0, options.stepHeightM);
  const position = vec(
    plantedAt.x + (underHip.x - plantedAt.x) * progress,
    plantedAt.y + (underHip.y - plantedAt.y) * progress + lift,
    plantedAt.z + (underHip.z - plantedAt.z) * progress,
  );
  return {
    position,
    // Landing is reported, so a caller carries one position per foot and
    // nothing else -- and never ends up permanently mid-step with both feet in
    // the air.
    planted: progress >= 1,
    travelM: travel,
    progress,
    solution: solveTwoBone(hip, position, thigh, shin),
  };
}

/**
 * Task 639: both feet for a character at `hip`.
 *
 * No phase argument, and that is the point: the two feet stagger themselves
 * because each one lands a stride apart and then has to wait out its threshold
 * again. Anything driven by an external clock drifts out of step with the hips
 * the moment the speed changes.
 */
export function footTargetsForGait(
  hip: Vec3,
  planted: readonly (Vec3 | null)[],
  ground: GroundPlane = FLAT_GROUND,
  options: FootGaitOptions = DEFAULT_FOOT_GAIT,
): FootTarget[] {
  // One foot reaches forward of the hip and the other trails behind it.
  const half = Math.max(0, options.strideM) / 2;
  const front = footTargetFor(hip, planted[0] ?? null, ground, options, half);
  const back = footTargetFor(hip, planted[1] ?? null, ground, options, -half);
  // A walk always has one foot on the ground. Both feet are stepping at once
  // whenever they fell out of sync -- which they will, because each one only
  // measures its own travel -- and a character with both feet in the air is
  // hopping. So the step that is further along continues and the other waits.
  if (!front.planted && !back.planted) {
    const holding = { planted: true, progress: 0, solution: front.solution };
    return front.progress >= back.progress
      ? [front, { ...back, ...holding, position: planted[1] ?? back.position }]
      : [{ ...front, ...holding, position: planted[0] ?? front.position }, back];
  }
  return [front, back];
}

/**
 * Direction the leg should point, as a unit vector from the hip towards the
 * foot. A scene applies this to the thigh bone's orientation; the knee angle
 * comes from `solution.upperAngle`.
 */
export function legDirection(hip: Vec3, foot: Vec3): Vec3 {
  return normalize(sub(foot, hip));
}

/**
 * Direction perpendicular to a leg, for the knee's bend plane.
 *
 * `forward` is the direction the character faces. It is used to choose *which*
 * perpendicular, so the knee bends in the same plane the character is looking
 * along rather than flipping side to side frame to frame -- a knee that changes
 * its bend plane is what makes a walk look broken even when the foot is correct.
 */
export function kneeBendAxis(direction: Vec3, forward?: Vec3): Vec3 {
  const dir = length(direction) > 0 ? normalize(direction) : FALLBACK_AXIS;
  const facing = forward && length(forward) > 0 ? normalize(forward) : { x: 0, y: 0, z: 1 };
  // Any vector in the plane the character faces and is not along the leg works;
  // projecting the facing direction onto the leg's normal plane picks the stable
  // one, and falls back to an arbitrary perpendicular when they are parallel.
  const projected = sub(facing, scale(dir, dot(facing, dir)));
  return length(projected) > 1e-6 ? normalize(projected) : perpendicular(dir);
}

/**
 * Task 640: the hand holds the weapon, at the weapon's own grip point.
 *
 * The ten staged weapon GLBs have no rig and no named sockets -- they are a
 * single mesh each, authored lying along +X with the stock at the origin. So the
 * grip is derived from the geometry instead: a fraction along the weapon's
 * length for the firing hand, a fraction for the support hand. Because it is a
 * fraction, the same code holds an AK-74 and a P226 correctly, and the numbers
 * come out of the real accessor bounds rather than out of a hand-tuned table.
 *
 * The arm is then solved to that point with the same two-bone chain the legs use.
 */

/** A weapon's bounds, as read out of its GLB. */
export interface WeaponBounds {
  min: Vec3;
  max: Vec3;
}

/** Where on a weapon a hand goes. */
export interface GripSpec {
  /**
   * Along the weapon's length, 0 at the muzzle end of the box and 1 at the
   * other end. The firing hand sits back towards the stock; the support hand
   * sits forward of it.
   */
  alongM: number;
  /** Across the weapon, metres; a right-handed grip is slightly off-centre. */
  acrossM: number;
  /** Above the weapon's centreline, metres. */
  aboveM: number;
}

/**
 * A right-handed firing grip on a weapon laid out along +X: back from the front
 * of the box, level with the bore.
 */
export const FIRE_GRIP: GripSpec = { alongM: 0.32, acrossM: 0.02, aboveM: 0.03 };

/** A support hand further forward, under the handguard. */
export const SUPPORT_GRIP: GripSpec = { alongM: 0.62, acrossM: 0.0, aboveM: 0.02 };

/** Length of a weapon's bounds along its longest axis, metres. */
export function weaponLength(bounds: WeaponBounds): number {
  const dx = Math.abs(bounds.max.x - bounds.min.x);
  const dy = Math.abs(bounds.max.y - bounds.min.y);
  const dz = Math.abs(bounds.max.z - bounds.min.z);
  return Math.max(dx, dy, dz);
}

/**
 * The world-space point a hand should hold, from a grip spec and the weapon's
 * bounds.
 *
 * `alongM` is measured from the *rear* of the box towards its front, which is
 * the direction a weapon points in the staged files. A spec outside 0..1 is
 * clamped rather than extrapolated: a grip a few centimetres off the end of a
 * rifle is wrong, a grip half a metre off it is not a bug anyone should hit.
 */
export function gripPointFor(bounds: WeaponBounds, spec: GripSpec): Vec3 {
  const length = weaponLength(bounds);
  if (!(length > 0)) {
    // A zero-length weapon is a collapsed mesh; the origin is the only honest
    // answer, and the arm solve will clamp rather than invent a reach.
    return { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z };
  }
  const along = Math.min(1, Math.max(0, Number.isFinite(spec.alongM) ? spec.alongM : 0));
  const across = Number.isFinite(spec.acrossM) ? spec.acrossM : 0;
  const above = Number.isFinite(spec.aboveM) ? spec.aboveM : 0;
  // The longest axis is the weapon's length whichever axis it happens to be;
  // the two others are its width and height, both far smaller.
  const extents = [
    Math.abs(bounds.max.x - bounds.min.x),
    Math.abs(bounds.max.y - bounds.min.y),
    Math.abs(bounds.max.z - bounds.min.z),
  ];
  const longAxis = extents.indexOf(Math.max(...extents));
  const centre: Vec3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const offset = (along - 0.5) * length;

  if (longAxis === 0) return vec(centre.x + offset, centre.y + above, centre.z + across);
  if (longAxis === 1) return vec(centre.x + across, centre.y + offset, centre.z + above);
  return vec(centre.x + above, centre.y + across, centre.z + offset);
}

/** What an arm solve produced. */
export interface HandSolution {
  /** Point the hand ended up at, which may not be the grip if the arm is short. */
  hand: Vec3;
  /** The grip it was asked for. */
  grip: Vec3;
  /** Shoulder angle away from the arm-to-grip line, radians. */
  shoulderAngle: number;
  /** Elbow interior angle, radians; pi is straight. */
  elbowAngle: number;
  /** True when the grip was out of the arm's reach. */
  clamped: boolean;
  /** Where the elbow ended up, for a scene that positions it explicitly. */
  elbow: Vec3;
}

/** Arm lengths for a 1.8 m character. */
export const DEFAULT_ARM: { upperArmM: number; forearmM: number } = {
  upperArmM: 0.3,
  forearmM: 0.28,
};

/**
 * Task 640: solve an arm onto a grip point.
 *
 * `pole` is where the elbow should end up -- for a rifle hold that is out and
 * back from the shoulder, not tucked under. Defaulting it to a point below the
 * shoulder gives a natural elbow-down carry, which is right for a pistol at
 * rest and wrong for a shouldered rifle, so a caller holding a rifle passes the
 * pole explicitly.
 */
export function solveHandToGrip(
  shoulder: Vec3,
  grip: Vec3,
  pole: Vec3 | null = null,
  arm: { upperArmM: number; forearmM: number } = DEFAULT_ARM,
): HandSolution {
  const upper = Number.isFinite(arm.upperArmM) && arm.upperArmM > 0 ? arm.upperArmM : DEFAULT_ARM.upperArmM;
  const lower = Number.isFinite(arm.forearmM) && arm.forearmM > 0 ? arm.forearmM : DEFAULT_ARM.forearmM;
  const solution = solveTwoBone(shoulder, grip, upper, lower);
  const direction = length(sub(grip, shoulder)) > 0 ? normalize(sub(grip, shoulder)) : { x: 0, y: -1, z: 0 };
  const elbowTarget = pole ?? vec(shoulder.x, shoulder.y - upper, shoulder.z);
  // Keep the elbow on the pole side of the shoulder-grip line, at arm's length
  // from the shoulder: that is where a real elbow ends up.
  const along = sub(elbowTarget, shoulder);
  const projected = sub(along, scale(direction, dot(along, direction)));
  const bend = length(projected) > 1e-6 ? normalize(projected) : perpendicular(direction);
  const elbow = add(shoulder, scale(bend, upper));
  const clampedGrip = solution.clamped
    ? add(shoulder, scale(direction, upper + lower))
    : grip;
  return {
    hand: clampedGrip,
    grip,
    shoulderAngle: solution.rootAngle,
    elbowAngle: solution.lowerAngle,
    clamped: solution.clamped,
    elbow,
  };
}
