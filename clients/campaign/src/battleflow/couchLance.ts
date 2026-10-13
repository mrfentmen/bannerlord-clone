/**
 * Couched lancing, ported from Bannerlord's cavalry.
 *
 * At a full gallop, a lancer braces the weapon under the arm and lets the
 * horse do the work. Bannerlord rewards it with devastating damage that
 * scales with speed — but it only works with a proper lance, at speed, in
 * a straight line. A couch at a walk is just an awkward spear.
 */

export interface CouchAttempt {
  /** Horse speed in m/s. */
  speed: number;
  /** Is the weapon a lance/polearm (can be couched)? */
  isLance: boolean;
  /** Rider's riding skill 0..10. */
  ridingSkill: number;
}

export interface CouchResult {
  couched: boolean;
  /** Damage multiplier when it lands. */
  damageMult: number;
  line: string;
}

/** Minimum gallop to couch: ~7 m/s. */
export const COUCH_MIN_SPEED = 7;

export function attemptCouch(a: CouchAttempt): CouchResult {
  if (!a.isLance) {
    return { couched: false, damageMult: 1, line: "That weapon can't be couched." };
  }
  if (a.speed < COUCH_MIN_SPEED) {
    return {
      couched: false,
      damageMult: 1,
      line: `Too slow to couch — ${a.speed.toFixed(1)} m/s at a braced lance is just a spear.`,
    };
  }
  // Damage scales with speed past the threshold; skill steadies the aim.
  const speedBonus = (a.speed - COUCH_MIN_SPEED) * 0.15;
  const skillBonus = a.ridingSkill * 0.05;
  const damageMult = 2.5 + speedBonus + skillBonus;
  return {
    couched: true,
    damageMult: Math.round(damageMult * 10) / 10,
    line: `Couched at ${a.speed.toFixed(1)} m/s — the horse delivers the blow (×${damageMult.toFixed(1)}).`,
  };
}
