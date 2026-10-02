/**
 * The fogged-settlement panel, and what it is for.
 *
 * The behaviour under test is not "renders some nodes". It is that this panel makes the
 * *distinction* fog exists to draw, and fails loudly in the specific direction of showing
 * something it should not. Two failure modes, and they point opposite ways:
 *
 *  - A **remembered** town has real figures in the snapshot, and rendering the ordinary
 *    town panel presents last tick's unrest under a heading that says nothing about time.
 *    A player reads a month's-old number as this morning's and decides on it.
 *  - An **unseen** town has no standing to have figures shown at all. The client is
 *    holding the real survey population; printing it is the exact leak `UNSEEN_POLICY` in
 *    `src/data/fog.ts` exists to prevent.
 *
 * So the tests below assert both halves: that remembered data is shown *and marked stale*,
 * and that unseen data is not shown at all. A panel that merely greys everything out would
 * pass the second and fail the first, and would be wrong about remembered towns — a player
 * who scouted a place and marched away wants to remember what they found.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import { unknownTownPanel, staleOrderReason } from "../panels/UnknownTownPanel.js";
import type { TownRecency } from "../../data/fog.js";
import type { SimSnapshot, TownState } from "../../data/types.js";

let snapshot: SimSnapshot;
let golden: TownState;

beforeAll(async () => {
  snapshot = await createFixtureSimulationProvider().getSnapshot();
  golden = snapshot.towns.find((t) => t.name === "Golden")!;
});

function panel(opts: {
  state: "visible" | "remembered" | "unseen";
  town?: TownState | null;
  name?: string;
  recency?: TownRecency;
  days?: number | null;
  onWhy?: (field: string) => void;
}): HTMLElement {
  // Spelled out rather than passed straight through: `exactOptionalPropertyTypes` is on,
  // so handing the panel an explicit `undefined` for an optional callback is a type error,
  // and a conditional spread reads worse than the branch it replaces.
  const options = {
    settlementName: opts.name ?? "Golden",
    town: opts.town === undefined ? golden : opts.town,
    state: opts.state,
    day: snapshot.day,
    ...(opts.recency === undefined ? {} : { recency: opts.recency, days: opts.days ?? null }),
  };
  return unknownTownPanel(opts.onWhy ? { ...options, onWhy: opts.onWhy } : options);
}

function testId(root: HTMLElement, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-testid='${id}']`);
}

// -- the state is stated before any number -------------------------------------

describe("a fogged panel says what it is before it says anything else", () => {
  it("leads with the state chip and its sentence, so the figures are read in its light", () => {
    const root = panel({ state: "remembered" });
    const detail = testId(root, "fog-state-detail");
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toContain("has been here before");
    // The chip and the detail come before the figures in document order, so a player who
    // scrolls straight to a number still passed the caveat.
    const html = root.innerHTML;
    expect(html.indexOf("fog-state-detail")).toBeLessThan(html.indexOf("Population"));
  });

  it("names the state in words on the chip, not only as a colour", () => {
    // Same redundancy rule the notifications tray follows: nothing is icon- or
    // colour-only.
    const chip = testId(panel({ state: "remembered" }), "fog-state-chip");
    expect(chip!.textContent).toContain("Remembered");
    expect(testId(panel({ state: "unseen" }), "fog-state-chip")!.textContent).toContain("Never found");
  });
});

// -- remembered: shown, and marked as old --------------------------------------

describe("a remembered town", () => {
  it("shows its last-known figures, because a player who scouted it wants to remember", () => {
    const root = panel({ state: "remembered" });
    const html = root.textContent ?? "";
    expect(html).toContain("Population");
    expect(html).toContain("Unrest");
    expect(html).toContain("Garrison");
    // The real number, not a placeholder: this is the data the client is holding.
    if (golden.population !== null) {
      expect(html).toContain(golden.population.toLocaleString("en-US"));
    }
  });

  it("marks them as last-known in a banner above the figures, with the day", () => {
    const root = panel({ state: "remembered" });
    const banner = testId(root, "fog-stale-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("may have changed since");
    const html = root.innerHTML;
    expect(html.indexOf("fog-stale-banner")).toBeLessThan(html.indexOf("Population"));
  });

  it("says orders cannot be placed here, rather than leaving the player to find out", () => {
    expect(testId(panel({ state: "remembered" }), "fog-recruit-blocked")).not.toBeNull();
  });

  it("says how long ago it was seen, on its own line under the banner", () => {
    // "Last known" tells the player the figures are not current. It does not tell them how
    // far back they reach, and that is the number they would actually act on.
    const root = panel({ state: "remembered", recency: "old", days: 61 });
    const age = testId(root, "fog-age")!;
    expect(age.textContent).toMatch(/61 days ago/);
    const html = root.innerHTML;
    // Under the banner, above the figures: a number about how old the news is is itself a
    // number, and the rule this panel already follows is that none appears above its caveat.
    expect(html.indexOf("fog-stale-banner")).toBeLessThan(html.indexOf("fog-age"));
    expect(html.indexOf("fog-age")).toBeLessThan(html.indexOf("Population"));
  });

  it("says no age at all rather than saying zero, when the simulation stated none", () => {
    // "Last seen 0 days ago" is a claim that somebody looked today. A panel that cannot
    // date a sighting must not print the freshest possible news.
    for (const root of [
      panel({ state: "remembered" }),
      panel({ state: "remembered", recency: "unknown" }),
      panel({ state: "remembered", recency: "unknown", days: null }),
      panel({ state: "remembered", recency: "recent", days: null }),
    ]) {
      expect(testId(root, "fog-age")).toBeNull();
      expect(root.textContent).not.toMatch(/0 days ago/);
    }
  });

  it("does not date an unseen town, which was never seen at all", () => {
    // A caller passing an age for an unseen town has a bug, and the panel must not turn it
    // into "Last seen 0 days ago" under a Never found chip.
    const root = panel({ state: "unseen", recency: "now", days: 0 });
    expect(testId(root, "fog-age")).toBeNull();
    expect(root.textContent).not.toMatch(/days ago/);
  });

  it("keeps the Why links, because a remembered figure still has a real cause chain", () => {
    const root = panel({ state: "remembered", onWhy: () => {} });
    expect(testId(root, "fog-why-unrest")).not.toBeNull();
  });

  it("reports an unsurveyed population as unsurveyed, not as zero", () => {
    // Zero would read as a place that emptied out, which is a claim about the world rather
    // than a statement about the survey. On a fogged town that misreading is easy to act on.
    const root = panel({ state: "remembered", town: { ...golden, population: null } });
    expect(root.textContent).toContain("Not surveyed");
    expect(root.textContent).not.toContain("Population0");
  });

  it("says so plainly when the simulation runs no town for a settlement it remembers", () => {
    const root = panel({ state: "remembered", town: null });
    expect(testId(root, "fog-no-town-record")).not.toBeNull();
    expect(root.textContent).toContain("not running a town");
  });
});

// -- unseen: nothing stated at all ---------------------------------------------

describe("an unseen town", () => {
  it("prints no population, no garrison and no unrest, because it knows none of them", () => {
    // The regression this whole file exists for. The server sends unseen towns in full on
    // purpose; the client is the other half of that decision, and a panel that prints the
    // survey figures is a spyglass with a paragraph around it.
    const root = panel({ state: "unseen" });
    const text = root.textContent ?? "";
    for (const field of ["Unrest", "Loyalty", "Garrison", "Prosperity", "Prosperity"]) {
      expect(text).not.toContain(field);
    }
    expect(text).not.toContain("Last known");
  });

  it("says the side has never been there, and stops there", () => {
    const root = panel({ state: "unseen" });
    expect(testId(root, "fog-unseen-detail")).not.toBeNull();
    expect(root.textContent).toContain("never had it in sight");
    // And it tells the player the way to find out, so the panel is not just a refusal.
    expect(root.textContent).toContain("Marching here will find it");
  });

  it("still titles the panel with the place's name, because the player got here by clicking it", () => {
    // The name is not the leak: the marker and label are hidden because they *place* the
    // town, and the player only reaches this panel by clicking something already drawn. A
    // panel that cannot name its own subject is worse.
    expect(panel({ state: "unseen", name: "Nederland" }).textContent).toContain("Nederland");
  });
});

// -- orders --------------------------------------------------------------------

describe("staleOrderReason", () => {
  it("has no reason to give while a town is in sight", () => {
    expect(staleOrderReason("visible")).toBeNull();
  });

  it("gives a reason for both fogged states, from the one owner of the wording", () => {
    // A function rather than a constant so the town panel and this panel cannot drift, and
    // so the wording has one owner.
    expect(staleOrderReason("remembered")).toContain("has been here before");
    expect(staleOrderReason("unseen")).toContain("never had this place in sight");
  });
});
