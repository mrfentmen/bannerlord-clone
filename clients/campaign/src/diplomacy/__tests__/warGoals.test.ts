/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  activeWars,
  declareWarGoal,
  exhaustedWars,
  tickWarWeariness,
  wearinessPerSeason,
  WAR_GOALS,
} from "../warGoals.js";

beforeEach(() => localStorage.clear());

describe("war goal declaration (solo task 83)", () => {
  it("offers four goals", () => {
    expect(WAR_GOALS).toHaveLength(4);
  });

  it("undeclared wars exhaust fastest", () => {
    expect(wearinessPerSeason(null)).toBeGreaterThan(wearinessPerSeason("liberation"));
    expect(wearinessPerSeason(null)).toBeGreaterThan(wearinessPerSeason("conquest"));
  });

  it("weariness accumulates per season", () => {
    declareWarGoal("e1", "Ironhold", "conquest", 1);
    tickWarWeariness();
    tickWarWeariness();
    const [war] = activeWars();
    expect(war!.weariness).toBe(wearinessPerSeason("conquest") * 2);
  });

  it("wars exhaust at 100", () => {
    declareWarGoal("e1", "Ironhold", "humiliation", 1);
    for (let i = 0; i < 20; i++) tickWarWeariness();
    expect(exhaustedWars()).toHaveLength(1);
    expect(activeWars()[0]!.weariness).toBe(100);
  });

  it("re-declaring updates the goal", () => {
    declareWarGoal("e1", "Ironhold", "conquest", 1);
    declareWarGoal("e1", "Ironhold", "tribute", 2);
    expect(activeWars()).toHaveLength(1);
    expect(activeWars()[0]!.goal).toBe("tribute");
  });

  it("unknown goals throw", () => {
    expect(() => declareWarGoal("e1", "Ironhold", "picnic" as never, 1)).toThrow("unknown war goal");
  });
});
