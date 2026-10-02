/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { activeRivals, rivalGrudge, trackRival } from "../rivals.js";

beforeEach(() => localStorage.clear());

describe("rival tracking (solo task 48)", () => {
  it("tracks escapes across battles", () => {
    trackRival("r1", "Vex Marlowe", "Rust Horde", true);
    trackRival("r1", "Vex Marlowe", "Rust Horde", true);
    const rival = trackRival("r1", "Vex Marlowe", "Rust Horde", true);
    expect(rival.escapes).toBe(3);
    expect(rival.encounters).toBe(3);
    expect(rival.defeated).toBe(false);
  });

  it("defeat closes the saga", () => {
    trackRival("r1", "Vex Marlowe", "Rust Horde", true);
    const rival = trackRival("r1", "Vex Marlowe", "Rust Horde", false);
    expect(rival.defeated).toBe(true);
    expect(activeRivals()).toHaveLength(0);
  });

  it("active rivals sort by escapes", () => {
    trackRival("r1", "Vex", "Horde", true);
    trackRival("r2", "Mara", "Legion", true);
    trackRival("r2", "Mara", "Legion", true);
    const active = activeRivals();
    expect(active[0]!.id).toBe("r2");
  });

  it("grudge summaries read well", () => {
    const rival = trackRival("r1", "Vex Marlowe", "Rust Horde", true);
    trackRival("r1", "Vex Marlowe", "Rust Horde", true);
    expect(rivalGrudge({ ...rival, escapes: 2 })).toContain("escaped you 2 times");
  });

  it("survives reload", () => {
    trackRival("r1", "Vex Marlowe", "Rust Horde", true);
    expect(activeRivals()).toHaveLength(1);
  });
});
