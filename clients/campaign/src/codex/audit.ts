/**
 * Codex missing-entries audit (Rowan solo task 93).
 *
 * Every game system must have a codex entry. Systems are identified by
 * slug; an entry covers a system when one of its tags is
 * `mechanic:<slug>`. The audit reports any system with no covering
 * entry.
 */

import type { CodexEntry } from "./types.js";

/** Slugs of the game systems that must be documented. */
export const GAME_SYSTEMS: readonly string[] = [
  "scheme-timeline",
  "blackmail-leverage",
  "assassination",
  "spy-extraction",
  "spy-alerts",
  "spy-tips",
  "workshop-pnl",
  "caravan-ranking",
  "price-alerts",
  "tax-policy",
  "smuggling-risk",
  "trade-deals",
  "shortages",
  "treasury-forecast",
  "loans",
  "trade-dominance",
  "relation-notifications",
  "treaties",
  "war-goals",
  "peace-concessions",
  "joint-operations",
  "tribute",
  "reputation",
  "envoy-assignment",
  "border-incidents",
  "great-powers",
  "battle-tutorial",
  "hint-cooldown",
];

export interface CodexAuditResult {
  total: number;
  covered: number;
  missing: string[];
  line: string;
}

/** Audit the corpus: which systems lack a codex entry. */
export function auditCodexCoverage(entries: readonly CodexEntry[]): CodexAuditResult {
  const tags = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.tags) tags.add(tag);
  }
  const missing = GAME_SYSTEMS.filter((slug) => !tags.has(`mechanic:${slug}`));
  const covered = GAME_SYSTEMS.length - missing.length;
  const line =
    missing.length === 0
      ? `Codex complete: all ${GAME_SYSTEMS.length} game systems documented.`
      : `Codex missing ${missing.length} entr${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}.`;
  return { total: GAME_SYSTEMS.length, covered, missing, line };
}
