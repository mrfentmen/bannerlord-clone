import { describe, expect, it } from "vitest";
import { createClanRoles } from "../roles.js";

const aldric = { id: "m1", name: "Aldric", skills: { stewardship: 80, scouting: 20 } };
const bryn = { id: "m2", name: "Bryn", skills: { stewardship: 30, scouting: 70 } };

describe("clan role assignments (solo task 51)", () => {
  it("assigns offices with skill-scaled bonuses", () => {
    const roles = createClanRoles();
    roles.assign(aldric, "steward");
    const a = roles.assignmentFor("steward")!;
    expect(a.memberName).toBe("Aldric");
    expect(a.bonus).toContain("tax income +20%");
    expect(a.magnitude).toBeCloseTo(0.8, 5);
  });

  it("quartermaster reduces wages", () => {
    const roles = createClanRoles();
    roles.assign(aldric, "quartermaster");
    expect(roles.assignmentFor("quartermaster")!.bonus).toContain("wages −20%");
  });

  it("reassigning moves the office", () => {
    const roles = createClanRoles();
    roles.assign(aldric, "scout");
    roles.assign(bryn, "scout");
    expect(roles.assignmentFor("scout")!.memberName).toBe("Bryn");
    expect(roles.assignments()).toHaveLength(1);
  });

  it("unassigning clears the office", () => {
    const roles = createClanRoles();
    roles.assign(aldric, "steward");
    roles.unassign("steward");
    expect(roles.assignmentFor("steward")).toBeNull();
  });

  it("unknown roles throw", () => {
    const roles = createClanRoles();
    expect(() => roles.assign(aldric, "jester" as never)).toThrow("unknown clan role");
  });
});
