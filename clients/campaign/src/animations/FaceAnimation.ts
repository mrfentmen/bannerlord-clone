/**
 * Face animation: blinking, and looking at whoever is talking.
 *
 * Task 644: characters blink. A blinking character reads as alive; a staring one
 * reads as a mannequin, and the effect costs nothing. The hard part is not the
 * eyelid, it is the *rate*: blinks that arrive on a metronome are the single most
 * noticeable thing about a dead-looking face.
 *
 * Two rules make it work:
 *
 * - The interval is random between 3 and 7 seconds, and the randomness is
 *   seeded per character so a reload does not change someone's face. A blink
 *   pattern is as much a character's identity as its silhouette.
 * - A blink is not an instant toggle. It closes over about a third of the blink,
 *   stays shut for a frame or two, and opens again -- a lid that snaps shut and
 *   open in one frame reads as a glitch, not a blink.
 *
 * Task 645: a character looks at whoever is speaking, and only while it matters.
 */

/** A tiny seeded random source, so a character's face is reproducible. */
export function makeRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    // xorshift32: one multiply-free step per call, good enough for a blink.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/** Shortest gap between blinks, seconds. */
export const MIN_BLINK_INTERVAL_S = 3;

/** Longest gap between blinks, seconds. */
export const MAX_BLINK_INTERVAL_S = 7;

/** How long a whole blink takes, seconds. */
export const BLINK_DURATION_S = 0.12;

/** Fraction of the blink spent closing and opening. */
export const BLINK_CLOSE_FRACTION = 0.4;

/** Eyelid state, 0 open and 1 shut. */
export type LidState = 'open' | 'closing' | 'closed' | 'opening';

/** Where a character's face is this frame. */
export interface BlinkFrame {
  state: LidState;
  /** 0 = wide open, 1 = shut. */
  closure: number;
  /** Seconds until the next blink starts; negative while one is running. */
  nextInS: number;
  /** How many blinks have happened, for a test or a debug overlay. */
  count: number;
}

/**
 * Task 644: one character's blink clock.
 *
 * Feed it delta time, get the eyelid. The next blink is drawn as soon as the
 * previous one starts rather than at its end, so the interval is measured
 * between blinks and a long blink does not push the next one out.
 */
export class BlinkScheduler {
  private state: LidState = 'open';
  private sinceLastBlinkS: number;
  private elapsedInBlinkS = 0;
  private nextIntervalS: number;
  private blinks = 0;
  private readonly random: () => number;

  constructor(
    readonly characterId: string,
    private readonly minIntervalS: number = MIN_BLINK_INTERVAL_S,
    private readonly maxIntervalS: number = MAX_BLINK_INTERVAL_S,
    private readonly durationS: number = BLINK_DURATION_S,
  ) {
    this.random = makeRandom(characterId);
    const low = Number.isFinite(minIntervalS) && minIntervalS > 0 ? minIntervalS : MIN_BLINK_INTERVAL_S;
    // `>=`, not `>`: equal bounds are a deliberate fixed interval, which is how
    // a test drives an exact blink rate.
    const high = Number.isFinite(maxIntervalS) && maxIntervalS >= low ? maxIntervalS : MAX_BLINK_INTERVAL_S;
    this.minIntervalS = low;
    this.maxIntervalS = high;
    this.durationS = Number.isFinite(durationS) && durationS > 0 ? durationS : BLINK_DURATION_S;
    // The clock starts at zero with an interval already drawn, so `nextInS` is
    // the full gap rather than the gap minus the gap.
    this.sinceLastBlinkS = 0;
    this.nextIntervalS = this.drawInterval();
  }

  /** Seconds until the next blink. */
  get nextInS(): number {
    if (this.state !== 'open') return -1;
    return this.nextIntervalS - this.sinceLastBlinkS;
  }

  /** Advances the clock and returns the eyelid for this frame. */
  update(deltaS: number): BlinkFrame {
    const step = Number.isFinite(deltaS) ? Math.max(0, deltaS) : 0;
    if (step === 0) return this.frame();

    if (this.state !== 'open') {
      this.elapsedInBlinkS += step;
      const t = Math.min(1, this.elapsedInBlinkS / this.durationS);
      const closing = this.durationS * BLINK_CLOSE_FRACTION;
      if (this.elapsedInBlinkS < closing) {
        this.state = 'closing';
      } else if (this.elapsedInBlinkS < this.durationS - closing) {
        this.state = 'closed';
      } else if (t < 1) {
        this.state = 'opening';
      } else {
        this.state = 'open';
        this.elapsedInBlinkS = 0;
        this.sinceLastBlinkS = 0;
        // The next gap is drawn as the blink finishes, so a slow blink does not
        // push the next one out.
        this.nextIntervalS = this.drawInterval();
      }
      return this.frame();
    }

    this.sinceLastBlinkS += step;
    if (this.sinceLastBlinkS >= this.nextIntervalS) {
      this.state = 'closing';
      this.elapsedInBlinkS = 0;
      this.blinks++;
    }
    return this.frame();
  }

  /** Forces a blink now, e.g. after a cutscene jump. */
  trigger(): BlinkFrame {
    if (this.state === 'open') {
      this.state = 'closing';
      this.elapsedInBlinkS = 0;
      this.blinks++;
    }
    return this.frame();
  }

  /** How many blinks have run. */
  get count(): number {
    return this.blinks;
  }

  private drawInterval(): number {
    const spread = this.maxIntervalS - this.minIntervalS;
    return this.minIntervalS + this.random() * spread;
  }

  private frame(): BlinkFrame {
    const closing = this.durationS * BLINK_CLOSE_FRACTION;
    let closure = 0;
    if (this.state === 'closing') {
      closure = Math.min(1, this.elapsedInBlinkS / closing);
    } else if (this.state === 'closed') {
      closure = 1;
    } else if (this.state === 'opening') {
      const into = this.elapsedInBlinkS - (this.durationS - closing);
      closure = Math.max(0, 1 - into / closing);
    }
    return { state: this.state, closure, nextInS: this.nextInS, count: this.blinks };
  }
}

/** Keeps a blink clock for every character on the field. */
export class BlinkSet {
  private readonly schedulers = new Map<string, BlinkScheduler>();

  constructor(
    private readonly minIntervalS: number = MIN_BLINK_INTERVAL_S,
    private readonly maxIntervalS: number = MAX_BLINK_INTERVAL_S,
  ) {}

  /** The clock for a character, created on first use. */
  forCharacter(id: string): BlinkScheduler {
    let scheduler = this.schedulers.get(id);
    if (!scheduler) {
      scheduler = new BlinkScheduler(id, this.minIntervalS, this.maxIntervalS);
      this.schedulers.set(id, scheduler);
    }
    return scheduler;
  }

  /** Advances every clock, returning each character's eyelid. */
  update(deltaS: number): Map<string, BlinkFrame> {
    const frames = new Map<string, BlinkFrame>();
    for (const [id, scheduler] of this.schedulers) frames.set(id, scheduler.update(deltaS));
    return frames;
  }

  /** How many characters have clocks. */
  get size(): number {
    return this.schedulers.size;
  }
}