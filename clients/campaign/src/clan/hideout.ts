/**
 * Task 119: hideout/base management. The clan hideout takes upgrades;
 * each upgrade gives a concrete, named bonus (no decorative tiers).
 */

export type HideoutUpgradeId = "walls" | "tunnels" | "infirmary" | "training-yard";

export interface HideoutUpgrade {
  id: HideoutUpgradeId;
  label: string;
  cost: number;
  /** The concrete bonus the upgrade gives. */
  bonus: string;
}

export const HIDEOUT_UPGRADES: HideoutUpgrade[] = [
  { id: "walls", label: "Palisade walls", cost: 400, bonus: "+30 hideout defense" },
  { id: "tunnels", label: "Escape tunnels", cost: 350, bonus: "+25% exfiltration odds" },
  { id: "infirmary", label: "Infirmary", cost: 300, bonus: "wounded recover twice as fast" },
  { id: "training-yard", label: "Training yard", cost: 500, bonus: "+1 militia training speed" },
];

export interface Hideout {
  installed: HideoutUpgradeId[];
}

export function createHideout(): Hideout {
  return { installed: [] };
}

/** Install an upgrade. Returns null when already installed. */
export function installUpgrade(hideout: Hideout, id: HideoutUpgradeId): HideoutUpgrade | null {
  if (hideout.installed.includes(id)) return null;
  const upgrade = HIDEOUT_UPGRADES.find((u) => u.id === id) ?? null;
  if (upgrade) hideout.installed.push(id);
  return upgrade;
}

/** Concrete bonuses currently active. */
export function activeBonuses(hideout: Hideout): string[] {
  return hideout.installed.map((id) => HIDEOUT_UPGRADES.find((u) => u.id === id)!.bonus);
}
