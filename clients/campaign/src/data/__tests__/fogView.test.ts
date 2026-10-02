/**
 * The presentation half of fog: how each state is drawn, said, diffed and remembered.
 *
 * `fog.test.ts` covers the reading — the join between simulation town ids and map
 * settlements. This file covers everything above it, and the rule is the same one restated
 * as a test obligation: **none of these functions decides what is visible.** Every test
 * here starts from states `fog.ts` produced and asserts only about drawing, wording and
 * bookkeeping. A test that passed by computing a distance or a radius would be testing a
 * second visibility system.
 *
 * The weighting below is deliberate. The properties that make fog *safe* — a null
 * vantage point is not an empty world, a remembered town is not a live one, a local store
 * cannot raise a town to `visible`, an unfiltered map carries its caveat — are the ones
 * that hold when someone changes this code. So those are the ones asserted.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOG_SETTINGS,
  diffFog,
  fogLegend,
  fogStrength,
  fogViewDetail,
  labelStrength,
  minimapDotRadius,
  minimapDots,
  partyPinStrength,
  routeStrength,
  settlementFogView,
  sightingsSince,
  statesForDisplay,
  type FogSettings,
} from "../fogView.js";
import {
  FOG_MEMORY_VERSION,
  applyRememberedFloor,
  fogMemoryKey,
  foundIds,
  loadRemembered,
  saveRemembered,
} from "../fogMemory.js";
import type { TownVisibility } from "../types.js";

/** A storage stand-in. `Storage` has more surface than fog needs, so this is the part used. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const OFF: FogSettings = { enabled: false, caveatShown: true };

// -- the three states' arithmetic ---------------------------------------------

describe("how strongly each state is drawn", () => {
  it("gives an unseen town no strength at all, and a remembered one less than half", () => {
    // The ordering is the contract: a remembered town must be unmistakably remembered at
    // any zoom, and an unseen one must not be on screen. A caller that multiplies by these
    // cannot produce a brighter-than-visible town from a foggier state.
    expect(fogStrength("unseen")).toBe(0);
    expect(fogStrength("remembered")).toBeLessThan(0.5);
    expect(fogStrength("visible")).toBe(1);
  });

  it("treats labels, pins and routes as one policy with three numbers, so they cannot disagree", () => {
    // Splitting the *number* is worth it for tuning; splitting the *policy* is the bug this
    // pins. A remembered pin at 0.9 because someone overrode it is the failure.
    expect(labelStrength("remembered")).toBe(fogStrength("remembered"));
    expect(partyPinStrength("remembered")).toBe(1);
    expect(routeStrength("unseen")).toBeGreaterThan(0);
  });

  it("keeps a route to an unfound town as a ghost, because the player ordered that march", () => {
    // 0 would leave them watching their party walk into nothing; 1 would draw the road
    // leading to a town the side has never found, which is the label leak by another route.
    expect(routeStrength("unseen")).toBeGreaterThan(0);
    expect(routeStrength("unseen")).toBeLessThan(0.5);
  });

  it("never hides the player's own party pin, which is theirs whatever the fog says", () => {
    expect(partyPinStrength("visible")).toBe(1);
    expect(partyPinStrength("unseen")).toBe(0);
  });
});

describe("settlementFogView", () => {
  it("marks remembered as not current, which is what stops a stale figure being read as live", () => {
    // `current` is the single boolean every panel is meant to gate on. If remembered ever
    // read as current, a month-old unrest figure would print under a heading that says
    // nothing about time.
    expect(settlementFogView("visible").current).toBe(true);
    expect(settlementFogView("remembered").current).toBe(false);
    expect(settlementFogView("remembered").known).toBe(true);
  });

  it("says unseen is not merely stale but unknown, so no panel prints figures about it", () => {
    expect(settlementFogView("unseen").known).toBe(false);
    expect(settlementFogView("unseen").current).toBe(false);
  });

  it("gives every state a detail sentence that is not just its label restated", () => {
    for (const state of ["visible", "remembered", "unseen"] as const) {
      const view = settlementFogView(state);
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.detail.length).toBeGreaterThan(view.label.length);
    }
  });
});

// -- change detection ----------------------------------------------------------

describe("diffFog", () => {
  const before = new Map<string, TownVisibility>([
    ["a", "visible"],
    ["b", "remembered"],
    ["c", "unseen"],
  ]);

  it("separates what was gained from what was lost, which is the difference between news and churn", () => {
    // Fog moves every tick. A notification that fires on any change announces a town that
    // merely greyed out, which is the thing that trains a player to ignore notifications.
    const after = new Map<string, TownVisibility>([
      ["a", "remembered"],
      ["b", "visible"],
      ["c", "unseen"],
    ]);
    const diff = diffFog(before, after);
    expect(diff.sighted).toEqual(["b"]);
    expect(diff.lost).toEqual(["a"]);
    expect([...diff.changed].sort()).toEqual(["a", "b"]);
  });

  it("reports nothing for a settlement that held its state", () => {
    const same = new Map(before);
    expect(diffFog(before, same).changed).toEqual([]);
  });
});

describe("sightingsSince", () => {
  const before = new Map<string, TownVisibility>([
    ["a", "remembered"],
    ["b", "visible"],
  ]);

  it("announces nothing on the first reading of a session, which would greet every town ever seen", () => {
    const first = new Map<string, TownVisibility>([
      ["a", "visible"],
      ["b", "visible"],
      ["c", "visible"],
    ]);
    expect(sightingsSince(new Map(), first, new Set(), 12, -1).sighted).toEqual([]);
  });

  it("announces a town at most once per in-game day, since the sighting memory is itself in days", () => {
    const next = new Map<string, TownVisibility>([
      ["a", "remembered"],
      ["b", "visible"],
      ["c", "visible"],
    ]);
    const first = sightingsSince(before, next, new Set(), 12, 11);
    expect(first.sighted).toEqual(["c"]);
    // Same in-game day: suppressed, and `c` stays eligible rather than being consumed.
    const second = sightingsSince(before, next, first.announced, 12, 12);
    expect(second.sighted).toEqual([]);
    expect(second.announced.has("c")).toBe(true);
  });

  it("counts an unseen town coming into sight as the sighting it is", () => {
    const next = new Map<string, TownVisibility>([
      ["a", "remembered"],
      ["b", "visible"],
      ["c", "visible"],
    ]);
    expect(sightingsSince(before, next, new Set<string>(), 12, 11).sighted).toEqual(["c"]);
  });
});

// -- the toggle ---------------------------------------------------------------

describe("statesForDisplay", () => {
  const states = new Map<string, TownVisibility>([
    ["a", "visible"],
    ["b", "remembered"],
    ["c", "unseen"],
  ]);

  it("passes the states through untouched while fog is on", () => {
    expect(statesForDisplay(states, DEFAULT_FOG_SETTINGS)).toBe(states);
  });

  it("reports every settlement as visible while fog is off, and that is the point", () => {
    const open = statesForDisplay(states, OFF);
    expect([...open.values()]).toEqual(["visible", "visible", "visible"]);
    // The input is not mutated: the indicator must still be able to count what the side
    // actually knows while the map shows the survey.
    expect(states.get("c")).toBe("unseen");
  });
});

describe("fogViewDetail", () => {
  it("demands a notice whenever the map is drawn whole, and gives nothing when fog is on", () => {
    // Returns `string | null` rather than a string that is sometimes blank, because
    // "sometimes blank" is exactly how a required notice goes missing.
    expect(fogViewDetail(DEFAULT_FOG_SETTINGS)).toBeNull();
    const caveat = fogViewDetail(OFF);
    expect(caveat).toBeTruthy();
    expect(caveat).toContain("simulation is still applying fog");
  });

  it("defaults to fog on, so a caller that constructs nothing still gets a filtered map", () => {
    // The unsafe direction must be the one that has to be asked for.
    expect(DEFAULT_FOG_SETTINGS.enabled).toBe(true);
  });
});

// -- the legend ----------------------------------------------------------------

describe("fogLegend", () => {
  it("covers all three states in the order a player meets them", () => {
    expect(fogLegend().map((r) => r.state)).toEqual(["visible", "remembered", "unseen"]);
  });

  it("says what each state does to the panels, not only to the map", () => {
    // The misreading this exists to correct is a remembered town's panel showing old
    // numbers. A legend with only an "on the map" column leaves that uncorrected.
    for (const row of fogLegend()) {
      expect(row.onMap.length).toBeGreaterThan(0);
      expect(row.inPanels.length).toBeGreaterThan(0);
    }
  });
});

// -- the minimap ---------------------------------------------------------------

describe("minimapDots", () => {
  const dots = [
    { id: "a", x: 10, y: 20, state: "visible", isCity: true },
    { id: "b", x: 30, y: 40, state: "remembered", isCity: false },
  ] as const;

  it("leaves out a settlement it was never told about rather than inventing a dot for it", () => {
    // The map draws an unstated settlement; the minimap is a summary of the map, and a
    // summary that invents dots is a summary of a different map.
    const out = minimapDots([...dots], new Map([["a", "visible"]]), DEFAULT_FOG_SETTINGS);
    expect(out.map((d) => d.id)).toEqual(["a"]);
  });

  it("filters through the same toggle as the map, so the two cannot disagree", () => {
    const states = new Map<string, TownVisibility>([
      ["a", "visible"],
      ["b", "unseen"],
    ]);
    const out = minimapDots([...dots], states, OFF);
    expect(out.every((d) => d.state === "visible")).toBe(true);
  });

  it("keeps a remembered city the biggest thing on the minimap", () => {
    expect(minimapDotRadius(true, "remembered")).toBeGreaterThan(minimapDotRadius(false, "remembered"));
    expect(minimapDotRadius(true, "visible")).toBeGreaterThan(minimapDotRadius(true, "remembered"));
  });
});

// -- remembering across sessions -----------------------------------------------

describe("fog memory", () => {
  it("keys the store per side and per region, so neither leaks into the other", () => {
    expect(fogMemoryKey("side-1", "Colorado")).toContain("Colorado");
    expect(fogMemoryKey("side-1", "Colorado")).not.toBe(fogMemoryKey("side-2", "Colorado"));
    expect(fogMemoryKey("side-1", "Colorado")).toContain(String(FOG_MEMORY_VERSION));
  });

  it("round-trips the ids it was given", () => {
    const storage = memoryStorage();
    const key = fogMemoryKey("side-1", "Colorado");
    expect(saveRemembered(storage, key, new Set(["a", "b"]), 12)).toBe(true);
    expect([...loadRemembered(storage, key)]).toEqual(["a", "b"]);
  });

  it("can only ever move a town up from unseen, and never to visible", () => {
    // The whole safety property. A store a player can edit must not be able to hand out a
    // spyglass, so a local floor may add grey and may do nothing else.
    const states = new Map<string, TownVisibility>([
      ["a", "unseen"],
      ["b", "remembered"],
      ["c", "visible"],
    ]);
    const out = applyRememberedFloor(states, new Set(["a", "b", "c"]));
    expect(out.get("a")).toBe("remembered");
    expect(out.get("b")).toBe("remembered");
    expect(out.get("c")).toBe("visible");
  });

  it("does not hide a settlement the server said nothing about", () => {
    // Absent from the map means *unmentioned*, not `unseen`. Giving it a floor would invent
    // a state the server never sent and would hide most of a region from a new player.
    const states = new Map<string, TownVisibility>([["a", "unseen"]]);
    const out = applyRememberedFloor(states, new Set(["zzz"]));
    expect(out.has("zzz")).toBe(false);
    expect(out.get("a")).toBe("unseen");
  });

  it("remembers only the two states that mean this side has been here", () => {
    const found = foundIds(
      new Map<string, TownVisibility>([
        ["a", "visible"],
        ["b", "remembered"],
        ["c", "unseen"],
      ]),
    );
    expect([...found].sort()).toEqual(["a", "b"]);
  });

  it("reads a missing, corrupt or mis-versioned store as no memory rather than throwing", () => {
    // A wrong memory shows one extra grey town, which is cosmetic. A throw is a dead client.
    const key = fogMemoryKey("side-1", "Colorado");
    expect([...loadRemembered(null, key)]).toEqual([]);
    expect([...loadRemembered(memoryStorage({ [key]: "not json" }), key)]).toEqual([]);
    expect([...loadRemembered(memoryStorage({ [key]: '{"version":999,"found":["a"]}' }), key)]).toEqual([]);
    expect([...loadRemembered(memoryStorage({ [key]: '{"version":1,"found":"a"}' }), key)]).toEqual([]);
  });

  it("reports a failed write instead of pretending it stored something", () => {
    expect(saveRemembered(null, "k", new Set(["a"]), 1)).toBe(false);
  });
});
