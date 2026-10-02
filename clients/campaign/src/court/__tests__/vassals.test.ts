/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  addVassal,
  assignVassal,
  shiftLoyalty,
  vassalBonus,
  vassalRow,
  vassals,
} from "../vassals.js";

beforeEach(() => localStorage.clear());

describe("vassal management panel (solo task 60)", () => {
  it("lists vassals with loyalty and assignment", () => {
    addVassal("v1", "Lord Harrow", "Milltown");
    const list = vassals();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Lord Harrow", loyalty: 50, assignment: "unassigned" });
  });

  it("assigns vassals with bonuses", () => {
    addVassal("v1", "Lord Harrow", "Milltown");
    const v = assignVassal("v1", "tax-collector");
    expect(v.assignment).toBe("tax-collector");
    expect(vassalBonus(v)).toBe("tax income +10%");
  });

  it("shifts loyalty within bounds", () => {
    addVassal("v1", "Lord Harrow", "Milltown");
    expect(shiftLoyalty("v1", 30).loyalty).toBe(80);
    expect(shiftLoyalty("v1", -200).loyalty).toBe(0);
    expect(shiftLoyalty("v1", 500).loyalty).toBe(100);
  });

  it("sorts lowest loyalty first", () => {
    addVassal("v1", "Harrow", "Milltown");
    addVassal("v2", "Vex", "Docks");
    shiftLoyalty("v2", -20);
    expect(vassals()[0]!.id).toBe("v2");
  });

  it("formats panel rows", () => {
    addVassal("v1", "Lord Harrow", "Milltown");
    assignVassal("v1", "warden");
    const row = vassalRow(vassals()[0]!);
    expect(row).toContain("Lord Harrow");
    expect(row).toContain("loyalty 50");
    expect(row).toContain("warden");
  });

  it("rejects duplicates and unknown vassals", () => {
    addVassal("v1", "Harrow", "Milltown");
    expect(() => addVassal("v1", "Harrow", "Milltown")).toThrow("already exists");
    expect(() => assignVassal("nope", "warden")).toThrow("unknown vassal");
  });
});
