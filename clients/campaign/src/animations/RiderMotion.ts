/**
 * Riding.
 *
 * Task 659: a rider bounces with the horse. There is no "mounted idle" clip in
 * any staged asset, and it does not matter: the bounce is procedural, a small
 * vertical and roll offset driven by the horse's gait, which is also why it works
 * at any speed without an animation per speed.
 *
 * Task 660: a rider can shoot while mounted. The `shoot` clip exists on all five
 * operator GLBs, so the upper body plays it; what makes it *mounted* rather than
 * standing is the constraint below -- the hands stay on the reins and the torso
 * cannot rotate as far as it can on foot, so the aim is redirected rather than the
 * animation being replaced.
 */

/** How the horse is moving. */
export type MountGait = 'halt' | 'walk' | 'trot' | 'gallop';

/** Vertical bounce amplitude by gait, metres. */
export const BOUNCE_AMPLITUDE_M: Readonly<Record<MountGait, number>> = {
  halt: 0,
  walk: 0.035,
  trot: 0.07,
  gallop: 0.11,
};

/** How far the rider leans back by gait, radians. A rider on a gallop leans. */
export const RIDER_LEAN_RAD: Readonly<Record<MountGait, number>> = {
  halt: 0,
  walk: 0.04,
  trot: 0.12,
  gallop: 0.22,
};

/** Cadence of the bounce by gait, cycles per second. */
export const BOUNCE_HZ: Readonly<Record<MountGait, number>> = {
  halt: 0,
  walk: 1.1,
  trot: 1.8,
  gallop: 2.4,
};

/** Where the rider's body is, relative to the saddle. */
export interface RiderPose {
  /** Vertical offset, metres. */
  liftM: number;
  /** Roll about the horse's forward axis, radians. */
  rollRad: number;
  /** Lean backwards about the horse's side axis, radians. */
  leanRad: number;
  /** Gait the pose came from. */
  gait: MountGait;
}

/** The rider's neutral pose: sitting still in the saddle. */
export const SADDLED: RiderPose = { liftM: 0, rollRad: 0, leanRad: 0, gait: 'halt' };

/**
 * Task 659: the rider's pose at a point in the gait cycle.
 *
 * `phase` is 0..1 through one stride. The lift is a half-sine, so it is at the
 * bottom of the bounce at both ends of the cycle and at its peak halfway -- a
 * bounce that starts at its peak looks like the rider is being thrown.
 */
export function riderPose(gait: MountGait, phase: number): RiderPose {
  const amplitude = BOUNCE_AMPLITUDE_M[gait] ?? 0;
  const cadence = BOUNCE_HZ[gait] ?? 0;
  if (amplitude <= 0 || cadence <= 0) return { ...SADDLED, gait };
  const cycle = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
  // A half-sine over the stride, so the rider is at the bottom at both ends and
  // at the top of the bounce halfway through. A full sine would put the peak at
  // the quarter mark, which is where the horse's shoulder is, not its stride.
  const lift = Math.sin(cycle * Math.PI) * amplitude;
  return {
    liftM: lift,
    // A full sine over the same cycle, so the roll peaks a quarter of a stride
    // away from the lift: the roll is what reads as balance, and a bounce with
    // no roll looks like a lift.
    rollRad: Math.sin(cycle * Math.PI * 2) * amplitude * 0.35,
    leanRad: RIDER_LEAN_RAD[gait] ?? 0,
    gait,
  };
}

/** Advances a rider's pose along the cycle. */
export class RiderMotion {
  private cycle = 0;

  /** Where the rider is now, and the gait it came from. */
  pose(gait: MountGait, deltaS = 0): RiderPose {
    const cadence = BOUNCE_HZ[gait] ?? 0;
    if (Number.isFinite(deltaS) && deltaS > 0 && cadence > 0) {
      this.cycle += deltaS * cadence;
      this.cycle = ((this.cycle % 1) + 1) % 1;
    }
    // The lift's half-sine needs the phase doubled: the stride runs from the
    // bottom of one bounce to the bottom of the next, twice per cadence cycle.
    return riderPose(gait, this.cycle * 2);
  }

  /** Puts the cycle back to the bottom of a stride, e.g. on mounting. */
  reset(): void {
    this.cycle = 0;
  }
}

/** How much a rider may turn while mounted, radians. On foot it is the head's cone. */
export const MOUNTED_YAW_LIMIT = 0.45;

/** How far a rider may aim down while mounted, radians. */
export const MOUNTED_PITCH_LIMIT = 0.3;

/** An aim that has been constrained to what a rider can actually do. */
export interface MountedAim {
  /** Yaw the rider will actually use, radians. */
  yaw: number;
  /** Pitch the rider will actually use, radians. */
  pitch: number;
  /** True when the target was outside what a rider can reach. */
  redirected: boolean;
  /** Where the rider is actually looking, in the direction it was aiming. */
  aimDirection: { x: number; y: number; z: number };
}

/**
 * Task 660: redirect an aim to what a rider can do.
 *
 * A rider cannot spin in the saddle to hit something behind the horse, so the aim
 * is clamped -- and the *direction* comes back with it, because the weapon in
 * the rider's hands has to point at the clamped target or the shot lands somewhere
 * the reticle is not.
 */
export function mountedAim(yaw: number, pitch: number): MountedAim {
  const yawLimit = MOUNTED_YAW_LIMIT;
  const pitchLimit = MOUNTED_PITCH_LIMIT;
  const wantedYaw = Number.isFinite(yaw) ? yaw : 0;
  const wantedPitch = Number.isFinite(pitch) ? pitch : 0;
  const y = Math.min(yawLimit, Math.max(-yawLimit, wantedYaw));
  const p = Math.min(pitchLimit, Math.max(-pitchLimit, wantedPitch));
  const redirected = y !== wantedYaw || p !== wantedPitch;
  return {
    yaw: y,
    pitch: p,
    redirected,
    // Yaw about +Y then pitch about the rider's right, matching the aim the
    // blend table already plays.
    aimDirection: {
      x: Math.sin(y) * Math.cos(p),
      y: Math.sin(p),
      z: Math.cos(y) * Math.cos(p),
    },
  };
}

/** What a mounted shooter is doing this frame. */
export interface MountedFire {
  /** True when the rider has a shot in progress. */
  firing: boolean;
  /** Clip to play; the staged operators ship `shoot`. */
  clip: string | null;
  /** Aim the weapon uses, already constrained to the saddle. */
  aim: MountedAim;
}

/** The clip the staged operator GLBs ship for firing. Verified against the file. */
export const MOUNTED_SHOOT_CLIP = 'shoot';

/**
 * Task 660: what a mounted shooter plays.
 *
 * A shot while mounted is the same `shoot` clip with a constrained aim, so it is
 * the same policy a dismounted shooter uses -- which is what makes it read as the
 * same weapon.
 */
export function mountedFire(wantsToFire: boolean, yaw: number, pitch: number): MountedFire {
  return {
    firing: wantsToFire === true,
    clip: wantsToFire === true ? MOUNTED_SHOOT_CLIP : null,
    aim: mountedAim(yaw, pitch),
  };
}