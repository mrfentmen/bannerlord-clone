/**
 * Task 109: envoy system. Send envoys on missions; each season they travel,
 * and dangerous routes risk capture. Capture is deterministic from the
 * route's danger and the envoy's skill — the campaign layer supplies both.
 */

import type { Envoy } from "./types.js";

let nextEnvoy = 1;

export interface EnvoyCorps {
  envoys(): Envoy[];
  send(name: string, mission: string, target: string, eta: number): Envoy;
  /** Advance one season; `danger` 0..1 per target, `skill` 0..100 per envoy. */
  tick(
    danger: Record<string, number>,
    skill: Record<string, number>,
    roll: (envoyId: string) => number,
  ): { returned: Envoy[]; captured: Envoy[] };
  release(id: string): void;
}

export function createEnvoyCorps(): EnvoyCorps {
  const envoys = new Map<string, Envoy>();
  return {
    envoys: () => [...envoys.values()],
    send(name, mission, target, eta) {
      if (eta < 1) throw new Error("envoy mission needs at least one season");
      const envoy: Envoy = { id: `envoy-${nextEnvoy++}`, name, mission, target, eta, captured: false };
      envoys.set(envoy.id, envoy);
      return envoy;
    },
    tick(danger, skill, roll) {
      const returned: Envoy[] = [];
      const captured: Envoy[] = [];
      for (const e of envoys.values()) {
        e.eta -= 1;
        const captureOdds = Math.max(0, (danger[e.target] ?? 0) - (skill[e.id] ?? 50) / 200);
        if (roll(e.id) < captureOdds) {
          e.captured = true;
          captured.push(e);
          envoys.delete(e.id);
        } else if (e.eta <= 0) {
          returned.push(e);
          envoys.delete(e.id);
        }
      }
      return { returned, captured };
    },
    release(id) {
      envoys.delete(id);
    },
  };
}
