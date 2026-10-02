/**
 * Task 136: coat of arms designer. Pick a field, a division, and a charge;
 * the arms apply to shields in battle through the narrow ShieldTarget
 * interface (the banner-designer pattern) — the campaign layer wires the
 * real shield meshes, this module owns the design.
 */

export type ArmsField = "red" | "blue" | "black" | "gold" | "green" | "white";
export type ArmsDivision = "plain" | "pale" | "fess" | "bend" | "chevron";
export type ArmsCharge = "none" | "star" | "sword" | "tower" | "wolf" | "eagle";

export interface CoatOfArms {
  field: ArmsField;
  division: ArmsDivision;
  charge: ArmsCharge;
}

export function createCoatOfArms(): CoatOfArms {
  return { field: "red", division: "plain", charge: "none" };
}

/** Narrow target the battle layer implements to paint shields. */
export interface ShieldTarget {
  paintShield(shieldId: string, arms: CoatOfArms): void;
}

/** Apply the arms to every shield id through the target. */
export function applyArmsToShields(target: ShieldTarget, shieldIds: string[], arms: CoatOfArms): void {
  for (const id of shieldIds) target.paintShield(id, arms);
}

/** Stable key for save files and the gallery. */
export function armsKey(arms: CoatOfArms): string {
  return `${arms.field}|${arms.division}|${arms.charge}`;
}
