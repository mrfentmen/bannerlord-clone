/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { battleJournal, captureSnapshot, saveSnapshot } from "../snapshots.js";

beforeEach(() => localStorage.clear());

const units = [
  { unitId: "u1", name: "Iron Shields", side: "player" as const, x: 10, z: 5, survivors: 41 },
  { unitId: "u2", name: "Rust Horde", side: "enemy" as const, x: -12, z: 3, survivors: 0 },
];

describe("battle map snapshot (solo task 49)", () => {
  it("captures the final map state", () => {
    const snap = captureSnapshot("Dust Bowl", "player", 240, units);
    expect(snap.battleName).toBe("Dust Bowl");
    expect(snap.winner).toBe("player");
    expect(snap.units).toHaveLength(2);
    expect(snap.note).toContain("victory");
  });

  it("saves to the journal, newest first", () => {
    saveSnapshot(captureSnapshot("First", "player", 100, units));
    saveSnapshot(captureSnapshot("Second", "enemy", 150, units));
    const journal = battleJournal();
    expect(journal).toHaveLength(2);
    expect(journal[0]!.battleName).toBe("Second");
  });

  it("survives reload", () => {
    saveSnapshot(captureSnapshot("Dust Bowl", "player", 240, units));
    expect(battleJournal()[0]!.units[0]!.survivors).toBe(41);
  });

  it("copies units so later mutation cannot corrupt the snapshot", () => {
    const snap = captureSnapshot("Dust Bowl", "player", 240, units);
    units[0]!.survivors = 999;
    expect(snap.units[0]!.survivors).toBe(41);
    units[0]!.survivors = 41;
  });
});
