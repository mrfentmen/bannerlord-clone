/**
 * Tests for city notables and building owners (del order 2026-10-04).
 */

import { describe, expect, it } from "vitest";
import { CITY_NOTABLES, notablesForCity, totalNotableCount } from "../cityNotables.js";
import "../notables/index.js";
import { BUILDING_OWNERS, buildingOwnersForCity } from "../buildingOwners.js";

describe("city notables", () => {
  it("has 12 notables for each of the 19 cities", () => {
    const cities = Object.keys(CITY_NOTABLES);
    expect(cities.length).toBe(19);
    for (const cityId of cities) {
      const notables = notablesForCity(cityId);
      expect(notables.length, `${cityId} should have 12 notables`).toBe(12);
    }
  });

  it("totals 228 notables", () => {
    expect(totalNotableCount()).toBe(228);
  });

  it("every notable has a name, lore, portrait key, and title", () => {
    for (const [cityId, notables] of Object.entries(CITY_NOTABLES)) {
      for (const n of notables) {
        expect(n.name.length, `${cityId} notable name`).toBeGreaterThan(0);
        expect(n.lore.length, `${n.name} lore`).toBeGreaterThan(20);
        expect(n.portraitKey, `${n.name} portrait`).toMatch(/^[a-z]+-(male|female)/);
        expect(n.title.length, `${n.name} title`).toBeGreaterThan(0);
        expect(n.id).toBe(`${cityId}-notable-${notables.indexOf(n) + 1}`);
      }
    }
  });

  it("returns empty array for unknown city", () => {
    expect(notablesForCity("nonexistent")).toEqual([]);
  });
});

describe("building owners", () => {
  it("has 8 buildings per city", () => {
    for (const cityId of Object.keys(BUILDING_OWNERS)) {
      const owners = buildingOwnersForCity(cityId);
      expect(owners.length, `${cityId} should have 8 buildings`).toBe(8);
    }
  });

  it("every building has a named owner from the generator", () => {
    for (const owners of Object.values(BUILDING_OWNERS)) {
      for (const o of owners) {
        expect(o.ownerName.split(" ").length).toBeGreaterThanOrEqual(2);
        expect(o.buildingName.length).toBeGreaterThan(0);
        expect(o.portraitKey).toMatch(/^[a-z]+-(male|female)$/);
      }
    }
  });
});
