import { describe, expect, it } from "vitest";
import {
  generateBulletins,
  radioBedUrl,
  RADIO_BEDS,
  stationIntro,
  stationOutro,
} from "../radio.js";
import type { TownState } from "../../data/types.js";

function town(overrides: Partial<TownState>): TownState {
  return {
    id: "t1",
    settlementId: "s1",
    name: "Testville",
    klass: "town",
    holderId: null,
    holderName: "no one",
    population: 5000,
    workers: 2000,
    foodStock: 100000,
    foodProduction: 1000,
    foodDemand: 900,
    medicineStock: 100,
    sanitation: 0.7,
    infected: 0,
    crowding: 0.2,
    unrest: 0.1,
    loyalty: 0.8,
    prosperity: 0.5,
    taxRate: 0.1,
    garrison: 50,
    garrisonConduct: 0.8,
    roadSafety: 0.8,
    informationTrust: 0.7,
    money: 1000,
    gold: 10,
    metal: 100,
    ...overrides,
  } as TownState;
}

describe("generateBulletins", () => {
  it("reports unrest above threshold", () => {
    const out = generateBulletins([town({ name: "Angrytown", unrest: 0.9 })], 4);
    expect(out.some((b) => b.kind === "unrest" && b.headline.includes("Angrytown"))).toBe(true);
  });

  it("reports food shortage", () => {
    const out = generateBulletins(
      [town({ name: "Hungryville", foodStock: 5000, foodDemand: 1000 })],
      4,
    );
    expect(out.some((b) => b.kind === "food")).toBe(true);
  });

  it("reports disease outbreaks", () => {
    const out = generateBulletins([town({ name: "Sickbay", infected: 0.2 })], 4);
    expect(out.some((b) => b.kind === "health")).toBe(true);
  });

  it("reports prosperity booms", () => {
    const out = generateBulletins([town({ name: "Boomtown", prosperity: 0.9 })], 4);
    expect(out.some((b) => b.kind === "prosperity")).toBe(true);
  });

  it("reports dangerous roads", () => {
    const out = generateBulletins([town({ name: "Banditry", roadSafety: 0.1 })], 4);
    expect(out.some((b) => b.kind === "roads")).toBe(true);
  });

  it("falls back to a quiet-day bulletin when nothing is newsworthy", () => {
    const out = generateBulletins([town({})], 4);
    expect(out.length).toBe(1);
    expect(out[0]?.kind).toBe("general");
  });

  it("is deterministic for the same snapshot", () => {
    const towns = [
      town({ name: "B", unrest: 0.7 }),
      town({ name: "A", unrest: 0.7 }),
    ];
    const a = generateBulletins(towns, 4).map((b) => b.headline);
    const b = generateBulletins(towns, 4).map((b) => b.headline);
    expect(a).toEqual(b);
  });

  it("never invents people, only places", () => {
    const out = generateBulletins([town({ name: "Angrytown", unrest: 0.9 })], 4);
    for (const b of out) {
      expect(b.text).toContain("Angrytown");
    }
  });
});

describe("station identity", () => {
  it("intro and outro name the station", () => {
    expect(stationIntro()).toContain("KHRD");
    expect(stationOutro()).toContain("KHRD");
  });

  it("ships three era beds", () => {
    expect(RADIO_BEDS.length).toBe(3);
    expect(radioBedUrl("heartland-rock")).toBe("audio/radio/bed-heartland-rock.mp3");
    expect(radioBedUrl("night-synth")).toBe("audio/radio/bed-night-synth.mp3");
  });
});
