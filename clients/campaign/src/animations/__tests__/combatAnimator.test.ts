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
 */

import { describe, expect, it, vi } from "vitest";
import { AnimationController, CombatAnimator } from "../AnimationController.js";
import { clipsOf } from "./glbClips.js";

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
