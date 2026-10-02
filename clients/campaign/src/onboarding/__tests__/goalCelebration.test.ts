/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createGuidedStart, type StartGoal } from "../guidedStart.js";
import { goalCelebration } from "../goalCelebration.js";

describe("goal completion celebration (solo task 8)", () => {
  it("fires onGoalComplete once per newly completed goal", () => {
    const seen: StartGoal[] = [];
    const g = createGuidedStart({ onGoalComplete: (goal) => seen.push(goal) });
    g.complete("move-party");
    g.complete("move-party"); // already done: no second fire
    g.complete("nope"); // unknown: ignored
    expect(seen.map((s) => s.id)).toEqual(["move-party"]);
    expect(seen[0]!.done).toBe(true);
  });

  it("still accepts a bare storage argument", () => {
    const g = createGuidedStart(null);
    g.complete("recruit");
    expect(g.doneCount()).toBe(1);
  });

  it("celebration shows the goal label and progress", () => {
    const onDismiss = vi.fn();
    const el = goalCelebration({
      goal: { id: "recruit", label: "Recruit your first troops", done: true },
      doneCount: 2,
      totalGoals: 5,
      allDone: false,
      onDismiss,
    });
    expect(el.querySelector('[data-testid="goal-celebration-label"]')?.textContent).toContain(
      "Recruit your first troops",
    );
    expect(el.querySelector('[data-testid="goal-celebration-progress"]')?.textContent).toContain("2 of 5");
    expect(el.getAttribute("role")).toBe("status");
    (el.querySelector('[data-testid="goal-celebration-dismiss"]') as HTMLButtonElement).click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("celebration graduates when all goals are done", () => {
    const el = goalCelebration({
      goal: { id: "swear-fealty", label: "Swear fealty or found your clan", done: true },
      doneCount: 5,
      totalGoals: 5,
      allDone: true,
      onDismiss: () => {},
    });
    expect(el.querySelector('[data-testid="goal-celebration-progress"]')?.textContent).toContain(
      "All starting goals complete",
    );
  });
});
