/**
 * Flanking bonus indicator (Rowan solo task 29).
 *
 * A unit attacking from the target's side arc gets a damage bonus; from the
 * rear arc, a bigger one. The geometry is pure (attacker position, target
 * position + facing); the badge is a DOM chip the unit card / selection
 * panel mounts. The battle scene (milo's lane) supplies the facing.
 */

export type FlankArc = "front" | "flank" | "rear";

/** Damage multiplier when attacking from the side arc. */
export const FLANK_BONUS = 1.25;
/** Damage multiplier when attacking from the rear arc. */
export const REAR_BONUS = 1.5;

/**
 * Which arc the attacker is in, relative to the target's facing.
 * Facing is radians, 0 = +x. Side arcs are 60°–120° off the facing axis;
 * rear is beyond 120°.
 */
export function flankArc(
  attackerX: number,
  attackerZ: number,
  targetX: number,
  targetZ: number,
  targetFacingRad: number,
): FlankArc {
  const dx = attackerX - targetX;
  const dz = attackerZ - targetZ;
  if (dx === 0 && dz === 0) return "front";
  const angleToAttacker = Math.atan2(dz, dx);
  let diff = Math.abs(angleToAttacker - targetFacingRad) % (Math.PI * 2);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  // diff = 0 means the attacker is straight ahead of the target's facing.
  if (diff >= (2 * Math.PI) / 3) return "rear"; // >= 120°
  if (diff >= Math.PI / 3) return "flank"; // >= 60°
  return "front";
}

/** Damage multiplier for the arc (1 when not flanking). */
export function flankBonus(arc: FlankArc): number {
  if (arc === "rear") return REAR_BONUS;
  if (arc === "flank") return FLANK_BONUS;
  return 1;
}

/** Short badge text, e.g. "FLANK +25%". Null when there is no bonus. */
export function flankBadgeText(arc: FlankArc): string | null {
  if (arc === "rear") return `REAR +${Math.round((REAR_BONUS - 1) * 100)}%`;
  if (arc === "flank") return `FLANK +${Math.round((FLANK_BONUS - 1) * 100)}%`;
  return null;
}
