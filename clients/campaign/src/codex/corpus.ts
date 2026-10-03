/**
 * Assembles the full codex corpus from its parts.
 */

import { CONTROL_ENTRIES, SETTINGS_ENTRIES } from "./entries1.js";
import { CAMPAIGN_ENTRIES, COMMAND_ENTRIES, ECONOMY_ENTRIES } from "./entries2.js";
import { WORLD_ENTRIES } from "./entries3.js";
import { SOLO_ENTRIES } from "./entries4.js";
import { LORE_ENTRIES } from "./entries5.js";
import type { CodexEntry } from "./types.js";

export const ALL_CODEX_ENTRIES: readonly CodexEntry[] = [
  ...CONTROL_ENTRIES,
  ...SETTINGS_ENTRIES,
  ...COMMAND_ENTRIES,
  ...CAMPAIGN_ENTRIES,
  ...ECONOMY_ENTRIES,
  ...WORLD_ENTRIES,
  ...SOLO_ENTRIES,
  ...LORE_ENTRIES,
];

export const CODEX_ENTRY_COUNT = ALL_CODEX_ENTRIES.length;
