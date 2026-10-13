/**
 * Task 654: an animation's playback rate follows the character's speed, so the
 * feet do not slide, and the gait changes happen with hysteresis so a character
 * hovering at the threshold does not flip between two clips every frame.
 *
 * The relationship that matters is checked as a relationship, not as a number:
 * whatever the speed, the distance the character's feet cover in one clip has to
 * equal the distance it actually travelled in that time.
 */

import { describe, expect, it } from "vitest";
import {
  AUTHORED_RUN_SPEED,
  AUTHORED_WALK_SPEED,
  GAIT_HYSTERESIS_MPS,
  GAIT_THRESHOLD_MPS,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  gaitFor,
  locomotionPlayback,
  playbackRateFor,
} from "../Locomotion.js";

describe("playback rate (task 654)", () => {
  it("plays a clip at 1x at the speed it was authored at", () => {
    expect(playbackRateFor(AUTHORED_WALK_SPEED)).toBeCloseTo(1);
    expect(playbackRateFor(AUTHORED_RUN_SPEED, AUTHORED_RUN_SPEED)).toBeCloseTo(1);
  });

  it("slows down below the authored speed and speeds up above it", () => {
    expect(playbackRateFor(0.7)).toBeCloseTo(0.5);
    expect(playbackRateFor(2.8)).toBeCloseTo(2);
    expect(playbackRateFor(0.7)).toBeLessThan(1);
    expect(playbackRateFor(2.8)).toBeGreaterThan(1);
  });

  it("stops when the character is standing still", () => {
    // Zero, not a slow walk: a character standing at the origin playing a walk
    // cycle slides its feet through the floor.
    expect(playbackRateFor(0)).toBe(0);
    expect(playbackRateFor(-3)).toBe(0);
    expect(playbackRateFor(Number.NaN)).toBe(0);
  });

  it("clamps rather than extrapolating", () => {
    expect(playbackRateFor(0.01)).toBe(MIN_PLAYBACK_RATE);
    expect(playbackRateFor(500)).toBe(MAX_PLAYBACK_RATE);
    expect(MIN_PLAYBACK_RATE).toBeGreaterThan(0);
    expect(MAX_PLAYBACK_RATE).toBeGreaterThan(MIN_PLAYBACK_RATE);
  });

  it("falls back to the authored speed when the reference is broken", () => {
    expect(playbackRateFor(1.4, 0)).toBeCloseTo(1);
    expect(playbackRateFor(1.4, Number.NaN)).toBeCloseTo(1);
  });
});

describe("locomotionPlayback (task 654)", () => {
  it("keeps the stride the same at every speed, so the feet cannot slide", () => {
    // The invariant: a clip's stride is baked into the clip, so the rate has to
    // absorb every change of speed. If the stride changed with speed the feet
    // would have to travel further than the body does, which is the slide.
    const clipDurationS = 1.1;
    const expectedStride = AUTHORED_WALK_SPEED * clipDurationS;
    for (const speed of [0.6, 1.0, 1.4, 2.0, 3.5]) {
      const playback = locomotionPlayback(speed, clipDurationS);
      expect(playback.strideLengthM, `speed ${speed}`).toBeCloseTo(expectedStride, 6);
    }
  });

  it("accepts a sliding stride past the rate clamp, rather than a chipmunk run", () => {
    // Beyond MAX_PLAYBACK_RATE the clip cannot keep up, and the feet do slide.
    // That is the deliberate trade: a slight slide beats playing a walk clip at
    // four times speed, and a character that fast should be on a horse anyway.
    const clipDurationS = 1.1;
    const tooFast = locomotionPlayback(20, clipDurationS);
    expect(tooFast.rate).toBe(MAX_PLAYBACK_RATE);
    expect(tooFast.strideLengthM).toBeGreaterThan(AUTHORED_WALK_SPEED * clipDurationS);
  });

  it("changes the rate, not the stride, when a character speeds up", () => {
    const slow = locomotionPlayback(0.7, 1);
    const fast = locomotionPlayback(2.8, 1);
    expect(fast.rate).toBeGreaterThan(slow.rate);
    expect(slow.strideLengthM).toBeCloseTo(fast.strideLengthM, 6);
  });

  it("reports whether the character is actually moving", () => {
    expect(locomotionPlayback(1.4, 1).moving).toBe(true);
    expect(locomotionPlayback(0, 1).moving).toBe(false);
    expect(locomotionPlayback(Number.NaN, 1).moving).toBe(false);
  });

  it("survives a clip of no length", () => {
    const playback = locomotionPlayback(1.4, 0);
    expect(Number.isFinite(playback.strideLengthM)).toBe(true);
    expect(Number.isFinite(playback.rate)).toBe(true);
    expect(locomotionPlayback(1.4, Number.NaN).moving).toBe(true);
  });
});

describe("gait changes (task 654)", () => {
  it("walks below the threshold and runs above it", () => {
    expect(gaitFor(0)).toBe('idle');
    expect(gaitFor(1.2, 'walk')).toBe('walk');
    expect(gaitFor(3, 'walk')).toBe('run');
    expect(gaitFor(Number.NaN)).toBe('idle');
    // A crawl is a walk, not an idle: a character moving at 0.2 m/s is moving.
    expect(gaitFor(0.2)).toBe('walk');
  });

  it("does not flip at the threshold", () => {
    // On the boundary from a run it stays run; reaching it from a walk promotes.
    const atThreshold = GAIT_THRESHOLD_MPS;
    expect(gaitFor(atThreshold, 'run')).toBe('run');
    expect(gaitFor(atThreshold, 'walk')).toBe('run');
    // ...and the band is wide enough to survive a speed that wobbles.
    expect(gaitFor(atThreshold - GAIT_HYSTERESIS_MPS + 0.01, 'run')).toBe('run');
    expect(gaitFor(atThreshold - GAIT_HYSTERESIS_MPS - 0.01, 'run')).toBe('walk');
  });

  it("needs a real deceleration to drop out of a run", () => {
    let gait: ReturnType<typeof gaitFor> = 'run';
    for (const speed of [GAIT_THRESHOLD_MPS - 0.1, GAIT_THRESHOLD_MPS - 0.4]) {
      gait = gaitFor(speed, gait);
      expect(gait).toBe('run');
    }
    expect(gaitFor(GAIT_THRESHOLD_MPS - GAIT_HYSTERESIS_MPS - 0.1, gait)).toBe('walk');
  });

  it("treats a broken speed as standing still", () => {
    expect(gaitFor(Number.NaN, 'run')).toBe('idle');
    expect(gaitFor(Number.POSITIVE_INFINITY, 'run')).toBe('run');
  });
});
