/**
 * Retreat with rearguard (Rowan solo task 24).
 *
 * When the player retreats, they may leave a rearguard: one unit stays
 * behind to hold the enemy while the army escapes. The rearguard is lost,
 * but the army's retreat losses are cut. The after-action report names the
 * sacrifice. Pure logic; the battle HUD (milo's lane) offers the choice and
 * the sim applies the losses.
 */

export interface RearguardUnit {
  id: string;
  name: string;
  troops: number;
}

export interface RearguardPlan {
  /** The unit staying behind. */
  rearguard: RearguardUnit;
  /** Troops the rearguard saves by holding (estimate). */
  troopsSaved: number;
  /** One-line summary for the after-action report. */
  summary: string;
}

/**
 * Leaving a rearguard saves roughly 40% of the troops that would otherwise
 * be lost in the rout, at the cost of the rearguard unit itself. The
 * rearguard should be small and expendable — the function picks the
 * smallest unit if none is specified.
 */
export function planRearguard(
  army: RearguardUnit[],
  rearguardId?: string,
  expectedRoutLosses?: number,
): RearguardPlan | null {
  if (army.length < 2) return null; // nothing to save with a lone unit
  const rearguard =
    army.find((u) => u.id === rearguardId) ??
    [...army].sort((a, b) => a.troops - b.troops)[0]!;
  const routLosses = Math.max(0, expectedRoutLosses ?? 0);
  const troopsSaved = Math.round(routLosses * 0.4);
  return {
    rearguard,
    troopsSaved,
    summary: `${rearguard.name} held the rear and was lost — ${troopsSaved} troops escaped who would not have.`,
  };
}

/** After-action line for a rearguard retreat. */
export function rearguardReportLine(plan: RearguardPlan): string {
  return `Rearguard: ${plan.summary}`;
}
