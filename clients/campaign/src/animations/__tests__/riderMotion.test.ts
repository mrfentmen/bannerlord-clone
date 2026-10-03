/**
 * Task 659: a rider bounces with the horse.
 *
 * There is no mounted-idle clip in any staged asset and none is needed -- the
 * bounce is procedural. What is pinned is the shape: the rider is at the bottom
 * of the bounce at both ends of a stride and at its peak in the middle, because
 * a bounce that starts at its peak looks like the rider is being thrown; the
 * amplitude and lean rise with the gait; and a standing horse produces no bounce
 * at all.
 *
 * Task 660: a rider can shoot while mounted, and cannot aim at things a rider
 * could not reach. The `shoot` clip exists on all five operator GLBs -- the test
 * reads them to prove it -- and the aim is redirected to the saddle's limits, with
 * the direction returned so the weapon points where the shot goes.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BOUNCE_AMPLITUDE_M,
  MOUNTED_PITCH_LIMIT,
  MOUNTED_SHOOT_CLIP,
  MOUNTED_YAW_LIMIT,
  RiderMotion,
  mountedAim,
  mountedFire,
  riderPose,
  type MountGait,
} from "../RiderMotion.js";

const modelsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "models");

/** Clip names in one staged GLB. */
function clipsOf(file: string): string[] {
  const bytes = readFileSync(join(modelsDir, file));
  const chunkLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength)),
  ) as { animations?: Array<{ name?: string }> };
  return (json.animations ?? []).map((a) => a.name ?? '');
}

describe("the shoot clip exists (task 660)", () => {
  const operators = readdirSync(modelsDir).filter((n) => n.startsWith('operator-') && n.endsWith('.glb'));

  it("finds the five operator rigs", () => {
    expect(operators).toHaveLength(5);
  });

  it("ships the shoot clip on every one of them", () => {
    const missing = operators.filter((name) => !clipsOf(name).includes(MOUNTED_SHOOT_CLIP));
    expect(missing).toEqual([]);
  });

  it("records that female-operator.glb does not ship one", () => {
    // The medic rig has the aim poses but no shoot clip. Saying so is the
    // point: a rider on that model cannot fire, and a table that claimed
    // otherwise would fail silently at runtime.
    const clips = clipsOf('female-operator.glb');
    expect(clips).not.toContain(MOUNTED_SHOOT_CLIP);
    expect(clips).toContain('aim_idle');
  });
});

describe("the rider's bounce (task 659)", () => {
  it("does nothing at a halt", () => {
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      const pose = riderPose('halt', phase);
      expect(pose.liftM).toBe(0);
      expect(pose.rollRad).toBe(0);
      expect(pose.leanRad).toBe(0);
    }
  });

  it("is at the bottom of the bounce at both ends of a stride", () => {
    for (const gait of ['walk', 'trot', 'gallop'] as MountGait[]) {
      expect(riderPose(gait, 0).liftM).toBeCloseTo(0, 6);
      expect(riderPose(gait, 1).liftM).toBeCloseTo(0, 6);
      // ...and at its peak halfway through.
      expect(riderPose(gait, 0.5).liftM).toBeCloseTo(BOUNCE_AMPLITUDE_M[gait] as number, 6);
    }
  });

  it("bounces harder and leans further the faster the horse goes", () => {
    const amplitudes = (['walk', 'trot', 'gallop'] as MountGait[]).map(
      (g) => BOUNCE_AMPLITUDE_M[g] as number,
    );
    expect(amplitudes[0]).toBeLessThan(amplitudes[1] as number);
    expect(amplitudes[1]).toBeLessThan(amplitudes[2] as number);
    const walk = riderPose('walk', 0.25);
    const gallop = riderPose('gallop', 0.25);
    expect(gallop.leanRad).toBeGreaterThan(walk.leanRad);
  });

  it("rolls out of phase with the lift, which is what reads as balance", () => {
    // The roll peaks a quarter of a stride away from the lift.
    expect(riderPose('trot', 0).liftM).toBeCloseTo(0, 6);
    expect(riderPose('trot', 0.25).rollRad).toBeGreaterThan(0);
    expect(riderPose('trot', 0.25).liftM).toBeGreaterThan(0);
    expect(riderPose('trot', 0.5).liftM).toBeCloseTo(BOUNCE_AMPLITUDE_M.trot as number, 6);
    expect(Math.abs(riderPose('trot', 0.5).rollRad)).toBeCloseTo(0, 6);
  });

  it("stays inside a sane range at every phase", () => {
    for (const gait of ['walk', 'trot', 'gallop'] as MountGait[]) {
      for (let i = 0; i < 32; i++) {
        const pose = riderPose(gait, i / 32);
        expect(Math.abs(pose.liftM)).toBeLessThanOrEqual(BOUNCE_AMPLITUDE_M[gait] as number + 1e-9);
        expect(Math.abs(pose.leanRad)).toBeLessThan(0.3);
      }
    }
  });

  it("advances along the cycle as time passes, and can be reset", () => {
    const motion = new RiderMotion();
    const first = motion.pose('trot', 1 / 60);
    const second = motion.pose('trot', 1 / 60);
    expect(second.liftM).not.toBe(first.liftM);

    motion.reset();
    const afterReset = motion.pose('trot', 0);
    expect(afterReset.liftM).toBeCloseTo(0, 6);
  });

  it("holds still when time does not pass", () => {
    const motion = new RiderMotion();
    const first = motion.pose('gallop', 0);
    const second = motion.pose('gallop', 0);
    expect(second.liftM).toBe(first.liftM);
    motion.pose('gallop', Number.NaN);
    motion.pose('gallop', -1);
    expect(motion.pose('gallop', 0).liftM).toBe(first.liftM);
  });
});

describe("mounted aim (task 660)", () => {
  it("leaves an aim the rider can already make", () => {
    const aim = mountedAim(0.2, 0.1);
    expect(aim.yaw).toBeCloseTo(0.2);
    expect(aim.pitch).toBeCloseTo(0.1);
    expect(aim.redirected).toBe(false);
  });

  it("redirects an aim a rider cannot make, and says so", () => {
    const behind = mountedAim(2.5, 0);
    expect(Math.abs(behind.yaw)).toBeLessThanOrEqual(MOUNTED_YAW_LIMIT);
    expect(behind.redirected).toBe(true);

    const steep = mountedAim(0, -1.5);
    expect(steep.pitch).toBeCloseTo(-MOUNTED_PITCH_LIMIT);
    expect(steep.redirected).toBe(true);
  });

  it("cannot turn further than the saddle allows", () => {
    expect(MOUNTED_YAW_LIMIT).toBeLessThan(0.9);
    expect(MOUNTED_PITCH_LIMIT).toBeLessThan(MOUNTED_YAW_LIMIT);
  });

  it("points the weapon where the shot will go", () => {
    const aim = mountedAim(0.3, 0.1);
    const length = Math.hypot(aim.aimDirection.x, aim.aimDirection.y, aim.aimDirection.z);
    expect(length).toBeCloseTo(1);
    // Straight ahead: mostly +Z.
    expect(aim.aimDirection.z).toBeGreaterThan(0.9);
    // Turned: the direction swings with the yaw.
    expect(mountedAim(-0.4, 0).aimDirection.x).toBeLessThan(0);
  });

  it("treats a broken aim as looking straight ahead", () => {
    const aim = mountedAim(Number.NaN, Number.NaN);
    expect(aim.yaw).toBe(0);
    expect(aim.pitch).toBe(0);
    expect(aim.redirected).toBe(false);
  });
});

describe("mounted fire (task 660)", () => {
  it("plays the shoot clip when the rider fires", () => {
    const shot = mountedFire(true, 0.1, 0);
    expect(shot.firing).toBe(true);
    expect(shot.clip).toBe(MOUNTED_SHOOT_CLIP);
    expect(shot.aim.yaw).toBeCloseTo(0.1);
  });

  it("plays nothing when the rider is not firing", () => {
    const idle = mountedFire(false, 0.1, 0);
    expect(idle.firing).toBe(false);
    expect(idle.clip).toBeNull();
  });

  it("constrains the aim even when not firing, so the weapon follows the reticle", () => {
    const idle = mountedFire(false, 3, 0);
    expect(idle.aim.redirected).toBe(true);
    expect(Math.abs(idle.aim.yaw)).toBeLessThanOrEqual(MOUNTED_YAW_LIMIT);
  });

  it("ignores a value that is not a decision", () => {
    expect(mountedFire(undefined as unknown as boolean, 0, 0).firing).toBe(false);
  });
});