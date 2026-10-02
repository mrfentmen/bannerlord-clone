/**
 * Task 126: guided campaign start. Five first goals for a new campaign;
 * checking them off persists so the player sees real progress.
 */

export interface StartGoal {
  id: string;
  label: string;
  done: boolean;
}

export const START_GOALS: Array<Omit<StartGoal, "done">> = [
  { id: "move-party", label: "Move your party on the campaign map" },
  { id: "visit-town", label: "Enter a town and open its market" },
  { id: "recruit", label: "Recruit your first troops" },
  { id: "win-battle", label: "Win your first battle" },
  { id: "swear-fealty", label: "Swear fealty or found your clan" },
];

export interface GuidedStart {
  goals: StartGoal[];
  /** Check a goal off. Unknown ids are ignored. */
  complete(id: string): void;
  doneCount(): number;
  isComplete(): boolean;
  reset(): void;
}

export function createGuidedStart(storage: Pick<Storage, "getItem" | "setItem"> | null = null): GuidedStart {
  const KEY = "campaign.guidedStart.v1";
  let goals: StartGoal[] = START_GOALS.map((g) => ({ ...g, done: false }));
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as string[];
      goals = goals.map((g) => ({ ...g, done: saved.includes(g.id) }));
    }
  } catch {
    // Corrupt storage: start fresh.
  }
  const persist = (): void => {
    try {
      storage?.setItem(KEY, JSON.stringify(goals.filter((g) => g.done).map((g) => g.id)));
    } catch {
      // Storage writes blocked: the session still works.
    }
  };
  return {
    goals,
    complete(id) {
      const goal = goals.find((g) => g.id === id);
      if (goal && !goal.done) {
        goal.done = true;
        persist();
      }
    },
    doneCount: () => goals.filter((g) => g.done).length,
    isComplete: () => goals.every((g) => g.done),
    reset() {
      goals = goals.map((g) => ({ ...g, done: false }));
      persist();
    },
  };
}
