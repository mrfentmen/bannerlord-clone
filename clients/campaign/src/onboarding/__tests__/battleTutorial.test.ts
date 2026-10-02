import { describe, expect, it } from "vitest";
import {
  completeStep,
  currentStep,
  skipStep,
  startBattleTutorial,
  tutorialProgress,
  TUTORIAL_ACTIONS,
} from "../battleTutorial.js";

describe("battle command tutorial (solo task 91)", () => {
  it("walks through orders and camera steps", () => {
    let t = startBattleTutorial();
    expect(TUTORIAL_ACTIONS).toContain("issue-move-order");
    expect(TUTORIAL_ACTIONS).toContain("pan-camera");
    expect(currentStep(t)!.action).toBe("select-unit");
    for (const action of TUTORIAL_ACTIONS) {
      t = completeStep(t, action);
    }
    expect(t.done).toBe(true);
    expect(currentStep(t)).toBeNull();
  });

  it("wrong actions don't advance", () => {
    let t = startBattleTutorial();
    t = completeStep(t, "zoom-camera");
    expect(currentStep(t)!.action).toBe("select-unit");
  });

  it("steps can be skipped", () => {
    let t = startBattleTutorial();
    t = skipStep(t);
    expect(currentStep(t)!.action).toBe("issue-move-order");
    expect(tutorialProgress(t)).toBeCloseTo(1 / TUTORIAL_ACTIONS.length);
  });

  it("instructions are non-empty", () => {
    const t = startBattleTutorial();
    for (const step of t.steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.instruction.length).toBeGreaterThan(0);
    }
  });

  it("completing after done is a no-op", () => {
    let t = startBattleTutorial();
    for (const action of TUTORIAL_ACTIONS) t = completeStep(t, action);
    const again = completeStep(t, "select-unit");
    expect(again.done).toBe(true);
  });
});
