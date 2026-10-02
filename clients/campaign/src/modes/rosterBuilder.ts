/**
 * Custom battle roster builder (Rowan solo task 35).
 *
 * Pick units within a points budget: each unit kind/tier has a point cost,
 * the builder tracks spent vs remaining, rejects over-budget picks, and
 * produces a ForceDef for the custom battle setup.
 */

import type { ForceDef, UnitDef } from "./types.js";

export const ROSTER_BUDGET = 1000;

export type UnitKind = UnitDef["kind"];
export type UnitTier = UnitDef["tier"];

export interface RosterEntry {
  kind: UnitKind;
  tier: UnitTier;
  count: number;
}

/** Points per single soldier of each kind/tier. */
export function unitCost(kind: UnitKind, tier: UnitTier): number {
  const base: Record<UnitKind, number> = {
    infantry: 4,
    archers: 5,
    cavalry: 9,
    skirmishers: 6,
  };
  return base[kind] * tier;
}

export interface RosterBuilder {
  budget: number;
  entries(): RosterEntry[];
  spent(): number;
  remaining(): number;
  /** Add soldiers; throws when the pick would exceed the budget. */
  add(kind: UnitKind, tier: UnitTier, count: number): void;
  /** Remove soldiers; throws when removing more than present. */
  remove(kind: UnitKind, tier: UnitTier, count: number): void;
  clear(): void;
  buildForce(id: string, name: string): ForceDef;
}

export function createRosterBuilder(budget = ROSTER_BUDGET): RosterBuilder {
  const entries: RosterEntry[] = [];

  function spent(): number {
    return entries.reduce((sum, e) => sum + e.count * unitCost(e.kind, e.tier), 0);
  }

  function find(kind: UnitKind, tier: UnitTier): RosterEntry | undefined {
    return entries.find((e) => e.kind === kind && e.tier === tier);
  }

  return {
    budget,
    entries: () => entries.map((e) => ({ ...e })),
    spent,
    remaining: () => budget - spent(),
    add(kind, tier, count) {
      if (!Number.isInteger(count) || count <= 0) throw new Error("count must be a positive integer");
      const cost = count * unitCost(kind, tier);
      if (spent() + cost > budget) {
        throw new Error(`over budget: ${spent() + cost} > ${budget}`);
      }
      const entry = find(kind, tier);
      if (entry) entry.count += count;
      else entries.push({ kind, tier, count });
    },
    remove(kind, tier, count) {
      if (!Number.isInteger(count) || count <= 0) throw new Error("count must be a positive integer");
      const entry = find(kind, tier);
      if (!entry || entry.count < count) throw new Error("cannot remove more soldiers than present");
      entry.count -= count;
      if (entry.count === 0) entries.splice(entries.indexOf(entry), 1);
    },
    clear() {
      entries.length = 0;
    },
    buildForce(id, name) {
      return {
        id,
        name,
        units: entries.map((e) => ({ kind: e.kind, count: e.count, tier: e.tier })),
      };
    },
  };
}
