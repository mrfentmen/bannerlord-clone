/**
 * Troop branching upgrade trees, ported from Bannerlord's upgrade UI.
 *
 * Promotions used to be a straight ladder: tier 2 becomes tier 3, full
 * stop. Bannerlord's real choice is the branch — at key tiers a troop can
 * become one of two specialists. This is the tree; the fixture applies it.
 */

export interface TroopBranch {
  id: string;
  name: string;
  /** Flavor: what this specialist does. */
  role: string;
  /** Stat shifts applied on top of the tier's base (multipliers). */
  damageMult: number;
  toughnessMult: number;
  /** Wage shift on top of the tier's wage. */
  wageMult: number;
}

export interface BranchTier {
  /** The tier you promote FROM. */
  fromTier: number;
  branches: [TroopBranch, TroopBranch];
}

/**
 * Branch points. Tier 2 splits the rabble into fighters vs. eyes;
 * tier 4 splits veterans into line-breakers vs. sharpshooters.
 * Other tiers promote straight up the ladder.
 */
export const BRANCH_TIERS: BranchTier[] = [
  {
    fromTier: 2,
    branches: [
      {
        id: "raider",
        name: "Raider",
        role: "Shock infantry — hits harder, breaks lines.",
        damageMult: 1.25,
        toughnessMult: 1.0,
        wageMult: 1.1,
      },
      {
        id: "lookout",
        name: "Lookout",
        role: "Skirmisher — fast, keen-eyed, hard to pin down.",
        damageMult: 1.0,
        toughnessMult: 0.9,
        wageMult: 1.0,
      },
    ],
  },
  {
    fromTier: 4,
    branches: [
      {
        id: "enforcer",
        name: "Enforcer",
        role: "Heavy infantry — a wall that walks forward.",
        damageMult: 1.15,
        toughnessMult: 1.3,
        wageMult: 1.25,
      },
      {
        id: "marksman",
        name: "Marksman",
        role: "Sharpshooter — kills at distance, folds up close.",
        damageMult: 1.4,
        toughnessMult: 0.85,
        wageMult: 1.2,
      },
    ],
  },
];

/** Branch choices available when promoting from this tier (empty = straight ladder). */
export function branchChoices(fromTier: number): TroopBranch[] {
  return BRANCH_TIERS.find((b) => b.fromTier === fromTier)?.branches.slice() ?? [];
}

/** Look up a branch by id. */
export function getBranch(branchId: string): TroopBranch | null {
  for (const tier of BRANCH_TIERS) {
    const found = tier.branches.find((b) => b.id === branchId);
    if (found) return found;
  }
  return null;
}

/** Does this branch id belong to this tier's fork? */
export function isValidBranch(fromTier: number, branchId: string): boolean {
  return branchChoices(fromTier).some((b) => b.id === branchId);
}
