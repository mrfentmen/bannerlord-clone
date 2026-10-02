/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { dismissSpyTip, resetSpyTips, spyTip, SPY_ACTIONS } from "../spyTips.js";

beforeEach(() => localStorage.clear());

describe("espionage tutorial tips (solo task 70)", () => {
  it("covers every spy action", () => {
    expect(SPY_ACTIONS.length).toBeGreaterThanOrEqual(8);
    for (const action of SPY_ACTIONS) {
      expect(spyTip(action)).toBeTruthy();
    }
  });

  it("shows once, then never again", () => {
    expect(spyTip("sweep")).not.toBeNull();
    dismissSpyTip("sweep");
    expect(spyTip("sweep")).toBeNull();
    // Other tips unaffected.
    expect(spyTip("place-spy")).not.toBeNull();
  });

  it("reset brings tips back", () => {
    dismissSpyTip("sweep");
    resetSpyTips();
    expect(spyTip("sweep")).not.toBeNull();
  });

  it("dismiss is idempotent", () => {
    dismissSpyTip("sweep");
    dismissSpyTip("sweep");
    expect(spyTip("sweep")).toBeNull();
  });

  it("unknown actions throw", () => {
    expect(() => spyTip("nope" as never)).toThrow("unknown spy action");
  });

  it("survives reload", () => {
    dismissSpyTip("sweep");
    expect(spyTip("sweep")).toBeNull();
  });
});
