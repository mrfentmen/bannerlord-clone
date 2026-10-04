/**
 * Campaign game clock — the single source of game time.
 *
 * Everything time-of-day reads from here: the day/night cycle, weather,
 * shop hours, mission timers. Pure, serializable, unit-testable.
 */
export class GameClock {
  /** Game seconds since the campaign started. */
  time = 0;
  /** Game seconds per real second. */
  timeScale: number;
  /** Game seconds per full day. Default 86400 (a 24-minute day at 60x). */
  readonly dayLength: number;

  constructor(opts: { timeScale?: number; dayLength?: number; startHour?: number } = {}) {
    this.timeScale = opts.timeScale ?? 60;
    this.dayLength = opts.dayLength ?? 86400;
    this.time = ((opts.startHour ?? 9) / 24) * this.dayLength;
  }

  tick(realDt: number): void {
    this.time += realDt * this.timeScale;
  }

  /** 0..24. */
  get hourOfDay(): number {
    return ((this.time % this.dayLength) / this.dayLength) * 24;
  }

  /** Whole days elapsed. */
  get day(): number {
    return Math.floor(this.time / this.dayLength);
  }

  get isNight(): boolean {
    const h = this.hourOfDay;
    return h < 5.5 || h >= 20.5;
  }

  setTime(hour: number): void {
    const dayStart = Math.floor(this.time / this.dayLength) * this.dayLength;
    this.time = dayStart + ((hour % 24) / 24) * this.dayLength;
  }

  serialize(): { time: number; timeScale: number } {
    return { time: this.time, timeScale: this.timeScale };
  }

  deserialize(data: { time?: number; timeScale?: number } | null): void {
    if (!data) return;
    if (typeof data.time === "number") this.time = data.time;
    if (typeof data.timeScale === "number") this.timeScale = data.timeScale;
  }
}
