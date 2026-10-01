/**
 * Codex / encyclopedia data model (MASTER_PLAN task 123).
 *
 * A searchable lore + mechanics reference. Entries are hand-written and live
 * in `entries.ts`; the accept criterion — every mechanic has an entry — is
 * enforced by test (`__tests__/codex.test.ts` asserts every input action id
 * and every settings key is tagged on at least one entry).
 */

export type CodexCategory =
  | "controls"
  | "settings"
  | "command"
  | "campaign"
  | "economy"
  | "world";

export const CODEX_CATEGORIES: CodexCategory[] = [
  "controls",
  "settings",
  "command",
  "campaign",
  "economy",
  "world",
];

export const CODEX_CATEGORY_LABEL: Record<CodexCategory, string> = {
  controls: "Controls",
  settings: "Settings",
  command: "Command",
  campaign: "Campaign",
  economy: "Economy",
  world: "World",
};

export interface CodexEntry {
  /** Stable slug, e.g. "action-map-pan-up" or "mechanic-marching". */
  id: string;
  title: string;
  category: CodexCategory;
  /** One line, shown in the result list. */
  summary: string;
  /** Paragraphs shown in the detail view. */
  body: string[];
  /**
   * Searchable keywords. Coverage tags use the `action:<id>` and
   * `setting:<key>` prefixes so the coverage test can find them.
   */
  tags: string[];
  /** Ids of related entries, rendered as links. */
  related: string[];
}
