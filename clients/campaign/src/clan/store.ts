/**
 * Persisted clan store (integration for clan tasks 51-60).
 *
 * The clan modules are pure functions over passed-in state; this store is
 * the persistence seam. It owns the clan roster (members + companions) and
 * the clan-office holders in localStorage, and applies the pure module
 * functions, saving after every mutation. Panels read through
 * `loadClanStore()` and mutate through the helpers below — never by
 * touching localStorage directly.
 */

import type { ClanMember, Companion } from "./types.js";
import { influenceLoyalty, loyaltyAlerts, type InfluenceAction, type LoyaltyEvent } from "./loyalty.js";
import {
  CLAN_ROLES,
  createClanRoles,
  type ClanRole,
  type ClanRoleAssignment,
  type ClanRoles,
} from "./roles.js";

const STORE_KEY = "campaign.clan-store.v1";

export interface ClanStore {
  members: ClanMember[];
  companions: Companion[];
  /** Clan office -> holding member id (null when vacant). */
  roleHolders: Record<ClanRole, string | null>;
  updatedAt: number;
}

function blankHolders(): Record<ClanRole, string | null> {
  return { steward: null, scout: null, quartermaster: null };
}

function blank(): ClanStore {
  return { members: [], companions: [], roleHolders: blankHolders(), updatedAt: Date.now() };
}

function validRoleHolders(v: unknown): Record<ClanRole, string | null> {
  const holders = blankHolders();
  if (v && typeof v === "object") {
    for (const role of CLAN_ROLES) {
      const id = (v as Record<string, unknown>)[role];
      holders[role] = typeof id === "string" ? id : null;
    }
  }
  return holders;
}

/** Load the persisted clan store; empty store when nothing is saved yet. */
export function loadClanStore(): ClanStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<ClanStore>;
    if (!Array.isArray(parsed.members) || !Array.isArray(parsed.companions)) return blank();
    return {
      members: parsed.members,
      companions: parsed.companions,
      roleHolders: validRoleHolders(parsed.roleHolders),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return blank();
  }
}

export function saveClanStore(store: ClanStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...store, updatedAt: Date.now() }));
  } catch {
    // Storage unavailable; the store stays session-only.
  }
}

/**
 * Rebuild the live ClanRoles object from a store: office holders are
 * resolved against the member roster (a holder whose member is gone reads
 * as vacant).
 */
export function clanRoles(store: ClanStore): ClanRoles {
  const roles = createClanRoles();
  for (const role of CLAN_ROLES) {
    const id = store.roleHolders[role];
    if (!id) continue;
    const member = store.members.find((m) => m.id === id);
    if (member) roles.assign(member, role);
  }
  return roles;
}

/** Current office assignments with skill-scaled bonuses. */
export function roleAssignments(): ClanRoleAssignment[] {
  return clanRoles(loadClanStore()).assignments();
}

/** Add or replace a clan member, then persist. */
export function upsertMember(member: ClanMember): ClanStore {
  const store = loadClanStore();
  const i = store.members.findIndex((m) => m.id === member.id);
  if (i >= 0) store.members[i] = member;
  else store.members.push(member);
  saveClanStore(store);
  return store;
}

/** Add or replace a companion, then persist. */
export function upsertCompanion(companion: Companion): ClanStore {
  const store = loadClanStore();
  const i = store.companions.findIndex((c) => c.id === companion.id);
  if (i >= 0) store.companions[i] = companion;
  else store.companions.push(companion);
  saveClanStore(store);
  return store;
}

/**
 * Apply a loyalty influence action to a companion and persist the result.
 * Returns the updated companion, or null when the id is unknown.
 */
export function influenceCompanion(id: string, action: InfluenceAction): Companion | null {
  const store = loadClanStore();
  const i = store.companions.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const updated = influenceLoyalty(store.companions[i]!, action);
  store.companions[i] = updated;
  saveClanStore(store);
  return updated;
}

/** Current loyalty warnings across all companions, most urgent first. */
export function clanLoyaltyAlerts(): Array<{ companion: Companion; events: LoyaltyEvent[] }> {
  return loadClanStore()
    .companions.map((companion) => ({ companion, events: loyaltyAlerts(companion) }))
    .filter((e) => e.events.length > 0)
    .sort((a, b) => a.companion.loyalty - b.companion.loyalty);
}

/**
 * Assign a clan office to a roster member and persist. Returns false when
 * the member is unknown.
 */
export function assignClanRole(memberId: string, role: ClanRole): boolean {
  const store = loadClanStore();
  if (!store.members.some((m) => m.id === memberId)) return false;
  store.roleHolders[role] = memberId;
  saveClanStore(store);
  return true;
}

/** Vacate a clan office and persist. */
export function unassignClanRole(role: ClanRole): ClanStore {
  const store = loadClanStore();
  store.roleHolders[role] = null;
  saveClanStore(store);
  return store;
}

/** Clear the persisted clan store (new game / reset). */
export function clearClanStore(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing to clear.
  }
}
