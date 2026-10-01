/**
 * Task 83: companion management. Assign companions to parties and roles;
 * each role converts a companion skill into a party bonus. Bonuses are pure
 * data — the campaign layer applies them to the party.
 */

import type { Companion } from "./types.js";

export const COMPANION_ROLES = ["quartermaster", "scout", "surgeon", "engineer"] as const;
export type CompanionRole = (typeof COMPANION_ROLES)[number];

/** Which skill feeds each role's bonus. */
const ROLE_SKILL: Record<CompanionRole, string> = {
  quartermaster: "stewardship",
  scout: "scouting",
  surgeon: "medicine",
  engineer: "engineering",
};

export interface PartyBonus {
  partyId: string;
  role: CompanionRole;
  companionId: string;
  /** e.g. "wages -12%", computed from skill. */
  description: string;
  /** 0..1 magnitude for the campaign layer to scale. */
  magnitude: number;
}

const ROLE_BLURB: Record<CompanionRole, string> = {
  quartermaster: "wages",
  scout: "sight range",
  surgeon: "recovery",
  engineer: "siege",
};

export function assignCompanion(
  companion: Companion,
  partyId: string,
  role: CompanionRole,
): Companion {
  if (!(COMPANION_ROLES as readonly string[]).includes(role)) {
    throw new Error(`unknown companion role: ${role}`);
  }
  return { ...companion, partyId, role };
}

/** The bonus a companion's assignment grants their party. */
export function companionBonus(companion: Companion): PartyBonus | null {
  if (!companion.partyId || !companion.role) return null;
  const role = companion.role as CompanionRole;
  const skill = companion.skills[ROLE_SKILL[role]] ?? 0;
  const magnitude = Math.min(1, skill / 100);
  return {
    partyId: companion.partyId,
    role,
    companionId: companion.id,
    description: `${ROLE_BLURB[role]} +${Math.round(magnitude * 25)}%`,
    magnitude,
  };
}
