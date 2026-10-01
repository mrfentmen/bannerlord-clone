/**
 * Task 91: faction relation matrix. Seven factions, every pair's standing,
 * sortable rows/columns. Pure data for the grid UI.
 */

import type { FactionStanding } from "./types.js";

export const FACTIONS = [
  { id: "harbor", name: "Harbor Compact" },
  { id: "iron", name: "Iron Legion" },
  { id: "freeway", name: "Freeway Wardens" },
  { id: "rust", name: "Rust Horde" },
  { id: "neon", name: "Neon Syndicate" },
  { id: "gravel", name: "Gravel Pact" },
  { id: "static", name: "Static Collective" },
] as const;

function hashPair(a: string, b: string): number {
  const s = a < b ? a + b : b + a;
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

/** Deterministic starting standings, -100..100, symmetric. */
export function factionMatrix(): FactionStanding[] {
  return FACTIONS.map((f) => {
    const vs: Record<string, number> = {};
    for (const other of FACTIONS) {
      if (other.id === f.id) continue;
      vs[other.id] = (hashPair(f.id, other.id) % 201) - 100;
    }
    return { factionId: f.id, name: f.name, vs };
  });
}

/** Sort the matrix rows by standing vs a reference faction (or by name). */
export function sortMatrix(
  matrix: FactionStanding[],
  by: string | null,
  descending = true,
): FactionStanding[] {
  const rows = [...matrix];
  if (!by) return rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows.sort((a, b) => {
    const d = (b.vs[by] ?? 0) - (a.vs[by] ?? 0);
    return descending ? d : -d;
  });
}
