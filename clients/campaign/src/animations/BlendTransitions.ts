/**
 * Blend transitions between animation states.
 *
 * Task 632: a character speeding up from a walk to a run blends over 0.15 s --
 * a fifth shorter than a walk change, because a walk-to-run cross-fade that
 * takes as long as the idle-to-walk one reads as the character hesitating.
 *
 * Task 631: a character changing from standing to walking must not snap. The
 * blend has a fixed length, and this module owns those lengths: what a caller
 * asks is "how long does this cross-fade take", and {@link BlendTrack} is what
 * turns an answer into per-frame weights.
 *
 * Two properties matter more than the table itself.
 *
 * A blend is proportional to elapsed time, not to frames. `update(0.016)` and
 * `update(0.25)` reach the same place after the same 0.2 s of wall clock, which
 * is what stops the transition running at a different speed on a 30 fps machine.
 *
 * A blend can be interrupted. A hit reaction at any point in a walk blend takes
 * over from whatever weights exist right now, not from zero -- restarting the
 * cross-fade from scratch is what makes a character look like it is
 * re-synchronising rather than reacting.
 */

/** A blend length in seconds. */
export type BlendSeconds = number;

/** Every transition the animation layer can be asked for. */
export type BlendState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'aim'
  | 'shoot'
  | 'hit'
  | 'death';

/** A transition's blend length, in seconds. */
export interface BlendTiming {
  /** Seconds the cross-fade takes from full weight to zero. */
  outS: BlendSeconds;
  /** Seconds the cross-fade takes from zero to full weight. */
  inS: BlendSeconds;
}

/** The length used when a caller asks for a transition the table has no row for. */
export const DEFAULT_BLEND_SECONDS = 0.2;

/**
 * How close to its target a weight has to get before it is snapped onto it.
 *
 * Without this, accumulating 1/60 s steps never lands exactly on 1.0, and a
 * finished blend reports itself as still blending forever -- which costs a scene
 * a per-frame write and makes "is it done?" unanswerable.
 */
export const BLEND_EPSILON = 1e-4;

/** Task 631: idle to walk blends over 0.2 s. */
export const IDLE_TO_WALK: BlendTiming = { outS: 0.2, inS: 0.2 };

/** Task 632: walk to run blends over 0.15 s. */
export const WALK_TO_RUN: BlendTiming = { outS: 0.15, inS: 0.15 };

/**
 * The transition table. Every row is a design number from the animation brief,
 * not a guess: a locomotion change wants to be barely noticeable, a combat
 * change wants to be sharp.
 */
export const BLEND_TIMINGS: Readonly<
  Partial<Record<BlendState, Readonly<Partial<Record<BlendState, BlendTiming>>>>>
> = {
  idle: { walk: IDLE_TO_WALK },
  walk: { run: WALK_TO_RUN },
};

/** A transition key, as a string a caller can log. */
export function transitionKey(from: BlendState, to: BlendState): string {
  return `${from}->${to}`;
}

/**
 * Task 631: the blend length for a transition, in seconds.
 *
 * Falls back to {@link DEFAULT_BLEND_SECONDS} for a pair the table does not
 * name. The fallback matters: an unlisted transition is not an error, it is
 * every transition somebody invents later, and those still have to blend.
 */
export function blendTimeFor(from: BlendState, to: BlendState): BlendSeconds {
  const row = BLEND_TIMINGS[from];
  const timing = row?.[to];
  return timing ? timing.inS : DEFAULT_BLEND_SECONDS;
}

/** One state's weight in a blend, and where it is heading. */
export interface TrackEntry {
  state: BlendState;
  /** Current weight, 0..1. */
  weight: number;
  /** Weight this state is heading for, 0 or 1. */
  target: number;
  /** Length of the move it is making, seconds. */
  blendS: BlendSeconds;
}

/** What one {@link BlendTrack.update} call wrote. */
export interface BlendUpdate {
  /** Weights by state, only for the states in the track. */
  weights: Readonly<Record<string, number>>;
  /** True while any state is still moving. */
  blending: boolean;
}

/**
 * Task 631: the weights of a cross-fade, in one place.
 *
 * A track holds one active state plus whatever is fading out, which is all a
 * two-way cross-fade needs. {@link BlendTrack.play} moves from whatever is
 * playing now, so an interrupted blend continues from the current weights
 * rather than starting again.
 */
export class BlendTrack {
  private readonly entries = new Map<BlendState, TrackEntry>();

  /** The state with the highest weight, or null when the track is empty. */
  get active(): BlendState | null {
    let best: BlendState | null = null;
    let bestWeight = -1;
    for (const [state, entry] of this.entries) {
      if (entry.weight > bestWeight) {
        best = state;
        bestWeight = entry.weight;
      }
    }
    return best;
  }

  /** The weight of one state, 0 when it is not in the track. */
  weightOf(state: BlendState): number {
    return this.entries.get(state)?.weight ?? 0;
  }

  /**
   * Task 631: start a transition to `to`, blending out of whatever is playing.
   *
   * Playing the state that is already dominant is a no-op unless `force` is
   * set, which is what stops a per-frame "keep walking" call from restarting the
   * blend every frame.
   */
  play(to: BlendState, from?: BlendState, force = false): void {
    const current = from ?? this.active;
    if (current === to && !force) return;
    if (current !== null) {
      const out = this.ensure(current);
      out.target = 0;
      out.blendS = this.outTimeFor(current, to);
    }
    const next = this.ensure(to);
    next.blendS = this.inTimeFor(current, to);
    // Keep the weight it already has: an interrupted blend must not restart.
    next.target = 1;
  }

  /** Advances every weight by `deltaS`. */
  update(deltaS: number): BlendUpdate {
    const step = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
    const weights: Record<string, number> = {};
    let blending = false;
    for (const [state, entry] of this.entries) {
      if (entry.weight !== entry.target) {
        blending = true;
        if (entry.blendS <= 0) {
          entry.weight = entry.target;
        } else {
          const rate = step / entry.blendS;
          entry.weight =
            entry.target > entry.weight
              ? Math.min(entry.target, entry.weight + rate)
              : Math.max(entry.target, entry.weight - rate);
          if (Math.abs(entry.target - entry.weight) <= BLEND_EPSILON) {
            entry.weight = entry.target;
          }
        }
      }
      weights[state] = entry.weight;
    }
    return { weights, blending };
  }

  /** Forgets every state, for a fresh character or a respawn. */
  clear(): void {
    this.entries.clear();
  }

  private ensure(state: BlendState): TrackEntry {
    let entry = this.entries.get(state);
    if (!entry) {
      entry = { state, weight: 0, target: 0, blendS: DEFAULT_BLEND_SECONDS };
      this.entries.set(state, entry);
    }
    return entry;
  }

  private inTimeFor(from: BlendState | null, to: BlendState): BlendSeconds {
    if (from === null) return blendTimeFor(to, to);
    return blendTimeFor(from, to);
  }

  private outTimeFor(from: BlendState, to: BlendState): BlendSeconds {
    const row = BLEND_TIMINGS[from]?.[to];
    return row ? row.outS : DEFAULT_BLEND_SECONDS;
  }
}