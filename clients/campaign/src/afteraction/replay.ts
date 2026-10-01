/**
 * Tasks 72-74: battle replay viewer. A replay is a recorded event stream —
 * the sim records it, this module plays it back. The player owns the clock
 * (play/pause/seek/speed) and emits the current time plus the events at that
 * time; a scene adapter subscribes and draws. Scrubbing jumps the clock;
 * speed multiplies it (0.25×–4×).
 */

export interface ReplayEvent {
  /** Seconds into the battle. */
  t: number;
  kind: string;
  data: Record<string, unknown>;
}

export interface Replay {
  durationS: number;
  events: ReplayEvent[];
}

export interface ReplayTick {
  t: number;
  /** Events with timestamp <= t that the viewer hasn't seen yet at this pass. */
  newEvents: ReplayEvent[];
  playing: boolean;
  speed: number;
}

export interface ReplayPlayerOptions {
  now?: () => number;
  onTick?: (tick: ReplayTick) => void;
}

export interface ReplayPlayer {
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  setSpeed(speed: number): void;
  time(): number;
  isPlaying(): boolean;
  speed(): number;
  destroy(): void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function createReplayPlayer(replay: Replay, opts: ReplayPlayerOptions = {}): ReplayPlayer {
  const now = opts.now ?? (() => performance.now());
  const emit = opts.onTick ?? ((): void => {});
  const events = [...replay.events].sort((a, b) => a.t - b.t);

  let t = 0;
  let speed = 1;
  let playing = false;
  let lastNow = 0;
  let seenUpTo = -1; // index of last emitted event
  let raf = 0;
  let destroyed = false;

  function fire(): void {
    const newEvents: ReplayEvent[] = [];
    for (let i = seenUpTo + 1; i < events.length && events[i]!.t <= t; i++) {
      newEvents.push(events[i]!);
      seenUpTo = i;
    }
    emit({ t, newEvents, playing, speed });
  }

  function frame(): void {
    if (destroyed || !playing) return;
    const n = now();
    const dt = Math.min(1, (n - lastNow) / 1000);
    lastNow = n;
    t = Math.min(replay.durationS, t + dt * speed);
    if (t >= replay.durationS) playing = false;
    fire();
    if (playing) raf = requestAnimationFrame(frame);
  }

  return {
    play() {
      if (playing || destroyed) return;
      if (t >= replay.durationS) {
        t = 0;
        seenUpTo = -1;
      }
      playing = true;
      lastNow = now();
      raf = requestAnimationFrame(frame);
      fire();
    },
    pause() {
      playing = false;
      cancelAnimationFrame(raf);
      fire();
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    seek(next) {
      t = Math.min(replay.durationS, Math.max(0, next));
      seenUpTo = -1;
      for (let i = 0; i < events.length && events[i]!.t <= t; i++) seenUpTo = i;
      fire();
    },
    setSpeed(next) {
      if (!SPEEDS.includes(next)) throw new Error(`unsupported replay speed: ${next}`);
      speed = next;
      fire();
    },
    time: () => t,
    isPlaying: () => playing,
    speed: () => speed,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
    },
  };
}

export const REPLAY_SPEEDS = SPEEDS;
