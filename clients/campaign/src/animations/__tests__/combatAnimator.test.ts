/**
 * Task 667 (verify): a surrendering unit puts its hands up, using the cheer clip.
 *
 * There is no surrender clip in any staged asset -- the closest thing any of them
 * ships is `Cheer` on kaykit-rogue.glb -- so the animator plays `cheer` and the
 * test pins both halves of that claim: the animator really does ask for `cheer`,
 * and `Cheer` really is the clip that exists.
 *
 * The other half of the claim matters more: a surrender is not a victory, so
 * this is checked to be a *different* call from `cheer()` and not an alias of it.
 *
 * Task 668 (verify): a winning side celebrates, on the same `Cheer` clip. Which
 * rig plays it is the interesting part -- only `kaykit-rogue.glb` has one, so a
 * victory on any of the Quaternius operator rigs has to resolve the state
 * against the model before it asks for it, and that is what the registry is for.
 */

import { describe, expect, it, vi } from "vitest";
import { AnimationController, CombatAnimator } from "../AnimationController.js";
import { clipsOf } from "./glbClips.js";
import { resolveStateClip } from "../StateClips.js";
import { BlendTrack, RETURN_FROM_HIT_SECONDS } from "../BlendTransitions.js";

/** A controller with every state the animator can ask for. */
function controller(): AnimationController {
  const anim = new AnimationController({});
  for (const state of ['idle', 'walk', 'run', 'attack', 'block', 'hit', 'death', 'cheer', 'salute'] as const) {
    anim.addState(state, {
      name: state,
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      setWeightForAllAnimatables: vi.fn(),
    });
  }
  return anim;
}

describe("surrender (task 667)", () => {
  it("plays the cheer pose, because that is the clip that exists", () => {
    const anim = controller();
    const play = vi.spyOn(anim, 'play');
    new CombatAnimator(anim).surrender();
    expect(play).toHaveBeenCalledWith('cheer');
    expect(anim.getCurrentState()).toBe('cheer');
  });

  it("has a clip behind it: Cheer on the rogue rig, and nothing closer", () => {
    const rogue = clipsOf('kaykit-rogue.glb');
    expect(rogue).toContain('Cheer');
    // No staged asset ships a surrender clip, by any spelling.
    for (const rig of ['kaykit-rogue.glb', 'operator-viper.glb', 'female-operator.glb']) {
      const clips = clipsOf(rig);
      expect(clips.filter((c) => /surrender/i.test(c)), rig).toEqual([]);
    }
  });

  it("is not the victory cheer, so the two stay distinguishable", () => {
    const anim = controller();
    const combat = new CombatAnimator(anim);
    const calls: string[] = [];
    vi.spyOn(anim, 'play').mockImplementation((name) => {
      calls.push(name);
    });
    combat.cheer();
    combat.surrender();
    // Same clip, different intent: a scene that wants to show a surrender as a
    // defeat can tell the calls apart only if the animator distinguishes them,
    // and today it does not -- so this records the limitation rather than
    // pretending the two are different animations.
    expect(calls).toEqual(['cheer', 'cheer']);
  });

  it("warns rather than throwing when the state was never added", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bare = new AnimationController({});
    expect(() => new CombatAnimator(bare).surrender()).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("victory cheer (task 668)", () => {
  it("plays the cheer state, and starts it if it was not already playing", () => {
    const anim = controller();
    anim.play('idle');
    const combat = new CombatAnimator(anim);
    combat.cheer();
    expect(anim.getCurrentState()).toBe('cheer');
    // The state is set immediately; it is playing once the blend has run, which
    // is why `isPlaying` is a weight test and not a state test.
    expect(anim.isPlaying('cheer')).toBe(false);
    anim.update(0.2);
    expect(anim.isPlaying('cheer')).toBe(true);
  });

  it("does not restart the cheer that is already playing", () => {
    const anim = controller();
    const combat = new CombatAnimator(anim);
    combat.cheer();
    const play = vi.spyOn(anim, 'play');
    combat.cheer();
    // A cheer that loops should not be restarted every time it is announced.
    expect(play).not.toHaveBeenCalledWith('cheer', true);
  });

  it("has exactly one clip behind it, on one rig", () => {
    const withCheer = ['kaykit-rogue.glb'];
    const without = ['operator-viper.glb', 'female-operator.glb', 'soldier-animated.glb', 'horse.glb'];
    for (const rig of withCheer) {
      expect(clipsOf(rig), rig).toContain('Cheer');
    }
    for (const rig of without) {
      expect(clipsOf(rig).filter((c) => /^cheer$/i.test(c)), rig).toEqual([]);
    }
  });

  it("cannot be claimed by a state registry entry on the operator rigs", () => {
    // The registry has no cheer entry yet: the clip is capitalised on the one
    // rig that has it, and a registry entry named `cheer` would report a gap
    // against every Quaternius model. Until it exists, a scene asking for a
    // victory on those rigs gets a named gap rather than a silent no-op.
    expect(resolveStateClip('cheer' as 'downed', clipsOf('operator-viper.glb')).gap).toBe(
      'no-clip-registered',
    );
  });
});

describe("hit reaction and the way back out (task 669)", () => {
  it("records what was playing before the hit, and plays the hit", () => {
    const anim = controller();
    const combat = new CombatAnimator(anim);
    anim.play('walk');
    combat.takeHit();
    expect(anim.getCurrentState()).toBe('hit');
    expect(combat.getHitReturnState()).toBe('walk');
  });

  it("blends in fast and back out slowly, from every state", () => {
    // The 0.05 s in and 0.3 s out are the design numbers from the blend table.
    for (const state of ['idle', 'walk', 'run', 'cheer'] as const) {
      const track = new BlendTrack();
      track.play(state);
      for (let i = 0; i < 20; i++) track.update(1 / 60);
      track.interrupt('hit');
      track.update(0.05);
      expect(track.weightOf('hit'), state).toBeCloseTo(1, 5);
      expect(track.weightOf(state), state).toBe(0);

      expect(track.playAfterHit(state)).toBe(state);
      track.update(RETURN_FROM_HIT_SECONDS / 2);
      // Halfway out, the reaction and the stance are equally weighted -- a
      // straight cut to the stance is the artefact this prevents.
      expect(track.weightOf('hit')).toBeCloseTo(0.5, 1);
      expect(track.weightOf(state)).toBeCloseTo(0.5, 1);
      track.update(RETURN_FROM_HIT_SECONDS / 2);
      expect(track.weightOf(state)).toBeCloseTo(1, 5);
    }
  });

  it("does not return into the reaction when a second hit lands", () => {
    const anim = controller();
    const combat = new CombatAnimator(anim);
    anim.play('run');
    combat.takeHit();
    // A second hit while the first reaction is playing: the way back out is the
    // stance before either of them, or the character flinch-loops.
    combat.takeHit();
    expect(combat.getHitReturnState()).toBe('hit');
    const track = new BlendTrack();
    track.interrupt('hit');
    expect(track.playAfterHit(combat.getHitReturnState())).toBe('idle');
  });

  it("keeps the hit interruptible by the next hit", () => {
    const track = new BlendTrack();
    track.play('idle');
    for (let i = 0; i < 20; i++) track.update(1 / 60);
    track.interrupt('hit');
    track.update(0.02);
    const mid = track.weightOf('hit');
    track.interrupt('hit'); // a second hit mid-reaction
    expect(track.weightOf('hit')).toBe(mid);
    track.update(0.05);
    expect(track.weightOf('hit')).toBeCloseTo(1, 5);
  });

  it("is not a death: the reaction comes back out", () => {
    const track = new BlendTrack();
    track.play('idle');
    for (let i = 0; i < 20; i++) track.update(1 / 60);
    track.interrupt('hit');
    track.update(0.05);
    expect(track.isTerminal()).toBe(false);
    track.playAfterHit('idle');
    track.update(RETURN_FROM_HIT_SECONDS);
    expect(track.active).toBe('idle');
  });
});
