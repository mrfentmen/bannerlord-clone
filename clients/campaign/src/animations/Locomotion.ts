/**
 * Locomotion playback and the additive aim layer.
 *
 * Task 654: an animation's playback rate has to follow the character's speed, or
 * the feet slide. A walk clip authored at 1.4 m/s played at a sprint has its feet
 * in the wrong place every frame -- the single most common giveaway of a cheap
 * character controller, and the reason "walk" and "run" alone are not enough.
 *
 * The mapping is deliberately simple: playback rate is movement speed divided by
 * the speed the clip was authored at. Anything cleverer -- blending two clips by
 * speed -- needs a clip set that ships in two tempos, and the staged ones do not.
 * What the simple mapping does get right is that it *always* matches the feet.
 *
 * Task 655: the aim overlay. Aiming is an upper-body pose that has to sit on top
 * of whatever the legs are doing, so it is an additive layer over a bone mask
 * rather than a state the whole body switches to.
 */

/** Speed the staged walk clips were authored at, m/s. */
export const AUTHORED_WALK_SPEED = 1.4;

/** Speed the staged run clips were authored at, m/s. */
export const AUTHORED_RUN_SPEED = 4.2;

/** Playback rates outside this range are clamped: nothing useful lives beyond it. */
export const MIN_PLAYBACK_RATE = 0.25;

export const MAX_PLAYBACK_RATE = 2.5;

/**
 * Task 654: the playback rate a locomotion clip should play at for a given
 * movement speed.
 *
 * Returns 1 at the authored speed, below 1 when the character is moving slower
 * and above 1 when faster. A non-positive speed means the character is standing
 * still, which is a rate of zero -- not a rate of "walk backwards at a third
 * speed", which is what dividing by a moving reference would give.
 */
export function playbackRateFor(
  movementSpeedMps: number,
  authoredSpeedMps: number = AUTHORED_WALK_SPEED,
): number {
  if (!Number.isFinite(movementSpeedMps) || movementSpeedMps <= 0) return 0;
  const reference = Number.isFinite(authoredSpeedMps) && authoredSpeedMps > 0
    ? authoredSpeedMps
    : AUTHORED_WALK_SPEED;
  const rate = movementSpeedMps / reference;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate));
}

/** How far through a clip a character should be, from its speed. */
export interface LocomotionPlayback {
  /** Speed to apply to the animation group. */
  rate: number;
  /** True when the character is moving rather than standing. */
  moving: boolean;
  /** Distance the character covers in one loop of the clip, metres. */
  strideLengthM: number;
}

/**
 * Task 654: playback for a whole cycle.
 *
 * `strideLengthM` is what a caller needs to work out whether the animation is
 * keeping up: it is the distance the character's feet travel in one loop of the
 * clip, and it should equal the distance the character covers in that time.
 */
export function locomotionPlayback(
  movementSpeedMps: number,
  clipDurationS: number,
  authoredSpeedMps: number = AUTHORED_WALK_SPEED,
): LocomotionPlayback {
  const duration = Number.isFinite(clipDurationS) && clipDurationS > 0 ? clipDurationS : 1;
  const speed = Number.isFinite(movementSpeedMps) && movementSpeedMps > 0 ? movementSpeedMps : 0;
  const rate = playbackRateFor(movementSpeedMps, authoredSpeedMps);
  return {
    rate,
    moving: speed > 0,
    strideLengthM: (speed / rate) * duration,
  };
}

/**
 * Speed to change gait at. Below it a character walks, above it it runs; the
 * middle is a hysteresis band so a character hovering at the threshold does not
 * alternate between two clips every frame.
 */
export const GAIT_THRESHOLD_MPS = 2.4;

/** Hysteresis either side of {@link GAIT_THRESHOLD_MPS}, m/s. */
export const GAIT_HYSTERESIS_MPS = 0.5;

/** Which locomotion clip a character is playing. */
export type Gait = 'idle' | 'walk' | 'run';

/**
 * Task 654: the gait for a speed, given the one it is already playing.
 *
 * Running down to a walk needs a lower speed than walking up to a run, because a
 * character that changes gait at the same threshold in both directions flips
 * every time its speed wobbles around it.
 */
export function gaitFor(speedMps: number, current: Gait = 'idle'): Gait {
  // Only NaN becomes zero. An infinite speed is faster than any threshold, and
  // calling it "idle" would be the opposite of right.
  const speed = Number.isNaN(speedMps) ? 0 : Math.max(0, speedMps);
  if (speed <= 0) return 'idle';
  if (current === 'run') return speed > GAIT_THRESHOLD_MPS - GAIT_HYSTERESIS_MPS ? 'run' : 'walk';
  return speed >= GAIT_THRESHOLD_MPS ? 'run' : 'walk';
}

/**
 * Bones an aim overlay is allowed to touch, by name fragment.
 *
 * Both arm conventions are listed because the staged rigs use different ones:
 * Babylon's own skeletons say `UpperArm`/`LowerArm` and the mixamo-named
 * operator GLBs say `UpperArm`/`ForeArm`. Listing `arm` covers whichever arrives
 * without ever reaching the legs, which are excluded first and separately.
 */
export const AIM_BONE_MASK: readonly string[] = [
  'spine',
  'chest',
  'neck',
  'head',
  'shoulder',
  'upperarm',
  'lowerarm',
  'forearm',
  'arm',
  'hand',
];

/** Bones the overlay must never touch, because the legs drive them. */
export const LEG_BONE_FRAGMENTS: readonly string[] = ['thigh', 'calf', 'foot', 'toe', 'leg', 'hip'];

/**
 * True when a bone belongs to the aim overlay.
 *
 * The leg exclusion is checked first on purpose: a Quaternius rig has both
 * "LeftUpLeg" and "LeftUpperArm", and a mask that matched on "upper" alone would
 * take the thigh with it and stop the legs working.
 */
export function boneInAimMask(name: string): boolean {
  const lower = name.toLowerCase();
  if (LEG_BONE_FRAGMENTS.some((fragment) => lower.includes(fragment.toLowerCase()))) return false;
  return AIM_BONE_MASK.some((fragment) => lower.includes(fragment.toLowerCase()));
}

/** How strongly the aim layer is applied, 0..1. */
export interface AimOverlay {
  /** Weight of the additive layer. */
  weight: number;
  /** Bones it was applied to, by name. */
  bones: string[];
  /** True when the overlay is fading in or out rather than settled. */
  moving: boolean;
}

/** Seconds for the aim overlay to reach full weight. */
export const AIM_FADE_S = 0.2;

/**
 * Task 655: the aim overlay's weight, and which bones it may touch.
 *
 * The weight is a plain fade rather than a spring: an aim overlay that
 * overshoots reads as a flinch, and the fade is also what the blend table in
 * `BlendTransitions.ts` is already tuned around.
 */
export class AimLayer {
  private weight = 0;

  constructor(private readonly fadeS: number = AIM_FADE_S) {}

  /** True when the character is aiming. */
  aiming = false;

  /** Advances the fade towards the aim state. */
  update(deltaS: number, bones: readonly string[] = []): AimOverlay {
    const duration = Number.isFinite(this.fadeS) && this.fadeS > 0 ? this.fadeS : AIM_FADE_S;
    const step = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
    const target = this.aiming ? 1 : 0;
    if (step >= duration) {
      this.weight = target;
    } else {
      const rate = step / duration;
      this.weight = target > this.weight
        ? Math.min(target, this.weight + rate)
        : Math.max(target, this.weight - rate);
    }
    // `moving` means the overlay has not arrived yet -- not that this frame
    // changed something. A caller polling it wants to know whether to keep
    // writing the layer, and a layer that has landed does not need writing.
    const settled = Math.abs(this.weight - target) <= 1e-6;
    return {
      weight: this.weight,
      // Nothing to apply at zero weight: reporting the bone list anyway would
      // invite a scene to write an additive layer of weight zero.
      bones: this.weight > 0 ? bones.filter(boneInAimMask) : [],
      moving: !settled,
    };
  }

  /** The current weight without advancing it. */
  get currentWeight(): number {
    return this.weight;
  }
}