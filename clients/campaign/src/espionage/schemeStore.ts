/**
 * Persisted scheme store (integration for espionage tasks 65-70).
 *
 * Schemes planned with `planScheme` live in module memory; this store
 * persists them in localStorage so the Spymaster panel can list, tick,
 * and abandon schemes across sessions.
 */

import { exposeScheme, planScheme, tickScheme, type SchemeTick } from "./schemes.js";
import type { Scheme, SchemeKind } from "./types.js";

const STORE_KEY = "campaign.schemes.v1";

function load(): Scheme[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Scheme[]) : [];
  } catch {
    return [];
  }
}

function save(schemes: Scheme[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(schemes));
  } catch {
    // Session-only schemes.
  }
}

/** All schemes, oldest first. */
export function schemes(): Scheme[] {
  return load();
}

/** Plan a scheme and persist it. */
export function startScheme(kind: SchemeKind, target: string): Scheme {
  const scheme = planScheme(kind, target);
  const all = load();
  all.push(scheme);
  save(all);
  return scheme;
}

/**
 * Advance every undiscovered, incomplete scheme one season.
 * Discovery is rolled here (the pure tick only reports odds).
 * Returns the ticks for the panel to report.
 */
export function tickSchemes(cover: number, heat: number, roll: () => number = Math.random): SchemeTick[] {
  const all = load();
  const ticks: SchemeTick[] = [];
  for (const scheme of all) {
    if (scheme.discovered || scheme.progress >= 100) continue;
    const tick = tickScheme(scheme, cover, heat);
    let next = tick.scheme;
    if (roll() < tick.discoveryOdds) next = exposeScheme(next);
    Object.assign(scheme, next);
    ticks.push({ ...tick, scheme: next });
  }
  save(all);
  return ticks;
}

/** Abandon a scheme. Returns true when one was removed. */
export function abandonScheme(id: string): boolean {
  const all = load();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  save(next);
  return true;
}
