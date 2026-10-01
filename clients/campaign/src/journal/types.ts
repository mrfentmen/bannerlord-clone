/**
 * Quest journal data model (MASTER_PLAN task 114).
 *
 * The journal is a pure client-side record. It does not simulate quests and it
 * does not call the data provider: notables can offer quests (see the
 * `ask-quest` notable action) and battle outcomes can close them, but the
 * journal itself only stores what the player has been told, in the state the
 * player last saw it. A future lane task can wire quest offers and completions
 * into `QuestJournal.add` / `QuestJournal.setStatus` without changing this
 * file.
 */

export type QuestStatus = "active" | "completed" | "failed";

export type QuestCategory =
  | "war"
  | "trade"
  | "bounty"
  | "escort"
  | "intrigue"
  | "exploration"
  | "aid";

export const QUEST_CATEGORIES: QuestCategory[] = [
  "war",
  "trade",
  "bounty",
  "escort",
  "intrigue",
  "exploration",
  "aid",
];

export const CATEGORY_LABEL: Record<QuestCategory, string> = {
  war: "War",
  trade: "Trade",
  bounty: "Bounty",
  escort: "Escort",
  intrigue: "Intrigue",
  exploration: "Exploration",
  aid: "Aid",
};

export const STATUS_LABEL: Record<QuestStatus, string> = {
  active: "Active",
  completed: "Completed",
  failed: "Failed",
};

export interface QuestObjective {
  id: string;
  text: string;
  done: boolean;
}

export interface Quest {
  id: string;
  title: string;
  summary: string;
  giver: string;
  settlement: string;
  category: QuestCategory;
  status: QuestStatus;
  objectives: QuestObjective[];
  /** Human-readable reward, e.g. "$1,200" or "safehouse access". */
  reward: string;
  /** Days until the deadline, or null when there is none. */
  daysLeft: number | null;
  startedDay: number;
}

export interface JournalFilters {
  status: "all" | QuestStatus;
  category: "all" | QuestCategory;
  /** Free text matched against title, giver, settlement and summary. */
  query: string;
}

export const EMPTY_FILTERS: JournalFilters = { status: "all", category: "all", query: "" };
