/**
 * The client's side of fog of war: the join between simulation town ids and map
 * settlements, and the census the HUD reports.
 *
 * The rule under test throughout is that the client never decides what is visible. Every
 * function here reads the snapshot's `fog` block; none of them takes a radius, a position
 * or a distance. A test that passed by computing visibility itself would be testing a
 * second visibility system, which is the thing `src/data/fog.ts` says must not exist.
 */

import { describe, expect, it } from "vitest";
import {
  buildFogIndex,
  countByVisibility,
  fogByTownId,
  fogIndicator,
  isDrawn,
  reportFog,
  townVisibility,
  UNSEEN_POLICY,
} from "../fog.js";
import type { FogState, TownState } from "../types.js";

function fog(overrides: Partial<FogState> = {}): FogState {
  return {
    sideId: "side-1",
    sightRadiusKm: 50,
    sightRadiusLeagues: 10.356,
    sightingMemoryDays: 10,
    visibleTowns: ["town-a", "town-b"],
    knownTowns: ["town-a", "town-b", "town-c"],
    unseenTowns: ["town-d"],
    counts: { visible: 2, known: 3, unseen: 1, total: 4 },
    ...overrides,
  };
}

const TOWNS: Pick<TownState, "id" | "visible" | "known">[] = [
  { id: "town-a", visible: true, known: true },
  { id: "town-c", visible: false, known: true },
];

describe("buildFogIndex", () => {
  it("is inactive for a missing block, so a simulation without fog still draws its map", () => {
    const index = buildFogIndex(undefined);
    expect(index.active).toBe(false);
  });

  it("is inactive when there is no vantage point, which is not the same as seeing nothing", () => {
    // The lists are empty in this case by construction, so trusting them would blank the
    // whole map — the wrong answer to "nobody is looking".
    const index = buildFogIndex(fog({ sideId: null, visibleTowns: [], knownTowns: [], unseenTowns: [] }));
    expect(index.active).toBe(false);
    expect(townVisibility(index, "town-d")).toBe("visible");
  });

  it("is active when the server names a side", () => {
    expect(buildFogIndex(fog()).active).toBe(true);
  });
});

describe("townVisibility", () => {
  const index = buildFogIndex(fog());

  it("reads the three states from the explicit lists, in the order visible/known/unseen", () => {
    expect(townVisibility(index, "town-a")).toBe("visible");
    expect(townVisibility(index, "town-c")).toBe("remembered");
    expect(townVisibility(index, "town-d")).toBe("unseen");
  });

  it("decides by membership and never by set subtraction", () => {
    // "Never found" is the complement of the other two, and deriving it that way breaks
    // the first time a town is added between snapshots — showing a town wrongly.
    const halfBuilt = buildFogIndex(fog({ unseenTowns: [] }));
    expect(townVisibility(halfBuilt, "town-zzz-new")).toBe("remembered");
  });

  it("falls back to a town in none of the lists, and stops at remembered rather than visible", () => {
    const orphan = buildFogIndex(fog({ knownTowns: [], visibleTowns: [], unseenTowns: [] }));
    // The town's own flags are consulted only here, where the server named the town and
    // then left it out of all three lists.
    expect(townVisibility(orphan, "town-a", { visible: true, known: true })).toBe("visible");
    // No optimistic reading: an unreadable list must not draw a town as watched.
    expect(townVisibility(orphan, "town-a", { visible: false, known: true })).toBe("remembered");
    expect(townVisibility(orphan, "town-a")).toBe("remembered");
  });

  it("returns visible for everything when fog is not being applied", () => {
    expect(townVisibility(buildFogIndex(undefined), "town-d")).toBe("visible");
  });
});

describe("fogByTownId", () => {
  it("keys every simulation town by its own id", () => {
    const out = fogByTownId(buildFogIndex(fog()), TOWNS);
    expect(out.get("town-a")).toBe("visible");
    expect(out.get("town-c")).toBe("remembered");
  });
});

describe("isDrawn", () => {
  it("hides only the never-found, and says so in one named constant", () => {
    expect(UNSEEN_POLICY).toBe("hidden");
    expect(isDrawn("visible")).toBe(true);
    expect(isDrawn("remembered")).toBe(true);
    expect(isDrawn("unseen")).toBe(false);
  });
});

describe("countByVisibility", () => {
  it("keeps a settlement the simulation runs no town for out of the visible count", () => {
    // The regression this guards: a place with no town record is drawn in full, and
    // counting it as `visible` reports the map's settlement total back as "in sight".
    const states = new Map([
      ["place-a", "visible" as const],
      ["place-b", "remembered" as const],
      ["place-c", "unseen" as const],
      ["place-d", "visible" as const],
    ]);
    const census = countByVisibility(states, new Set(["place-a", "place-b", "place-c"]));
    expect(census.visible).toBe(1);
    expect(census.remembered).toBe(1);
    expect(census.unseen).toBe(1);
    expect(census.unsighted).toBe(1);
    expect(census.total).toBe(4);
  });

  it("always sums to the total, which is what the indicator's arithmetic rests on", () => {
    const states = new Map([
      ["a", "visible" as const],
      ["b", "remembered" as const],
      ["c", "unseen" as const],
      ["d", "visible" as const],
      ["e", "unseen" as const],
    ]);
    const watched = new Set(["a", "b", "c"]);
    const census = countByVisibility(states, watched);
    expect(census.visible + census.remembered + census.unseen + census.unsighted).toBe(census.total);
  });

  it("treats a null watch set as 'not tracking the join', not as 'everything is watched'", () => {
    const states = new Map([
      ["a", "visible" as const],
      ["b", "visible" as const],
    ]);
    const census = countByVisibility(states, null);
    expect(census.applied).toBe(false);
    expect(census.unsighted).toBe(0);
    expect(census.visible).toBe(2);
  });
});

describe("fogIndicator", () => {
  it("carries the census's own numbers and its applied flag", () => {
    const census = countByVisibility(
      new Map([
        ["a", "visible" as const],
        ["b", "unseen" as const],
        ["c", "visible" as const],
      ]),
      new Set(["a", "b"]),
    );
    expect(fogIndicator(census)).toEqual({
      applied: true,
      visible: 1,
      remembered: 0,
      unseen: 1,
      total: 3,
      unsighted: 1,
    });
  });
});

describe("reportFog", () => {
  const census = countByVisibility(
    new Map([
      ["a", "visible" as const],
      ["b", "remembered" as const],
      ["c", "unseen" as const],
    ]),
    new Set(["a", "b", "c"]),
  );

  it("says nothing is hidden when the simulation publishes no fog", () => {
    const report = reportFog(undefined, census);
    expect(report.applied).toBe(false);
    expect(report.detail).toMatch(/not publishing fog of war/);
    // The distinction matters: "has not said" is not "this side sees everything".
    expect(report.detail).toMatch(/not a statement that/);
  });

  it("distinguishes no vantage point from an empty world", () => {
    const report = reportFog(fog({ sideId: null }), census);
    expect(report.applied).toBe(false);
    expect(report.detail).toMatch(/no vantage point/);
    expect(report.detail).toMatch(/different claim/);
  });

  it("states the radius, the memory window and the three counts when fog is applied", () => {
    const report = reportFog(fog(), census);
    expect(report.applied).toBe(true);
    expect(report.detail).toMatch(/50 km/);
    expect(report.detail).toMatch(/10 days/);
    expect(report.detail).toMatch(/1 in sight/);
    expect(report.detail).toMatch(/1 remembered/);
    expect(report.detail).toMatch(/1 never found/);
  });
});