/**
 * The real world, published to whichever provider is active.
 *
 * The simulation produces town state; the client produces the real geography. The
 * fixture wants real populations so its state profiles are not invented, and the HTTP
 * provider has no use for them at all. Rather than have `main.ts` import from
 * `data/fixture/` to hand them over, they are published here and read by whoever wants
 * them.
 *
 * That indirection is not architecture for its own sake: it is what keeps the fixture
 * out of the application's import graph, and therefore out of a production bundle.
 */

import type { WorldSettlement } from "./types.js";

let settlements: WorldSettlement[] = [];
let regionName = "";
let retrieved = "";

export function publishWorld(data: {
  settlements: WorldSettlement[];
  name: string;
  retrieved: string;
}): void {
  settlements = data.settlements;
  regionName = data.name;
  retrieved = data.retrieved;
}

export function worldSettlements(): WorldSettlement[] {
  return settlements;
}

export function worldRegion(): { name: string; retrieved: string } {
  return { name: regionName, retrieved };
}

/**
 * Real population summed by state, from the Census figures the client loaded.
 * Settlements with no surveyed population contribute nothing, because contributing a
 * guess would put a fabricated number into a panel.
 */
export function populationsByState(): Map<string, number> {
  const byState = new Map<string, number>();
  for (const s of settlements) {
    if (s.population === null || s.stateCode === null) continue;
    byState.set(s.stateCode, (byState.get(s.stateCode) ?? 0) + s.population);
  }
  return byState;
}
