/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelPriceAlert,
  checkPriceAlerts,
  pendingPriceAlerts,
  priceAlertLine,
  setPriceAlert,
} from "../priceAlerts.js";

beforeEach(() => localStorage.clear());

const prices = { grain: 6 };
const priceAt = () => prices.grain;

describe("market price alerts (solo task 73)", () => {
  it("fires when a below target is hit", () => {
    setPriceAlert("grain", "s1", "Town", 5, "below");
    expect(checkPriceAlerts(priceAt)).toHaveLength(0);
    prices.grain = 4;
    const fired = checkPriceAlerts(priceAt);
    expect(fired).toHaveLength(1);
    expect(priceAlertLine(fired[0]!)).toContain("fell to 5");
  });

  it("fires when an above target is hit", () => {
    setPriceAlert("grain", "s1", "Town", 8, "above");
    prices.grain = 9;
    const fired = checkPriceAlerts(priceAt);
    expect(fired).toHaveLength(1);
    expect(priceAlertLine(fired[0]!)).toContain("reached 8");
  });

  it("fired alerts are consumed", () => {
    setPriceAlert("grain", "s1", "Town", 8, "above");
    prices.grain = 9;
    checkPriceAlerts(priceAt);
    expect(checkPriceAlerts(priceAt)).toHaveLength(0);
    expect(pendingPriceAlerts()).toHaveLength(0);
  });

  it("cancels pending alerts", () => {
    const a = setPriceAlert("grain", "s1", "Town", 8, "above");
    expect(cancelPriceAlert(a.id)).toBe(true);
    expect(pendingPriceAlerts()).toHaveLength(0);
    expect(cancelPriceAlert("missing")).toBe(false);
  });

  it("rejects bad targets", () => {
    expect(() => setPriceAlert("grain", "s1", "Town", 0, "above")).toThrow("positive");
    expect(() => setPriceAlert("grain", "s1", "Town", 5, "sideways" as never)).toThrow("unknown direction");
  });
});
