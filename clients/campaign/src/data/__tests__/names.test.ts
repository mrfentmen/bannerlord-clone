/**
 * Tests for the ethnicity-based name generator (Rowan).
 */

import { describe, expect, it } from "vitest";
import {
  createNameRng,
  generateNotableName,
  generateStartingLeaders,
  NAME_ETHNICITY_IDS,
  personName,
  randomEthnicityId,
  titledName,
} from "../names.js";
import { ETHNICITIES } from "../ethnicities.js";

describe("name generator", () => {
  it("covers exactly the ten playable ethnicities", () => {
    const playable = ETHNICITIES.map((e) => e.id).sort();
    expect([...NAME_ETHNICITY_IDS].sort()).toEqual(playable);
  });

  it("is deterministic per seed", () => {
    const a = personName("irish", createNameRng(42));
    const b = personName("irish", createNameRng(42));
    expect(a).toEqual(b);
  });

  it("varies across seeds", () => {
    const names = new Set(
      Array.from({ length: 20 }, (_, i) => personName("mexican", createNameRng(i)).fullName),
    );
    expect(names.size).toBeGreaterThan(10);
  });

  it("builds a well-formed person", () => {
    const p = personName("korean", createNameRng(7), "female");
    expect(p.gender).toBe("female");
    expect(p.ethnicityId).toBe("korean");
    expect(p.fullName).toBe(`${p.firstName} ${p.lastName}`);
    expect(p.firstName.length).toBeGreaterThan(0);
    expect(p.lastName.length).toBeGreaterThan(0);
  });

  it("falls back gracefully on an unknown ethnicity id", () => {
    const p = personName("nope-not-real", createNameRng(1));
    expect(p.firstName.length).toBeGreaterThan(0);
    expect(p.lastName.length).toBeGreaterThan(0);
  });

  it("randomEthnicityId only returns real ethnicity ids", () => {
    const rng = createNameRng(99);
    for (let i = 0; i < 50; i++) {
      expect(NAME_ETHNICITY_IDS).toContain(randomEthnicityId(rng));
    }
  });

  it("generateNotableName returns a complete notable name", () => {
    const n = generateNotableName(createNameRng(1234));
    expect(NAME_ETHNICITY_IDS).toContain(n.ethnicityId);
    expect(n.fullName.split(" ").length).toBeGreaterThanOrEqual(2);
  });

  it("titledName assigns a fitting title per role", () => {
    const king = titledName("king", createNameRng(5));
    expect(["Kingpin", "Don", "Chairman", "Supremo", "Boss of Bosses"]).toContain(king.title);
    expect(king.styledName).toBe(`${king.title} ${king.fullName}`);

    const courier = titledName("courier", createNameRng(6));
    expect(["Runner", "Courier", "Messenger"]).toContain(courier.title);
  });

  it("titledName accepts an explicit ethnicity", () => {
    const t = titledName("noble", createNameRng(3), "russian");
    expect(t.ethnicityId).toBe("russian");
  });

  it("generateStartingLeaders returns one king, two nobles, three leaders", () => {
    const leaders = generateStartingLeaders(createNameRng(2026));
    expect(leaders).toHaveLength(6);
    expect(leaders.map((l) => l.role)).toEqual([
      "king",
      "noble",
      "noble",
      "leader",
      "leader",
      "leader",
    ]);
    for (const l of leaders) {
      expect(l.styledName.length).toBeGreaterThan(l.fullName.length);
    }
  });
});
