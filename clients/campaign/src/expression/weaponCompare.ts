/**
 * Task 133: weapon comparison. DPS = damage x attacks per second; the
 * comparison shows the signed DPS delta so the better weapon is obvious.
 */

export interface Weapon {
  id: string;
  name: string;
  damage: number;
  /** Attacks per second. */
  speed: number;
}

export function weaponDps(weapon: Weapon): number {
  return weapon.damage * weapon.speed;
}

export interface WeaponComparison {
  a: Weapon;
  b: Weapon;
  dpsA: number;
  dpsB: number;
  /** b minus a: positive means b hits harder. */
  dpsDelta: number;
  winner: "a" | "b" | "tie";
}

export function compareWeapons(a: Weapon, b: Weapon): WeaponComparison {
  const dpsA = weaponDps(a);
  const dpsB = weaponDps(b);
  const dpsDelta = Math.round((dpsB - dpsA) * 10) / 10;
  return {
    a,
    b,
    dpsA,
    dpsB,
    dpsDelta,
    winner: dpsDelta > 0 ? "b" : dpsDelta < 0 ? "a" : "tie",
  };
}
