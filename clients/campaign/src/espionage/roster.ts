/**
 * Persisted spy roster (integration for espionage tasks 61-70).
 *
 * Missions, alerts, sweeps, and ledgers all key off spy ids; this store
 * owns the roster itself — who the spies are, where they are posted, and
 * their cover — in localStorage. Panels read the roster and pass
 * `PlacedSpy` views into the pure mission/marker functions.
 */

import type { PlacedSpy } from "./spyMissions.js";

const STORE_KEY = "campaign.spy-roster.v1";

export interface RosterSpy {
  id: string;
  name: string;
  /** Post id (settlement/faction); resolved to a display name by the panel. */
  post: string;
  /** 0-100 cover; sweeps and exposure chew through it. */
  cover: number;
  /** 0-10 tradecraft skill. */
  skill: number;
}

function blank(): RosterSpy[] {
  return [];
}

function load(): RosterSpy[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return blank();
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as RosterSpy[]) : blank();
  } catch {
    return blank();
  }
}

function save(spies: RosterSpy[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(spies));
  } catch {
    // Session-only roster.
  }
}

/** All spies on the roster. */
export function spyRoster(): RosterSpy[] {
  return load();
}

/** Place a new spy. Throws when the id is already taken. */
export function placeSpy(spy: RosterSpy): RosterSpy {
  const spies = load();
  if (spies.some((s) => s.id === spy.id)) throw new Error(`spy already placed: ${spy.id}`);
  const placed: RosterSpy = {
    id: spy.id,
    name: spy.name,
    post: spy.post,
    cover: Math.max(0, Math.min(100, spy.cover)),
    skill: Math.max(0, Math.min(10, spy.skill)),
  };
  spies.push(placed);
  save(spies);
  return placed;
}

/** Recall a spy from the field. Returns true when someone was recalled. */
export function recallSpy(id: string): boolean {
  const spies = load();
  const next = spies.filter((s) => s.id !== id);
  if (next.length === spies.length) return false;
  save(next);
  return true;
}

/** Adjust a spy's cover (clamped 0-100). Returns the updated spy or null. */
export function adjustCover(id: string, delta: number): RosterSpy | null {
  const spies = load();
  const spy = spies.find((s) => s.id === id);
  if (!spy) return null;
  spy.cover = Math.max(0, Math.min(100, spy.cover + delta));
  save(spies);
  return { ...spy };
}

/** Roster as the mission/marker functions expect it. */
export function placedSpies(): PlacedSpy[] {
  return load().map((s) => ({ id: s.id, name: s.name, post: s.post, cover: s.cover }));
}
