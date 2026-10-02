import { describe, expect, it } from "vitest";
import { alertResponses, raiseAlert, respondToAlert, SPY_ALERT_RESPONSES } from "../spyAlerts.js";

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
    const alert = raiseAlert("Mole", "harbor", "Harbor", 100);
    const wins = Array.from({ length: 20 }, (_, s) => respondToAlert(alert, "arrest", s)).filter(
      (r) => r.success,
    ).length;
    expect(wins).toBeGreaterThan(15);
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
