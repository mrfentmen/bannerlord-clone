/**
 * Codex search (MASTER_PLAN task 123).
 *
 * Token-based ranking across title, tags, summary, and body. Title and tag
 * hits outrank body hits; an empty query returns everything in category order.
 */

import type { CodexEntry } from "./types.js";
import { CODEX_CATEGORIES } from "./types.js";

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function score(entry: CodexEntry, queryTokens: string[]): number {
  const title = entry.title.toLowerCase();
  const tags = entry.tags.join(" ").toLowerCase();
  const summary = entry.summary.toLowerCase();
  const body = entry.body.join(" ").toLowerCase();
  let total = 0;
  for (const tok of queryTokens) {
    if (title.includes(tok)) total += 5;
    if (tags.split(/[^a-z0-9]+/).includes(tok)) total += 4;
    else if (tags.includes(tok)) total += 2;
    if (summary.includes(tok)) total += 2;
    if (body.includes(tok)) total += 1;
  }
  return total;
}

/** Ranked search. Every token must appear somewhere in the entry to match. */
export function searchCodex(entries: readonly CodexEntry[], query: string): CodexEntry[] {
  const toks = tokens(query);
  if (toks.length === 0) {
    return [...entries].sort(
      (a, b) => CODEX_CATEGORIES.indexOf(a.category) - CODEX_CATEGORIES.indexOf(b.category),
    );
  }
  const titleOf = (en: CodexEntry) =>
    `${en.title} ${en.tags.join(" ")} ${en.summary} ${en.body.join(" ")}`.toLowerCase();
  return entries
    .filter((en) => {
      const hay = titleOf(en);
      return toks.every((t) => hay.includes(t));
    })
    .map((en) => ({ en, s: score(en, toks) }))
    .sort((a, b) => b.s - a.s || a.en.title.localeCompare(b.en.title))
    .map((r) => r.en);
}

/** Look up an entry by id. */
export function getEntry(entries: readonly CodexEntry[], id: string): CodexEntry | undefined {
  return entries.find((en) => en.id === id);
}
