/**
 * Task 656 and 657: horse gaits and the horse's fall.
 *
 * The clip table is checked against the real file. `horse.glb` ships Walk,
 * Gallop, Death and the idle set, and no trot -- so the module names the trot as
 * missing rather than quietly playing the walk, and this test fails if anyone
 * adds a trot row the file does not back.
 *
 * Everything else is the policy: hysteresis so a horse does not change its mind
 * three times on the way down from a gallop, a per-gait authored speed so the
 * rate changes with the clip, and a ragdoll handoff partway through the death
 * clip rather than at its end.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HORSE_DEATH_CLIP_S,
  HORSE_GAIT_CLIPS,
  HORSE_GAIT_HYSTERESIS_MPS,
  HORSE_HALT_MPS,
  HORSE_RAGDOLL_AT_S,
  HORSE_TROT_MPS,
  HorseDeathState,
  clipForGait,
  horseGaitFor,
  horsePlayback,
} from "../HorseGaits.js";

/** Every animation in the staged horse.glb, read out of its glTF JSON chunk. */
function horseClips(): string[] {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "models", "horse.glb");
  const bytes = readFileSync(path);
  const chunkLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength)),
  ) as { animations?: Array<{ name?: string }> };
  return (json.animations ?? [])
    .map((a) => a.name ?? '')
    // The armature-prefixed duplicates are the same clips; the mask variant
    // appends "Mask" to a couple of them.
    .filter((name) => !name.includes('Mask'))
    .map((name) => name.split('|').pop() as string);
}

describe("the clip table against the real file (task 656)", () => {
  const clips = horseClips();

  it("found the staged horse's clips", () => {
    expect(clips).toContain('Walk');
    expect(clips).toContain('Gallop');
    expect(clips).toContain('Death');
    expect(clips.length).toBeGreaterThan(10);
  });

  it("names only clips that exist", () => {
    for (const [gait, clip] of Object.entries(HORSE_GAIT_CLIPS)) {
      if (clip === null) continue;
      expect(clips, `${gait} -> ${clip}`).toContain(clip);
    }
  });

  it("says a trot has no clip, rather than faking one", () => {
    expect(HORSE_GAIT_CLIPS.trot).toBeNull();
    expect(clips).not.toContain('Trot');
    const { gap, clip } = clipForGait('trot');
    expect(clip).toBeNull();
    expect(gap).toBe('no-clip-for-gait');
  });
});

describe("horse gaits (task 656)", () => {
  it("uses the documented speed bands", () => {
    expect(HORSE_HALT_MPS).toBeLessThan(HORSE_TROT_MPS);
    expect(HORSE_GAIT_HYSTERESIS_MPS).toBeGreaterThan(0);
  });

  it("picks a gait from the speed", () => {
    expect(horseGaitFor(0)).toBe('halt');
    expect(horseGaitFor(HORSE_HALT_MPS + 0.1)).toBe('walk');
    expect(horseGaitFor(2.5)).toBe('trot');
    expect(horseGaitFor(6)).toBe('gallop');
    expect(horseGaitFor(Number.NaN)).toBe('halt');
  });

  it("does not change its mind on the way down from a gallop", () => {
    let gait: ReturnType<typeof horseGaitFor> = 'gallop';
    // Just under the boundary, still galloping because the band holds it there.
    for (const speed of [HORSE_TROT_MPS - 0.1, HORSE_TROT_MPS - HORSE_GAIT_HYSTERESIS_MPS + 0.05]) {
      gait = horseGaitFor(speed, gait);
      expect(gait).toBe('gallop');
    }
    expect(horseGaitFor(HORSE_TROT_MPS - HORSE_GAIT_HYSTERESIS_MPS - 0.05, gait)).toBe('trot');
  });

  it("reports the missing clip through the playback", () => {
    const trot = horsePlayback(2.5);
    expect(trot.gait).toBe('trot');
    expect(trot.clip).toBeNull();
    expect(trot.missing).toBe(true);
  });

  it("rates a gallop differently from a walk, because the clips are different", () => {
    const walk = horsePlayback(1.6);
    const gallop = horsePlayback(9);
    expect(walk.clip).toBe('Walk');
    expect(gallop.clip).toBe('Gallop');
    expect(walk.rate).toBeCloseTo(1);
    expect(gallop.rate).toBeCloseTo(1);
    // Half the walk speed plays the walk at half rate.
    expect(horsePlayback(0.8).rate).toBeCloseTo(0.5);
  });

  it("holds a standing horse at rate 1 rather than 0", () => {
    const halt = horsePlayback(0);
    expect(halt.gait).toBe('halt');
    expect(halt.clip).toBe('Idle');
    expect(halt.rate).toBe(1);
  });

  it("clamps the rate instead of extrapolating", () => {
    expect(horsePlayback(100).rate).toBeLessThanOrEqual(2);
    expect(horsePlayback(0.21).rate).toBeGreaterThanOrEqual(0.5);
  });
});

describe("the horse's fall (task 657)", () => {
  it("does nothing until it starts", () => {
    const death = new HorseDeathState();
    const idle = death.update(1);
    expect(idle.clip).toBeNull();
    expect(idle.ragdollReady).toBe(false);
    expect(death.active).toBe(false);
  });

  it("plays the Death clip the pack actually ships", () => {
    const death = new HorseDeathState();
    death.begin();
    const frame = death.update(1 / 60);
    expect(frame.clip).toBe('Death');
    expect(horseClips()).toContain('Death');
  });

  it("hands the body to physics partway through, not at the end", () => {
    const death = new HorseDeathState();
    death.begin();
    const early = death.update(HORSE_RAGDOLL_AT_S - 0.2);
    expect(early.ragdollReady).toBe(false);
    const handoff = death.update(0.3);
    expect(handoff.ragdollReady).toBe(true);
    // The clip is still running: the fall reads as a fall while the legs go.
    expect(handoff.progress).toBeLessThan(1);
  });

  it("runs to the end of the clip and stops there", () => {
    const death = new HorseDeathState();
    death.begin();
    const end = death.update(HORSE_DEATH_CLIP_S * 3);
    expect(end.progress).toBe(1);
    expect(end.ragdollReady).toBe(true);
  });

  it("only starts once", () => {
    const death = new HorseDeathState();
    expect(death.begin()).toBe(true);
    expect(death.begin()).toBe(false);
    death.reset();
    expect(death.active).toBe(false);
    expect(death.begin()).toBe(true);
  });

  it("survives a broken clip length or frame time", () => {
    const death = new HorseDeathState(0, Number.NaN);
    death.begin();
    const frame = death.update(Number.NaN);
    expect(Number.isFinite(frame.progress)).toBe(true);
    expect(frame.ragdollReady).toBe(true);
  });
});