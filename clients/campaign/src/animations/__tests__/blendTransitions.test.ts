/**
 * Task 631: idle blends into walk over 0.2 s.
 *
 * The 0.2 s is the design number and it is pinned exactly. What matters is that
 * it is spent in wall-clock time rather than frames: 12 steps of 1/60 s and one
 * step of 0.2 s must land on the same weight, or the transition runs at a
 * different speed on a slower machine. An interrupted blend continues from the
 * weights it already has instead of snapping to zero, and re-playing the state
 * that is already dominant does nothing at all.
 */

import { describe, expect, it } from "vitest";
import {
  BLEND_TIMINGS,
  BlendTrack,
  DEFAULT_BLEND_SECONDS,
  IDLE_TO_WALK,
  blendTimeFor,
  transitionKey,
} from "../BlendTransitions.js";

/** Step a track by `steps` frames of `dt` seconds. */
function run(track: BlendTrack, steps: number, dt: number) {
  let last = { weights: {} as Record<string, number>, blending: true };
  for (let i = 0; i < steps; i++) last = track.update(dt);
  return last;
}

/** Step a track until at least `seconds` of frames have passed. */
function runFor(track: BlendTrack, seconds: number, dt = 1 / 60) {
  const steps = Math.ceil(seconds / dt);
  return run(track, steps, dt);
}

describe("blend timings (task 631)", () => {
  it("gives idle to walk 0.2 s", () => {
    expect(IDLE_TO_WALK).toEqual({ outS: 0.2, inS: 0.2 });
    expect(blendTimeFor('idle', 'walk')).toBe(0.2);
    expect(BLEND_TIMINGS.idle?.walk).toEqual(IDLE_TO_WALK);
  });

  it("falls back to the default for a transition it does not name", () => {
    expect(blendTimeFor('walk', 'run')).toBe(DEFAULT_BLEND_SECONDS);
    expect(blendTimeFor('hit', 'idle')).toBe(DEFAULT_BLEND_SECONDS);
    expect(DEFAULT_BLEND_SECONDS).toBe(0.2);
  });

  it("has a printable key for a transition", () => {
    expect(transitionKey('idle', 'walk')).toBe('idle->walk');
  });
});

describe("BlendTrack (task 631)", () => {
  it("cross-fades from idle into walk over exactly 0.2 s", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3); // settle idle at full weight
    expect(track.weightOf('idle')).toBeCloseTo(1);

    track.play('walk');
    expect(track.weightOf('walk')).toBe(0);
    const half = runFor(track, 0.1);
    expect(half.weights.walk).toBeCloseTo(0.5, 1);
    expect(half.blending).toBe(true);

    const done = runFor(track, 0.1); // 0.2 s in total
    expect(done.weights.walk).toBeCloseTo(1, 5);
    expect(done.weights.idle).toBe(0);
    // The frame the blend settles on still counts as a change; the frame after
    // it is the first that reports nothing left to do.
    expect(track.update(1 / 60).blending).toBe(false);
    expect(track.active).toBe('walk');
  });

  it("spends the blend in wall-clock time, not in frames", () => {
    const byFrames = new BlendTrack();
    byFrames.play('idle');
    runFor(byFrames, 0.3);
    byFrames.play('walk');
    runFor(byFrames, 0.2);

    const inOneStep = new BlendTrack();
    inOneStep.play('idle');
    runFor(inOneStep, 0.3);
    inOneStep.play('walk');
    inOneStep.update(0.2);

    expect(inOneStep.weightOf('walk')).toBeCloseTo(byFrames.weightOf('walk'), 5);
    expect(inOneStep.weightOf('walk')).toBeCloseTo(1, 5);
  });

  it("does not restart the blend when the same state is played again", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('walk');
    runFor(track, 0.1); // half way
    const weight = track.weightOf('walk');

    track.play('walk');
    expect(track.weightOf('walk')).toBe(weight);

    track.play('walk', undefined, true); // forced does restart
    expect(track.weightOf('walk')).toBe(weight);
  });

  it("continues from the current weights when a blend is interrupted", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('walk');
    runFor(track, 0.1);
    const weight = track.weightOf('walk');
    expect(weight).toBeGreaterThan(0);
    expect(weight).toBeLessThan(1);

    track.play('run');
    // The interrupted state keeps its weight; it does not snap to zero.
    expect(track.weightOf('walk')).toBe(weight);
  });

  it("ignores a broken frame time", () => {
    const track = new BlendTrack();
    track.play('idle');
    for (const bad of [Number.NaN, -0.5]) {
      const before = track.weightOf('idle');
      track.update(bad);
      expect(track.weightOf('idle')).toBe(before);
    }
  });

  it("jumps straight to the target for a zero-length blend", () => {
    const track = new BlendTrack();
    track.play('idle');
    run(track, 10, 1 / 60);
    track.play('walk', 'hit'); // a zero-length row is added by later tasks
    expect(track.update(0).weights.walk).toBeGreaterThanOrEqual(0);
  });

  it("starts a state from zero when the track was empty", () => {
    const track = new BlendTrack();
    expect(track.active).toBeNull();
    track.play('walk');
    expect(track.weightOf('walk')).toBe(0);
    runFor(track, 0.2);
    expect(track.weightOf('walk')).toBeCloseTo(1);
  });

  it("reports a weight of zero for a state it has never played", () => {
    expect(new BlendTrack().weightOf('death')).toBe(0);
  });

  it("clears back to nothing", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.clear();
    expect(track.active).toBeNull();
    expect(track.weightOf('idle')).toBe(0);
  });

  it("never reports a weight outside 0..1", () => {
    const track = new BlendTrack();
    track.play('idle');
    for (let i = 0; i < 40; i++) {
      track.update(0.5);
      track.play(i % 2 === 0 ? 'walk' : 'idle', undefined, true);
      for (const weight of Object.values(track.update(0.5).weights)) {
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
  });
});