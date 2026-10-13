/**
 * Goal completion celebration (Rowan solo task 8).
 *
 * When a guided-start goal is checked off, the game acknowledges it: a
 * compact toast-panel with the goal label, the running count, and — when
 * all five are done — the graduation line. The host mounts it from the
 * onGoalComplete callback and dismisses it after a few seconds.
 */

import { h } from "../ui/dom.js";
import type { StartGoal } from "./guidedStart.js";

export interface GoalCelebrationOptions {
  goal: StartGoal;
  doneCount: number;
  totalGoals: number;
  allDone: boolean;
  onDismiss: () => void;
}

export function goalCelebration(options: GoalCelebrationOptions): HTMLElement {
  const { goal, doneCount, totalGoals, allDone } = options;
  const root = h(
    "div",
    {
      class: "goal-celebration",
      role: "status",
      "aria-live": "polite",
      "data-testid": "goal-celebration",
    },
    h("p", { class: "goal-celebration__headline", "data-testid": "goal-celebration-label" }, `Goal complete: ${goal.label}`),
    h(
      "p",
      { class: "caption", "data-testid": "goal-celebration-progress" },
      allDone
        ? "All starting goals complete — the coast is yours to take."
        : `${doneCount} of ${totalGoals} starting goals complete.`,
    ),
  );
  const dismiss = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "goal-celebration-dismiss" },
    "Dismiss",
  );
  dismiss.addEventListener("click", () => options.onDismiss());
  root.appendChild(dismiss);
  return root;
}
