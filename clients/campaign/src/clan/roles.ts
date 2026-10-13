/**
 * Clan role assignments (Rowan solo task 51).
 *
 * Distinct from companion party roles (companions.ts): these are clan
 * offices. Assign a clan member as steward, scout, or quartermaster and
 * the whole clan gets a bonus scaled by their relevant skill. One member
 * per office; reassigning moves the office.
 */

export const CLAN_ROLES = ["steward", "scout", "quartermaster"] as const;
export type ClanRole = (typeof CLAN_ROLES)[number];

export interface OfficeCandidate {
  id: string;
  name: string;
  /** e.g. { stewardship: 62, scouting: 40 }. */
  skills: Record<string, number>;
}

export interface ClanRoleAssignment {
  role: ClanRole;
  memberId: string;
  memberName: string;
  /** Human-readable bonus, e.g. "tax income +18%". */
  bonus: string;
  /** 0..1 magnitude for the campaign layer to scale. */
  magnitude: number;
}

/** Which skill feeds each office, and what the clan gets. */
const ROLE_DEF: Record<ClanRole, { skill: string; blurb: string }> = {
  steward: { skill: "stewardship", blurb: "tax income" },
  scout: { skill: "scouting", blurb: "map vision" },
  quartermaster: { skill: "stewardship", blurb: "party wages" },
};

export interface ClanRoles {
  assign(member: OfficeCandidate, role: ClanRole): void;
  unassign(role: ClanRole): void;
  assignments(): ClanRoleAssignment[];
  assignmentFor(role: ClanRole): ClanRoleAssignment | null;
}

export function createClanRoles(): ClanRoles {
  const holders = new Map<ClanRole, OfficeCandidate>();

  function describe(role: ClanRole, member: OfficeCandidate): ClanRoleAssignment {
    const def = ROLE_DEF[role];
    const skill = Math.max(0, member.skills[def.skill] ?? 0);
    const magnitude = Math.min(1, skill / 100);
    const pct = Math.round(magnitude * 25);
    const sign = role === "quartermaster" ? "−" : "+";
    return {
      role,
      memberId: member.id,
      memberName: member.name,
      bonus: `${def.blurb} ${sign}${pct}%`,
      magnitude,
    };
  }

  return {
    assign(member, role) {
      if (!(CLAN_ROLES as readonly string[]).includes(role)) {
        throw new Error(`unknown clan role: ${role}`);
      }
      holders.set(role, member);
    },
    unassign(role) {
      holders.delete(role);
    },
    assignments() {
      return [...holders.entries()].map(([role, member]) => describe(role, member));
    },
    assignmentFor(role) {
      const member = holders.get(role);
      return member ? describe(role, member) : null;
    },
  };
}
