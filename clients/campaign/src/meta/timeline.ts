/**
 * MASTER_PLAN task 139: campaign timeline — visual history of your reign.
 *
 * Pure, testable logic over the clan chronicle's recorded deeds
 * (`ChronicleEvent` from expression/chronicle.ts, persisted by main.ts).
 * The DOM rendering lives in timelinePanel.ts; this module only derives the
 * date-ordered view model: seasons group into years (4 seasons per year,
 * matching the 90-day seasons of `seasonForDay`).
 */

import type { ChronicleEvent } from "../expression/chronicle.js";

/** The chronicle's event kinds, re-exported for timeline consumers. */
export type TimelineKind = ChronicleEvent["kind"];

/** Four 90-day seasons per campaign year. */
export const SEASONS_PER_YEAR = 4;

const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"] as const;

/** 1-based season number -> 1-based campaign year. */
export function seasonYear(season: number): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(season)) / SEASONS_PER_YEAR));
}

/** 1-based season number -> season name ("Spring".."Winter", cycling yearly). */
export function seasonName(season: number): string {
  const s = Math.max(1, Math.floor(season));
  return SEASON_NAMES[(s - 1) % SEASONS_PER_YEAR] ?? "Spring";
}

/** Human date label for a season, e.g. "Spring, Year 3". */
export function seasonLabel(season: number): string {
  return `${seasonName(season)}, Year ${seasonYear(season)}`;
}

/** Kind metadata for the timeline spine: label and marker glyph. */
export const KIND_META: Record<TimelineKind, { label: string; glyph: string }> = {
  battle: { label: "Battle", glyph: "⚔" },
  marriage: { label: "Marriage", glyph: "💒" },
  birth: { label: "Birth", glyph: "👶" },
  death: { label: "Death", glyph: "⚱" },
  treaty: { label: "Treaty", glyph: "🤝" },
  edict: { label: "Edict", glyph: "📜" },
  building: { label: "Building", glyph: "🏗" },
  other: { label: "Deed", glyph: "❖" },
};

/** Every chronicle kind, for the "show all" filter default. */
export const ALL_KINDS: TimelineKind[] = (Object.keys(KIND_META) as TimelineKind[]);

/** A sanitized event with a guaranteed integer season >= 1. */
export interface TimelineEntry {
  season: number;
  kind: TimelineKind;
  text: string;
}

/** One date tick on the spine: every recorded event in a single season. */
export interface TimelineGroup {
  season: number;
  label: string;
  entries: TimelineEntry[];
}

function sanitize(event: ChronicleEvent): TimelineEntry | null {
  const text = String(event.text ?? "").trim();
  if (!text) return null;
  const season = Math.floor(Number(event.season));
  if (!Number.isFinite(season)) return null;
  const kind: TimelineKind =
    event.kind && event.kind in KIND_META ? event.kind : "other";
  return { season: Math.max(1, season), kind, text: text.slice(0, 500) };
}

/**
 * Sort events oldest-first (stable within a season) and group them into
 * season ticks. Malformed entries (empty text, non-finite season) are dropped.
 */
export function groupTimeline(events: ChronicleEvent[]): TimelineGroup[] {
  const entries: TimelineEntry[] = [];
  for (const e of events) {
    const clean = sanitize(e);
    if (clean) entries.push(clean);
  }
  entries.sort((a, b) => a.season - b.season); // Array.sort is stable: ties keep input order.
  const groups: TimelineGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.season === entry.season) {
      last.entries.push(entry);
    } else {
      groups.push({ season: entry.season, label: seasonLabel(entry.season), entries: [entry] });
    }
  }
  return groups;
}

/** Keep only events whose kind is in the selected set. */
export function filterTimeline(events: ChronicleEvent[], kinds: ReadonlySet<TimelineKind>): ChronicleEvent[] {
  return events.filter((e) => kinds.has(sanitizeKind(e.kind)));
}

function sanitizeKind(kind: unknown): TimelineKind {
  return typeof kind === "string" && kind in KIND_META ? (kind as TimelineKind) : "other";
}

export interface TimelineStats {
  total: number;
  byKind: Record<TimelineKind, number>;
  firstSeason: number | null;
  lastSeason: number | null;
}

/** Aggregate counts across the recorded events. */
export function timelineStats(events: ChronicleEvent[]): TimelineStats {
  const byKind = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as Record<TimelineKind, number>;
  let total = 0;
  let firstSeason: number | null = null;
  let lastSeason: number | null = null;
  for (const event of events) {
    const clean = sanitize(event);
    if (!clean) continue;
    total += 1;
    byKind[clean.kind] += 1;
    firstSeason = firstSeason === null ? clean.season : Math.min(firstSeason, clean.season);
    lastSeason = lastSeason === null ? clean.season : Math.max(lastSeason, clean.season);
  }
  return { total, byKind, firstSeason, lastSeason };
}
