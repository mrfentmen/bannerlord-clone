import { describe, expect, it } from "vitest";

import { ETHNICITY_HOME_STATES, resolveHome } from "../homes.js";
import { ETHNICITIES } from "../ethnicities.js";
import type { WorldSettlement } from "../../world/types.js";

function place(over: Partial<WorldSettlement> & { name: string }): WorldSettlement {
  const { name, ...rest } = over;
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    place: "city",
    lat: 0,
    lon: 0,
    population: 0,
    populationSource: "U.S. Census Bureau",
    state: null,
    stateCode: null,
    osmPopulation: null,
    ...rest,
  };
}

describe("ethnicity home states", () => {
  it("covers every playable heritage", () => {
    for (const e of ETHNICITIES) {
      expect(ETHNICITY_HOME_STATES[e.id]?.length ?? 0, e.id).toBeGreaterThan(0);
    }
  });

  it("holds only real two-letter state codes", () => {
    for (const [id, states] of Object.entries(ETHNICITY_HOME_STATES)) {
      for (const code of states) {
        expect(/^[A-Z]{2}$/.test(code), `${id}: ${code}`).toBe(true);
      }
    }
  });

  it("follows the real broad geography of each community", () => {
    // Northeast coast for the Italian and Irish lists, West Coast first for the
    // Chinese and Korean lists, the Southwest and Texas for the Mexican list.
    expect(ETHNICITY_HOME_STATES["italian"]).toContain("NY");
    expect(ETHNICITY_HOME_STATES["irish"]).toContain("MA");
    expect(ETHNICITY_HOME_STATES["chinese"]?.[0]).toBe("CA");
    expect(ETHNICITY_HOME_STATES["korean"]?.[0]).toBe("CA");
    expect(ETHNICITY_HOME_STATES["mexican"]).toContain("TX");
    expect(ETHNICITY_HOME_STATES["puerto_rican"]).toContain("NY");
    expect(ETHNICITY_HOME_STATES["german"]).toContain("PA");
    expect(ETHNICITY_HOME_STATES["jamaican"]?.[0]).toBe("NY");
  });
});

describe("resolveHome", () => {
  const settlements: WorldSettlement[] = [
    place({ name: "New York City", state: "New York", stateCode: "NY", population: 8_804_190 }),
    place({ name: "Chicago", state: "Illinois", stateCode: "IL", population: 2_665_039 }),
    place({ name: "Columbus", state: "Ohio", stateCode: "OH", population: 913_175 }),
    place({ name: "Los Angeles", state: "California", stateCode: "CA", population: 3_898_747 }),
    place({ name: "Miami", state: "Florida", stateCode: "FL", population: 442_241 }),
    place({ name: "Austin", state: "Texas", stateCode: "TX", population: 974_447 }),
  ];

  it("puts an Italian-American start in New York when the side allows it", () => {
    const home = resolveHome({
      ethnicityId: "italian",
      ethnicityName: "Italian-American",
      sideStateCodes: ["NY", "PA"],
      settlements,
    });
    expect(home?.settlement.name).toBe("New York City");
    expect(home?.slug).toBe("new-york-city");
    expect(home?.fallback).toBe(false);
    expect(home?.reason).toContain("New York");
  });

  it("keeps the player inside their side, not at the heritage's national capital", () => {
    // Italian's strongest state is New York, but the Great Lakes Union holds no
    // New York. Illinois is the next real Italian stronghold the side does hold,
    // so Chicago is home rather than a town outside the player's section.
    const home = resolveHome({
      ethnicityId: "italian",
      ethnicityName: "Italian-American",
      sideStateCodes: ["OH", "IL", "MI"],
      settlements,
    });
    expect(home?.settlement.name).toBe("Chicago");
  });

  it("prefers the state the player chose when it is a candidate", () => {
    const home = resolveHome({
      ethnicityId: "italian",
      ethnicityName: "Italian-American",
      stateCode: "OH",
      sideStateCodes: ["OH", "IL"],
      settlements,
    });
    expect(home?.settlement.name).toBe("Columbus");
  });

  it("picks the most populous mapped town of the state, not list order", () => {
    const home = resolveHome({
      ethnicityId: "italian",
      ethnicityName: "Italian-American",
      settlements: [
        place({ name: "Albany", state: "New York", stateCode: "NY", population: 99_224 }),
        ...settlements,
      ],
    });
    expect(home?.settlement.name).toBe("New York City");
  });

  it("treats an unsurveyed population as zero rather than inventing a figure", () => {
    const home = resolveHome({
      ethnicityId: "italian",
      ethnicityName: "Italian-American",
      settlements: [
        place({ name: "Nowhere", state: "New York", stateCode: "NY", population: null, populationSource: null }),
        place({ name: "Buffalo", state: "New York", stateCode: "NY", population: 278_349 }),
      ],
    });
    expect(home?.settlement.name).toBe("Buffalo");
  });

  it("says it fell back when no mapped state is a heritage stronghold", () => {
    const home = resolveHome({
      ethnicityId: "russian",
      ethnicityName: "Russian-American",
      sideStateCodes: ["VT"],
      settlements: [place({ name: "Burlington", state: "Vermont", stateCode: "VT", population: 44_743 })],
    });
    expect(home?.settlement.name).toBe("Burlington");
    expect(home?.fallback).toBe(true);
    expect(home?.reason).toContain("no Russian-American stronghold");
  });

  it("returns nothing when no settlement is mapped", () => {
    expect(resolveHome({ ethnicityId: "italian", ethnicityName: "Italian-American", settlements: [] })).toBeNull();
  });
});
