import { describe, expect, it } from "vitest";
import {
  GOLD_CARRYOVER_RATE,
  LEGACY_BONUS_POINTS,
  bankCampaign,
  carryoverLines,
  clearNewGamePlusRecord,
  legacyBiographyLine,
  loadNewGamePlusRecord,
  saveNewGamePlusRecord,
  type NewGamePlusRecord,
} from "../newgameplus.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const INPUT = {
  rulerName: "Asha the Bold",
  renown: 1250,
  playerMoney: 4000,
  playerGold: 3000,
  partyMoney: 1000,
  gearNames: [],
  day: 270,
  battlesWon: 34,
};

describe("bankCampaign", () => {
  it("carries 25% of liquid wealth as gold", () => {
    const r = bankCampaign(INPUT);
    // liquid = 4000 + 3000 + 1000 = 8000; 25% = 2000
    expect(r.gold).toBe(2000);
    expect(GOLD_CARRYOVER_RATE).toBe(0.25);
  });

  it("records renown, seasons, battles and the ruler name", () => {
    const r = bankCampaign(INPUT);
    expect(r.renown).toBe(1250);
    expect(r.seasonsPlayed).toBe(3); // 270 / 90
    expect(r.battlesWon).toBe(34);
    expect(r.rulerName).toBe("Asha the Bold");
  });

  it("grants the documented legacy training bonus", () => {
    expect(bankCampaign(INPUT).bonusPoints).toBe(LEGACY_BONUS_POINTS);
    expect(LEGACY_BONUS_POINTS).toBe(2);
  });

  it("clamps hostile inputs to zero instead of breaking", () => {
    const r = bankCampaign({
      rulerName: "  ",
      renown: -50,
      playerMoney: Number.NaN,
      playerGold: Number.POSITIVE_INFINITY,
      partyMoney: -10,
      gearNames: ["  ", "Champion's Sabre"],
      day: -5,
      battlesWon: 3.9,
    });
    expect(r.renown).toBe(0);
    expect(r.gold).toBe(0);
    expect(r.rulerName).toBe("a forgotten ruler");
    expect(r.gear).toEqual(["Champion's Sabre"]);
    expect(r.seasonsPlayed).toBe(0);
    expect(r.battlesWon).toBe(3);
  });
});

describe("carryoverLines", () => {
  it("shows renown, gold, training and heirlooms for the start screen", () => {
    const r: NewGamePlusRecord = {
      ...bankCampaign(INPUT),
      gear: ["Champion's Sabre"],
    };
    const lines = carryoverLines(r);
    expect(lines.join("\n")).toContain("Asha the Bold");
    expect(lines.join("\n")).toContain("1250 renown");
    expect(lines.join("\n")).toContain("2,000 gold");
    expect(lines.join("\n")).toContain("+2 focus points");
    expect(lines.join("\n")).toContain("Champion's Sabre");
  });

  it("omits the heirloom line when there is no gear", () => {
    const lines = carryoverLines(bankCampaign(INPUT));
    expect(lines.some((l) => l.startsWith("Heirlooms:"))).toBe(false);
  });
});

describe("legacyBiographyLine", () => {
  it("names the ruler and their renown", () => {
    const line = legacyBiographyLine(bankCampaign(INPUT));
    expect(line).toContain("Asha the Bold");
    expect(line).toContain("1250 renown");
  });
});

describe("record storage", () => {
  it("round-trips through storage", () => {
    const s = memStorage();
    const record = bankCampaign(INPUT);
    expect(saveNewGamePlusRecord(record, s)).toBe(true);
    expect(loadNewGamePlusRecord(s)).toEqual(record);
  });

  it("returns null when nothing is banked", () => {
    expect(loadNewGamePlusRecord(memStorage())).toBeNull();
  });

  it("discards corrupt records instead of throwing", () => {
    const s = memStorage();
    s.setItem("fentmen.newgameplus.v1", "{not json");
    expect(loadNewGamePlusRecord(s)).toBeNull();
    s.setItem("fentmen.newgameplus.v1", JSON.stringify({ version: 2, nope: true }));
    expect(loadNewGamePlusRecord(s)).toBeNull();
  });

  it("clear removes the record", () => {
    const s = memStorage();
    saveNewGamePlusRecord(bankCampaign(INPUT), s);
    clearNewGamePlusRecord(s);
    expect(loadNewGamePlusRecord(s)).toBeNull();
  });
});
