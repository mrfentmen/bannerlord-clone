/**
 * Blend transitions between animation states.
 *
 * Task 634: once the reaction is over the character goes back to what it was
 * doing, over 0.3 s -- the longest blend in the table. A reaction that snaps back
 * into a run looks like a cut, and a cut in the middle of a firefight is the
 * single most visible animation artefact in a shooter.
 *
 * Task 633: a hit reaction interrupts whatever is playing, from any state, in
 * 0.05 s. That is the shortest blend in the game and it is deliberate: a hit
 * that takes a fifth of a second to appear reads as the game ignoring the shot.
 * The timing is held per destination state rather than per pair, because a hit
 * has to be equally sharp out of a walk, out of a run and out of a reload.
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

/** Task 634: how long a hit reaction takes to blend back out, seconds. */
export const RETURN_FROM_HIT_SECONDS = 0.3;

/** Every transition the animation layer can be asked for. */
export type BlendState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'aim'
  | 'shoot'
  | 'hit'
  | 'death';

/** A state a hit reaction must never return to. */
const NEVER_RETURN_TO: ReadonlySet<BlendState> = new Set<BlendState>(['hit', 'death']);

/**
 * Task 634: the state a hit reaction returns to.
 *
 * `previous` is whatever was playing before the hit. A reaction caused by a
 * second hit while the first is still playing must return to the state *before*
 * that, not straight back into the reaction -- otherwise the character loops in
 * the flinch forever. `hit` and `death` are never returned to: a hit reaction
 * ends in a normal stance, and a death is not something to blend back out of.
 */
export function stateToReturnTo(previous: BlendState | null): BlendState {
  if (previous === null || NEVER_RETURN_TO.has(previous)) return 'idle';
  return previous;
}

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
 * Task 633: blend length for a state reached from *any* other state, seconds.
 *
 * A hit reaction has to be as fast out of a walk as out of an aim: the player
 * is reading the reaction, not the transition.
 */
export const ANY_SOURCE_TIMINGS: Readonly<Partial<Record<BlendState, BlendSeconds>>> = {
  hit: 0.05,
};

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
  if (timing) return timing.inS;
  // A destination that has to be equally fast from everywhere wins over the
  // default, which is the point of task 633.
  return ANY_SOURCE_TIMINGS[to] ?? DEFAULT_BLEND_SECONDS;
}

/** Task 633: the blend length for an interrupt, from any state. */
export function interruptTimeFor(to: BlendState): BlendSeconds {
  return ANY_SOURCE_TIMINGS[to] ?? blendTimeFor(to, to);
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

  /**
   * Task 633: interrupt whatever is playing with `to`, at its interrupt speed.
   *
   * Unlike {@link play} this always takes effect, because the whole point is
   * that it pre-empts an animation that may still be blending. The weights that
   * exist now are kept: the reaction starts from where the character is, not
   * from a standing start.
   */
  interrupt(to: BlendState): void {
    const current = this.active;
    if (current !== null && current !== to) {
      const out = this.ensure(current);
      out.target = 0;
      out.blendS = interruptTimeFor(to);
    }
    const next = this.ensure(to);
    next.target = 1;
    next.blendS = interruptTimeFor(to);
  }

  /**
   * Task 634: end a hit reaction and blend back to the state it interrupted.
   *
   * The blend is {@link RETURN_FROM_HIT_SECONDS} whichever state that is -- it
   * is the reaction blending out, not a locomotion change, so the table's rows
   * for locomotion do not apply.
   */
  playAfterHit(previous: BlendState | null): BlendState {
    const target = stateToReturnTo(previous);
    const current = this.active;
    if (current !== null && current !== target) {
      const out = this.ensure(current);
      out.target = 0;
      out.blendS = RETURN_FROM_HIT_SECONDS;
    }
    const next = this.ensure(target);
    next.target = 1;
    next.blendS = RETURN_FROM_HIT_SECONDS;
    return target;
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
    if (row) return row.outS;
    // The state being left fades at the same rate the reaction arrives, so the
    // two do not cross at different speeds and the character appears to split.
    return ANY_SOURCE_TIMINGS[to] ?? DEFAULT_BLEND_SECONDS;
  }
}