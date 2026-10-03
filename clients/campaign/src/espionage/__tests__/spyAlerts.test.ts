import { describe, expect, it } from "vitest";
import { alertResponses, raiseAlert, respondToAlert, SPY_ALERT_RESPONSES } from "../spyAlerts.js";
import type { EnemySpyAlert } from "../spyAlerts.js";

describe("enemy spy alerts (solo task 69)", () => {
  it("raises alerts with certainty", () => {
    const alert = raiseAlert("Mole", "harbor", "Harbor", 80);
    expect(alert.line).toContain("Mole");
    expect(alert.line).toContain("Harbor");
    expect(alert.certainty).toBe(80);
  });

  it("offers three responses", () => {
    expect(SPY_ALERT_RESPONSES).toHaveLength(3);
    expect(alertResponses().every((r) => r.blurb.length > 0)).toBe(true);
  });

  it("arrest usually succeeds at high certainty", () => {
    // The alert id is pinned rather than taken from `raiseAlert`, which stamps one
    // from the clock and `Math.random()`. An unpinned id made this a 20-draw
    // Monte Carlo that failed ~4% of runs (P(<=15 wins) for a 0.9 chance) without
    // anything changing. Fixed id and a wider sample: the assertion is now a
    // statement about the implemented odds that cannot flake.
    const alert: EnemySpyAlert = {
      id: "alert-fixed-arrest",
      spyName: "Mole",
      postId: "harbor",
      postName: "Harbor",
      certainty: 100,
      line: "",
    };
    // The arrest chance at certainty 100 is 0.9, so 200 seeds centre on 180 wins
    // with a spread of about 4. A floor of 150 is a true statement of "usually",
    // and sits far enough below the mean to hold for any id.
    const wins = Array.from({ length: 200 }, (_, s) => respondToAlert(alert, "arrest", s)).filter(
      (r) => r.success,
    ).length;
    expect(wins).toBeGreaterThan(150);
  });

  it("turning is risky", () => {
    const alert = raiseAlert("Mole", "harbor", "Harbor", 50);
    const results = Array.from({ length: 40 }, (_, s) => respondToAlert(alert, "turn", s));
    expect(results.some((r) => !r.success)).toBe(true);
    expect(results.some((r) => r.success)).toBe(true);
  });

  it("resolutions narrate the outcome", () => {
    const alert = raiseAlert("Mole", "harbor", "Harbor", 80);
    const r = respondToAlert(alert, "watch", 7);
    expect(r.line).toContain("Mole");
  });

  it("unknown responses throw", () => {
    const alert = raiseAlert("Mole", "harbor", "Harbor", 80);
    expect(() => respondToAlert(alert, "nope" as never, 1)).toThrow("unknown alert response");
  });

  it("is deterministic per seed", () => {
    const alert = raiseAlert("Mole", "harbor", "Harbor", 80);
    expect(respondToAlert(alert, "watch", 7)).toEqual(respondToAlert(alert, "watch", 7));
  });
});
