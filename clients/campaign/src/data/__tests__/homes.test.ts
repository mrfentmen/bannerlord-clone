/**
 * Tests for the home resolver (`src/data/homes.ts`).
 *
 * The home step's whole job is to put a new character in a town that really
 * exists on the loaded map, for a reason the census data actually supports. A
 * resolver that picked a favourite town by hand, or that ignored the player's
 * own state pick, would quietly lie on the start screen — so the rank order,
 * the pick-wins rule, and the honest fallback are all pinned here against a
 * mapped three-state slice with real figures.
 */

import { describe, expect, it } from "vitest";

import { mappedStates, resolveHome, settlementSlug } from "../homes.js";
import type { WorldSettlement } from "../../world/types.js";

/** A mapped three-state slice: Ohio holds the biggest city, Pennsylvania the Italian and German stronghold. */
const SETTLEMENTS: WorldSettlement[] = [
  { id: "s-oh-1", name: "Columbus", place: "city", lat: 39.96, lon: -82.99, population: 990000, populationSource: "Census", state: "Ohio", stateCode: "OH", osmPopulation: null },
  { id: "s-oh-2", name: "Cincinnati", place: "city", lat: 39.1, lon: -84.51, population: 309317, populationSource: "Census", state: "Ohio", stateCode: "OH", osmPopulation: null },
  { id: "s-pa-1", name: "Pittsburgh", place: "city", lat: 40.44, lon: -79.99, population: 302971, populationSource: "Census", state: "Pennsylvania", stateCode: "PA", osmPopulation: null },
  { id: "s-ky-1", name: "Louisville", place: "city", lat: 38.25, lon: -85.76, population: 633045, populationSource: "Census", state: "Kentucky", stateCode: "KY", osmPopulation: null },
];

function home(ethnicityId: string, stateCode?: string | null) {
  const name = ethnicityId.charAt(0).toUpperCase() + ethnicityId.slice(1) + "-American";
  return resolveHome({
    ethnicityId,
    ethnicityName: name,
    ...(stateCode === undefined ? {} : { stateCode }),
    settlements: SETTLEMENTS,
  });
}

describe("resolveHome", () => {
  it("follows the heritage's stronghold rank order, not just the biggest city", () => {
    // Italian's census list ranks Pennsylvania above Ohio, so Pittsburgh wins
    // even though Columbus is the larger city. The order is the data.
    const choice = home("italian");
    expect(choice).not.toBeNull();
    expect(choice!.settlement.name).toBe("Pittsburgh");
    expect(choice!.fallback).toBe(false);
    expect(choice!.reason).toContain("Pennsylvania");
    expect(choice!.reason).toContain("Italian-American");
  });

  it("puts the slug in the shape the simulation's town index matches", () => {
    const choice = home("italian");
    expect(choice!.slug).toBe("pittsburgh");
  });

  it("lets the player's own state pick win when it is a stronghold", () => {
    const choice = home("german", "OH");
    expect(choice!.settlement.name).toBe("Columbus");
    expect(choice!.fallback).toBe(false);
  });

  it("lets the player's own state pick win even when it is not a stronghold", () => {
    // Ohio is not on the Mexican census list, but the home step is the
    // player's choice and a heritage never blocks.
    const choice = home("mexican", "OH");
    expect(choice!.settlement.name).toBe("Columbus");
    expect(choice!.fallback).toBe(true);
    expect(choice!.reason).toContain("No Mexican-American stronghold is mapped");
  });

  it("falls back to the region's largest town when no stronghold is mapped", () => {
    const choice = home("mexican");
    expect(choice!.settlement.name).toBe("Columbus");
    expect(choice!.fallback).toBe(true);
    expect(choice!.reason).toContain("No Mexican-American stronghold is mapped");
    expect(choice!.reason).toContain("largest town the map holds");
  });

  it("resolves within the picked state to its most populous mapped town", () => {
    const choice = home("italian", "OH");
    expect(choice!.settlement.name).toBe("Columbus");
    expect(choice!.settlement.name).not.toBe("Cincinnati");
  });

  it("returns null when the map holds no placeable towns", () => {
    expect(resolveHome({ ethnicityId: "italian", ethnicityName: "Italian-American", settlements: [] })).toBeNull();
    expect(
      resolveHome({
        ethnicityId: "italian",
        ethnicityName: "Italian-American",
        settlements: [{ ...SETTLEMENTS[0]!, stateCode: null, state: null }],
      }),
    ).toBeNull();
  });
});

describe("mappedStates", () => {
  it("sums real populations and counts towns per state, sorted by name", () => {
    const states = mappedStates(SETTLEMENTS);
    expect(states.map((s) => s.code)).toEqual(["KY", "OH", "PA"]);
    const ohio = states.find((s) => s.code === "OH")!;
    expect(ohio.name).toBe("Ohio");
    expect(ohio.townCount).toBe(2);
    expect(ohio.population).toBe(1299317);
  });

  it("ignores settlements without a state code", () => {
    const states = mappedStates([{ ...SETTLEMENTS[0]!, stateCode: null, state: null }]);
    expect(states).toEqual([]);
  });
});

describe("settlementSlug", () => {
  it("matches the simulation's slug form: lowercase, dashes for runs of non-alphanumerics", () => {
    expect(settlementSlug("New York City")).toBe("new-york-city");
    expect(settlementSlug("Washington, D.C.")).toBe("washington-d-c");
    expect(settlementSlug("  Columbus ")).toBe("columbus");
  });
});
