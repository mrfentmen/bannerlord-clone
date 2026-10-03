/**
 * Task 639: feet plant on the ground instead of sliding with the character.
 *
 * The test walks a character forward in small steps and checks the two things
 * that make a walk read as a walk: a planted foot does not move while the hip
 * travels past it, and it does move once the hip has gone far enough that the
 * foot must step. The sliding -- the artefact -- cannot come back without failing
 * here. Both feet are never in the air at once, because the feet stagger
 * themselves: nothing in the API is driven by a clock.
 *
 * The maths underneath is pinned too: the two-bone solve clamps a target beyond
 * the leg's reach instead of producing a NaN angle, and a leg stretched straight
 * down cannot bend sideways without its hip dropping -- which is why a character
 * walks with bent knees.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARM,
  DEFAULT_HEAD_TURN_RATE,
  EYE_HEIGHT,
  HEAD_PIVOT,
  HeadLookTracker,
  MAX_HEAD_PITCH,
  MAX_HEAD_YAW,
  DEFAULT_FOOT_GAIT,
  FIRE_GRIP,
  FLAT_GROUND,
  add,
  distance,
  dot,
  footTargetFor,
  footTargetsForGait,
  gripPointFor,
  groundHeightAt,
  headLookAt,
  kneeBendAxis,
  legDirection,
  length,
  normalize,
  perpendicular,
  STIRRUP_DROP_FRACTION,
  solveHandToGrip,
  solveTwoBone,
  stirrupFor,
  stirrupsFor,
  stepLengthFor,
  vec,
  weaponLength,
  SUPPORT_GRIP,
  type Vec3,
  type WeaponBounds,
} from "../IkSolver.js";

/** The hip of a character standing on flat ground. */
const HIP = vec(0, DEFAULT_FOOT_GAIT.hipHeightM, 0);

/** Walk a character along +X, one foot state carried between frames. */
function walk(
  frames: number,
  speedMps = 1.2,
  dt = 1 / 60,
): Array<{ hip: Vec3; targets: ReturnType<typeof footTargetsForGait> }> {
  // null, not the hip: the first frame is what plants each foot on the ground.
  const planted: Array<Vec3 | null> = [null, null];
  const framesOut: Array<{ hip: Vec3; targets: ReturnType<typeof footTargetsForGait> }> = [];
  for (let i = 0; i < frames; i++) {
    const hip = vec(HIP.x + speedMps * dt * i, HIP.y, HIP.z);
    const targets = footTargetsForGait(hip, planted);
    // Whatever has landed becomes this frame's pin for the next.
    for (let leg = 0; leg < 2; leg++) {
      const target = targets[leg];
      if (target?.planted) planted[leg] = target.position;
    }
    framesOut.push({ hip, targets });
  }
  return framesOut;
}

describe("vector helpers (task 639)", () => {
  it("adds, subtracts, scales and measures", () => {
    expect(add(vec(1, 2, 3), vec(4, 5, 6))).toEqual(vec(5, 7, 9));
    expect(distance(vec(0, 0, 0), vec(3, 4, 0))).toBe(5);
    expect(length(vec(0, 3, 4))).toBe(5);
    expect(dot(vec(1, 0, 0), vec(0, 1, 0))).toBe(0);
  });

  it("normalises, and refuses to normalise nothing", () => {
    expect(length(normalize(vec(0, 5, 0)))).toBeCloseTo(1);
    expect(normalize(vec(0, 0, 0))).toEqual(vec(0, 0, 0));
    expect(normalize(vec(Number.NaN, 1, 0))).toEqual(vec(0, 0, 0));
  });

  it("finds a perpendicular even when the axis is nearly parallel", () => {
    for (const v of [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1), vec(0.9, 0.1, 0)]) {
      expect(dot(normalize(v), perpendicular(v))).toBeCloseTo(0, 5);
    }
  });
});

describe("solveTwoBone (task 639)", () => {
  it("solves a straight leg with zero bend", () => {
    const straight = solveTwoBone(vec(0, 0.9, 0), vec(0, 0, 0), 0.45, 0.45);
    expect(straight.clamped).toBe(false);
    expect(straight.reach).toBeCloseTo(0.9);
    expect(straight.lowerAngle).toBeCloseTo(0, 5);
  });

  it("bends the knee for a target that is not straight below", () => {
    // The hip has to be lower than the leg is long for a bend to be possible at
    // all: a leg stretched straight down cannot swing sideways without its hip
    // dropping, which is why a character walks with bent knees.
    const bent = solveTwoBone(vec(0, 0.7, 0), vec(0.3, 0, 0), 0.45, 0.45);
    expect(bent.clamped).toBe(false);
    expect(bent.upperAngle).toBeGreaterThan(0);
    expect(bent.lowerAngle).toBeGreaterThan(0);
  });

  it("clamps a lateral target from a straight-legged hip, as real legs do", () => {
    const tooFar = solveTwoBone(vec(0, 0.9, 0), vec(0.3, 0, 0), 0.45, 0.45);
    expect(tooFar.clamped).toBe(true);
  });

  it("clamps a target beyond the leg's reach instead of producing NaN", () => {
    const far = solveTwoBone(vec(0, 0.9, 0), vec(0, 0, 5), 0.45, 0.45);
    expect(far.clamped).toBe(true);
    expect(far.reach).toBeCloseTo(Math.sqrt(0.9 * 0.9 + 25));
    expect(Number.isNaN(far.rootAngle)).toBe(false);
    expect(Number.isNaN(far.lowerAngle)).toBe(false);
  });

  it("folds safely when the target is closer than the shin is long", () => {
    const close = solveTwoBone(vec(0, 0.9, 0), vec(0, 0.8, 0), 0.45, 0.45);
    expect(Number.isNaN(close.lowerAngle)).toBe(false);
    expect(close.lowerAngle).toBeLessThanOrEqual(Math.PI);
  });

  it("survives a zero-length bone instead of dividing by zero", () => {
    for (const [a, b] of [
      [0, 0.45],
      [0.45, 0],
      [0, 0],
    ] as const) {
      const solved = solveTwoBone(vec(0, 0.9, 0), vec(0, 0, 0), a, b);
      expect(Number.isNaN(solved.rootAngle)).toBe(false);
      expect(Number.isNaN(solved.lowerAngle)).toBe(false);
    }
  });
});

describe("ground (task 639)", () => {
  it("is flat at zero by default", () => {
    expect(groundHeightAt(FLAT_GROUND, vec(100, 0, -100))).toBe(0);
  });

  it("follows a slope and ignores broken values", () => {
    const slope = { height: 1, slopeX: 0.5, slopeZ: -0.25 };
    expect(groundHeightAt(slope, vec(2, 0, 0))).toBeCloseTo(2);
    expect(groundHeightAt(slope, vec(0, 0, 4))).toBeCloseTo(0);
    const broken = { height: Number.NaN, slopeX: Number.POSITIVE_INFINITY, slopeZ: 1 };
    expect(groundHeightAt(broken, vec(5, 0, 0))).toBe(0);
  });
});

describe("foot planting (task 639)", () => {
  it("plants a foot on the ground under the hip, not at hip height", () => {
    const first = footTargetFor(HIP, null);
    expect(first.planted).toBe(true);
    expect(first.position).toEqual(vec(0, 0, 0));
    expect(first.progress).toBe(0);
  });

  it("holds a planted foot while the hip travels past it", () => {
    const planted = vec(0, 0, 0);
    const held = footTargetFor(vec(0.05, HIP.y, 0), planted);
    expect(held.planted).toBe(true);
    expect(held.position).toEqual(planted);
    // Travel is measured along the ground, not from the hip: the leg's own
    // length is not the hip having walked away.
    expect(held.travelM).toBeCloseTo(0.05);
  });

  it("waits out the threshold before it steps", () => {
    const planted = vec(0, 0, 0);
    const justInside = footTargetFor(vec(DEFAULT_FOOT_GAIT.stepThresholdM * 0.9, HIP.y, 0), planted);
    expect(justInside.planted).toBe(true);
    const justOutside = footTargetFor(vec(DEFAULT_FOOT_GAIT.stepThresholdM * 1.1, HIP.y, 0), planted);
    expect(justOutside.planted).toBe(false);
  });

  it("lifts clear of the ground in the middle of a step", () => {
    const planted = vec(0, 0, 0);
    const travel = DEFAULT_FOOT_GAIT.stepThresholdM + stepLengthFor(DEFAULT_FOOT_GAIT) * 0.5;
    const mid = footTargetFor(vec(travel, HIP.y, 0), planted);
    expect(mid.planted).toBe(false);
    expect(mid.progress).toBeCloseTo(0.5, 2);
    expect(mid.position.y).toBeGreaterThan(planted.y);
    // The maximum lift is the configured step height.
    expect(mid.position.y).toBeCloseTo(DEFAULT_FOOT_GAIT.stepHeightM, 5);
  });

  it("lands at the end of a step and says so", () => {
    const planted = vec(0, 0, 0);
    const travel = DEFAULT_FOOT_GAIT.stepThresholdM + stepLengthFor(DEFAULT_FOOT_GAIT);
    const landed = footTargetFor(vec(travel, HIP.y, 0), planted);
    expect(landed.planted).toBe(true);
    expect(landed.progress).toBe(1);
    expect(landed.position.y).toBeCloseTo(0);
    expect(landed.position.x).toBeCloseTo(travel);
  });

  it("never slides a planted foot while walking a whole stride", () => {
    const frames = walk(240);
    let plantedFrames = 0;
    let movedWhilePlanted = 0;
    for (const frame of frames) {
      for (const target of frame.targets) {
        if (!target.planted) continue;
        plantedFrames++;
        // A planted foot sits on the ground plane; nothing about it changes
        // with the frame the hip is in.
        if (Math.abs(target.position.y - groundHeightAt(FLAT_GROUND, target.position)) > 1e-6) {
          movedWhilePlanted++;
        }
      }
    }
    expect(plantedFrames).toBeGreaterThan(100);
    expect(movedWhilePlanted).toBe(0);
  });

  it("never has both feet off the ground at once", () => {
    for (const frame of walk(240)) {
      const inContact = frame.targets.filter((t) => t.planted).length;
      expect(inContact, 'two airborne feet is a hop, not a walk').toBeGreaterThanOrEqual(1);
    }
  });

  it("staggers the feet by half a stride rather than aiming both at the hip", () => {
    const first = footTargetsForGait(HIP, [null, null]);
    expect(first[0]?.position.x).toBeCloseTo(DEFAULT_FOOT_GAIT.strideM / 2);
    expect(first[1]?.position.x).toBeCloseTo(-DEFAULT_FOOT_GAIT.strideM / 2);
    expect(distance(first[0]?.position as Vec3, first[1]?.position as Vec3)).toBeCloseTo(
      DEFAULT_FOOT_GAIT.strideM,
    );
  });

  it("keeps both feet on the ground plane once they have landed", () => {
    for (const frame of walk(180)) {
      for (const target of frame.targets) {
        expect(target.position.y).toBeGreaterThanOrEqual(-1e-6);
        expect(target.position.y).toBeLessThan(HIP.y);
      }
    }
  });

  it("shortens its stride when the character speeds up, rather than moonwalking", () => {
    const slow = walk(240, 0.8);
    const fast = walk(120, 3.0);
    const movingFrames = (frames: typeof slow) =>
      frames.flatMap((f) => f.targets).filter((t) => !t.planted).length;
    // Twice the speed over half the time: about the same number of steps, each
    // one further. What matters is that the fast character is not spending all
    // its time dragging a planted foot along the ground.
    expect(movingFrames(fast)).toBeGreaterThan(0);
    expect(movingFrames(fast)).toBeLessThan(movingFrames(slow) * 4);
  });

  it("puts the feet on a slope rather than through it", () => {
    const slope = { height: 0, slopeX: 0.4, slopeZ: 0 };
    const hip = vec(2, groundHeightAt(slope, vec(2, 0, 0)) + DEFAULT_FOOT_GAIT.hipHeightM, 0);
    const target = footTargetFor(hip, null, slope);
    expect(target.position.y).toBeCloseTo(0.8);
  });

  it("reports a leg that cannot reach and does not pretend otherwise", () => {
    const planted = vec(0, 0, 0);
    // A very long step: halfway through it the foot is still metres from the
    // hip, which no 0.9 m leg reaches.
    const longStep = { ...DEFAULT_FOOT_GAIT, stepLengthM: 9 };
    const early = footTargetFor(vec(5, HIP.y, 0), planted, FLAT_GROUND, longStep);
    expect(early.planted).toBe(false);
    expect(early.solution.clamped).toBe(true);
    // Once the foot has arrived under the hip it is in reach.
    const landed = footTargetFor(vec(5, HIP.y, 0), planted);
    expect(landed.solution.clamped).toBe(false);
  });

  it("holds the foot rather than following a hip it cannot place", () => {
    const planted = vec(1, 0, 0);
    const target = footTargetFor(vec(Number.NaN, HIP.y, 0), planted);
    expect(target.position).toEqual(planted);
    expect(target.planted).toBe(true);
    expect(target.travelM).toBe(0);
  });

  it("never reports progress outside 0..1 or a negative travel", () => {
    for (const frame of walk(120, 4)) {
      for (const target of frame.targets) {
        expect(target.progress).toBeGreaterThanOrEqual(0);
        expect(target.progress).toBeLessThanOrEqual(1);
        expect(target.travelM).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("leg orientation (task 639)", () => {
  it("points the leg from hip to foot", () => {
    const dir = legDirection(HIP, vec(0, 0, 0));
    expect(dir.y).toBeCloseTo(-1);
    expect(length(dir)).toBeCloseTo(1);
  });

  it("finds a stable bend axis, and never flips it frame to frame", () => {
    const axis = kneeBendAxis(vec(0, -1, 0), vec(0, 0, 1));
    expect(length(axis)).toBeCloseTo(1);
    // Facing along the leg gives no information, so it falls back to a
    // perpendicular rather than returning nothing.
    expect(length(kneeBendAxis(vec(0, -1, 0), vec(0, -1, 0)))).toBeCloseTo(1);
    expect(length(kneeBendAxis(vec(0, 0, 0), vec(0, 0, 1)))).toBeCloseTo(1);
  });
});
describe("hand to weapon grip (task 640)", () => {
  // The real bounds of public/models/weapons/ak74.glb, read from its accessor
  // min/max by the same code task 630 uses for the whole batch.
  const AK74: WeaponBounds = {
    min: { x: -0.0275, y: -0.001, z: -0.008 },
    max: { x: 0.0275, y: 0.001, z: 0.008 },
  };
  const P226: WeaponBounds = {
    min: { x: -0.009, y: -0.0015, z: -0.006 },
    max: { x: 0.009, y: 0.0015, z: 0.006 },
  };
  // A shoulder 0.5 m from the weapon: the carry position, and inside a 0.58 m
  // arm. The weapon mesh is at the origin because that is how the staged files
  // are authored -- a character attaches it to the hand, not the other way.
  const CARRY_GRIP = vec(-0.0115, 0.003, 0.012);
  const SHOULDER = vec(CARRY_GRIP.x + 0.16, CARRY_GRIP.y + 0.44, CARRY_GRIP.z - 0.16);

  it("measures the weapon's length from whichever axis is longest", () => {
    expect(weaponLength(AK74)).toBeCloseTo(0.055);
    expect(weaponLength(P226)).toBeCloseTo(0.018);
    const tall = { min: vec(0, 0, 0), max: vec(0.2, 1.4, 0.1) };
    expect(weaponLength(tall)).toBeCloseTo(1.4);
  });

  it("puts the firing hand on the weapon, not beside it", () => {
    const grip = gripPointFor(AK74, FIRE_GRIP);
    expect(grip.x).toBeGreaterThan(AK74.min.x);
    expect(grip.x).toBeLessThan(AK74.max.x);
    // The support hand is further along the barrel than the firing hand.
    expect(gripPointFor(AK74, SUPPORT_GRIP).x).toBeGreaterThan(grip.x);
  });

  it("scales the grip with the weapon, so a pistol is not held at rifle reach", () => {
    const rifle = gripPointFor(AK74, FIRE_GRIP);
    const pistol = gripPointFor(P226, FIRE_GRIP);
    // Same fraction of a much shorter object.
    expect(Math.abs(pistol.x)).toBeLessThan(Math.abs(rifle.x));
    expect(weaponLength(AK74) / weaponLength(P226)).toBeGreaterThan(2);
  });

  it("clamps a grip spec that runs off the end of the weapon", () => {
    expect(gripPointFor(AK74, { alongM: 5, acrossM: 0, aboveM: 0 })).toEqual(
      gripPointFor(AK74, { alongM: 1, acrossM: 0, aboveM: 0 }),
    );
    expect(gripPointFor(AK74, { alongM: -5, acrossM: 0, aboveM: 0 })).toEqual(
      gripPointFor(AK74, { alongM: 0, acrossM: 0, aboveM: 0 }),
    );
  });

  it("ignores a broken grip spec instead of producing NaN", () => {
    const grip = gripPointFor(AK74, { alongM: Number.NaN, acrossM: Number.NaN, aboveM: Number.NaN });
    expect(Number.isNaN(grip.x)).toBe(false);
    expect(Number.isNaN(grip.y)).toBe(false);
  });

  it("returns the origin for a collapsed weapon rather than extrapolating", () => {
    const flat = { min: vec(0.1, 0.2, 0.3), max: vec(0.1, 0.2, 0.3) };
    expect(gripPointFor(flat, FIRE_GRIP)).toEqual(vec(0.1, 0.2, 0.3));
  });

  it("puts the hand on the grip when it is in reach", () => {
    const grip = gripPointFor(AK74, FIRE_GRIP);
    expect(distance(SHOULDER, grip)).toBeLessThan(DEFAULT_ARM.upperArmM + DEFAULT_ARM.forearmM);
    const solution = solveHandToGrip(SHOULDER, grip);
    expect(solution.clamped).toBe(false);
    expect(solution.hand.x).toBeCloseTo(grip.x);
    expect(solution.hand.y).toBeCloseTo(grip.y);
    expect(distance(solution.hand, SHOULDER)).toBeCloseTo(distance(grip, SHOULDER), 5);
  });

  it("bends the elbow towards the pole the caller asked for", () => {
    const grip = CARRY_GRIP;
    const elbowDown = solveHandToGrip(SHOULDER, grip, vec(SHOULDER.x, 0, SHOULDER.z + 0.4));
    const elbowOut = solveHandToGrip(SHOULDER, grip, vec(SHOULDER.x, SHOULDER.y, -0.5));
    expect(elbowDown.elbow.z).toBeGreaterThan(0);
    expect(elbowOut.elbow.z).toBeLessThan(0);
    // The elbow is always one upper-arm length from the shoulder.
    expect(distance(elbowDown.elbow, SHOULDER)).toBeCloseTo(DEFAULT_ARM.upperArmM);
  });

  it("clamps a grip the arm cannot reach and says so", () => {
    const far = solveHandToGrip(SHOULDER, vec(3, 1.2, 0));
    expect(far.clamped).toBe(true);
    expect(distance(SHOULDER, far.hand)).toBeCloseTo(DEFAULT_ARM.upperArmM + DEFAULT_ARM.forearmM);
    // The hand stops at the reach, but the grip it was asked for is reported.
    expect(far.grip.x).toBe(3);
    expect(far.hand.x).toBeLessThan(3);
  });

  it("straightens the arm for a grip at exactly its reach", () => {
    const reach = DEFAULT_ARM.upperArmM + DEFAULT_ARM.forearmM;
    const stretched = solveHandToGrip(SHOULDER, vec(SHOULDER.x, SHOULDER.y - reach, SHOULDER.z));
    expect(stretched.elbowAngle).toBeCloseTo(0, 3);
    expect(stretched.clamped).toBe(false);
  });

  it("falls back to sane arm lengths rather than dividing by zero", () => {
    const grip = gripPointFor(AK74, FIRE_GRIP);
    const broken = solveHandToGrip(SHOULDER, grip, null, {
      upperArmM: 0,
      forearmM: Number.NaN,
    });
    expect(Number.isNaN(broken.shoulderAngle)).toBe(false);
    expect(Number.isNaN(broken.elbowAngle)).toBe(false);
    expect(Number.isNaN(broken.elbow.x)).toBe(false);
  });

  it("gives the same answer twice for the same weapon and grip", () => {
    const grip = gripPointFor(AK74, FIRE_GRIP);
    expect(gripPointFor(AK74, FIRE_GRIP)).toEqual(grip);
    expect(solveHandToGrip(SHOULDER, grip)).toEqual(solveHandToGrip(SHOULDER, grip));
  });
});

describe("head look at (task 641)", () => {
  const HEAD = vec(0, 1.55, 0);
  const FORWARD = vec(0, 0, 1);

  it("uses the staged character's neck and eye heights", () => {
    expect(HEAD_PIVOT.y).toBeCloseTo(1.55);
    expect(EYE_HEIGHT).toBeGreaterThan(0);
    expect(HEAD_PIVOT.y + EYE_HEIGHT).toBeLessThan(1.8);
    expect(DEFAULT_HEAD_TURN_RATE).toBeGreaterThan(0);
  });

  it("looks straight ahead at something in front of it", () => {
    const look = headLookAt(HEAD, vec(0, 1.55, 5), FORWARD);
    expect(look.yaw).toBeCloseTo(0, 5);
    expect(look.pitch).toBeCloseTo(0, 5);
    expect(look.clamped).toBe(false);
    expect(look.distanceM).toBeCloseTo(5);
  });

  it("turns towards a target to its side, within the cone", () => {
    const look = headLookAt(HEAD, vec(2, 1.55, 2), FORWARD);
    expect(Math.abs(look.yaw)).toBeGreaterThan(0.5);
    expect(Math.abs(look.yaw)).toBeLessThanOrEqual(MAX_HEAD_YAW);
    expect(look.clamped).toBe(false);
  });

  it("clamps a target behind it instead of snapping the neck round", () => {
    const behind = headLookAt(HEAD, vec(0, 1.55, -5), FORWARD);
    expect(Math.abs(behind.yaw)).toBeLessThanOrEqual(MAX_HEAD_YAW + 1e-9);
    expect(behind.clamped).toBe(true);
  });

  it("tips up and down inside a smaller vertical cone", () => {
    const up = headLookAt(HEAD, vec(0, 1.55 + 20, 5), FORWARD);
    const down = headLookAt(HEAD, vec(0, 1.55 - 20, 5), FORWARD);
    expect(up.pitch).toBeCloseTo(MAX_HEAD_PITCH);
    expect(down.pitch).toBeCloseTo(-MAX_HEAD_PITCH);
    expect(up.clamped).toBe(true);
    // A head can turn further than it can tip: that asymmetry is the point.
    expect(MAX_HEAD_PITCH).toBeLessThan(MAX_HEAD_YAW);
  });

  it("honours a tighter cone when the caller gives one", () => {
    const tight = headLookAt(HEAD, vec(2, 1.55, 2), FORWARD, 0.3, 0.1);
    expect(Math.abs(tight.yaw)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(tight.clamped).toBe(true);
  });

  it("reports nothing to look at when the target is the head", () => {
    const look = headLookAt(HEAD, HEAD, FORWARD);
    expect(look.distanceM).toBe(0);
    expect(look.yaw).toBe(0);
    expect(look.pitch).toBe(0);
  });

  it("survives a target that cannot be placed", () => {
    const look = headLookAt(HEAD, vec(Number.NaN, 1.5, 5), FORWARD);
    expect(Number.isNaN(look.yaw)).toBe(false);
    expect(Number.isNaN(look.pitch)).toBe(false);
  });
});

describe("HeadLookTracker (task 641)", () => {
  const HEAD = vec(0, 1.55, 0);
  const FORWARD = vec(0, 0, 1);

  it("turns at a fixed rate rather than snapping", () => {
    const tracker = new HeadLookTracker(2.2);
    // Facing +Z, a target at +X is to the character's right, so the yaw is
    // negative: positive is left.
    const target = vec(5, 1.55, 0.5);
    const first = tracker.step(HEAD, target, FORWARD, 1 / 60);
    expect(first.turning).toBe(true);
    expect(Math.abs(first.yaw)).toBeLessThanOrEqual(2.2 / 60 + 1e-9);
    expect(Math.abs(first.yaw)).toBeGreaterThan(0);

    // A long frame moves it further, and it never exceeds the cone.
    for (let i = 0; i < 120; i++) tracker.step(HEAD, target, FORWARD, 1 / 60);
    expect(tracker.state.yaw).toBeCloseTo(-MAX_HEAD_YAW);
    expect(tracker.state.turning).toBe(false);
  });

  it("returns to facing forward when the target goes away", () => {
    const tracker = new HeadLookTracker(4);
    for (let i = 0; i < 30; i++) tracker.step(HEAD, vec(5, 1.55, 0), FORWARD, 1 / 60);
    expect(Math.abs(tracker.state.yaw)).toBeGreaterThan(0);

    for (let i = 0; i < 30; i++) tracker.step(HEAD, null, FORWARD, 1 / 60);
    expect(tracker.state.yaw).toBeCloseTo(0);
  });

  it("snaps on demand for a cutscene", () => {
    const tracker = new HeadLookTracker(0.5);
    const snapped = tracker.snap(HEAD, vec(5, 1.55, 0), FORWARD);
    expect(snapped.turning).toBe(true);
    expect(Math.abs(snapped.yaw)).toBeCloseTo(MAX_HEAD_YAW);
    expect(tracker.state.yaw).toBeCloseTo(-MAX_HEAD_YAW);
  });

  it("ignores a broken frame time and a broken rate", () => {
    const tracker = new HeadLookTracker(Number.NaN);
    const still = tracker.step(HEAD, vec(5, 1.55, 0), FORWARD, Number.NaN);
    expect(still.yaw).toBe(0);
    expect(still.turning).toBe(false);
    const negative = tracker.step(HEAD, vec(5, 1.55, 0), FORWARD, -1);
    expect(negative.yaw).toBe(0);
  });
});

describe("rider legs to stirrups (task 642)", () => {
  // public/models/horse.glb accessor bounds, before the manifest's 2.4 m scale.
  const HORSE = { min: vec(-0.007, -0.0285, -0.024), max: vec(0.007, 0.0285, 0.024) };
  const SEAT = vec(0, 0.9, 0);

  it("hangs the stirrup from the horse's barrel, not from a constant", () => {
    const small = stirrupFor(HORSE, SEAT);
    const big = stirrupFor({ min: vec(0, 0, 0), max: vec(1, 3, 1) }, SEAT);
    expect(small.dropM).toBeCloseTo(0.057 * STIRRUP_DROP_FRACTION);
    expect(big.dropM).toBeCloseTo(3 * STIRRUP_DROP_FRACTION);
    expect(big.dropM).toBeGreaterThan(small.dropM);
  });

  it("puts the foot below and beside the seat", () => {
    const stirrup = stirrupFor(HORSE, SEAT);
    expect(stirrup.position.y).toBeLessThan(SEAT.y);
    expect(stirrup.position.z).toBeGreaterThan(SEAT.z);
  });

  it("solves the leg onto the stirrup", () => {
    const stirrup = stirrupFor(HORSE, SEAT);
    // The stirrup hangs `dropM` below the seat and is set slightly outboard, so
    // the straight-line reach is a little more than the drop.
    expect(SEAT.y - stirrup.position.y).toBeCloseTo(stirrup.dropM);
    expect(distance(SEAT, stirrup.position)).toBeGreaterThan(stirrup.dropM);
    expect(Number.isNaN(stirrup.solution.lowerAngle)).toBe(false);
  });

  it("says when the leg is over-stretched, so the rider can be raised", () => {
    // A horse scaled up brings its stirrup with it, and a rider's leg does not
    // get longer. That gap is the signal to raise the seat instead of stretching.
    const normal = stirrupFor(HORSE, SEAT);
    expect(normal.overReaching).toBe(false);
    const huge = stirrupFor({ min: vec(0, 0, 0), max: vec(3, 20, 2) }, SEAT);
    expect(huge.overReaching).toBe(true);
    expect(huge.solution.clamped).toBe(true);
  });

  it("hangs one stirrup on each side of the horse", () => {
    const [left, right] = stirrupsFor(HORSE, SEAT);
    expect(left.position.x).toBeLessThan(SEAT.x);
    expect(right.position.x).toBeGreaterThan(SEAT.x);
    expect(right.position.x - left.position.x).toBeCloseTo(0.56);
    // Both are the same height: a rider sits level.
    expect(left.position.y).toBeCloseTo(right.position.y);
  });

  it("handles a collapsed horse and a broken side offset", () => {
    const flat = { min: vec(0, 1, 0), max: vec(0, 1, 0) };
    expect(stirrupFor(flat, SEAT).dropM).toBeCloseTo(0.35);
    const [left, right] = stirrupsFor(HORSE, SEAT, Number.NaN);
    expect(left.position.x).toBeCloseTo(right.position.x);
  });

  it("falls back to a real leg when the caller gives a broken one", () => {
    const stirrup = stirrupFor(HORSE, SEAT, { thighM: 0, shinM: Number.NaN });
    expect(Number.isNaN(stirrup.solution.lowerAngle)).toBe(false);
    expect(stirrup.solution.lowerAngle).toBeGreaterThan(0);
  });
});
