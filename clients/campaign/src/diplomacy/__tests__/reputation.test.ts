/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  diplomaticReputation,
  driftReputation,
  recordReputationAction,
  reputationMeterLine,
  reputationTitle,
  REPUTATION_ACTIONS,
} from "../reputation.js";

beforeEach(() => localStorage.clear());

describe("diplomatic reputation meter (solo task 87)", () => {
  it("starts neutral", () => {
    expect(diplomaticReputation()).toBe(50);
    expect(reputationTitle(50)).toBe("Unremarkable");
  });

  it("honorable acts raise it", () => {
    recordReputationAction("kept-treaty");
    recordReputationAction("honored-deal");
    expect(diplomaticReputation()).toBe(57);
  });

  it("betrayals tank it", () => {
    recordReputationAction("betrayed-ally");
    expect(diplomaticReputation()).toBe(30);
    expect(reputationTitle(30)).toBe("Shifty");
  });

  it("clamps at 0..100", () => {
    for (let i = 0; i < 10; i++) recordReputationAction("betrayed-ally");
    expect(diplomaticReputation()).toBe(0);
    expect(reputationTitle(0)).toBe("Oathbreaker");
    for (let i = 0; i < 30; i++) recordReputationAction("kept-treaty");
    expect(diplomaticReputation()).toBe(100);
    expect(reputationTitle(100)).toBe("Honored");
  });

  it("drifts toward neutral", () => {
    recordReputationAction("betrayed-ally");
    driftReputation();
    expect(diplomaticReputation()).toBe(31);
  });

  it("renders a meter line", () => {
    expect(reputationMeterLine()).toContain("50/100");
  });

  it("covers every action", () => {
    expect(REPUTATION_ACTIONS.length).toBeGreaterThanOrEqual(8);
  });

  it("unknown actions throw", () => {
    expect(() => recordReputationAction("nope" as never)).toThrow("unknown reputation action");
  });
});
