import { describe, expect, it } from "vitest";
import {
  applyNewGamePlusRecord,
  bankCampaign,
  carryoverLines,
  clearNewGamePlusRecord,
  loadNewGamePlusRecord,
  saveNewGamePlusRecord,
  type BankInput,
} from "../newgameplus.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const INPUT: BankInput = {
  rulerName: "Del",
  renown: 70,
  playerMoney: 4000,
  playerGold: 2000,
  partyMoney: 2000,
  gearNames: ["Father's Rifle"],
  day: 270,
  battlesWon: 15,
};

describe("New Game+ end-to-end (solo task 7)", () => {
  it("banks, persists, offers, applies, and spends the legacy in one loop", () => {
    const storage = memStorage();

    // 1. Campaign 1 ends: bank the legacy and persist it.
    const record = bankCampaign(INPUT);
    expect(record.gold).toBe(2000); // 25% of 8000 liquid
    expect(saveNewGamePlusRecord(record, storage)).toBe(true);

    // 2. New campaign start screen: the banked record is offered.
    const offered = loadNewGamePlusRecord(storage);
    expect(offered).not.toBeNull();
    const lines = carryoverLines(offered!);
    expect(lines.join("\n")).toContain("Del");
    expect(lines.join("\n")).toContain("2,000 gold");

    // 3. Player begins as heir: gold, training and biography carry over.
    const heir = applyNewGamePlusRecord(
      { startingCash: 500, biography: "A young driver.", bonusPointsTotal: 6 },
      offered,
    );
    expect(heir.startingCash).toBe(2500);
    expect(heir.bonusPointsTotal).toBe(8);
    expect(heir.biography).toContain("A young driver.");
    expect(heir.biography).toContain("Scion of Del");

    // 4. Campaign mounts: the legacy is spent exactly once.
    clearNewGamePlusRecord(storage);
    expect(loadNewGamePlusRecord(storage)).toBeNull();
  });

  it("a fresh campaign without a banked record is untouched", () => {
    const storage = memStorage();
    const heir = applyNewGamePlusRecord(
      { startingCash: 500, biography: "A young driver.", bonusPointsTotal: 6 },
      loadNewGamePlusRecord(storage),
    );
    expect(heir).toEqual({ startingCash: 500, biography: "A young driver.", bonusPointsTotal: 6 });
  });

  it("never applies negative gold or bonus points", () => {
    const record = { ...bankCampaign(INPUT), gold: -50, bonusPoints: -3 };
    const heir = applyNewGamePlusRecord(
      { startingCash: 500, biography: "Bio.", bonusPointsTotal: 6 },
      record,
    );
    expect(heir.startingCash).toBe(500);
    expect(heir.bonusPointsTotal).toBe(6);
  });
});
