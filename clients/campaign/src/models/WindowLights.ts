/**
 * Lit windows at night.
 *
 * Task 627: a settlement at night is a scatter of lit windows, and it is the
 * cheapest atmosphere in the whole game -- a few emissive quads against a dark
 * building read as "somebody is home" for the cost of nothing. What is hard is
 * not the glow, it is the *policy*: which windows are lit at a given hour, and
 * how that set thins out as the night goes on.
 *
 * The rule here is deliberate:
 *
 * - Occupancy falls through the night. A city at 22:00 has most of its windows
 *   lit; by 03:00 most of them are not, because most of the people in it are
 *   asleep. A town where every window stays lit all night reads as a painting.
 * - Windows switch on in a deterministic order per building rather than at
 *   random, so two visits to the same street at the same hour look the same.
 *   Randomness that differs between frames is the flicker people notice first.
 * - A window's own brightness varies: a kitchen light is brighter than a
 *   bedroom one, and a couple of very bright windows carry the eye.
 */

/** A single window's identity and where its light sits. */
export interface WindowSpec {
  /** Unique within its building. */
  id: string;
  /** Building the window belongs to. */
  buildingId: string;
  /** Metres up the wall; higher windows are lit later. */
  heightM: number;
  /** 0..1, relative brightness once lit. */
  brightness: number;
}

/** What one window should look like at a given hour. */
export interface WindowLight {
  id: string;
  buildingId: string;
  /** 0 = dark, 1 = fully lit. */
  intensity: number;
  /** Slight per-window hue shift, so a row is not one colour. */
  warmth: number;
}

/** Lighting policy for a night. */
export interface NightPolicy {
  /** Hour at which windows begin to light, 0..24. */
  lightsOnHour: number;
  /** Hour at which the last windows go out, 0..24. */
  lightsOffHour: number;
  /** Fraction of windows still lit at the deadest hour, 0..1. */
  lateNightFraction: number;
  /** Brightness added on top of the window's own, for the loudest few. */
  landmarkBoost: number;
  /**
   * How many windows get the boost, 0..1. Kept small: a street where every
   * window is a landmark is a street with no landmarks.
   */
  landmarkFraction: number;
}

/** Evening through small hours: lit from 18:30, thinning until 05:00. */
export const DEFAULT_NIGHT_POLICY: NightPolicy = {
  lightsOnHour: 18.5,
  lightsOffHour: 5,
  lateNightFraction: 0.18,
  landmarkBoost: 0.45,
  landmarkFraction: 0.08,
};

/** Window brightness is multiplied by this spread, so a row is not uniform. */
export const WINDOW_BRIGHTNESS_SPREAD = 0.35;

/** How much a window's warmth can vary, 0..1. */
export const WINDOW_WARMTH_SPREAD = 0.25;

/** Hour wrapped into 0..24; a broken value becomes noon, which is lit by no policy. */
function normaliseHour(hour: number): number {
  if (!Number.isFinite(hour)) return 12;
  return ((hour % 24) + 24) % 24;
}

/**
 * True while the policy considers windows lit at all.
 *
 * The window crosses midnight, so this is not a simple comparison: at 23:00
 * and at 02:00 it is night, at noon it is not.
 */
export function isNightHour(hour: number, policy: NightPolicy = DEFAULT_NIGHT_POLICY): boolean {
  const h = normaliseHour(hour);
  const on = normaliseHour(policy.lightsOnHour);
  const off = normaliseHour(policy.lightsOffHour);
  if (on === off) return true; // a policy with no day at all
  // on > off means the night wraps midnight: [on, 24) plus [0, off).
  return on > off ? h >= on || h < off : h >= on && h < off;
}

/**
 * How many windows are lit at `hour`, 0..1 of the street.
 *
 * Full at dusk, easing down to `lateNightFraction` at the deadest hour, then
 * rising back towards full as the morning comes. The curve is linear on
 * purpose: an eased curve here is indistinguishable in play and much harder to
 * reason about when someone asks why a street looked wrong at 23:00.
 */
export function litFractionAt(
  hour: number,
  policy: NightPolicy = DEFAULT_NIGHT_POLICY,
): number {
  if (!isNightHour(hour, policy)) return 0;
  const h = normaliseHour(hour);
  const on = normaliseHour(policy.lightsOnHour);
  const off = normaliseHour(policy.lightsOffHour);
  const late = Math.min(1, Math.max(0, policy.lateNightFraction));

  // Hours elapsed since lights-on, wrapping over midnight, and the length of
  // the night in hours. A policy whose lights-off is before its lights-on wraps;
  // one that does not, does not.
  const wraps = on > off;
  const since = wraps ? (h >= on ? h - on : h + 24 - on) : h - on;
  const span = wraps ? 24 - on + off : off - on;
  const progress = span <= 0 ? 0 : Math.min(1, Math.max(0, since / span));
  return 1 - (1 - late) * progress;
}

/**
 * A stable per-window pseudo-random value in 0..1.
 *
 * Derived from the window's own id, so it survives a reload, a scene rebuild and
 * a different frame. This is the difference between a street that looks the same
 * every time and one that reshuffles itself at 60 Hz.
 */
function hashToUnit(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // One fold to keep it in range as an unsigned integer.
  return ((hash >>> 0) % 100000) / 100000;
}

/** Whether a single window is lit at `hour`. */
export function isWindowLit(window: WindowSpec, hour: number, policy: NightPolicy = DEFAULT_NIGHT_POLICY): boolean {
  const fraction = litFractionAt(hour, policy);
  if (fraction <= 0) return false;
  if (fraction >= 1) return true;
  // Higher windows go dark first: the ones over the street stay lit longest.
  const heightBias = Math.min(1, Math.max(0, window.heightM / 12));
  const threshold = hashToUnit(window.id) * (0.6 + heightBias * 0.4);
  return threshold <= fraction;
}

/** The look of one lit window. */
export function windowLight(
  window: WindowSpec,
  hour: number,
  policy: NightPolicy = DEFAULT_NIGHT_POLICY,
): WindowLight | null {
  if (!isWindowLit(window, hour, policy)) return null;
  const jitter = hashToUnit(`${window.id}:warm`);
  // A NaN brightness would survive Math.min/Math.max and reach the shader as
  // NaN, so it is replaced outright rather than clamped.
  const authored = Number.isFinite(window.brightness) ? window.brightness : 0.6;
  const brightness = Math.min(1, Math.max(0, authored));
  const isLandmark =
    hashToUnit(`${window.id}:lm`) < Math.min(1, Math.max(0, policy.landmarkFraction));
  return {
    id: window.id,
    buildingId: window.buildingId,
    intensity: Math.min(1, brightness * (isLandmark ? 1 + policy.landmarkBoost : 1)),
    warmth: jitter * WINDOW_WARMTH_SPREAD,
  };
}

/**
 * Task 627: every lit window on a street at `hour`.
 *
 * Returned in input order with the dark ones omitted, so a scene can diff two
 * frames cheaply: an unchanged hour returns an equal array, and the number of
 * changed entries is the number of scene writes.
 */
export function streetLightsAt(
  windows: readonly WindowSpec[],
  hour: number,
  policy: NightPolicy = DEFAULT_NIGHT_POLICY,
): WindowLight[] {
  const lights: WindowLight[] = [];
  for (const window of windows) {
    const light = windowLight(window, hour, policy);
    if (light) lights.push(light);
  }
  return lights;
}

/**
 * How many windows changed between two hours, for a scene deciding whether to
 * rewrite its emissive buffers at all.
 */
export function changedWindowCount(
  windows: readonly WindowSpec[],
  fromHour: number,
  toHour: number,
  policy: NightPolicy = DEFAULT_NIGHT_POLICY,
): number {
  return windows.filter((w) => isWindowLit(w, fromHour, policy) !== isWindowLit(w, toHour, policy)).length;
}

/** Spread a window's own brightness into a range, for authoring convenience. */
export function windowBrightness(base: number, id: string): number {
  const jitter = (hashToUnit(id) - 0.5) * 2 * WINDOW_BRIGHTNESS_SPREAD;
  return Math.min(1, Math.max(0, base + jitter));
}