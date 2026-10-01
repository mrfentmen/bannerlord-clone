/**
 * Gamepad haptics for key battle events (MASTER_PLAN task 7).
 *
 * Named effects over the gamepad manager's `rumble` primitive: orders thump,
 * hits sting, deployment lands heavy, menu feedback stays light. Everything is
 * best-effort — no pad, no actuator, or a rejected effect simply does nothing
 * and never throws into the game. Hit rumble is throttled so a volley doesn't
 * turn into a buzz storm.
 */

export type HapticEvent = "order" | "hit" | "select" | "confirm" | "cancel" | "deploy" | "error";

export interface Haptics {
  play(event: HapticEvent): void;
}

interface Pulse {
  duration: number;
  strong: number;
  weak: number;
  /** Silence after this pulse before the next, ms. */
  gap?: number;
}

const PATTERNS: Record<HapticEvent, Pulse[]> = {
  order: [{ duration: 180, strong: 0.7, weak: 0.4 }],
  hit: [{ duration: 90, strong: 1.0, weak: 0.6 }],
  select: [{ duration: 40, strong: 0.25, weak: 0.15 }],
  confirm: [{ duration: 60, strong: 0.35, weak: 0.2 }],
  cancel: [{ duration: 60, strong: 0.2, weak: 0.3 }],
  deploy: [{ duration: 250, strong: 0.8, weak: 0.5 }],
  error: [
    { duration: 70, strong: 0.5, weak: 0.3, gap: 60 },
    { duration: 70, strong: 0.5, weak: 0.3 },
  ],
};

/** Hits closer together than this collapse into one rumble. */
const HIT_THROTTLE_MS = 250;

export interface HapticsSource {
  rumble(durationMs?: number, strongMagnitude?: number, weakMagnitude?: number, padIndex?: number): Promise<void>;
}

export interface HapticsOptions {
  source: HapticsSource | null;
  /** Gates every effect (the `hapticsEnabled` setting, pad connected, ...). */
  isEnabled?: () => boolean;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
}

export function createHaptics(opts: HapticsOptions): Haptics {
  const isEnabled = opts.isEnabled ?? (() => true);
  const now = opts.now ?? (() => Date.now());
  const later = opts.setTimeoutFn ?? setTimeout;
  let lastHitAt = -Infinity;
  let disposed = false;

  function play(event: HapticEvent): void {
    if (disposed || !isEnabled()) return;
    const source = opts.source;
    if (!source) return;
    if (event === "hit") {
      const t = now();
      if (t - lastHitAt < HIT_THROTTLE_MS) return;
      lastHitAt = t;
    }
    const pulses = PATTERNS[event];
    const fire = (i: number): void => {
      if (disposed || i >= pulses.length) return;
      const p = pulses[i]!;
      // A failed rumble (no actuator, autoplay policy) must never surface as
      // an unhandled rejection; haptics are best-effort by design.
      source.rumble(p.duration, p.strong, p.weak).catch(() => {});
      if (p.gap !== undefined && i + 1 < pulses.length) {
        later(() => fire(i + 1), p.duration + p.gap);
      }
    };
    fire(0);
  }

  return { play };
}
