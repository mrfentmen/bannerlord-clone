/** Task 547: a zoom tick shared by mouse-wheel and touch-pinch camera input. */

/** Minimum time between ticks while a wheel or pinch gesture sends repeated zooms. */
export const ZOOM_TICK_COOLDOWN_MS = 120;

/** Plays a tick only when the last one is outside the cooldown window. */
export class ZoomTick {
  #lastPlayedAt = Number.NEGATIVE_INFINITY;
  readonly #now: () => number;
  readonly #play: () => void;

  constructor(play: () => void, now: () => number = () => performance.now()) {
    this.#play = play;
    this.#now = now;
  }

  /** Called for each real zoom input; dense inputs collapse into one tick. */
  input(): void {
    const now = this.#now();
    if (!Number.isFinite(now)) return;
    if (now >= this.#lastPlayedAt && now - this.#lastPlayedAt < ZOOM_TICK_COOLDOWN_MS) return;
    this.#lastPlayedAt = now;
    this.#play();
  }
}
