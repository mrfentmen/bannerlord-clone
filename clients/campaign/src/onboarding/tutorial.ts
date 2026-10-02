/**
 * Task 116: interactive tutorial. Contextual hints queue up during the
 * first campaign hour; dismissing a hint persists so it never repeats.
 * The campaign layer reports the current context; this module decides
 * which hints to show.
 */

import type { TutorialHint } from "./types.js";

const FIRST_HOUR_MINUTES = 60;

export interface Tutorial {
  /** Hints for this context that haven't been dismissed. */
  hintsFor(context: string, elapsedMinutes: number): TutorialHint[];
  dismiss(hintId: string): void;
  /** Skip the whole tutorial at any step (task 121 acceptance). */
  skip(): void;
  skipped(): boolean;
  dismissed(): string[];
  reset(): void;
}

export function createTutorial(hints: TutorialHint[]): Tutorial {
  const dismissedSet = new Set<string>();
  let skipped = false;
  return {
    skip() {
      skipped = true;
    },
    skipped: () => skipped,
    hintsFor(context, elapsedMinutes) {
      if (skipped || elapsedMinutes > FIRST_HOUR_MINUTES) return [];
      return hints.filter((h) => h.context === context && !dismissedSet.has(h.id));
    },
    dismiss(hintId) {
      dismissedSet.add(hintId);
    },
    dismissed: () => [...dismissedSet],
    reset() {
      dismissedSet.clear();
      skipped = false;
    },
  };
}

/** The default first-hour hint set. */
export const DEFAULT_HINTS: TutorialHint[] = [
  { id: "move-camera", context: "map", text: "Drag to move the camera. Scroll or pinch to zoom." },
  { id: "select-party", context: "map", text: "Click your party banner to select it, then right-click to move." },
  { id: "open-menu", context: "map", text: "Press Esc or click the menu button for clan, court, and help." },
  { id: "first-battle-orders", context: "battle", text: "Select a group (1-9), then right-click the ground to order it there." },
  { id: "first-battle-charge", context: "battle", text: "Press F to order a charge when the enemy closes in." },
  { id: "after-action", context: "after-action", text: "Review casualties here, then choose your next move." },
  { id: "recruit", context: "settlement", text: "Visit the tavern to recruit companions and troops." },
  { id: "taxes", context: "economy", text: "Set tax rates per fief — high taxes pay coin but cost loyalty." },
];
