/**
 * Task 95: scheme planner. Pick a scheme kind and target, then watch
 * discovery odds as progress accumulates. Discovery odds rise with the
 * scheme's heat and fall with the spymaster's cover; success at 100
 * progress yields the scheme's payoff description for the campaign layer.
 */

import type { Scheme, SchemeKind } from "./types.js";

export const SCHEME_KINDS: SchemeKind[] = ["steal-plans", "sow-dissent", "sabotage", "assassinate"];

export const SCHEME_LABELS: Record<SchemeKind, string> = {
  "steal-plans": "Steal battle plans",
  "sow-dissent": "Sow dissent",
  "sabotage": "Sabotage supplies",
  "assassinate": "Assassinate",
};

/** Base seasons to complete each scheme kind. */
const BASE_DURATION: Record<SchemeKind, number> = {
  "steal-plans": 3,
  "sow-dissent": 5,
  "sabotage": 4,
  "assassinate": 8,
};

let nextScheme = 1;

export function planScheme(kind: SchemeKind, target: string): Scheme {
  if (!SCHEME_KINDS.includes(kind)) throw new Error(`unknown scheme kind: ${kind}`);
  return {
    id: `scheme-${nextScheme++}`,
    kind,
    target,
    progress: 0,
    rate: 100 / BASE_DURATION[kind],
    discovered: false,
  };
}

export interface SchemeTick {
  scheme: Scheme;
  /** 0..1 chance the scheme is discovered this season. */
  discoveryOdds: number;
  completed: boolean;
}

/**
 * Advance a scheme one season. `cover` is the assigned spy's cover 0..100;
 * `heat` is the target's counter-espionage pressure 0..100.
 */
export function tickScheme(scheme: Scheme, cover: number, heat: number): SchemeTick {
  const next = { ...scheme };
  next.progress = Math.min(100, next.progress + next.rate);
  const discoveryOdds = Math.min(
    0.9,
    Math.max(0.02, (heat / 100) * 0.5 + (next.progress / 100) * 0.3 - (cover / 100) * 0.4),
  );
  return { scheme: next, discoveryOdds, completed: next.progress >= 100 };
}

/** Mark a scheme discovered; returns the fallout summary. */
export function exposeScheme(scheme: Scheme): Scheme {
  return { ...scheme, discovered: true };
}
