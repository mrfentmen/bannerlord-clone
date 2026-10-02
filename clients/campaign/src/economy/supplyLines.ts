/**
 * Task 104: supply line overlay (assessment). Each field army reports days
 * of food remaining; the overlay flags armies by status — starving armies
 * red, low amber, supplied green. The returned descriptors plug into the
 * map-overlay canvas the same way routeVisualizer does.
 */

export type SupplyStatus = "supplied" | "low" | "starving";

export interface ArmySupply {
  armyId: string;
  label: string;
  /** Map position. */
  x: number;
  z: number;
  /** Days of food remaining. */
  daysOfFood: number;
}

export interface SupplyFlag {
  armyId: string;
  label: string;
  x: number;
  z: number;
  status: SupplyStatus;
  /** Overlay color: starving armies are red (the task's acceptance). */
  color: string;
}

export function assessSupply(army: ArmySupply): SupplyStatus {
  if (army.daysOfFood <= 0) return "starving";
  if (army.daysOfFood < 3) return "low";
  return "supplied";
}

const STATUS_COLOR: Record<SupplyStatus, string> = {
  supplied: "#4caf50",
  low: "#ffb300",
  starving: "#e53935",
};

/** Flag every army for the overlay; starving ones come first. */
export function flagSupplyLines(armies: ArmySupply[]): SupplyFlag[] {
  return armies
    .map((a) => {
      const status = assessSupply(a);
      return { armyId: a.armyId, label: a.label, x: a.x, z: a.z, status, color: STATUS_COLOR[status] };
    })
    .sort((a, b) => {
      const rank = { starving: 0, low: 1, supplied: 2 } as const;
      return rank[a.status] - rank[b.status];
    });
}
