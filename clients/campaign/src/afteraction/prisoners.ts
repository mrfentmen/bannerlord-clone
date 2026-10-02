/**
 * Task 116: prisoner management. After battles with many captives, the
 * roster supports bulk selection and bulk actions — ransom all, recruit
 * all, or release all — and stays responsive at 50+ prisoners (pure data
 * ops; the panel renders rows lazily by selection, not by animation).
 */

export type PrisonerAction = "ransom" | "recruit" | "release";

export interface Prisoner {
  id: string;
  name: string;
  tier: number;
  /** Ransom value in the campaign's currency. */
  ransomValue: number;
}

export interface PrisonerRoster {
  prisoners: Prisoner[];
  selected: Set<string>;
}

export function createRoster(prisoners: Prisoner[]): PrisonerRoster {
  return { prisoners: [...prisoners], selected: new Set() };
}

export function selectAll(roster: PrisonerRoster): void {
  roster.selected = new Set(roster.prisoners.map((p) => p.id));
}

export function clearSelection(roster: PrisonerRoster): void {
  roster.selected.clear();
}

export function toggleSelect(roster: PrisonerRoster, id: string): void {
  if (roster.selected.has(id)) roster.selected.delete(id);
  else roster.selected.add(id);
}

/**
 * Apply a bulk action to the selected prisoners. Returns the affected
 * prisoners and removes them from the roster.
 */
export function bulkAction(roster: PrisonerRoster, action: PrisonerAction): Prisoner[] {
  const affected = roster.prisoners.filter((p) => roster.selected.has(p.id));
  const ids = new Set(affected.map((p) => p.id));
  roster.prisoners = roster.prisoners.filter((p) => !ids.has(p.id));
  roster.selected.clear();
  void action;
  return affected;
}

/** Total ransom value of the selected prisoners. */
export function selectedRansomValue(roster: PrisonerRoster): number {
  return roster.prisoners
    .filter((p) => roster.selected.has(p.id))
    .reduce((sum, p) => sum + p.ransomValue, 0);
}
