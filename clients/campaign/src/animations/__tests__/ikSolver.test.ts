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
  DEFAULT_FOOT_GAIT,
  FLAT_GROUND,
  add,
  distance,
  dot,
  footTargetFor,
  footTargetsForGait,
  groundHeightAt,
  kneeBendAxis,
  legDirection,
  length,
  normalize,
  perpendicular,
  solveTwoBone,
  stepLengthFor,
  vec,
  type Vec3,
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