/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { abandonScheme, schemes, startScheme, tickSchemes } from "../schemeStore.js";

beforeEach(() => localStorage.clear());

describe("scheme store (integration)", () => {
  it("persists planned schemes", () => {
    startScheme("steal-plans", "Brooklyn");
    const all = schemes();
    expect(all).toHaveLength(1);
    expect(all[0]?.target).toBe("Brooklyn");
    expect(all[0]?.progress).toBe(0);
  });

  it("ticks progress and can discover a scheme", () => {
    startScheme("sabotage", "Queens");
    // Roll 0 so discovery is certain when odds allow; heat maxed.
    tickSchemes(0, 100, () => 0);
    const [s] = schemes();
    expect(s?.progress).toBeGreaterThan(0);
    expect(s?.discovered).toBe(true);
  });

  it("rolls with injected randomness", () => {
    startScheme("sow-dissent", "Harlem");
    // Roll 1 so nothing is ever discovered.
    tickSchemes(100, 0, () => 1);
    expect(schemes()[0]?.discovered).toBe(false);
    expect(schemes()[0]?.progress).toBeGreaterThan(0);
  });

  it("abandons schemes", () => {
    const s = startScheme("assassinate", "Midtown");
    expect(abandonScheme(s.id)).toBe(true);
    expect(schemes()).toHaveLength(0);
    expect(abandonScheme("missing")).toBe(false);
  });
});
