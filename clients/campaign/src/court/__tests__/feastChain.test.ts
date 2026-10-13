import { describe, expect, it } from "vitest";
import { FEAST_STAGES, feastChoices, resolveFeastStage } from "../feastChain.js";

const guests = [
  { id: "g1", name: "Lord Harrow" },
  { id: "g2", name: "Lady Vex" },
];

describe("family feast event chain (solo task 52)", () => {
  it("has five stages with choices", () => {
    expect(FEAST_STAGES).toHaveLength(5);
    for (const stage of FEAST_STAGES) {
      expect(feastChoices(stage).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("resolves choices into outcomes", () => {
    const o = resolveFeastStage(99, "arrival", "greet-personally", guests);
    expect(o.text).toBeTruthy();
    expect(o.relationDeltas["g1"]).toBe(4);
    expect(o.prestige).toBe(2);
  });

  it("gold costs apply", () => {
    const o = resolveFeastStage(99, "entertainment", "pay-minstrels", guests);
    expect(o.gold).toBe(-150);
  });

  it("taking sides splits relations", () => {
    const o = resolveFeastStage(99, "incident", "take-side", guests);
    expect(o.relationDeltas["g1"]).toBe(6);
    expect(o.relationDeltas["g2"]).toBe(-4);
  });

  it("unknown choices throw", () => {
    expect(() => resolveFeastStage(99, "arrival", "nope", guests)).toThrow("unknown feast choice");
  });

  it("is deterministic per seed", () => {
    expect(resolveFeastStage(99, "toast", "toast-future", guests)).toEqual(
      resolveFeastStage(99, "toast", "toast-future", guests),
    );
  });
});
