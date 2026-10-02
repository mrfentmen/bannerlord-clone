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
  tallyStaleness,
  townAge,
  townRecency,
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
      stale: 0,
      oldestDays: null,
    });
  });
});

// -- recency: the fourth dimension ----------------------------------------------

describe("townAge", () => {
  // The clock is the block's own. `day` is `Tick % 365` and wraps, so an age computed
  // against it would be wrong twice a year and wrong silently, which is why the server
  // sends one and why these tests never mention the day's own value.
  const clocked = fog({ tick: 100, lastSeen: { "town-a": 100, "town-b": 90, "town-c": 12 } });

  it("counts from the block's clock, not from the snapshot's day", () => {
    expect(townAge(clocked, "town-a")).toBe(0);
    expect(townAge(clocked, "town-b")).toBe(10);
    expect(townAge(clocked, "town-c")).toBe(88);
  });

  it("has no answer without a clock, and says so rather than counting from zero", () => {
    // The dangerous default here is 0: "seen 0 days ago" is a claim that somebody is
    // looking today, and a server that published no clock has not claimed it.
    expect(townAge(fog(), "town-b")).toBeNull();
    expect(townAge(fog({ tick: null }), "town-b")).toBeNull();
    expect(townAge(undefined, "town-b")).toBeNull();
  });

  it("treats both never-seen sentinels as never, because the two producers disagree", () => {
    // The simulation's field registry defaults last_seen_tick to -1; the fixture uses 0.
    // Reading only one of them would put a fixture town in the "seen today" band.
    expect(townAge(fog({ tick: 100 }), "town-b", 0)).toBeNull();
    expect(townAge(fog({ tick: 100 }), "town-b", -1)).toBeNull();
  });

  it("falls back to the town's own copy when the block does not mention it", () => {
    // The join can find a town the fog block's `lastSeen` omits — a town the block lists
    // as known but ages in a map keyed the same way — and dropping it would leave the
    // place permanently un-aged.
    expect(townAge(fog({ tick: 100 }), "town-z", 80)).toBe(20);
  });

  it("prefers the block's own map over the town's copy when they disagree", () => {
    // The block is rebuilt per tick frame and the town list only on a snapshot, so the
    // map is the fresher of the two by construction.
    expect(townAge(clocked, "town-a", 40)).toBe(0);
  });

  it("refuses a sighting stamped after its own clock", () => {
    expect(townAge(fog({ tick: 100, lastSeen: { "town-a": 140 } }), "town-a")).toBeNull();
  });
});

describe("townRecency", () => {
  const clocked = fog({ tick: 100, sightingMemoryDays: 10, lastSeen: { "town-a": 100, "town-b": 95, "town-c": 60 } });

  it("bands an age against the simulation's own sighting memory, not a number chosen here", () => {
    expect(townRecency(clocked, "town-a")).toBe("now");
    expect(townRecency(clocked, "town-b")).toBe("recent");
    // 40 ticks old against a 10-day window: the simulation would itself have dropped this
    // town out of `visibleTowns` by now.
    expect(townRecency(clocked, "town-c")).toBe("old");
  });

  it("reads a town the server kept in visibleTowns as recent when it is not being watched", () => {
    // The band exists because of this case: the sighting memory keeps a town in
    // `visibleTowns` for days after the party left, and a client that drew those exactly
    // like a watched town would be claiming eyes that are not there.
    const memoryCarried = fog({ tick: 100, sightingMemoryDays: 10, visibleTowns: ["town-b"], lastSeen: { "town-b": 95 } });
    expect(townVisibility(buildFogIndex(memoryCarried), "town-b")).toBe("visible");
    expect(townRecency(memoryCarried, "town-b")).toBe("recent");
  });

  it("calls every sighting old when the server remembers nothing", () => {
    // A memory window of zero means the simulation stops counting a sighting the moment
    // the party walks away, so any age at all is past the window.
    const forgetful = fog({ tick: 100, sightingMemoryDays: 0, lastSeen: { "town-b": 99 } });
    expect(townRecency(forgetful, "town-b")).toBe("old");
  });

  it("is unknown for a town with no stated age, and unknown is not now", () => {
    expect(townRecency(fog({ tick: 100 }), "town-d")).toBe("unknown");
    // The band a missing age must never fall into: "now" claims somebody is looking.
    expect(townRecency(fog({ tick: 100 }), "town-d")).not.toBe("now");
  });
});

describe("tallyStaleness", () => {
  it("counts the places past the memory window and finds the oldest", () => {
    const recency = new Map([
      ["a", "recent" as const],
      ["b", "old" as const],
      ["c", "old" as const],
      ["d", "now" as const],
    ]);
    const ages = new Map([["a", 4], ["b", 40], ["c", 90], ["d", 0]]);
    expect(tallyStaleness(recency, ages)).toEqual({ stale: 2, oldestDays: 90 });
  });

  it("finds the oldest place even when it is not the stale one", () => {
    // The oldest age on a map is the number a player wants, and it is not necessarily a
    // stale one: a long-remembered town inside a long sighting memory is old and current.
    const tally = tallyStaleness(new Map([["a", "recent"]]), new Map([["a", 300]]));
    expect(tally).toEqual({ stale: 0, oldestDays: 300 });
  });

  it("says nothing about a place with no stated age rather than counting it as fresh", () => {
    const tally = tallyStaleness(new Map([["a", "unknown"]]), new Map());
    expect(tally).toEqual({ stale: 0, oldestDays: null });
  });

  it("never counts a place the simulation holds no town for as stale", () => {
    // An unwatched settlement has no sighting at all, so `applyFog` gives it `unknown`.
    // That has to keep it out of `stale`, or the map would report places going out of
    // date that the simulation has never had an opinion about.
    const recency = new Map([["watched", "old" as const], ["unsurveyed", "unknown" as const]]);
    const ages = new Map([["watched", 90]]);
    expect(tallyStaleness(recency, ages)).toEqual({ stale: 1, oldestDays: 90 });
  });
});

describe("countByVisibility with staleness", () => {
  it("carries the staleness through without disturbing the three states", () => {
    const states = new Map([
      ["a", "visible" as const],
      ["b", "remembered" as const],
      ["c", "unseen" as const],
    ]);
    const census = countByVisibility(states, new Set(["a", "b", "c"]), {
      stale: 1,
      oldestDays: 61,
    });
    expect(census.stale).toBe(1);
    expect(census.oldestDays).toBe(61);
    // The invariant the indicator's totals rest on: staleness is read off the side, never
    // added in, so adding a fifth bucket is not something this signature allows.
    expect(census.visible + census.remembered + census.unseen + census.unsighted).toBe(census.total);
    // And it really is a subset of `remembered`, which is what makes that true.
    expect(census.stale).toBeLessThanOrEqual(census.remembered);
  });

  it("reports no staleness when the caller states none", () => {
    // Not "0" by accident: an unstated census has to be indistinguishable from a census
    // that looked and found nothing old, or the indicator cannot tell them apart.
    const census = countByVisibility(new Map([["a", "remembered"]]), new Set(["a"]));
    expect(census.stale).toBe(0);
    expect(census.oldestDays).toBeNull();
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

  it("says how out of date the map is, and only when something is", () => {
    const fresh = reportFog(fog(), census);
    // A standing "everything is current" line would be reassurance that stops being read
    // the day it is wrong, and there is nothing to say on a map with nothing stale.
    expect(fresh.detail).not.toMatch(/out of date/i);

    const stale = reportFog(
      fog(),
      countByVisibility(censusStates(), new Set(["a", "b", "c"]), { stale: 2, oldestDays: 61 }),
    );
    expect(stale.detail).toMatch(/2 of the remembered places are past the 10-day sighting memory/);
    expect(stale.detail).toMatch(/oldest thing this side knows is 61 ticks old/);
  });
});

/** The three states the report tests above share, so a staleness case can reuse them. */
function censusStates(): Map<string, "visible" | "remembered" | "unseen"> {
  return new Map([
    ["a", "visible" as const],
    ["b", "remembered" as const],
    ["c", "unseen" as const],
  ]);
}