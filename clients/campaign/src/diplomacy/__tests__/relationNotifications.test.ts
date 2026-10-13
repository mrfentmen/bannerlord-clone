/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  adjustRelation,
  relationNotifications,
  relationWith,
} from "../relationNotifications.js";

beforeEach(() => localStorage.clear());

describe("relation change notifications (solo task 81)", () => {
  it("every change shows its reason", () => {
    const n = adjustRelation("f1", "Ironhold", -15, "Raided their caravan", 3);
    expect(n.line).toContain("Ironhold");
    expect(n.line).toContain("Raided their caravan");
    expect(n.line).toContain("-15");
  });

  it("tracks the new standing", () => {
    adjustRelation("f1", "Ironhold", 20, "Gift of horses", 1);
    adjustRelation("f1", "Ironhold", -5, "Border skirmish", 2);
    expect(relationWith("f1")).toBe(15);
    const all = relationNotifications();
    expect(all).toHaveLength(2);
    expect(all[0]!.reason).toBe("Border skirmish");
  });

  it("clamps at -100..100", () => {
    adjustRelation("f1", "Ironhold", 500, "Huge gift", 1);
    expect(relationWith("f1")).toBe(100);
    adjustRelation("f1", "Ironhold", -900, "Betrayal", 2);
    expect(relationWith("f1")).toBe(-100);
  });

  it("requires a reason", () => {
    expect(() => adjustRelation("f1", "Ironhold", 5, "  ", 1)).toThrow("reason is required");
  });

  it("defaults unknown factions to 0", () => {
    expect(relationWith("nobody")).toBe(0);
  });
});
