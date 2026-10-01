/**
 * Quest journal store (MASTER_PLAN task 114).
 *
 * Owns the quest list and the pure filter. Anything that produces quest
 * events — notable dialogue, battle results, future lane work — calls `add`,
 * `setStatus` or `setObjectiveDone`; the panel only reads.
 */

import type { JournalFilters, Quest, QuestObjective, QuestStatus } from "./types.js";

/** Pure: returns the quests matching every active filter, newest first. */
export function filterQuests(quests: readonly Quest[], filters: JournalFilters): Quest[] {
  const q = filters.query.trim().toLowerCase();
  return quests
    .filter((quest) => {
      if (filters.status !== "all" && quest.status !== filters.status) return false;
      if (filters.category !== "all" && quest.category !== filters.category) return false;
      if (q) {
        const hay = `${quest.title} ${quest.giver} ${quest.settlement} ${quest.summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.startedDay - a.startedDay);
}

export function objectivesDone(quest: Quest): number {
  return quest.objectives.filter((o) => o.done).length;
}

export interface QuestJournalOptions {
  /**
   * Called when quests change through the mutation API. Lets observers (e.g.
   * the achievements system) track progress without polling.
   */
  onEvent?: (type: "quest.completed" | "quest.failed" | "quest.objective_done", fields?: Record<string, string>) => void;
}

export class QuestJournal {
  private readonly quests = new Map<string, Quest>();
  private readonly onEvent?: QuestJournalOptions["onEvent"];

  constructor(seed: readonly Quest[] = [], options: QuestJournalOptions = {}) {
    for (const q of seed) this.quests.set(q.id, structuredClone(q));
    this.onEvent = options.onEvent;
  }

  /** All quests, newest first. */
  all(): Quest[] {
    return [...this.quests.values()].sort((a, b) => b.startedDay - a.startedDay);
  }

  get(id: string): Quest | undefined {
    const q = this.quests.get(id);
    return q ? structuredClone(q) : undefined;
  }

  list(filters: JournalFilters): Quest[] {
    return filterQuests(this.all(), filters);
  }

  countByStatus(): Record<QuestStatus, number> {
    const counts: Record<QuestStatus, number> = { active: 0, completed: 0, failed: 0 };
    for (const q of this.quests.values()) counts[q.status] += 1;
    return counts;
  }

  add(quest: Quest): void {
    if (this.quests.has(quest.id)) throw new Error(`duplicate quest id: ${quest.id}`);
    this.quests.set(quest.id, structuredClone(quest));
  }

  setStatus(id: string, status: QuestStatus): boolean {
    const q = this.quests.get(id);
    if (!q) return false;
    const was = q.status;
    q.status = status;
    if (was !== status && (status === "completed" || status === "failed")) {
      this.onEvent?.(`quest.${status}`, { category: q.category });
    }
    return true;
  }

  setObjectiveDone(id: string, objectiveId: string, done: boolean): boolean {
    const q = this.quests.get(id);
    const o: QuestObjective | undefined = q?.objectives.find((x) => x.id === objectiveId);
    if (!o) return false;
    const was = o.done;
    o.done = done;
    if (done && !was) {
      this.onEvent?.("quest.objective_done");
    }
    return true;
  }
}
