/**
 * Task 128: tutorial progress tracker. Records which tutorial steps the
 * player finished; the record survives reloads via injected storage.
 */

export interface TutorialProgress {
  /** Step ids finished, in order. */
  finished: string[];
  markFinished(stepId: string): void;
  isFinished(stepId: string): boolean;
  reset(): void;
}

export function createTutorialProgress(
  storage: Pick<Storage, "getItem" | "setItem"> | null = null,
): TutorialProgress {
  const KEY = "campaign.tutorialProgress.v1";
  let finished: string[] = [];
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) finished = saved.filter((s): s is string => typeof s === "string");
    }
  } catch {
    // Corrupt storage: start fresh.
  }
  const persist = (): void => {
    try {
      storage?.setItem(KEY, JSON.stringify(finished));
    } catch {
      // Blocked storage: the session still works.
    }
  };
  return {
    finished,
    markFinished(stepId) {
      if (!finished.includes(stepId)) {
        finished.push(stepId);
        persist();
      }
    },
    isFinished: (stepId) => finished.includes(stepId),
    reset() {
      finished = [];
      persist();
    },
  };
}
