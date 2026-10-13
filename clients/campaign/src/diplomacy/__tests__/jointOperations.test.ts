/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  plannedOperations,
  planJointOperation,
  setOperationStatus,
  type PlanJointOpInput,
} from "../jointOperations.js";

beforeEach(() => localStorage.clear());

const base = (): PlanJointOpInput => ({
  name: "Thunder Strike",
  allyId: "a1",
  allyName: "The Free Cities",
  targetSettlementId: "t1",
  targetSettlementName: "Ironhold",
  targetGarrison: 1000,
  season: 5,
  currentSeason: 3,
  yourForce: 1200,
  allyForce: 1000,
  yourAxis: "north",
  allyAxis: "east",
});

describe("joint operation planning (solo task 85)", () => {
  it("plans a coordinated attack", () => {
    const plan = planJointOperation(base());
    expect(plan.combinedStrength).toBe(2200);
    expect(plan.forceRatio).toBe(2.2);
    expect(plan.line).toContain("Ironhold");
    expect(plan.line).toContain("Free Cities");
    expect(plannedOperations()).toHaveLength(1);
  });

  it("rejects infeasible plans", () => {
    expect(() => planJointOperation({ ...base(), yourForce: 0 })).toThrow("positive force");
    expect(() => planJointOperation({ ...base(), season: 3 })).toThrow("future season");
    expect(() => planJointOperation({ ...base(), yourAxis: "up" as never })).toThrow("unknown axis");
  });

  it("warns on thin odds", () => {
    const plan = planJointOperation({ ...base(), targetGarrison: 5000 });
    expect(plan.line).toContain("Thin odds");
  });

  it("tracks execution and cancellation", () => {
    const plan = planJointOperation(base());
    setOperationStatus(plan.operation.id, "executed");
    expect(plannedOperations()).toHaveLength(0);
  });

  it("rejects unknown operations", () => {
    expect(() => setOperationStatus("nope", "executed")).toThrow("no operation");
  });
});
