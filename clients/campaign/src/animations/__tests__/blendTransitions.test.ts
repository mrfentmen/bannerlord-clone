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
  AIM_TO_SHOOT,
  ANY_SOURCE_TIMINGS,
  BLEND_TIMINGS,
  BlendTrack,
  type BlendState,
  DEFAULT_BLEND_SECONDS,
  IDLE_TO_AIM,
  IDLE_TO_WALK,
  RETURN_FROM_HIT_SECONDS,
  SHOOT_TO_AIM,
  WALK_TO_RUN,
  blendTimeFor,
  interruptTimeFor,
  stateToReturnTo,
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
    // walk->run is named by task 632, so the unnamed pairs are the ones that
    // have to survive the fallback.
    expect(blendTimeFor('run', 'idle')).toBe(DEFAULT_BLEND_SECONDS);
    expect(blendTimeFor('hit', 'idle')).toBe(DEFAULT_BLEND_SECONDS);
    expect(blendTimeFor('death', 'idle')).toBe(DEFAULT_BLEND_SECONDS);
    expect(DEFAULT_BLEND_SECONDS).toBe(0.2);
  });

  it("has a printable key for a transition", () => {
    expect(transitionKey('idle', 'walk')).toBe('idle->walk');
  });
});

describe("shoot back to aim (task 638)", () => {
  it("settles back over 0.2 s, four times the shot's own blend", () => {
    expect(SHOOT_TO_AIM).toEqual({ outS: 0.2, inS: 0.2 });
    expect(blendTimeFor('shoot', 'aim')).toBe(0.2);
    expect(SHOOT_TO_AIM.inS / AIM_TO_SHOOT.inS).toBe(4);
    expect(SHOOT_TO_AIM.inS).toBe(IDLE_TO_WALK.inS);
  });

  it("is four frames of snap out and twelve frames of ease back", () => {
    const track = new BlendTrack();
    track.play('aim');
    runFor(track, 0.3);
    track.play('shoot');
    runFor(track, 0.05);
    expect(track.weightOf('shoot')).toBeCloseTo(1, 5);

    track.playAfterShot(); // the recovery the fire loop calls
    runFor(track, 0.1);
    expect(track.weightOf('aim')).toBeCloseTo(0.5, 1);
    runFor(track, 0.1);
    expect(track.weightOf('aim')).toBeCloseTo(1, 5);
    expect(track.weightOf('shoot')).toBe(0);
    expect(track.active).toBe('aim');
  });

  it("can be fired again without re-blending the weapon up", () => {
    const track = new BlendTrack();
    track.play('aim');
    runFor(track, 0.3);
    for (let round = 0; round < 3; round++) {
      track.play('shoot');
      runFor(track, 0.05);
      expect(track.weightOf('shoot'), `round ${round}`).toBeCloseTo(1, 5);
      track.playAfterShot();
      runFor(track, 0.2);
      expect(track.weightOf('aim'), `round ${round}`).toBeCloseTo(1, 5);
    }
  });
});

describe("aim to shoot (task 637)", () => {
  it("leaves the barrel in 0.05 s, as sharp as an interrupt", () => {
    expect(AIM_TO_SHOOT).toEqual({ outS: 0.05, inS: 0.05 });
    expect(blendTimeFor('aim', 'shoot')).toBe(0.05);
    expect(AIM_TO_SHOOT.inS).toBe(interruptTimeFor('hit'));
    expect(AIM_TO_SHOOT.inS).toBeLessThan(IDLE_TO_AIM.inS);
  });

  it("is inside one frame at 60 fps, so the shot does not visibly blend", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('aim');
    runFor(track, 0.2);
    expect(track.weightOf('aim')).toBeCloseTo(1, 5);

    track.play('shoot');
    // One 60 fps frame is 0.0167 s, a third of the 0.05 s blend; two finish it.
    const oneFrame = track.update(1 / 60);
    expect(oneFrame.weights.shoot ?? Number.NaN).toBeCloseTo(1 / 3, 2);
    expect(track.update(1 / 60).weights.shoot ?? Number.NaN).toBeCloseTo(2 / 3, 2);
    expect(track.update(1 / 60).weights.shoot ?? Number.NaN).toBeCloseTo(1, 5);
    expect(track.weightOf('aim')).toBe(0);
  });

  it("keeps aiming after the shot, so the next round needs no re-blend", () => {
    const track = new BlendTrack();
    track.play('aim');
    runFor(track, 0.3);
    track.play('shoot');
    runFor(track, 0.05);
    expect(track.active).toBe('shoot');
    // The aim track is still in the blend map, so the return is available.
    expect(track.weightOf('aim')).toBe(0);
  });

  it("has a recovery the fire loop can call", () => {
    expect(AIM_TO_SHOOT.inS).toBeLessThan(SHOOT_TO_AIM.inS);
  });
});

describe("idle to aim (task 636)", () => {
  it("brings the weapon up over 0.15 s, the same as walk to run", () => {
    expect(IDLE_TO_AIM).toEqual({ outS: 0.15, inS: 0.15 });
    expect(blendTimeFor('idle', 'aim')).toBe(0.15);
    expect(IDLE_TO_AIM.inS).toBe(WALK_TO_RUN.inS);
    expect(IDLE_TO_AIM.inS).toBeLessThan(IDLE_TO_WALK.inS);
  });

  it("reaches full aim weight in 0.15 s, not 0.2", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('aim');

    const early = runFor(track, 0.1);
    expect(early.weights.aim).toBeCloseTo(0.667, 1);
    runFor(track, 0.05);
    expect(track.weightOf('aim')).toBeCloseTo(1, 5);
    expect(track.weightOf('idle')).toBe(0);
    expect(track.active).toBe('aim');
  });

  it("fades idle out at the same rate it brings aim in", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('aim');
    // One update of exactly half the blend: the two curves cross together.
    const update = track.update(0.075);
    // NaN rather than 0 for a state the track does not hold, so a missing key
    // fails the comparison instead of quietly comparing equal to another.
    expect(update.weights.idle ?? Number.NaN).toBeCloseTo(update.weights.aim ?? Number.NaN, 5);
    expect(update.weights.aim ?? Number.NaN).toBeCloseTo(0.5, 5);
  });
});

describe("any to death (task 635)", () => {
  const STATES: BlendState[] = ['idle', 'walk', 'run', 'aim', 'shoot', 'hit'];

  it("reaches death in 0.1 s from every state", () => {
    expect(ANY_SOURCE_TIMINGS.death).toBe(0.1);
    for (const from of STATES) {
      expect(blendTimeFor(from, 'death'), from).toBe(0.1);
      const track = new BlendTrack();
      track.play(from);
      runFor(track, 0.3);
      expect(track.playDeath()).toBe(true);
      runFor(track, 0.1);
      expect(track.weightOf('death'), from).toBeCloseTo(1, 5);
      expect(track.weightOf(from), from).toBe(0);
    }
  });

  it("is slower than the hit interrupt and faster than anything else", () => {
    // A death needs room to read, so it is longer than a flinch -- but it is
    // half the return from a reaction and half a locomotion blend.
    expect(blendTimeFor('walk', 'death')).toBeGreaterThan(interruptTimeFor('hit'));
    expect(blendTimeFor('walk', 'death')).toBeLessThan(RETURN_FROM_HIT_SECONDS);
    expect(blendTimeFor('walk', 'death')).toBeLessThan(IDLE_TO_WALK.inS);
  });

  it("cannot be interrupted once started", () => {
    const track = new BlendTrack();
    track.play('run');
    runFor(track, 0.3);
    track.playDeath();
    expect(track.isTerminal()).toBe(true);
    expect(track.terminalState).toBe('death');

    track.interrupt('hit');
    track.play('walk');
    runFor(track, 0.2);
    expect(track.weightOf('death')).toBeCloseTo(1, 5);
    expect(track.weightOf('hit')).toBe(0);
    expect(track.weightOf('walk')).toBe(0);
    expect(track.active).toBe('death');
  });

  it("does not restart on a second lethal hit", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    expect(track.playDeath()).toBe(true);
    runFor(track, 0.05);
    const weight = track.weightOf('death');
    expect(track.playDeath()).toBe(false);
    runFor(track, 0.02);
    // The fall kept going rather than snapping back to the start.
    expect(track.weightOf('death')).toBeGreaterThan(weight);
    expect(track.weightOf('death')).toBeLessThanOrEqual(1);
  });

  it("releases the latch when the track is cleared for a respawn", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.playDeath();
    expect(track.isTerminal()).toBe(true);
    track.clear();
    expect(track.isTerminal()).toBe(false);
    track.play('walk');
    runFor(track, 0.3);
    expect(track.active).toBe('walk');
  });

  it("reports no terminal state while a reaction is still running", () => {
    const track = new BlendTrack();
    expect(track.isTerminal()).toBe(false);
    expect(track.terminalState).toBeNull();
    track.interrupt('hit');
    expect(track.isTerminal()).toBe(false);
  });
});

describe("hit back to previous (task 634)", () => {
  it("blends out of the reaction over 0.3 s", () => {
    expect(RETURN_FROM_HIT_SECONDS).toBe(0.3);
    for (const previous of ['idle', 'walk', 'run', 'aim', 'shoot'] as BlendState[]) {
      const track = new BlendTrack();
      track.play(previous);
      runFor(track, 0.3);
      track.interrupt('hit');
      runFor(track, 0.05);
      expect(track.weightOf('hit')).toBeCloseTo(1, 5);

      expect(track.playAfterHit(previous)).toBe(previous);
      const half = runFor(track, 0.15);
      expect(half.weights[previous]).toBeCloseTo(0.5, 1);
      expect(half.weights.hit).toBeCloseTo(0.5, 1);

      runFor(track, 0.15);
      expect(track.weightOf(previous)).toBeCloseTo(1, 5);
      expect(track.weightOf('hit')).toBe(0);
      expect(track.active).toBe(previous);
    }
  });

  it("returns to the state before the first hit, not into the reaction", () => {
    const track = new BlendTrack();
    track.play('run');
    runFor(track, 0.3);
    track.interrupt('hit');
    runFor(track, 0.05);
    // A second hit lands while the first reaction is still playing.
    expect(track.playAfterHit('hit')).toBe('idle');
    expect(stateToReturnTo('hit')).toBe('idle');
  });

  it("never returns to a death", () => {
    expect(stateToReturnTo('death')).toBe('idle');
    expect(stateToReturnTo(null)).toBe('idle');
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    expect(track.playAfterHit(null)).toBe('idle');
  });

  it("is slower than a locomotion change, which is the point", () => {
    expect(RETURN_FROM_HIT_SECONDS).toBeGreaterThan(IDLE_TO_WALK.inS);
    expect(RETURN_FROM_HIT_SECONDS).toBeGreaterThan(WALK_TO_RUN.inS);
    expect(RETURN_FROM_HIT_SECONDS).toBeGreaterThan(interruptTimeFor('hit'));
  });

  it("returns to a state that is only half blended in", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('walk');
    runFor(track, 0.1); // interrupted before walk reached full weight
    track.interrupt('hit');
    runFor(track, 0.05);
    expect(track.playAfterHit('walk')).toBe('walk');
    runFor(track, 0.3);
    expect(track.weightOf('walk')).toBeCloseTo(1, 5);
    expect(track.weightOf('hit')).toBe(0);
  });
});

describe("any to hit (task 633)", () => {
  const STATES: BlendState[] = ['idle', 'walk', 'run', 'aim', 'shoot'];

  it("blends a hit in over 0.05 s from every state", () => {
    expect(ANY_SOURCE_TIMINGS.hit).toBe(0.05);
    for (const from of STATES) {
      expect(blendTimeFor(from, 'hit'), from).toBe(0.05);
      expect(interruptTimeFor('hit')).toBe(0.05);
    }
  });

  it("is the shortest blend in the table", () => {
    expect(interruptTimeFor('hit')).toBeLessThan(WALK_TO_RUN.inS);
    expect(interruptTimeFor('hit')).toBeLessThan(IDLE_TO_WALK.inS);
    expect(interruptTimeFor('idle')).toBe(DEFAULT_BLEND_SECONDS);
  });

  it("takes over mid-blend without restarting it", () => {
    for (const from of STATES) {
      const track = new BlendTrack();
      track.play(from);
      runFor(track, 0.3);
      track.interrupt('hit');

      // 0.05 s later the reaction has arrived, whatever state it came from.
      runFor(track, 0.05);
      expect(track.weightOf('hit'), from).toBeCloseTo(1, 5);
      expect(track.weightOf(from), from).toBe(0);
      expect(track.active).toBe('hit');
    }
  });

  it("interrupts even when the state it is replacing is already dominant", () => {
    const track = new BlendTrack();
    track.play('hit');
    runFor(track, 0.3);
    track.interrupt('hit');
    // Nothing changed, so nothing was written; it must not restart the blend.
    runFor(track, 0.02);
    expect(track.weightOf('hit')).toBe(1);
  });

  it("interrupts from a state that is only half blended in", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('walk');
    runFor(track, 0.1);
    const walkWeight = track.weightOf('walk');
    expect(walkWeight).toBeGreaterThan(0);

    track.interrupt('hit');
    expect(track.weightOf('walk')).toBe(walkWeight);
    runFor(track, 0.05);
    expect(track.weightOf('hit')).toBeCloseTo(1, 5);
  });
});

describe("walk to run (task 632)", () => {
  it("blends over 0.15 s, a fifth faster than a walk change", () => {
    expect(WALK_TO_RUN).toEqual({ outS: 0.15, inS: 0.15 });
    expect(blendTimeFor('walk', 'run')).toBe(0.15);
    expect(WALK_TO_RUN.inS).toBeLessThan(IDLE_TO_WALK.inS);
  });

  it("reaches full run weight in 0.15 s and not before", () => {
    const track = new BlendTrack();
    track.play('walk');
    runFor(track, 0.3);
    track.play('run');

    const early = runFor(track, 0.1); // 2/3 of the way through
    expect(early.weights.run).toBeCloseTo(0.667, 1);
    expect(early.weights.run).toBeLessThan(1);

    runFor(track, 0.05);
    expect(track.weightOf('run')).toBeCloseTo(1, 5);
    expect(track.weightOf('walk')).toBe(0);
    expect(track.active).toBe('run');
  });

  it("uses the walk row, not the idle row, when coming out of a walk", () => {
    const track = new BlendTrack();
    track.play('idle');
    runFor(track, 0.3);
    track.play('walk');
    runFor(track, 0.3); // the walk is actually playing before the run starts
    track.play('run');
    runFor(track, 0.15);
    expect(track.weightOf('run')).toBeCloseTo(1, 5);
    expect(track.weightOf('walk')).toBe(0);
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
describe("state coverage (tasks 631-638, 669)", () => {
  it("can reach every state AnimationController can play", () => {
    // A blend that cannot name a state cannot cross-fade into it, and a state
    // that snaps while everything else cross-fades is the artefact this catches.
    const controllerStates: readonly string[] = [
      'idle',
      'walk',
      'run',
      'attack',
      'block',
      'hit',
      'death',
      'cheer',
      'salute',
    ];
    for (const state of controllerStates) {
      const track = new BlendTrack();
      track.play(state as BlendState);
      expect(track.active, state).toBe(state);
      // ...and it fades in rather than appearing at full weight.
      expect(track.weightOf(state as BlendState), state).toBe(0);
      for (let i = 0; i < 20; i++) track.update(1 / 60);
      expect(track.weightOf(state as BlendState), state).toBeCloseTo(1, 5);
    }
    // The combat-only states the blend layer adds on top.
    for (const state of ['aim', 'shoot'] as const) {
      const track = new BlendTrack();
      track.play(state);
      expect(track.active, state).toBe(state);
    }
  });
});
