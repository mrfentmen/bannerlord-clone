/**
 * Battle ambience tests. MASTER_PLAN.md section 4E, task 150.
 */

import { describe, expect, it, vi } from "vitest";
import { createBattleAmbience, CROWD_LOOP_FILE, crowdGainFor } from "../ambience.js";
import type { AudioPlayer, SoundHandle } from "../audio.js";

function fakePlayer(): AudioPlayer & { calls: { file: string; volume: number; loop: boolean | undefined }[]; lastHandle: () => SoundHandle } {
  const calls: { file: string; volume: number; loop: boolean | undefined }[] = [];
  let last: SoundHandle = { setVolume: vi.fn(), stop: vi.fn() };
  return {
    calls,
    lastHandle: () => last,
    playSound(file, opts) {
      calls.push({ file, volume: opts.volume, loop: opts.loop });
      last = { setVolume: vi.fn(), stop: vi.fn() };
      return last;
    },
  };
}

describe("crowdGainFor", () => {
  it("murmurs quietly with no units", () => {
    expect(crowdGainFor(0)).toBeCloseTo(0.2);
  });

  it("scales up with the live unit count", () => {
    expect(crowdGainFor(100)).toBeCloseTo(0.4);
    expect(crowdGainFor(200)).toBeCloseTo(0.6);
  });

  it("caps at full volume for very large battles", () => {
    expect(crowdGainFor(400)).toBeCloseTo(1.0);
    expect(crowdGainFor(2000)).toBeCloseTo(1.0);
  });

  it("treats negative counts as zero", () => {
    expect(crowdGainFor(-50)).toBeCloseTo(0.2);
  });
});

describe("createBattleAmbience", () => {
  it("starts the crowd loop on the first update with units", () => {
    const player = fakePlayer();
    const ambience = createBattleAmbience(player);
    ambience.update(150);
    expect(player.calls).toHaveLength(1);
    const first = player.calls[0];
    if (!first) throw new Error("expected one playSound call");
    expect(first.file).toBe(CROWD_LOOP_FILE);
    expect(first.loop ?? false).toBe(true);
    expect(first.volume).toBeCloseTo(crowdGainFor(150));
    expect(ambience.currentGain()).toBeCloseTo(crowdGainFor(150));
    ambience.destroy();
  });

  it("does not start the loop for zero units", () => {
    const player = fakePlayer();
    const ambience = createBattleAmbience(player);
    ambience.update(0);
    expect(player.calls).toHaveLength(0);
    expect(ambience.currentGain()).toBe(0);
    ambience.destroy();
  });

  it("moves the gain without restarting the loop as the count changes", () => {
    const player = fakePlayer();
    const ambience = createBattleAmbience(player);
    ambience.update(100);
    ambience.update(300);
    expect(player.calls).toHaveLength(1);
    const handle = player.lastHandle();
    expect(handle.setVolume).toHaveBeenCalledWith(crowdGainFor(300));
    expect(ambience.currentGain()).toBeCloseTo(crowdGainFor(300));
    ambience.destroy();
  });

  it("stop() ends the loop and a later update starts it fresh", () => {
    const player = fakePlayer();
    const ambience = createBattleAmbience(player);
    ambience.update(100);
    const first = player.lastHandle();
    ambience.stop();
    expect(first.stop).toHaveBeenCalled();
    expect(ambience.currentGain()).toBe(0);
    ambience.update(100);
    expect(player.calls).toHaveLength(2);
    ambience.destroy();
  });

  it("survives a player that throws", () => {
    const bad: AudioPlayer = {
      playSound: () => {
        throw new Error("no file");
      },
    };
    const ambience = createBattleAmbience(bad);
    expect(() => ambience.update(100)).not.toThrow();
    expect(ambience.currentGain()).toBe(0);
    ambience.destroy();
  });
});
