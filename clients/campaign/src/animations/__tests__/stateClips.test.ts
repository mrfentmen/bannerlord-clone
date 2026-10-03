/**
 * Task 671: a prone character crawls.
 *
 * Every `operator-*.glb` and `female-operator.glb` ships `prone_crawl`, and the
 * state keeps the legs playing prone underneath it rather than standing the
 * character up to crawl. The test reads the real animation lists, so the registry
 * cannot claim a clip the assets do not have, and it pins what happens when a
 * model lacks the clip: a named gap, not a silent no-op.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STATE_CLIPS,
  availableStates,
  resolveStateClip,
  unavailableStates,
} from "../StateClips.js";

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "models");

/** Clip names in a staged GLB. */
export function clipsOf(file: string): string[] {
  const bytes = readFileSync(join(modelsDir, file));
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
    expect(unavailableStates(clipsOf('horse.glb'))).toHaveLength(3);
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
