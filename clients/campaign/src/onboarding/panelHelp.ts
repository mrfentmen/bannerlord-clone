/**
 * Every-panel help coverage (Rowan solo task 94).
 *
 * Maps every UI panel to the help topic its help button opens. The
 * coverage test enumerates the panels directory and asserts each panel
 * has a mapping — so no panel ships without help.
 */

import { helpFor, type HelpTopic } from "./help.js";

/** Panel id → help screen key (see help.ts). */
export const PANEL_HELP_MAP: Record<string, string> = {
  Achievements: "map",
  CharacterMaker: "clan",
  CharacterPanel: "clan",
  ClanPanel: "clan",
  Codex: "map",
  DifficultyPanel: "map",
  DifficultySelector: "map",
  DiplomacyPanel: "diplomacy",
  GameMenu: "map",
  KeybindingEditor: "map",
  LedgerPanel: "economy",
  LoansPanel: "economy",
  MarchPlanner: "map",
  MarketPanel: "economy",
  PartyPanel: "map",
  QuestJournal: "map",
  RulerPanel: "clan",
  SettingsPanel: "map",
  ShortcutsReference: "map",
  SpymasterPanel: "espionage",
  StartScreen: "map",
  TownPanel: "economy",
  WarPaintPanel: "clan",
  WhyPanel: "map",
};

/** Panels that are not user-facing (helpers, skeletons) and need no help. */
export const HELP_EXEMPT_PANELS = ["narrow", "panel-skeletons", "skeletons"];

/**
 * The help topic a panel's help button opens. Falls back to the map
 * topic when a panel has no specific mapping.
 */
export function panelHelp(panelId: string): HelpTopic[] {
  const screen = PANEL_HELP_MAP[panelId] ?? "map";
  return helpFor(screen);
}

/** All registered panel ids. */
export function helpCoveredPanels(): string[] {
  return Object.keys(PANEL_HELP_MAP);
}