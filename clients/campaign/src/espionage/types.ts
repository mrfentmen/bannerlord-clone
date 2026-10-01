/**
 * Espionage (MASTER_PLAN 3C, tasks 94-100): spy network, scheme planner,
 * informant recruitment, counter-espionage, coded-message minigame,
 * assassination plotting, and intel reports.
 *
 * Data-level domain logic plus the cipher minigame DOM. Discovery odds,
 * plot progress, and exposure are computed here; the campaign layer owns
 * the world consequences.
 */

export interface Spy {
  id: string;
  name: string;
  /** Target settlement/court id. */
  post: string;
  cover: number; // 0..100, resists discovery
}

export interface Scheme {
  id: string;
  kind: SchemeKind;
  target: string;
  /** 0..100 accumulated. */
  progress: number;
  /** Per-season progress rate. */
  rate: number;
  discovered: boolean;
}

export type SchemeKind = "steal-plans" | "sow-dissent" | "sabotage" | "assassinate";

export interface Informant {
  id: string;
  name: string;
  post: string;
  reliability: number; // 0..100
  costPerSeason: number;
}

export interface IntelReport {
  id: string;
  post: string;
  summary: string;
  /** 0..1 — low reliability reports may be misleading. */
  confidence: number;
}
