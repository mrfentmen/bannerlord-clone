/**
 * Task 104: supply line overlay (assessment). Each field army reports days
 * of food remaining; the overlay flags armies by status — starving armies
 * red, low amber, supplied green. The returned descriptors plug into the
 * map-overlay canvas the same way routeVisualizer does.
 *
 * Colors are the design system's semantic status tokens rather than hex
 * literals, so the overlay reads as part of the same system as every other
 * status (see design/__tests__/design.test.ts, which fails a build that
 * hard-codes a colour outside the token file).
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
  /**
   * Overlay color as a `var(--status-*)` reference: starving armies are red
   * (the task's acceptance). Resolved by the overlay's own stylesheet.
   */
  color: string;
}

export function assessSupply(army: ArmySupply): SupplyStatus {
  if (army.daysOfFood <= 0) return "starving";
  if (army.daysOfFood < 3) return "low";
  return "supplied";
}

const STATUS_COLOR: Record<SupplyStatus, string> = {
  supplied: "var(--status-good)",
  low: "var(--status-warning)",
  starving: "var(--status-critical)",
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
