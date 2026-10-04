/**
 * Task 116: prisoner management. After battles with many captives, the
 * roster supports bulk selection and bulk actions — ransom all, recruit
 * all, or release all — and stays responsive at 50+ prisoners (pure data
 * ops; the panel renders rows lazily by selection, not by animation).
 */

export type PrisonerAction = "ransom" | "recruit" | "release" | "execute";

export interface Prisoner {
  id: string;
  name: string;
  tier: number;
  /** Ransom value in the campaign's currency. */
  ransomValue: number;
  /** True for captured nobles/lords — execution has political fallout. */
  isNoble?: boolean;
  /** Victim's faction id (for execution relation damage). */
  factionId?: string;
  /** Victim's clan name (for execution relation damage). */
  clanName?: string;
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

/**
 * Executing a captured lord — Bannerlord's nuclear political option.
 *
 * The fallout scales with the victim's standing: killing a nobody costs
 * little, killing a beloved lord turns their whole faction against you.
 * Honor craters, dread rises (enemies fear you, nobody trusts you), and
 * your own troops lose heart — soldiers signed up for war, not the block.
 */
export interface ExecutionConsequences {
  /** Relation delta with the victim's faction (-). */
  factionRelationDelta: number;
  /** Relation delta with the victim's clan (-). */
  clanRelationDelta: number;
  /** Honor delta (-). */
  honorDelta: number;
  /** Dread gained (+): enemies more likely to flee, lords less likely to deal. */
  dreadGained: number;
  /** Own party morale delta (-). */
  ownMoraleDelta: number;
  line: string;
}

export function executionConsequences(prisoner: Prisoner): ExecutionConsequences {
  const standing = prisoner.isNoble ? prisoner.tier : 1;
  const factionRelationDelta = -(10 + standing * 8);
  const clanRelationDelta = -(20 + standing * 10);
  const honorDelta = -(15 + standing * 5);
  const dreadGained = 10 + standing * 5;
  const ownMoraleDelta = -8;
  return {
    factionRelationDelta,
    clanRelationDelta,
    honorDelta,
    dreadGained,
    ownMoraleDelta,
    line: `${prisoner.name} is executed. ${prisoner.clanName ? `${prisoner.clanName} will never forgive this.` : ""} Honor ${honorDelta}; dread +${dreadGained}. Your troops look away.`,
  };
}

/**
 * Execute the selected prisoners. Only nobles carry political fallout;
 * common captives are simply gone. Returns per-victim consequences and
 * removes them from the roster.
 */
export function executeSelected(roster: PrisonerRoster): { victim: Prisoner; consequences: ExecutionConsequences }[] {
  const victims = roster.prisoners.filter((p) => roster.selected.has(p.id));
  const ids = new Set(victims.map((p) => p.id));
  roster.prisoners = roster.prisoners.filter((p) => !ids.has(p.id));
  roster.selected.clear();
  return victims.map((victim) => ({ victim, consequences: executionConsequences(victim) }));
}
