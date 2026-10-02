/**
 * Disposing models when the browser says it is short of memory.
 *
 * Task 622: a tab that has been left open on the campaign map for an hour is
 * holding every model it has ever fetched. Browsers do not offer a memory
 * query they will let a game rely on, but they do fire an event when the
 * device is under pressure, and on mobile that is the difference between a
 * recovered tab and a killed one.
 *
 * The policy is an eviction order, not an eviction *trigger*. Which entries are
 * eligible, how they are ranked against each other, and what a caller has to do
 * to release one are all decided here and tested without a browser; the scene
 * owns the platform event and the disposal itself.
 *
 * Two things this refuses to do:
 *
 * - Evict what is on screen. A model that is culled because it is behind the
 *   camera can go; one the player is looking at cannot, no matter how much
 *   pressure the OS reports.
 * - Evict in arrival order. Least-recently-used is the only order that helps
 *   under pressure, because the thing that was fetched long ago is the thing
 *   the player has walked furthest from.
 */

/** What a scene knows about one loaded model. */
export interface DisposableModel {
  /** Manifest id. */
  id: string;
  /** Bytes this model's geometry and textures are believed to occupy. */
  bytes: number;
  /** Whether it is drawn right now; a visible model is never evicted. */
  visible: boolean;
  /** Time the model was last needed, ms from any monotonic clock. */
  lastUsedAt: number;
  /** Frees the GPU resources. Supplied by the scene, never called here. */
  dispose?: () => void;
}

/** Where the pressure signal came from. */
export interface PressureSignal {
  /** Bytes the device says it is short of, when it says so. */
  shortfallBytes?: number;
  /** True when the platform raised a memory-pressure event. */
  event?: boolean;
}

/** What the evictor decided to do. */
export interface EvictionPlan {
  /** Ids to free, least-recently-used first. */
  evict: string[];
  /** Bytes those ids are believed to hold. */
  reclaimedBytes: number;
  /** Ids that were skipped because they are on screen. */
  protectedIds: string[];
  /** The shortfall the plan set out to cover, when one was given. */
  targetBytes: number;
  /** True when a platform event fired regardless of any byte figure. */
  fromEvent: boolean;
}

/** Options for {@link evictUnderPressure}. */
export interface EvictionOptions {
  /**
   * How many to release at once. A device in trouble needs a real dent, not one
   * model at a time; 8 is enough to matter without emptying the map.
   */
  maxEvictions?: number;
  /**
   * Treat a platform event as a request to free this many bytes even when the
   * event carries no shortfall figure. Defaults to 32 MB.
   */
  eventTargetBytes?: number;
}

/** Bytes a pressure event is worth when it names no figure. */
export const DEFAULT_EVENT_TARGET_BYTES = 32 * 1024 * 1024;

/** How many models one pressure response frees by default. */
export const DEFAULT_MAX_EVICTIONS = 8;

/**
 * Task 622: choose what to free under memory pressure.
 *
 * Sorting is least-recently-used, with bytes as the tie-break: two models used
 * in the same frame, the bigger one goes first. Visible models are pulled out
 * of the ranking entirely rather than sorted to the end, because an eviction
 * order that *could* include them is an order someone will eventually get wrong.
 *
 * The plan is returned, not executed. A caller that wants the models gone calls
 * `dispose` itself, so the scene can tear down its own nodes in the order it
 * knows how to unwind.
 */
export function evictUnderPressure(
  models: readonly DisposableModel[],
  signal: PressureSignal,
  options: EvictionOptions = {},
): EvictionPlan {
  const targetBytes =
    typeof signal.shortfallBytes === 'number' && Number.isFinite(signal.shortfallBytes)
      ? Math.max(0, signal.shortfallBytes)
      : 0;
  const fromEvent = signal.event === true;
  const eventTarget =
    typeof options.eventTargetBytes === 'number' && options.eventTargetBytes > 0
      ? options.eventTargetBytes
      : DEFAULT_EVENT_TARGET_BYTES;
  const visible = models.filter((m) => m.visible);
  const goal = Math.max(targetBytes, fromEvent ? eventTarget : 0);
  // No shortfall figure and no platform event is not a request to free
  // anything: an unbounded eviction on an empty signal would empty the map.
  if (goal <= 0) {
    return {
      evict: [],
      reclaimedBytes: 0,
      protectedIds: visible.map((m) => m.id),
      targetBytes: 0,
      fromEvent,
    };
  }
  const maxEvictions =
    typeof options.maxEvictions === 'number' && options.maxEvictions > 0
      ? Math.floor(options.maxEvictions)
      : DEFAULT_MAX_EVICTIONS;

  const candidates = models
    .filter((m) => !m.visible)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt || b.bytes - a.bytes);

  const evict: string[] = [];
  const protectedIds: string[] = visible.map((m) => m.id);
  let reclaimed = 0;
  for (const candidate of candidates) {
    if (evict.length >= maxEvictions) break;
    if (goal > 0 && reclaimed >= goal) break;
    evict.push(candidate.id);
    reclaimed += Math.max(0, candidate.bytes);
  }

  return { evict, reclaimedBytes: reclaimed, protectedIds, targetBytes: goal, fromEvent };
}

/**
 * Runs a plan: frees the models it names and calls each `dispose` at most once.
 *
 * Returns the ids that were actually released, which can be shorter than the
 * plan when a caller has already disposed one by hand.
 */
export function applyEvictionPlan(
  models: readonly DisposableModel[],
  plan: EvictionPlan,
): string[] {
  // A protected id is skipped even if the plan names it: the plan is a
  // suggestion, and what is on screen outranks it.
  const protectedIds = new Set(plan.protectedIds);
  const wanted = new Set(plan.evict.filter((id) => !protectedIds.has(id)));
  const released: string[] = [];
  for (const model of models) {
    if (!wanted.has(model.id) || released.includes(model.id)) continue;
    model.dispose?.();
    released.push(model.id);
  }
  return released;
}

/**
 * Tracks pressure over time so a scene can ignore a signal it has already
 * answered. A browser can fire the same memory-pressure event several times in a
 * row; without a cooldown each event would re-plan the same eviction over models
 * that are already gone, which is how an eviction loop starts.
 */
export class PressureWatcher {
  private lastActedAt: number | null = null;

  constructor(
    private readonly cooldownMs = 5000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Returns a plan when the last response is older than the cooldown, or null
   * while still cooling down. The clock is injected so the cooldown is testable
   * without waiting five seconds.
   */
  consider(
    models: readonly DisposableModel[],
    signal: PressureSignal,
    options: EvictionOptions = {},
  ): EvictionPlan | null {
    const at = this.now();
    if (this.lastActedAt !== null && at - this.lastActedAt < this.cooldownMs) return null;
    this.lastActedAt = at;
    return evictUnderPressure(models, signal, options);
  }

  /** Milliseconds since the last acted-on signal, or null if never. */
  sinceLastPlan(): number | null {
    return this.lastActedAt === null ? null : this.now() - this.lastActedAt;
  }

  /** Forgets the cooldown, e.g. after the player changed scenes. */
  reset(): void {
    this.lastActedAt = null;
  }
}
