import { describe, expect, it } from "vitest";
import {
  applyPlanTemplate,
  BUILTIN_PLANS,
  deletePlanTemplate,
  loadPlanTemplates,
  savePlanTemplate,
  type PlanTemplate,
} from "../planTemplates.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const PLAN: PlanTemplate = {
  name: "Test plan",
  formation: "line",
  savedAt: "",
  slots: [
    { role: "infantry", dx: 0, dy: 0 },
    { role: "cavalry", dx: 20, dy: 0 },
  ],
};

describe("battle plan templates (solo task 22)", () => {
  it("ships builtin plans", () => {
    expect(BUILTIN_PLANS.length).toBeGreaterThan(0);
    expect(BUILTIN_PLANS.map((p) => p.name)).toContain("Shield wall");
  });

  it("saves and loads a named plan", () => {
    const s = memStorage();
    expect(savePlanTemplate(PLAN, s)).toBe(true);
    const plans = loadPlanTemplates(s);
    expect(plans.map((p) => p.name)).toContain("Test plan");
  });

  it("rejects duplicate names and blank names", () => {
    const s = memStorage();
    expect(savePlanTemplate(PLAN, s)).toBe(true);
    expect(savePlanTemplate(PLAN, s)).toBe(false);
    expect(savePlanTemplate({ ...PLAN, name: "  " }, s)).toBe(false);
  });

  it("deletes player plans but not builtins", () => {
    const s = memStorage();
    savePlanTemplate(PLAN, s);
    expect(deletePlanTemplate("Shield wall", s)).toBe(false);
    expect(deletePlanTemplate("Test plan", s)).toBe(true);
    expect(loadPlanTemplates(s).map((p) => p.name)).not.toContain("Test plan");
  });

  it("applies slots by role, leftovers to the rear", () => {
    const placed = applyPlanTemplate(
      [
        { id: "i1", role: "infantry" },
        { id: "c1", role: "cavalry" },
        { id: "a1", role: "archers" },
      ],
      PLAN,
    );
    expect(placed.find((p) => p.unitId === "i1")).toMatchObject({ dx: 0, dy: 0 });
    expect(placed.find((p) => p.unitId === "c1")).toMatchObject({ dx: 20, dy: 0 });
    const archer = placed.find((p) => p.unitId === "a1")!;
    expect(archer.dy).toBeLessThan(0); // rear
  });

  it("is deterministic", () => {
    const units = [
      { id: "i1", role: "infantry" as const },
      { id: "c1", role: "cavalry" as const },
    ];
    expect(applyPlanTemplate(units, PLAN)).toEqual(applyPlanTemplate(units, PLAN));
  });
});
