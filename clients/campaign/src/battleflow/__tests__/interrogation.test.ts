import { describe, expect, it } from "vitest";
import { interrogate } from "../interrogation.js";

const grunt = { id: "p1", name: "Captured Scout", rank: 1 as const };
const captain = { id: "p2", name: "Captured Captain", rank: 3 as const };

describe("prisoner interrogation (solo task 44)", () => {
  it("a skilled interrogator cracks a grunt", () => {
    const outcomes = new Set(
      Array.from({ length: 20 }, (_, s) => interrogate(grunt, 10, s).result),
    );
    expect(outcomes.has("success")).toBe(true);
  });

  it("an unskilled interrogator often fails", () => {
    const outcomes = Array.from({ length: 20 }, (_, s) => interrogate(captain, 0, s).result);
    expect(outcomes.some((r) => r !== "success")).toBe(true);
  });

  it("higher rank resists more", () => {
    const gruntWins = Array.from({ length: 30 }, (_, s) => interrogate(grunt, 5, s).result).filter(
      (r) => r === "success",
    ).length;
    const captainWins = Array.from({ length: 30 }, (_, s) => interrogate(captain, 5, s).result).filter(
      (r) => r === "success",
    ).length;
    expect(gruntWins).toBeGreaterThanOrEqual(captainWins);
  });

  it("false intel is flagged", () => {
    // Seed 5 deterministically produces false intel from the captain.
    const o = interrogate(captain, 0, 5);
    expect(o.result).toBe("false-intel");
    if (o.result === "false-intel") {
      expect(o.intel).toContain("suspicion");
    }
  });

  it("is deterministic per seed", () => {
    expect(interrogate(grunt, 5, 42)).toEqual(interrogate(grunt, 5, 42));
  });

  it("success intel names the prisoner", () => {
    const o = interrogate(grunt, 10, 1);
    expect(o.prisonerId).toBe("p1");
  });
});
