/**
 * The town, market and party panels, tested where the constitution says they matter.
 *
 * Four rules, four describes, and all four are properties of what got built rather
 * than of what was typed:
 *
 *  - A skeleton is a named component shaped like the real panel, drawn before the
 *    request, and never a spinner. Section counts are compared against the live panel
 *    so the two cannot drift apart quietly (section 3.2, ART_DIRECTION.md section 11).
 *  - An error says a plain sentence and offers a way out. A retry button that re-renders
 *    the same missing data would be a lie, so the market's retry is checked against a
 *    real request (section 1.3).
 *  - An empty state says what to do, in the product's voice, with the exact wording
 *    ART_DIRECTION.md section 10.2 sets out (section 3.3).
 *  - Every number in a table is mono with tabular figures, every status carries its
 *    glyph as well as its colour, and every control is reachable and named
 *    (UI_UX.md section 12).
 *
 * The data comes from the test fixture, which is what a fixture is for. Nothing here
 * reaches a production path: `src/data/fixture` is replaced by a throwing module in any
 * non-dev build, and `tools/check-no-fixtures.mjs` fails the build if its markers reach
 * `dist/`.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import { marketPanel, type MarketPanelHandle } from "../panels/MarketPanel.js";
import { partyPanel, partyPanelError } from "../panels/PartyPanel.js";
import { townPanel, townPanelError } from "../panels/TownPanel.js";
import { marketSkeletonBody, partySkeletonBody, townSkeletonBody, TOWN_SECTIONS } from "../panels/skeletons.js";
import type { PartyState, SimSnapshot, SimulationProvider, TownState } from "../../data/types.js";

/** The stylesheet, read from the project root: jsdom rewrites `import.meta.url`. */
function uiCss(): string {
  return readFileSync(join(process.cwd(), "src", "ui", "ui.css"), "utf8");
}

/** The generated token stylesheet, where the type classes are defined. */
function tokensCss(): string {
  return readFileSync(join(process.cwd(), "src", "design", "tokens.css"), "utf8");
}

let provider: SimulationProvider;
let snapshot: SimSnapshot;
let golden: TownState;
let longmont: TownState;

const noop = (): void => {};

/** One turn of the event loop, which is all a fixture round trip needs. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

function visibleText(root: Node): string {
  const out: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const t = child.textContent?.trim() ?? "";
        if (t.length > 0) out.push(t);
      } else if (child.nodeType === 1) {
        walk(child);
      }
    }
  };
  walk(root);
  return out.join(" ");
}

function town(opts: { loading?: boolean; town?: TownState | null } = {}): HTMLElement {
  return townPanel({
    town: opts.town === undefined ? golden : opts.town,
    previous: null,
    loading: opts.loading ?? false,
    onWhy: noop,
    onOpenMarket: noop,
    onMarchHere: noop,
    onRoster: noop,
  });
}

function party(opts: { loading?: boolean; party?: PartyState | null } = {}): HTMLElement {
  return partyPanel({
    party: opts.party === undefined ? snapshot.party : opts.party,
    previous: null,
    loading: opts.loading ?? false,
    onWhy: noop,
  });
}

function market(opts: { loading?: boolean; market?: SimSnapshot["markets"][string] | null; provider?: SimulationProvider } = {}): MarketPanelHandle {
  return marketPanel({
    townId: longmont.id,
    townName: longmont.name,
    market: opts.market === undefined ? snapshot.markets[longmont.id]! : opts.market,
    party: snapshot.party,
    money: snapshot.player.resources.money,
    day: snapshot.day,
    provider: opts.provider ?? provider,
    loading: opts.loading ?? false,
    onError: noop,
  });
}

beforeAll(async () => {
  provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
  golden = snapshot.towns.find((t) => t.name === "Golden")!;
  longmont = snapshot.towns.find((t) => t.name === "Longmont")!;
});

// -- skeletons ----------------------------------------------------------------

describe("named skeletons, not spinners (CONSTITUTION.md 3.2)", () => {
  it("gives the town panel a town-skeleton with the live panel's sections and gauges", () => {
    const live = town();
    const sk = townSkeletonBody();
    const liveSections = live.querySelectorAll(".panel__section").length;
    expect(liveSections).toBe(TOWN_SECTIONS);
    expect(sk.querySelectorAll(".skeleton__section").length).toBe(TOWN_SECTIONS);
    // Same number of gauges, so the fill bars do not appear or vanish on load.
    expect(sk.querySelectorAll(".skeleton__gauge").length).toBe(live.querySelectorAll("[role='meter']").length);
    // And the same number of action buttons along the bottom.
    expect(sk.querySelectorAll(".skeleton__action").length).toBe(
      live.querySelectorAll("[data-testid^='open-']").length,
    );
  });

  it("puts the town-skeleton up on the first frame when the survey is still being read", () => {
    const panel = town({ loading: true });
    const sk = panel.querySelector("[data-testid='town-skeleton']");
    expect(sk, "no town-skeleton while loading").not.toBeNull();
    expect(sk!.getAttribute("aria-busy")).toBe("true");
    expect(sk!.getAttribute("role")).toBe("status");
    // A skeleton, not a spinner: blocks of paper, no rotation, no travelling highlight.
    expect(sk!.querySelectorAll(".skeleton__block").length).toBeGreaterThan(10);
    expect(visibleText(sk!)).toMatch(/reading the town survey/i);
    // The context region is the same size as the live panel's, which is the point.
    expect(panel.classList.contains("panel")).toBe(true);
  });

  it("gives the party panel a party-skeleton with the live panel's sections", () => {
    const live = party();
    const sk = partySkeletonBody();
    // Shortages, supplies, condition and wages, roles, troops, goods. Six either way:
    // the shortages section is drawn whether or not anything is short, so a party that
    // is short and one that is not are the same height.
    expect(live.querySelectorAll(".panel__section").length).toBe(6);
    expect(sk.querySelectorAll(".skeleton__section").length).toBe(6);
    // Three supply gauges and two condition gauges, as the live panel draws them.
    expect(sk.querySelectorAll(".skeleton__gauge").length).toBe(5);
    // And the same two table stubs, with the same column counts.
    expect(sk.querySelectorAll(".skeleton__table").length).toBe(2);
    expect(sk.querySelectorAll(".skeleton__tr").length).toBe(5);
  });

  it("gives the market a market-skeleton with a two-row table stub (ART_DIRECTION 11)", () => {
    const live = market().root;
    const sk = marketSkeletonBody();
    expect(sk.querySelectorAll(".skeleton__section").length).toBe(live.querySelectorAll(".panel__section").length);
    expect(sk.querySelectorAll(".skeleton__tr").length).toBe(2);
    expect(live.querySelectorAll(".panel__section").length).toBe(5);
    expect(sk.getAttribute("aria-busy")).toBe("true");
  });

  it("renders every skeleton as paper blocks and never as a rotating element", () => {
    const css = uiCss();
    // The only repeating animation in the client is the wash, and it is opacity only.
    const wash = css.slice(css.indexOf("@keyframes skeleton-wash"));
    const block = wash.slice(0, wash.indexOf("}"));
    expect(block).toContain("opacity");
    expect(block).not.toContain("rotate");
    expect(css).not.toMatch(/@keyframes\s+\w*spin\b/);
    // Every skeleton block is paper-400 with a paper-300 outline, per section 11.
    expect(css).toMatch(/\.skeleton__block\s*\{[^}]*--paper-400[^}]*\}/);
  });

  it("keeps the measured skeleton heights in front of the older shape rules", () => {
    // `.skeleton--town .skeleton__gauge { height: 34px }` predates the components that
    // draw a town skeleton, and has the same specificity as the measured
    // `.skeleton__block.skeleton__gauge { height: 64px }`. Equal specificity means source
    // order decides, so the measured rule has to come later or the skeleton silently
    // shrinks to a third of the gauge it stands in for and the layout jumps on load.
    const css = uiCss();
    const older = css.indexOf(".skeleton--town .skeleton__gauge");
    const measured = css.indexOf(".skeleton__block.skeleton__gauge");
    expect(older).toBeGreaterThan(-1);
    expect(measured).toBeGreaterThan(older);
    expect(css.slice(measured, measured + 60)).toMatch(/height: 64px/);
    const olderRow = css.indexOf(".skeleton--town .skeleton__row");
    const measuredRow = css.indexOf(".skeleton__block.skeleton__row");
    expect(measuredRow).toBeGreaterThan(olderRow);
  });
});

// -- error states -------------------------------------------------------------

describe("errors say something plain and offer a way out (CONSTITUTION.md 1.3)", () => {
  it("gives the town panel a message and a working retry", () => {
    let retried = 0;
    const node = townPanelError("Longmont", "the socket closed", () => (retried += 1));
    expect(visibleText(node)).toMatch(/did not load/i);
    const retry = node.querySelector<HTMLButtonElement>("[data-testid='town-error-retry']");
    expect(retry).not.toBeNull();
    expect(retry!.textContent).toBe("Try again");
    retry!.click();
    expect(retried).toBe(1);
  });

  it("gives the party panel a message and a working retry", () => {
    let retried = 0;
    const node = partyPanelError("the socket closed", () => (retried += 1));
    expect(visibleText(node)).toMatch(/did not load/i);
    const retry = node.querySelector<HTMLButtonElement>("[data-testid='party-error-retry']");
    expect(retry).not.toBeNull();
    retry!.click();
    expect(retried).toBe(1);
  });

  it("retries the market against a real request, and recovers when it succeeds", async () => {
    let fail = true;
    const flaky: SimulationProvider = {
      ...provider,
      getSnapshot: async () => {
        if (fail) throw new Error("the socket closed");
        return provider.getSnapshot();
      },
    };
    const handle = market({ market: null, provider: flaky });
    // First frame: the skeleton, drawn before the request, not a complaint.
    expect(handle.root.querySelector("[data-testid='market-skeleton']")).not.toBeNull();
    await flush();
    const error = handle.root.querySelector("[data-testid='market-error']");
    expect(error, "a failed read must leave a message, not a blank panel").not.toBeNull();
    expect(visibleText(error!)).toMatch(/could not be read/i);

    fail = false;
    handle.root.querySelector<HTMLButtonElement>("[data-testid='market-error-retry']")!.click();
    await flush();
    // The retry is a request, not a re-render: it can succeed where the last one failed.
    expect(handle.root.querySelector("[data-testid='market-error']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='market-table']")).not.toBeNull();
  });

  it("sends the developer detail to the console, never to the player", () => {
    const seen: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => seen.push(args);
    try {
      partyPanelError("ECONNREFUSED 127.0.0.1:8080", noop);
    } finally {
      console.error = original;
    }
    const said = visibleText(partyPanelError("ECONNREFUSED 127.0.0.1:8080", noop));
    expect(said).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|8080/);
    expect(seen.length).toBeGreaterThan(0);
  });
});

// -- empty states -------------------------------------------------------------

describe("empty states say what to do next (ART_DIRECTION.md 10.2)", () => {
  it("tells the player how to select a town when nothing is selected", () => {
    const panel = town({ town: null });
    const empty = panel.querySelector("[data-testid='empty-state']");
    expect(empty).not.toBeNull();
    const text = visibleText(empty!);
    expect(text).toContain("No town selected.");
    expect(text).toContain("Choose a settlement on the map, or press Tab to cycle holdings.");
    // And a way out of the state, which is the roster.
    expect(panel.querySelector("[data-testid='empty-open-roster']")).not.toBeNull();
  });

  it("says the caravan holds nothing when there is nothing to sell", () => {
    const panel = market().root;
    const empty = panel.querySelector("[data-testid='empty-state']");
    expect(empty).not.toBeNull();
    expect(visibleText(empty!)).toContain("Caravan holds no goods. Buy something in a market before hauling.");
  });

  it("says so when nothing is under the player's command, and when nobody is following", () => {
    const bare = party({ party: null });
    expect(visibleText(bare.querySelector("[data-testid='empty-state']")!)).toMatch(/no party under your command/i);

    const leaderAlone: PartyState = { ...snapshot.party, troops: [], goods: [] };
    const alone = party({ party: leaderAlone });
    const empties = Array.from(alone.querySelectorAll("[data-testid='empty-state']")).map((n) => visibleText(n));
    expect(empties.some((t) => /nobody is following you/i.test(t))).toBe(true);
    expect(empties.some((t) => t.includes("Caravan holds no goods. Buy something in a market before hauling."))).toBe(true);
  });

  it("says nothing is traded when a town has no market records", () => {
    const bare: SimSnapshot["markets"][string] = { townId: longmont.id, goods: [] };
    const panel = market({ market: bare }).root;
    expect(visibleText(panel.querySelector("[data-testid='empty-state']")!)).toMatch(/nothing is traded here/i);
  });
});

// -- the town panel -----------------------------------------------------------

describe("the town panel", () => {
  it("covers the sections UI_UX.md section 6 lists", () => {
    const headings = Array.from(town().querySelectorAll(".section-header")).map((h) => h.textContent ?? "");
    for (const expected of [
      "Food and supply",
      "Health",
      "Sanitation and housing",
      "Unrest and loyalty",
      "Media trust",
      "Garrison and roads",
      "Money",
    ]) {
      expect(headings.some((h) => h.includes(expected)), `no ${expected} section`).toBe(true);
    }
  });

  it("shows population and workers, and refuses to invent a population it does not have", () => {
    expect(town().querySelector("[data-testid='town-population']")!.textContent).toBe("20,415");
    const unsurveyed = { ...golden, population: null, workers: 0 };
    expect(town({ town: unsurveyed }).querySelector("[data-testid='town-population']")!.textContent).toBe("Not surveyed");
  });

  it("states a food shortage in days, not in raw person-days", () => {
    const text = visibleText(town());
    // Golden is at 0.4 days of food. The number the player acts on has to be there.
    expect(text).toMatch(/0\.4 days/);
    expect(text).toMatch(/Nothing is arriving faster than it is eaten|empties in about/i);
  });

  it("puts a meter role and a value on every gauge, so the numbers are announced", () => {
    // Nine: two food, one infection, one sanitation, two unrest and loyalty, one media
    // trust, two garrison and roads. Money is three rows, not three gauges.
    const meters = Array.from(town().querySelectorAll("[role='meter']"));
    expect(meters.length).toBe(9);
    for (const m of meters) {
      expect(m.getAttribute("aria-label")).toBeTruthy();
      expect(m.getAttribute("aria-valuenow") ?? m.getAttribute("aria-valuetext")).toBeTruthy();
    }
  });

  it("puts a trend arrow beside each value and marks it decorative", () => {
    const withTrend = townPanel({
      town: golden,
      previous: { ...golden, foodStock: golden.foodStock + 900, unrest: golden.unrest - 0.1, loyalty: golden.loyalty + 0.1 },
      onWhy: noop,
      onOpenMarket: noop,
      onMarchHere: noop,
      onRoster: noop,
    });
    const arrows = Array.from(withTrend.querySelectorAll(".gauge__trend"));
    expect(arrows.length).toBeGreaterThan(0);
    for (const a of arrows) {
      expect(a.getAttribute("aria-hidden")).toBe("true");
      expect(["up", "down", "flat"]).toContain(a.getAttribute("data-trend"));
    }
  });
});

// -- the market panel ---------------------------------------------------------

describe("the market panel", () => {
  it("prices every good in tabular mono, which is what stops a column jittering", () => {
    const panel = market().root;
    const prices = Array.from(panel.querySelectorAll("[data-testid^='price-']"));
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) {
      const cell = p.closest("td");
      expect(cell!.classList.contains("table__td--numeric")).toBe(true);
      expect(p.classList.contains("data")).toBe(true);
      expect(p.textContent).toMatch(/\d+\.\d{2}/);
    }
    // The class is only worth anything if the generated token stylesheet says what it
    // means, so that is asserted rather than assumed.
    const rule = tokensCss().slice(tokensCss().indexOf(".data {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/--font-mono/);
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/tabular-nums/);
  });

  it("draws the price history the simulation sent, and says what it is", () => {
    const panel = market().root;
    const spark = panel.querySelectorAll("svg.sparkline");
    expect(spark.length).toBe(snapshot.markets[longmont.id]!.goods.length);
    const labelled = Array.from(spark).every((s) => /price history/.test(s.getAttribute("aria-label") ?? ""));
    expect(labelled).toBe(true);
    // The polyline is drawn from the fixture's history, unsmoothed.
    const grain = snapshot.markets[longmont.id]!.goods.find((g) => g.goodId === "grain")!;
    const line = panel.querySelector("svg.sparkline polyline")!;
    expect(line.getAttribute("points")!.split(" ").length).toBe(grain.history.length);
  });

  it("buys against the price on screen and moves the price the simulation moved it to", async () => {
    const handle = market();
    const grain = snapshot.markets[longmont.id]!.goods.find((g) => g.goodId === "grain")!;
    const before = handle.root.querySelector("[data-testid='price-grain']")!.textContent ?? "";
    expect(before).toContain(grain.price.toFixed(2));

    handle.root.querySelector<HTMLButtonElement>("[data-testid='buy-grain']")!.click();
    await flush();
    const after = handle.root.querySelector("[data-testid='price-grain']")!.textContent ?? "";
    expect(after, "the price column must show the post-trade price, not the pre-trade one").not.toBe(before);
    // The hold went up by the quantity ordered.
    expect(handle.root.querySelector("[data-testid='market-held']")!.textContent).toBe("10");
    expect(visibleText(handle.root)).toMatch(/Bought 10 grain/);
  });

  it("shows the simulation's own refusal, verbatim, when a trade is rejected", async () => {
    const broke: SimulationProvider = {
      ...provider,
      trade: async (request) => ({
        accepted: false,
        side: request.side,
        goodName: "Grain",
        unitPrice: 12,
        quantity: request.quantity,
        total: 120,
        partyQuantity: 0,
        marketPriceAfter: 12,
        reason: "Short 312. You have 2,180. Sell first, or take the contract at Longmont.",
        causedBy: "trade-rejected",
      }),
    };
    const handle = market({ provider: broke });
    handle.root.querySelector<HTMLButtonElement>("[data-testid='buy-grain']")!.click();
    await flush();
    const message = handle.root.querySelector("[data-testid='market-message']")!;
    expect(visibleText(message)).toContain("Short 312. You have 2,180.");
  });

  it("cannot sell what the caravan does not hold, and says why", () => {
    const sell = market().root.querySelector<HTMLButtonElement>("[data-testid='sell-grain']")!;
    expect(sell.disabled).toBe(true);
    expect(sell.getAttribute("title")).toMatch(/holding none of this/i);
  });

  it("re-labels the trade buttons when the quantity changes, without a re-render", () => {
    const handle = market();
    const input = handle.root.querySelector<HTMLInputElement>("#market-quantity")!;
    const buy = handle.root.querySelector("[data-testid='buy-grain']")!;
    expect(buy.getAttribute("aria-label")).toMatch(/^Buy 10 /);
    input.value = "40";
    input.dispatchEvent(new Event("change"));
    expect(buy.getAttribute("aria-label")).toMatch(/^Buy 40 /);
    // The same node is still in the document, so the field keeps the keyboard focus.
    expect(handle.root.contains(input)).toBe(true);
    expect(buy.getAttribute("aria-label")).toMatch(/\$[\d,]+/);
  });

  it("gives every cell the heading of its column, so the narrow layout can stack it", () => {
    const table = market().root.querySelector("[data-testid='market-table']")!;
    expect(table.classList.contains("table--stack")).toBe(true);
    const headings = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent ?? "");
    expect(headings).toEqual(["Good", "Price", "History", "Stock", "Held", "Trade"]);
    for (const cell of Array.from(table.querySelectorAll("tbody td"))) {
      expect(headings).toContain(cell.getAttribute("data-label"));
    }
  });
});

// -- the party panel ----------------------------------------------------------

describe("the party panel", () => {
  it("shows the headcount, and the troop table it came from", () => {
    const panel = party();
    const rows = panel.querySelectorAll("[data-testid='party-troops'] tbody tr");
    expect(rows.length).toBe(snapshot.party.troops.length);
    const counts = Array.from(panel.querySelectorAll("[data-testid='troop-count']")).map((c) => Number(c.textContent));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(25);
  });

  it("shows food, ammunition, medicine and morale as the player can act on them", () => {
    const panel = party();
    for (const id of ["party-food-gauge", "party-metal-gauge", "party-medicine-gauge", "party-morale-gauge"]) {
      expect(panel.querySelector(`[data-testid='${id}']`), `no ${id}`).not.toBeNull();
    }
    // Days, not a raw ration count.
    expect(visibleText(panel.querySelector("[data-testid='party-food-gauge']")!)).toMatch(/days/);
    expect(visibleText(panel.querySelector("[data-testid='party-food-gauge']")!)).toMatch(/person-days a day/);
  });

  it("shows wages owed, the daily bill and the purse, in whole dollars and cents", () => {
    const panel = party();
    expect(visibleText(panel.querySelector("[data-testid='party-wages-owed']")!)).toMatch(/^\$[\d,]+$/);
    expect(visibleText(panel.querySelector("[data-testid='party-daily-wages']")!)).toMatch(/^\$\d+\.\d{2}$/);
    expect(visibleText(panel.querySelector("[data-testid='party-purse']")!)).toMatch(/^\$[\d,]+$/);
  });

  it("carries every warning as a glyph, a colour and the word (ART_DIRECTION.md 5.3)", () => {
    const panel = party();
    const warnings = Array.from(panel.querySelectorAll("[data-testid^='party-warning-']:not([data-testid*='chip'])"));
    expect(warnings.length).toBeGreaterThan(0);
    const glyphs = new Set<string>();
    for (const w of warnings) {
      const chip = w.querySelector("[data-status]")!;
      const glyph = chip.querySelector(".chip__glyph")!;
      // The glyph alone is enough to read the status: it is not hidden from anyone.
      expect(glyph.getAttribute("aria-hidden")).toBe("true");
      expect(glyph.textContent!.trim()).toMatch(/^(◆|▲|●|■|○)$/);
      glyphs.add(glyph.textContent!.trim());
      // The colour is a third signal, not the only one: it comes from a token.
      const mark = (glyph as HTMLElement).style.color;
      expect(mark).toMatch(/^var\(--status-/);
      // And the word is in the accessible name.
      expect(chip.getAttribute("aria-label")).toMatch(/^(Critical|Warning|Healthy|For information|No change): /);
    }
    // Golden's party is short of grain and nothing else, so the two kinds must not
    // collapse into one glyph.
    expect(glyphs.has("◆")).toBe(true);
  });

  it("warns about the thing that is actually short, and stays quiet about the rest", () => {
    const panel = party();
    const text = visibleText(panel.querySelector("[data-testid='party-warnings']")!);
    // 46 person-days of grain for 25 people is 2.2 days. That is a critical warning.
    expect(text).toMatch(/GRAIN 2\.2 DAYS/);
    expect(text).toMatch(/person-days of grain left for 25 people/);
    // Ammunition is at 62 units. Not a warning, and the panel does not pretend it is.
    expect(text).not.toMatch(/AMMUNITION/);
    expect(panel.querySelector("[data-testid='party-warnings']")).not.toBeNull();
  });

  it("says nothing is short rather than dropping the section when nothing is", () => {
    const healthy: PartyState = {
      ...snapshot.party,
      food: 900,
      medicine: 40,
      metal: 300,
      morale: 0.9,
      wagesOwed: 0,
    };
    const panel = party({ party: healthy });
    expect(panel.querySelector("[data-testid='party-warnings']")).toBeNull();
    expect(visibleText(panel.querySelector("[data-testid='party-warnings-clear']")!)).toMatch(/nothing short/i);
    // Same height either way, which is the point of keeping the section.
    expect(panel.querySelectorAll(".panel__section").length).toBe(6);
  });

  it("says so when wages are owed, and stamps it", () => {
    const indebted: PartyState = { ...snapshot.party, wagesOwed: 1240 };
    const panel = party({ party: indebted });
    expect(visibleText(panel.querySelector("[data-testid='party-wages-owed']")!)).toBe("$1,240");
    const text = visibleText(panel.querySelector("[data-testid='party-warnings']")!);
    expect(text).toContain("WAGES OWED $1,240");
    expect(text).toMatch(/days of the current wage bill/);
    // The rubber stamp is the ART_DIRECTION.md section 6.2 motif for a confirmed state.
    expect(panel.querySelector(".stamp--critical")).not.toBeNull();
  });

  it("stacks the troop table for a 390px screen and keeps the headings announced", () => {
    const table = party().querySelector("[data-testid='party-troops']")!;
    expect(table.classList.contains("table--stack")).toBe(true);
    const first = table.querySelector("tbody tr td")!;
    expect(first.getAttribute("data-label")).toBe("Unit");
    const css = uiCss();
    const narrow = css.slice(css.indexOf("@media (max-width: 599px) {", css.indexOf("A wide table at 390px")));
    expect(narrow).toMatch(/\.table--stack td::before\s*\{\s*content: attr\(data-label\)/);
    // Clipped, not removed: the header row stays in the accessibility tree.
    expect(narrow).toMatch(/clip: rect\(0 0 0 0\)/);
  });
});

// -- accessibility ------------------------------------------------------------

describe("keyboard and names (UI_UX.md section 12)", () => {
  it("gives every control a real element and an accessible name", () => {
    const panels: [string, HTMLElement][] = [
      ["town", town()],
      ["town-empty", town({ town: null })],
      ["town-skeleton", town({ loading: true })],
      ["party", party()],
      ["party-empty", party({ party: null })],
      ["market", market().root],
      ["market-skeleton", market({ loading: true }).root],
    ];
    const problems: string[] = [];
    for (const [name, node] of panels) {
      for (const el of Array.from(node.querySelectorAll("button, input, select, a[href]"))) {
        if (el.tagName !== "BUTTON" && el.tagName !== "INPUT" && el.tagName !== "SELECT") {
          problems.push(`${name}: <${el.tagName.toLowerCase()} href> is not focusable by default`);
        }
        const label =
          el.getAttribute("aria-label") ??
          (el.id ? node.querySelector(`label[for='${el.id}']`)?.textContent : null) ??
          el.textContent ??
          "";
        if (label.trim().length === 0) problems.push(`${name}: a ${el.tagName.toLowerCase()} with no name`);
        if (el.tagName === "BUTTON" && (el as HTMLButtonElement).getAttribute("type") !== "button") {
          problems.push(`${name}: a button with no explicit type submits its form`);
        }
      }
    }
    expect(problems, problems.join("\n")).toHaveLength(0);
  });

  it("reaches every action by keyboard, in a sensible order", () => {
    const panel = town();
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button, input")).filter((b) => !b.hasAttribute("disabled"));
    expect(focusable.length).toBeGreaterThan(0);
    // A real button is in the tab order; nothing is a div with a click handler.
    for (const el of focusable) {
      expect(["BUTTON", "INPUT"]).toContain(el.tagName);
      expect(el.getAttribute("tabindex")).not.toBe("-1");
    }
    // The first thing the player meets is the market link, which is the panel's purpose.
    expect(panel.querySelector("[data-testid='open-market']")!.textContent).toBe("Open the market");
  });

  it("marks a skeleton busy rather than trapping focus in it", () => {
    const sk = town({ loading: true });
    expect(sk.querySelectorAll("button, input").length).toBe(0);
    expect(sk.getAttribute("tabindex")).toBe("-1");
  });
});

// -- copy ---------------------------------------------------------------------

describe("copy in every state of the three panels (CONSTITUTION.md 3.3)", () => {
  const BANNED = [
    /\bTODO\b/,
    /\bFIXME\b/,
    /\blorem ipsum\b/i,
    /\bcoming soon\b/i,
    /\bplaceholder\b/i,
    /\bundefined\b/,
    /\bNaN\b/,
    /\bnull\b/,
    /\[[\]]/,
    /\bsomething went wrong\b/i,
    /\bOops\b/,
    /\bWelcome back\b/,
  ];

  it("has no developer-speak in the empty, skeleton, error or live states", () => {
    const cases: [string, Node][] = [
      ["town", town()],
      ["town-empty", town({ town: null })],
      ["town-skeleton", town({ loading: true })],
      ["town-error", townPanelError("Longmont", "ECONNREFUSED", noop)],
      ["market", market().root],
      ["market-skeleton", market({ loading: true }).root],
      ["party", party()],
      ["party-empty", party({ party: null })],
      ["party-skeleton", party({ loading: true })],
      ["party-error", partyPanelError("ECONNREFUSED", noop)],
    ];
    const offenders: string[] = [];
    for (const [name, node] of cases) {
      for (const line of visibleText(node).split(/(?<=[.:])\s+/)) {
        for (const pattern of BANNED) {
          if (pattern.test(line)) offenders.push(`${name}: ${pattern} in "${line.slice(0, 80)}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toHaveLength(0);
  });

  it("uses the locked spellings, and no exclamation marks", () => {
    for (const node of [town(), town({ town: null }), market().root, party(), party({ party: null })]) {
      const text = visibleText(node);
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/\bOops\b|\bWelcome\b/i);
    }
  });
});
