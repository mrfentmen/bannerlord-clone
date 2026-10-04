/**
 * The registered town sections, in panel order. A facility the simulation can
 * back joins by adding its spec file and listing it here; the town panel and
 * every town render the whole set for free.
 */
import type { TownSectionSpec } from "../townSections.js";
import { tavernSectionSpec } from "./tavern.js";
import { tavernDiceSectionSpec } from "./tavernDice.js";
import { smithySectionSpec } from "./smithy.js";
import { townQuestsSectionSpec } from "./townQuests.js";
import { townNotablesSectionSpec } from "./townNotables.js";

export const TOWN_SECTIONS: TownSectionSpec<never>[] = [
  tavernSectionSpec,
  tavernDiceSectionSpec,
  smithySectionSpec,
  townQuestsSectionSpec,
  townNotablesSectionSpec,
] as unknown as TownSectionSpec<never>[];
