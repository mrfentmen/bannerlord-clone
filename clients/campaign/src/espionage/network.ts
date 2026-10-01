/**
 * Task 94: spy network map data. Place spies on the map; each post shows its
 * spy and their cover. The map itself stays in Hana's lane — this module
 * emits marker data the map layer can render.
 */

import type { Spy } from "./types.js";

export interface SpyMarker {
  postId: string;
  postName: string;
  spyName: string;
  cover: number;
  atRisk: boolean;
}

export interface SpyNetwork {
  spies(): Spy[];
  place(spy: Spy): void;
  recall(spyId: string): Spy | null;
  /** Marker data for the map layer. */
  markers(postNames: Record<string, string>): SpyMarker[];
  /** Season tick: cover decays where counter-espionage is strong. */
  tick(heat: Record<string, number>): void;
}

export function createSpyNetwork(): SpyNetwork {
  const spies = new Map<string, Spy>();
  return {
    spies: () => [...spies.values()],
    place(spy) {
      if (spy.cover < 0 || spy.cover > 100) throw new Error("cover must be 0..100");
      spies.set(spy.id, { ...spy });
    },
    recall(spyId) {
      const s = spies.get(spyId) ?? null;
      if (s) spies.delete(spyId);
      return s;
    },
    markers(postNames) {
      return [...spies.values()].map((s) => ({
        postId: s.post,
        postName: postNames[s.post] ?? s.post,
        spyName: s.name,
        cover: s.cover,
        atRisk: s.cover < 30,
      }));
    },
    tick(heat) {
      for (const s of spies.values()) {
        s.cover = Math.max(0, s.cover - (heat[s.post] ?? 0));
      }
    },
  };
}
