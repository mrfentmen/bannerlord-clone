/**
 * Governors, ported from Bannerlord.
 *
 * Assign a companion or family member as governor of a town. Their skills
 * shape the settlement: stewardship calms and feeds, charm opens purses,
 * roguery... finds money in places money shouldn't be. A governor with no
 * relevant skill is just a warm chair.
 */

export interface GovernorBonus {
  loyalty: number;
  prosperity: number;
  security: number;
  food: number;
  /** Human-readable summary for the town panel. */
  line: string;
}

export interface GovernorCandidate {
  id: string;
  name: string;
  /** Skill levels 0..10. */
  skills: Record<string, number>;
}

/**
 * Compute what a governor does for a town. Each skill point past 3 gives
 * +0.4/day to its domain; below 3 gives -0.2 (incompetence is noticed).
 */
export function governorBonus(candidate: GovernorCandidate): GovernorBonus {
  const s = (skill: string) => candidate.skills[skill] ?? 0;
  const effect = (skill: string) => {
    const v = s(skill);
    return v >= 3 ? (v - 3) * 0.4 : (v - 3) * 0.2;
  };
  const loyalty = effect("steward");
  const prosperity = effect("trade");
  const security = effect("tactics");
  const food = effect("steward") * 0.5;
  const parts: string[] = [];
  if (loyalty > 0.1) parts.push(`keeps order (+${loyalty.toFixed(1)} loyalty)`);
  if (prosperity > 0.1) parts.push(`fills coffers (+${prosperity.toFixed(1)} prosperity)`);
  if (security > 0.1) parts.push(`watches the walls (+${security.toFixed(1)} security)`);
  return {
    loyalty,
    prosperity,
    security,
    food,
    line:
      parts.length > 0
        ? `${candidate.name} ${parts.join(", ")}.`
        : `${candidate.name} is a warm chair. The town notices.`,
  };
}
