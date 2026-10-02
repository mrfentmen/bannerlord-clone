/**
 * Lifetime stats per-campaign drill-down (Rowan solo task 99).
 *
 * Lifetime stats aggregate across campaigns; this module records stats
 * per campaign and lets the player drill down: totals plus a per-campaign
 * breakdown. Persists in localStorage.
 */

import { emptyStats, mergeStats } from "./achievements.js";
import type { LifetimeStats } from "./types.js";

export interface CampaignStatsEntry {
  campaignId: string;
  campaignName: string;
  stats: LifetimeStats;
}

const STORE_KEY = "campaign.lifetime-stats-by-campaign.v1";

function load(): CampaignStatsEntry[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(entries: CampaignStatsEntry[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    // Session-only stats.
  }
}

/** Record (or replace) a campaign's stats. */
export function recordCampaignStats(campaignId: string, campaignName: string, stats: LifetimeStats): CampaignStatsEntry {
  const entries = load();
  const entry: CampaignStatsEntry = { campaignId, campaignName, stats: { ...stats } };
  const i = entries.findIndex((e) => e.campaignId === campaignId);
  if (i >= 0) entries[i] = entry;
  else entries.push(entry);
  save(entries);
  return entry;
}

/** All campaigns' stats, most recently recorded first. */
export function campaignStatsBreakdown(): CampaignStatsEntry[] {
  return load().reverse();
}

/** Lifetime totals across all campaigns. */
export function lifetimeTotals(): LifetimeStats {
  return load().reduce((acc, e) => mergeStats(acc, e.stats), emptyStats());
}

/** Drill down into one campaign's stats. */
export function campaignStats(campaignId: string): CampaignStatsEntry | null {
  return load().find((e) => e.campaignId === campaignId) ?? null;
}

/** Remove a campaign's stats (e.g. deleted save). */
export function removeCampaignStats(campaignId: string): boolean {
  const entries = load();
  const i = entries.findIndex((e) => e.campaignId === campaignId);
  if (i < 0) return false;
  entries.splice(i, 1);
  save(entries);
  return true;
}
