/**
 * Task 96: informant recruitment. Bribe an informant at a post; their
 * reliability sets how much you can trust the intel they feed you.
 */

import type { Informant } from "./types.js";

let nextInformant = 1;

export interface InformantNetwork {
  informants(): Informant[];
  recruit(name: string, post: string, bribe: number): Informant;
  dismiss(id: string): void;
  seasonalCost(): number;
}

export function createInformantNetwork(): InformantNetwork {
  const list = new Map<string, Informant>();
  return {
    informants: () => [...list.values()],
    recruit(name, post, bribe) {
      if (bribe <= 0) throw new Error("a bribe must be positive");
      // Bigger bribes buy more reliable informants, with diminishing returns.
      const reliability = Math.min(95, 30 + Math.sqrt(bribe) * 2);
      const informant: Informant = {
        id: `inf-${nextInformant++}`,
        name,
        post,
        reliability,
        costPerSeason: Math.round(bribe / 10),
      };
      list.set(informant.id, informant);
      return informant;
    },
    dismiss(id) {
      list.delete(id);
    },
    seasonalCost() {
      return [...list.values()].reduce((s, i) => s + i.costPerSeason, 0);
    },
  };
}
