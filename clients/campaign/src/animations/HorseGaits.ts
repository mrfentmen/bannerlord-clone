/**
 * Horse gaits and death.
 *
 * Task 656: a horse has three gaits, and the staged `horse.glb` has clips for
 * two of them -- `Walk` and `Gallop` -- and none for a trot. This module says so
 * rather than pretending: {@link HORSE_GAIT_CLIPS} maps each gait to the clip it
 * would play, `null` where the pack ships none, and {@link clipForGait} returns
 * the reason alongside. A controller that asked for a trot and quietly played the
 * walk instead would produce a horse that appears to canter on the spot.
 *
 * The test reads the real GLB's animation list and checks every clip this module
 * names actually exists in it, which is the only way a clip table stays honest.
 *
 * Task 657: a horse that dies falls. The `Death` clip exists, so this is the
 * `Death` clip plus the handoff: a fall is not over until the body has stopped
 * on the ground, and the point at which the physics ragdoll takes over is decided
 * here and handed over as an event rather than assumed by a caller counting
 * seconds.
 */

/** The three gaits, slowest first. */
export type HorseGait = 'halt' | 'walk' | 'trot' | 'gallop';

/** Speed below which a horse is standing, m/s. */
export const HORSE_HALT_MPS = 0.2;

/** Walk up to here, m/s. */
export const HORSE_WALK_MPS = 1.8;

/** Trot up to here, m/s. */
export const HORSE_TROT_MPS = 3.6;

/** Hysteresis either side of a gait boundary, m/s. */
export const HORSE_GAIT_HYSTERESIS_MPS = 0.4;

/**
 * Task 656: the clip each gait would play.
 *
 * `trot` is null: `horse.glb` ships Walk, Gallop, Gallop_Jump, Death, Idle,
 * Eating, Attack_Kick, Attack_Headbutt, Jump_toIdle and the two idle hit
 * reactions, and no trot. Null is the honest value and it is a useful one: it
 * tells whoever authors the next horse asset that this clip is missing.
 */
export const HORSE_GAIT_CLIPS: Readonly<Record<HorseGait, string | null>> = {
  halt: 'Idle',
  walk: 'Walk',
  trot: null,
  gallop: 'Gallop',
};

/** Why a gait cannot be played. */
export type GaitGap = 'no-clip-for-gait';

/** The clip a gait wants, and whether it can be played. */
export interface GaitClip {
  gait: HorseGait;
  /** Clip name, or null when the pack ships none. */
  clip: string | null;
  /** Set when the clip is missing. */
  gap: GaitGap | null;
}

/** Task 656: which clip a gait needs, and whether it exists. */
export function clipForGait(gait: HorseGait): GaitClip {
  const clip = HORSE_GAIT_CLIPS[gait] ?? null;
  return { gait, clip, gap: clip === null ? 'no-clip-for-gait' : null };
}

/**
 * Task 656: the gait for a speed, given the one already playing.
 *
 * Same hysteresis idea as a human character, with wider bands: a horse at a
 * gallop takes a long way to stop, so flipping gait at the threshold would have
 * it change its mind several times on the way down.
 */
export function horseGaitFor(speedMps: number, current: HorseGait = 'halt'): HorseGait {
  const speed = Number.isNaN(speedMps) ? 0 : Math.max(0, speedMps);
  if (speed <= HORSE_HALT_MPS) return 'halt';
  const band = HORSE_GAIT_HYSTERESIS_MPS;
  // Coming down out of a gait, the boundary is lower than the way up.
  const walkBoundary = current === 'gallop' || current === 'trot' ? HORSE_WALK_MPS - band : HORSE_WALK_MPS;
  const trotBoundary = current === 'gallop' ? HORSE_TROT_MPS - band : HORSE_TROT_MPS;
  if (speed < walkBoundary) return 'walk';
  if (speed < trotBoundary) return 'trot';
  return 'gallop';
}

/** What a scene needs to play a horse's gaits. */
export interface HorseGaitPlayback {
  gait: HorseGait;
  clip: string | null;
  /** True when the clip is missing and the caller has to do something about it. */
  missing: boolean;
  /** Playback rate for the speed, or 1 when the gait is stationary. */
  rate: number;
}

/** Speed `horse.glb`'s Walk and Gallop clips are authored at, m/s. */
export const AUTHORED_HORSE_WALK_MPS = 1.6;

export const AUTHORED_HORSE_TROT_MPS = 3.2;

export const AUTHORED_HORSE_GALLOP_MPS = 9;

/** Playback rate bounds for a horse, wider than a human's. */
export const MIN_HORSE_RATE = 0.5;

export const MAX_HORSE_RATE = 2;

/**
 * Task 656: what to play, and how fast.
 *
 * The authored speed is per gait, so a horse accelerating from a walk to a
 * gallop changes clip *and* rate, which is what stops the transition from looking
 * like a speed change with the animation left behind.
 */
export function horsePlayback(speedMps: number, current: HorseGait = 'halt'): HorseGaitPlayback {
  const gait = horseGaitFor(speedMps, current);
  const { clip, gap } = clipForGait(gait);
  const speed = Number.isNaN(speedMps) ? 0 : Math.max(0, speedMps);
  const authored =
    gait === 'gallop'
      ? AUTHORED_HORSE_GALLOP_MPS
      : gait === 'walk'
        ? AUTHORED_HORSE_WALK_MPS
        : AUTHORED_HORSE_TROT_MPS;
  const rate = gait === 'halt' ? 1 : Math.min(MAX_HORSE_RATE, Math.max(MIN_HORSE_RATE, speed / authored));
  return { gait, clip, missing: gap !== null, rate };
}

/** A horse's death, as this module hands it over. */
export interface HorseDeath {
  /** The clip to play, if the pack ships one. */
  clip: string | null;
  /** True once the fall has finished and physics should take the body. */
  ragdollReady: boolean;
  /** How far through the fall the horse is, 0..1. */
  progress: number;
}

/** How long the `Death` clip runs before the body has settled, seconds. */
export const HORSE_DEATH_CLIP_S = 2.4;

/** Seconds from the start of the fall at which the ragdoll takes over. */
export const HORSE_RAGDOLL_AT_S = 1.6;

/**
 * Task 657: the horse's death, and when the physics takes over.
 *
 * The handoff is at a fraction of the clip rather than at its end. A fall reads as
 * a fall while the legs are still going; handing the body to physics the instant
 * the clip ends produces a small pop as the last of the animation is replaced.
 */
export class HorseDeathState {
  private ageS = 0;
  private started = false;

  constructor(
    private readonly clipS: number = HORSE_DEATH_CLIP_S,
    private readonly ragdollAtS: number = HORSE_RAGDOLL_AT_S,
  ) {}

  /** True once the death has begun. */
  get active(): boolean {
    return this.started;
  }

  /** Starts the fall. Returns false if it was already going. */
  begin(): boolean {
    if (this.started) return false;
    this.started = true;
    this.ageS = 0;
    return true;
  }

  /** Clears the death, for a respawn or a horse that was only stunned. */
  reset(): void {
    this.started = false;
    this.ageS = 0;
  }

  /** Advances the fall. */
  update(deltaS: number): HorseDeath {
    if (!this.started) {
      return { clip: null, ragdollReady: false, progress: 0 };
    }
    const step = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
    this.ageS = Math.min(this.clipS, this.ageS + step);
    const duration = this.clipS > 0 ? this.clipS : 1;
    // A handoff threshold that cannot be read hands the body over at once: a
    // horse lying there waiting for a number that will never arrive is worse
    // than one that falls and stays fallen.
    const handoffAt = Number.isFinite(this.ragdollAtS) ? Math.min(duration, Math.max(0, this.ragdollAtS)) : 0;
    return {
      clip: 'Death',
      ragdollReady: this.ageS >= handoffAt,
      progress: Math.min(1, this.ageS / duration),
    };
  }
}