import { describe, expect, it } from "vitest";
import { planRearguard, rearguardReportLine } from "../rearguard.js";

const ARMY = [
  { id: "a", name: "Militia", troops: 50 },
  { id: "b", name: "Veterans", troops: 30 },
  { id: "c", name: "Scouts", troops: 10 },
];

describe("retreat with rearguard (solo task 24)", () => {
  it("picks the smallest unit when none is specified", () => {
    const plan = planRearguard(ARMY, undefined, 100)!;
    expect(plan.rearguard.id).toBe("c");
    expect(plan.troopsSaved).toBe(40);
  });

  it("honours an explicit rearguard choice", () => {
    const plan = planRearguard(ARMY, "b", 100)!;
    expect(plan.rearguard.id).toBe("b");
    expect(plan.summary).toContain("Veterans");
  });

  it("refuses a rearguard for a lone unit", () => {
    expect(planRearguard([{ id: "a", name: "Last", troops: 5 }], undefined, 50)).toBeNull();
  });

  it("is deterministic", () => {
    expect(planRearguard(ARMY, undefined, 100)).toEqual(planRearguard(ARMY, undefined, 100));
  });

  it("produces an after-action line naming the sacrifice", () => {
    const plan = planRearguard(ARMY, undefined, 100)!;
    const line = rearguardReportLine(plan);
    expect(line).toContain("Rearguard:");
    expect(line).toContain("Scouts");
    expect(line).toContain("was lost");
  });
});
