/**
 * Assembles the full codex corpus from its parts.
 */

import { CONTROL_ENTRIES, SETTINGS_ENTRIES } from "./entries1.js";
import { CAMPAIGN_ENTRIES, COMMAND_ENTRIES, ECONOMY_ENTRIES } from "./entries2.js";
import { WORLD_ENTRIES } from "./entries3.js";
import { SOLO_ENTRIES } from "./entries4.js";
import { LORE_ENTRIES } from "./entries5.js";
import { CULTURE_ENTRIES, CITY_ENTRIES } from "./entries6.js";
import { FRONT_RANGE_ENTRIES } from "./entries7.js";
import { STATE_ENTRIES } from "./entries8.js";
import { MORE_CITY_ENTRIES } from "./entries9.js";
import { PEOPLE_ENTRIES } from "./entries10.js";
import { STATE_ENTRIES_2 } from "./entries11.js";
import { STATE_ENTRIES_3 } from "./entries12.js";
import { STATE_ENTRIES_4 } from "./entries13.js";
import { MORE_CITY_ENTRIES_2 } from "./entries14.js";
import { MORE_CITY_ENTRIES_3 } from "./entries15.js";
import { MORE_CITY_ENTRIES_4 } from "./entries16.js";
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
  ...CULTURE_ENTRIES,
  ...CITY_ENTRIES,
  ...FRONT_RANGE_ENTRIES,
  ...STATE_ENTRIES,
  ...MORE_CITY_ENTRIES,
  ...PEOPLE_ENTRIES,
  ...STATE_ENTRIES_2,
  ...STATE_ENTRIES_3,
  ...STATE_ENTRIES_4,
  ...MORE_CITY_ENTRIES_2,
  ...MORE_CITY_ENTRIES_3,
  ...MORE_CITY_ENTRIES_4,
];

export const CODEX_ENTRY_COUNT = ALL_CODEX_ENTRIES.length;
