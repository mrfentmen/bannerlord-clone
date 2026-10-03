/**
 * Task 671: a prone character crawls.
 *
 * Every `operator-*.glb` and `female-operator.glb` ships `prone_crawl`, and the
 * state keeps the legs playing prone underneath it rather than standing the
 * character up to crawl. The test reads the real animation lists, so the registry
 * cannot claim a clip the assets do not have, and it pins what happens when a
 * model lacks the clip: a named gap, not a silent no-op.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STATE_CLIPS,
  availableStates,
  resolveStateClip,
  unavailableStates,
} from "../StateClips.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public");
const modelsDir = join(publicDir, "models");
const animsDir = join(publicDir, "anims");

/** Clip names in a staged GLB, by file name. */
export function clipsOf(file: string): string[] {
  const inModels = existsSync(join(modelsDir, file));
  const bytes = readFileSync(join(inModels ? modelsDir : animsDir, file));
  const chunkLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength)),
  ) as { animations?: Array<{ name?: string }> };
  return (json.animations ?? []).map((a) => a.name ?? '');
}

describe("prone crawl (task 671)", () => {
  it("is registered with the clip the assets actually ship", () => {
    const entry = STATE_CLIPS['prone-crawl'];
    expect(entry?.clip).toBe('prone_crawl');
    expect(entry?.loop).toBe(true);
    // The legs keep crawling underneath; the clip drives the arms and torso.
    expect(entry?.lowerBody).toBe('walk');
  });

  it("resolves on every rig that ships it", () => {
    const rigs = readdirSync(modelsDir).filter((n) => /^(operator-|female-operator)/.test(n) && n.endsWith('.glb'));
    expect(rigs.length).toBeGreaterThanOrEqual(6);
    for (const rig of rigs) {
      const resolved = resolveStateClip('prone-crawl', clipsOf(rig));
      expect(resolved.available, rig).toBe(true);
      expect(resolved.clip, rig).toBe('prone_crawl');
      expect(resolved.gap, rig).toBeNull();
    }
  });

  it("reports a named gap on a model that cannot crawl", () => {
    const resolved = resolveStateClip('prone-crawl', clipsOf('horse.glb'));
    expect(resolved.available).toBe(false);
    expect(resolved.gap).toBe('clip-not-in-model');
    // The clip it wanted is still reported, so a scene can log what is missing.
    expect(resolved.clip).toBe('prone_crawl');
    expect(resolved.entry).not.toBeNull();
  });

  it("reports a state nobody has registered yet", () => {
    const resolved = resolveStateClip('downed', ['idle']);
    expect(resolved.available).toBe(false);
    expect(resolved.gap).toBe('no-clip-registered');
    expect(resolved.entry).toBeNull();
  });

  it("lists what a model can and cannot do", () => {
    const operator = clipsOf('operator-viper.glb');
    expect(availableStates(operator)).toContain('prone-crawl');
    expect(unavailableStates(operator)).toEqual([]);
    expect(availableStates(clipsOf('horse.glb'))).toEqual([]);
    // A horse cannot do any of the human states: every one is reported by name.
    const gaps = unavailableStates(clipsOf('horse.glb'));
    expect(gaps.length).toBe(Object.keys(STATE_CLIPS).length);
    expect(gaps.every((g) => g.gap === 'clip-not-in-model')).toBe(true);
  });

  it("takes a model with no clips at all without throwing", () => {
    expect(resolveStateClip('prone-crawl', []).gap).toBe('clip-not-in-model');
    expect(availableStates([])).toEqual([]);
  });
});
describe("crouch idle and walk (task 672)", () => {
  const CROUCH_RIGS = ['operator-viper.glb', 'operator-heron.glb', 'operator-lynx.glb', 'operator-magpie.glb', 'operator-jackal.glb', 'female-operator.glb'];

  it("is registered as two states, not one", () => {
    expect(STATE_CLIPS['crouch-idle']?.clip).toBe('crouch_idle');
    expect(STATE_CLIPS['crouch-walk']?.clip).toBe('crouch_walk');
    // A crouched character has to be able to move, and the legs keep their own
    // locomotion underneath the crouch pose.
    expect(STATE_CLIPS['crouch-idle']?.lowerBody).toBe('idle');
    expect(STATE_CLIPS['crouch-walk']?.lowerBody).toBe('walk');
    expect(STATE_CLIPS['crouch-idle']?.loop).toBe(true);
  });

  it("resolves on every rig that ships both clips", () => {
    for (const rig of CROUCH_RIGS) {
      for (const state of ['crouch-idle', 'crouch-walk'] as const) {
        const resolved = resolveStateClip(state, clipsOf(rig));
        expect(resolved.available, `${rig} ${state}`).toBe(true);
        expect(resolved.clip).toBe(STATE_CLIPS[state]?.clip);
      }
    }
  });

  it("reports the gap on the rigs that have no crouch clips", () => {
    // The Quaternius troop rigs and the mixamo rigs are not rigged to crouch.
    const withoutCrouch = ['troop-gunner.glb', 'soldier-animated.glb'];
    for (const rig of withoutCrouch) {
      expect(resolveStateClip('crouch-idle', clipsOf(rig)).gap, rig).toBe('clip-not-in-model');
      expect(resolveStateClip('crouch-walk', clipsOf(rig)).available, rig).toBe(false);
    }
  });

  it("records that no staged model can crouch *and* crawl at once", () => {
    // Both states exist on the operator rigs, so a scene can offer both; the
    // combination itself is a transition the caller owns.
    const operator = clipsOf('operator-viper.glb');
    expect(availableStates(operator)).toEqual(
      expect.arrayContaining(['prone-crawl', 'crouch-idle', 'crouch-walk']),
    );
  });
});

describe("jump start, loop and land (task 673)", () => {
  it("registers three phases, and only the middle one loops", () => {
    expect(STATE_CLIPS['jump-start']?.clip).toBe('jump_start');
    expect(STATE_CLIPS['jump-loop']?.clip).toBe('jump_loop');
    expect(STATE_CLIPS['jump-land']?.clip).toBe('jump_land');
    expect(STATE_CLIPS['jump-start']?.loop).toBe(false);
    expect(STATE_CLIPS['jump-loop']?.loop).toBe(true);
    expect(STATE_CLIPS['jump-land']?.loop).toBe(false);
  });

  it("resolves all three on every operator rig", () => {
    for (const rig of ['operator-viper.glb', 'operator-heron.glb', 'operator-lynx.glb', 'operator-magpie.glb', 'operator-jackal.glb']) {
      const clips = clipsOf(rig);
      for (const state of ['jump-start', 'jump-loop', 'jump-land'] as const) {
        expect(resolveStateClip(state, clips).available, `${rig} ${state}`).toBe(true);
      }
    }
  });

  it("has no jump on the medic rig, and says so", () => {
    // female-operator.glb ships prone and crouch but no jump: it is a medic
    // set, and the rig does not include one.
    const clips = clipsOf('female-operator.glb');
    expect(resolveStateClip('jump-start', clips).gap).toBe('clip-not-in-model');
    expect(resolveStateClip('jump-start', clips).clip).toBe('jump_start');
    expect(availableStates(clips)).not.toContain('jump-start');
  });

  it("comes in faster than a stance change, because a jump is an impulse", () => {
    expect(STATE_CLIPS['jump-start']?.blendS ?? 1).toBeLessThan(STATE_CLIPS['crouch-idle']?.blendS ?? 0);
    expect(STATE_CLIPS['jump-land']?.blendS ?? 1).toBeLessThan(STATE_CLIPS['crouch-idle']?.blendS ?? 0);
  });
});

describe("slide start, loop and exit (task 674)", () => {
  it("registers three phases, only the middle one looping", () => {
    expect(STATE_CLIPS['slide-start']?.clip).toBe('slide_start');
    expect(STATE_CLIPS['slide-loop']?.clip).toBe('slide_loop');
    expect(STATE_CLIPS['slide-exit']?.clip).toBe('slide_exit');
    expect(STATE_CLIPS['slide-start']?.loop).toBe(false);
    expect(STATE_CLIPS['slide-loop']?.loop).toBe(true);
    expect(STATE_CLIPS['slide-exit']?.loop).toBe(false);
  });

  it("resolves all three on every operator rig", () => {
    for (const rig of ['operator-viper.glb', 'operator-heron.glb', 'operator-lynx.glb', 'operator-magpie.glb', 'operator-jackal.glb']) {
      const clips = clipsOf(rig);
      for (const state of ['slide-start', 'slide-loop', 'slide-exit'] as const) {
        expect(resolveStateClip(state, clips).available, `${rig} ${state}`).toBe(true);
      }
    }
  });

  it("has no slide on the medic rig", () => {
    const clips = clipsOf('female-operator.glb');
    expect(resolveStateClip('slide-exit', clips).gap).toBe('clip-not-in-model');
    expect(availableStates(clips)).not.toContain('slide-exit');
  });

  it("takes longer to get out of than to get into", () => {
    // The exit blends back into a stance the player has to see the end of.
    expect(STATE_CLIPS['slide-exit']?.blendS ?? 0).toBeGreaterThan(STATE_CLIPS['slide-start']?.blendS ?? 0);
  });
});

describe("melee swing (task 675)", () => {
  it("is registered as a fast, non-looping swing", () => {
    expect(STATE_CLIPS.melee?.clip).toBe('melee');
    expect(STATE_CLIPS.melee?.loop).toBe(false);
    // Sharper than a stance change: the swing has to land on the input.
    expect(STATE_CLIPS.melee?.blendS ?? 1).toBeLessThan(STATE_CLIPS['crouch-idle']?.blendS ?? 0);
    // ...but not as sharp as a hit reaction, which must pre-empt everything.
    expect(STATE_CLIPS.melee?.blendS ?? 0).toBeGreaterThan(0.05);
  });

  it("resolves on the operator rigs, and not on the medic", () => {
    for (const rig of ['operator-viper.glb', 'operator-lynx.glb', 'operator-jackal.glb']) {
      expect(resolveStateClip('melee', clipsOf(rig)).available, rig).toBe(true);
    }
    expect(resolveStateClip('melee', clipsOf('female-operator.glb')).gap).toBe('clip-not-in-model');
  });

  it("also exists as a set of swings on the rogue rig, which this state does not name", () => {
    // kaykit-rogue.glb has seven distinct melee attacks and no single `melee`
    // clip, so this registry deliberately does not claim it: a scene that wants
    // those picks them by name rather than getting one arbitrary swing.
    const rogue = clipsOf('kaykit-rogue.glb');
    expect(rogue.filter((c) => c.startsWith('1H_Melee_Attack')).length).toBeGreaterThan(1);
    expect(rogue).not.toContain('melee');
  });
});
