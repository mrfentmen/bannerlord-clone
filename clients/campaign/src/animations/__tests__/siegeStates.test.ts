/**
 * Tasks 662-665, modernized: the siege anims.
 *
 * The medieval spec wants ladder climbs and ram crews. The game is modern, so
 * the states are the modern siege: breach (door breach), ram-push (the truck
 * driving the gate), breach-impact (the moment it lands), artillery-fire (the
 * call for fire). The operator GLBs do not ship these clips yet -- no test
 * here claims they do. What the tests pin: the states are registered with the
 * right shape, and resolution reports the gap honestly (`clip-not-in-model`)
 * instead of silently doing nothing, so the scene can fall back to `interact`.
 */

import { describe, expect, it } from "vitest";
import {
  STATE_CLIPS,
  resolveStateClip,
} from "../StateClips.js";

describe("modern siege states (tasks 662-665)", () => {
  it("registers breach as a one-shot whole-body state (task 662)", () => {
    const entry = STATE_CLIPS['breach'];
    expect(entry?.clip).toBe('breach');
    expect(entry?.loop).toBe(false);
    expect(entry?.blendS).toBeLessThanOrEqual(0.15);
  });

  it("registers ram-push as a looping drive state (task 663)", () => {
    const entry = STATE_CLIPS['ram-push'];
    expect(entry?.clip).toBe('ram_push');
    expect(entry?.loop).toBe(true);
  });

  it("registers breach-impact as a fast one-shot (task 664)", () => {
    const entry = STATE_CLIPS['breach-impact'];
    expect(entry?.clip).toBe('breach_impact');
    expect(entry?.loop).toBe(false);
    expect(entry?.blendS).toBeLessThanOrEqual(0.1);
  });

  it("registers artillery-fire as a one-shot call (task 665)", () => {
    const entry = STATE_CLIPS['artillery-fire'];
    expect(entry?.clip).toBe('artillery_fire');
    expect(entry?.loop).toBe(false);
  });

  it("reports the gap honestly when the model lacks the clip", () => {
    // The staged operators ship interact/melee but no breach clips yet.
    const modelClips = ['interact', 'melee', 'idle', 'walk'];
    for (const state of ['breach', 'ram-push', 'breach-impact', 'artillery-fire'] as const) {
      const resolved = resolveStateClip(state, modelClips);
      expect(resolved.available).toBe(false);
      expect(resolved.gap).toBe('clip-not-in-model');
      expect(resolved.clip).toBe(STATE_CLIPS[state]?.clip);
    }
  });

  it("resolves when a model does ship the clip", () => {
    const resolved = resolveStateClip('breach', ['breach', 'idle']);
    expect(resolved.available).toBe(true);
    expect(resolved.gap).toBeNull();
  });
});
