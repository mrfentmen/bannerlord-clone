/**
 * Achievements system data model (MASTER_PLAN task 137).
 *
 * Achievements are data: a static catalog of definitions plus a store that
 * counts recorded events and unlocks definitions when their thresholds are
 * met. Anything in the client can emit events through `record()`; the store
 * does not care which lane the event came from.
 */

export type AchievementCategory = "quests" | "command" | "knowledge" | "customization" | "meta";

export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  "quests",
  "command",
  "knowledge",
  "customization",
  "meta",
];

export const ACHIEVEMENT_CATEGORY_LABEL: Record<AchievementCategory, string> = {
  quests: "Quests",
  command: "Command",
  knowledge: "Knowledge",
  customization: "Customization",
  meta: "Meta",
};

export interface AchievementDef {
  /** Stable id, e.g. "quest-completed-10". */
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  /** Event type that feeds this achievement, e.g. "quest.completed". */
  event: string;
  /** How many matching events unlock it. */
  count: number;
  /**
   * When present, only events whose fields include every pair here count.
   * E.g. `{ category: "war" }` for "complete 3 war quests".
   */
  match?: Record<string, string>;
  /** Trophy points. Higher tiers pay more. */
  points: number;
  /** Hidden achievements show as "???" until unlocked. */
  hidden?: boolean;
}

export interface AchievementProgress {
  def: AchievementDef;
  /** Current counted events toward the target. */
  current: number;
  unlocked: boolean;
  /** Day number the achievement unlocked, if it did. */
  unlockedDay?: number;
}

/** A gameplay event. `n` defaults to 1. */
export interface AchievementEvent {
  type: string;
  fields?: Record<string, string>;
  n?: number;
}
