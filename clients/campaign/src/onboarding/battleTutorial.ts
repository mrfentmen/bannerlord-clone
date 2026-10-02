/**
 * Battle command tutorial (Rowan solo task 91).
 *
 * An interactive step-by-step tutorial for battle orders and the camera:
 * each step names an action (issue an order, select a unit, pan the
 * camera, rotate, zoom), the player performs it, and the tutorial
 * advances. Steps can be skipped; progress is tracked. Pure model — the
 * battle layer reports completions via `completeStep`.
 */

export type TutorialAction =
  | "select-unit"
  | "issue-move-order"
  | "issue-attack-order"
  | "pan-camera"
  | "rotate-camera"
  | "zoom-camera";

export const TUTORIAL_ACTIONS: TutorialAction[] = [
  "select-unit",
  "issue-move-order",
  "issue-attack-order",
  "pan-camera",
  "rotate-camera",
  "zoom-camera",
];

export interface TutorialStep {
  action: TutorialAction;
  title: string;
  instruction: string;
  completed: boolean;
  skipped: boolean;
}

const STEP_CONTENT: Record<TutorialAction, { title: string; instruction: string }> = {
  "select-unit": {
    title: "Select a unit",
    instruction: "Click one of your units on the battlefield to select it.",
  },
  "issue-move-order": {
    title: "Issue a move order",
    instruction: "With a unit selected, right-click open ground to move it there.",
  },
  "issue-attack-order": {
    title: "Issue an attack order",
    instruction: "With a unit selected, right-click an enemy to order an attack.",
  },
  "pan-camera": {
    title: "Pan the camera",
    instruction: "Move the mouse to the screen edge (or drag with the middle button) to pan.",
  },
  "rotate-camera": {
    title: "Rotate the camera",
    instruction: "Hold the right mouse button and drag to rotate the view.",
  },
  "zoom-camera": {
    title: "Zoom the camera",
    instruction: "Scroll the mouse wheel to zoom in and out.",
  },
};

export interface BattleTutorial {
  steps: TutorialStep[];
  /** Index of the current step, or -1 when done. */
  current: number;
  done: boolean;
}

/** Start a fresh battle-command tutorial. */
export function startBattleTutorial(): BattleTutorial {
  return {
    steps: TUTORIAL_ACTIONS.map((action) => ({
      action,
      title: STEP_CONTENT[action].title,
      instruction: STEP_CONTENT[action].instruction,
      completed: false,
      skipped: false,
    })),
    current: 0,
    done: false,
  };
}

/** The step the player should do now, or null when done. */
export function currentStep(tutorial: BattleTutorial): TutorialStep | null {
  if (tutorial.done || tutorial.current < 0) return null;
  return tutorial.steps[tutorial.current] ?? null;
}

/** Report that the player performed an action. Advances when it matches. */
export function completeStep(tutorial: BattleTutorial, action: TutorialAction): BattleTutorial {
  const step = currentStep(tutorial);
  if (!step) return tutorial;
  if (step.action !== action) return tutorial;
  const steps = tutorial.steps.map((s, i) =>
    i === tutorial.current ? { ...s, completed: true } : s,
  );
  const next = tutorial.current + 1;
  return { steps, current: next >= steps.length ? -1 : next, done: next >= steps.length };
}

/** Skip the current step. */
export function skipStep(tutorial: BattleTutorial): BattleTutorial {
  const step = currentStep(tutorial);
  if (!step) return tutorial;
  const steps = tutorial.steps.map((s, i) =>
    i === tutorial.current ? { ...s, skipped: true } : s,
  );
  const next = tutorial.current + 1;
  return { steps, current: next >= steps.length ? -1 : next, done: next >= steps.length };
}

/** Fraction of steps completed or skipped, 0..1. */
export function tutorialProgress(tutorial: BattleTutorial): number {
  const finished = tutorial.steps.filter((s) => s.completed || s.skipped).length;
  return tutorial.steps.length === 0 ? 1 : finished / tutorial.steps.length;
}
