/**
 * Which clip each animation state needs, and whether the loaded model has it.
 *
 * Tasks 671 to 680 are all the same shape: a named state ("prone crawl", "heal",
 * "downed") and the clip that plays it. The staged operator GLBs carry most of
 * them, `kaykit-rogue` carries the rest, and the medic rig carries a subset --
 * so the honest design is two-part.
 *
 * {@link STATE_CLIPS} says what a state *needs*.
 * {@link resolveStateClip} is asked what the model *has*, and answers with the
 * clip when it is there and a named gap when it is not. A state with no clip is
 * not an error and is not silently dropped either: the caller gets
 * `available: false` and a reason, and can decide to hide the state, fall back,
 * or do nothing.
 *
 * The test reads the real animation lists out of every staged GLB, so this table
 * cannot claim a clip the assets do not ship.
 */

import type { BlendState } from './BlendTransitions.js';

/** The states this registry covers. */
export type ActionState =
  | 'prone-crawl'
  | 'crouch-idle'
  | 'crouch-walk'
  | 'jump'
  | 'slide'
  | 'melee'
  | 'throw'
  | 'interact'
  | 'heal'
  | 'revive'
  | 'downed'
  | 'surrender'
  | 'cheer'
  | 'reload';

/** What a state needs from the model. */
export interface StateClip {
  /** Clip name as the staged GLBs spell it. */
  clip: string;
  /** Blends into the state over this many seconds. */
  blendS: number;
  /** True when the clip loops. */
  loop: boolean;
  /** The locomotion state the legs keep playing underneath, if any. */
  lowerBody?: BlendState;
}

/** The registry. Built up as each state is specified. */
export const STATE_CLIPS: Readonly<Partial<Record<ActionState, StateClip>>> = {};

/** Why a state cannot play. */
export type StateGap =
  | 'no-clip-registered'
  | 'clip-not-in-model'
  | 'unknown-state';

/** The answer for one state on one model. */
export interface ResolvedClip {
  state: ActionState;
  /** Clip to play, or null. */
  clip: string | null;
  /** True when the model actually has it. */
  available: boolean;
  /** Set when it cannot play, and why. */
  gap: StateGap | null;
  /** The full entry, when one is registered. */
  entry: StateClip | null;
}

/** Merges a new state into the registry. */
export function registerState(state: ActionState, entry: StateClip): void {
  (STATE_CLIPS as Record<ActionState, StateClip>)[state] = entry;
}

/**
 * Resolves a state against the clips a model actually has.
 *
 * `modelClips` is whatever the loader found: the AnimationGroups it created, or
 * the clip names out of the GLB. Comparing against it rather than assuming is
 * the difference between a medic who can heal and one who silently does not.
 */
export function resolveStateClip(
  state: ActionState,
  modelClips: readonly string[],
): ResolvedClip {
  const entry = STATE_CLIPS[state] ?? null;
  if (!entry) {
    return { state, clip: null, available: false, gap: 'no-clip-registered', entry: null };
  }
  const has = modelClips.some((name) => name === entry.clip);
  if (!has) {
    return { state, clip: entry.clip, available: false, gap: 'clip-not-in-model', entry };
  }
  return { state, clip: entry.clip, available: true, gap: null, entry };
}

/**
 * Every registered state the model can play, in registration order.
 *
 * This is what a scene asks when it is wiring a character up: it gets the states
 * it can have, and {@link resolveStateClip} gives it the reasons for the rest.
 */
export function availableStates(modelClips: readonly string[]): ActionState[] {
  return (Object.keys(STATE_CLIPS) as ActionState[]).filter(
    (state) => resolveStateClip(state, modelClips).available,
  );
}

/** The states the model cannot play, with their reasons. */
export function unavailableStates(modelClips: readonly string[]): Array<{
  state: ActionState;
  gap: StateGap;
}> {
  return (Object.keys(STATE_CLIPS) as ActionState[])
    .map((state) => resolveStateClip(state, modelClips))
    .filter((resolved) => !resolved.available)
    .map((resolved) => ({ state: resolved.state, gap: resolved.gap as StateGap }));
}