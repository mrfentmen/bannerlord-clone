/**
 * What the map does with a fog state, where the map can be tested without a GPU.
 *
 * `tallyFogStates` is the arithmetic behind `scene.fogTally()` and `routeStrength` is what
 * the march route is drawn at; both are here because the scene itself needs a canvas and a
 * real engine, and these are the two decisions a player would notice being wrong.
 *
 * The property worth stating is that neither function decides *whether* a town is visible.
 * Both take states the simulation published and choose only how loudly to speak. That
 * separation is what `src/data/fogView.ts` is for, and it is why a route to a never-found
 * town stays on screen as a ghost line: the player ordered the march, so hiding the line
 * would leave them watching a party walk into nothing.
 */

import { describe, expect, it } from "vitest";
import { routeStrength } from "../../data/fogView.js";
import { tallyFogStates } from "../CampaignScene.js";

describe("how the march route is drawn through fog", () => {
  it("draws a route to a town in sight at full strength", () => {
    expect(routeStrength("visible")).toBe(1);
  });

  it("keeps a route to a never-found town as a visible ghost rather than nothing", () => {
    // The two wrong answers, and why each is wrong. Zero: the player ordered the march and
    // is left watching a party walk into a blank. One: the road polyline runs between two
    // real surveyed coordinates, so drawing it at full strength reveals the location of a
    // town the side has never found — the label leak by another route.
    expect(routeStrength("unseen")).toBeGreaterThan(0);
    expect(routeStrength("unseen")).toBeLessThan(routeStrength("remembered"));
    expect(routeStrength("remembered")).toBeLessThan(1);
  });

  it("orders the three states monotonically, so fading cannot invert", () => {
    expect(routeStrength("unseen")).toBeLessThan(routeStrength("remembered"));
    expect(routeStrength("remembered")).toBeLessThan(routeStrength("visible"));
  });
});

describe("the scene's own fog tally", () => {
  it("counts the three states over the ids actually drawn, not over the caller's whole map", () => {
    // Ids drive the count, so the total is the number of clusters on screen. A caller
    // passing states for settlements this region does not hold cannot inflate the total.
    const tally = tallyFogStates(
      new Map([
        ["denver", "visible"],
        ["boulder", "remembered"],
        ["nederland", "unseen"],
        ["atlantis", "visible"],
      ]),
      ["denver", "boulder", "nederland"],
    );
    expect(tally).toEqual({ visible: 1, remembered: 1, unseen: 1, total: 3 });
  });

  it("always sums to the total, which is what the summary sentence's arithmetic rests on", () => {
    const tally = tallyFogStates(
      new Map([
        ["a", "visible"],
        ["b", "remembered"],
        ["c", "unseen"],
        ["d", "remembered"],
      ]),
      ["a", "b", "c", "d", "e"],
    );
    expect(tally.visible + tally.remembered + tally.unseen).toBe(tally.total);
    expect(tally.total).toBe(5);
  });

  it("treats a cluster missing from the map as visible, so the tally never undercounts", () => {
    // Matching `setTownVisibility`'s fallback. A cluster the map drew and the call did not
    // name is a place the caller has not decided about, not one left over from the last
    // snapshot — so it is drawn, and the tally has to agree that it was.
    expect(tallyFogStates(new Map([["denver", "unseen"]]), ["denver", "boulder"])).toEqual({
      visible: 1,
      remembered: 0,
      unseen: 1,
      total: 2,
    });
  });

  it("reports nothing drawn when the map holds no clusters", () => {
    expect(tallyFogStates(new Map(), [])).toEqual({
      visible: 0,
      remembered: 0,
      unseen: 0,
      total: 0,
    });
  });
});
