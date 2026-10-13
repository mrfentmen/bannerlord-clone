import { describe, expect, it } from "vitest";
import { schemeTimeline } from "../schemeTimeline.js";
import { planScheme } from "../schemes.js";

describe("scheme progress timeline (solo task 65)", () => {
  it("has four stages", () => {
    const t = schemeTimeline({ ...planScheme("sabotage", "depot"), progress: 0 });
    expect(t.stages).toHaveLength(4);
    expect(t.stages[0]!.name).toBe("Planning");
    expect(t.stages[0]!.current).toBe(true);
  });

  it("marks done and current stages", () => {
    const t = schemeTimeline({ ...planScheme("sabotage", "depot"), progress: 60 });
    expect(t.stages[0]!.done).toBe(true);
    expect(t.stages[1]!.done).toBe(true);
    expect(t.stages[2]!.current).toBe(true);
    expect(t.stages[2]!.completion).toBe(40);
  });

  it("estimates seasons to completion", () => {
    const scheme = planScheme("sabotage", "depot"); // rate 25/season
    const t = schemeTimeline({ ...scheme, progress: 50 });
    expect(t.etaSeasons).toBe(2);
    expect(t.line).toContain("2 seasons");
  });

  it("handles stalled schemes", () => {
    const t = schemeTimeline({ ...planScheme("sabotage", "depot"), progress: 50, rate: 0 });
    expect(t.etaSeasons).toBeNull();
    expect(t.line).toContain("stalled");
  });

  it("complete schemes finish this season", () => {
    const t = schemeTimeline({ ...planScheme("sabotage", "depot"), progress: 100 });
    expect(t.etaSeasons).toBe(0);
    expect(t.stages.every((s) => s.done)).toBe(true);
  });
});
