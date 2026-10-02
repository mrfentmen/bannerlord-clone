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
import { SimulationUnavailableError } from "../../data/provider.js";
import { barterPanel, type BarterPanelHandle } from "../panels/BarterPanel.js";
import { marketPanel, type MarketPanelHandle } from "../panels/MarketPanel.js";
import { partyPanel, partyPanelError } from "../panels/PartyPanel.js";
import { questPanel, type QuestPanelHandle } from "../panels/QuestPanel.js";
import { townPanel, townPanelError } from "../panels/TownPanel.js";
import {
  BARTER_ACTIONS,
  BARTER_TABLE_COLUMNS,
  BARTER_TABLE_ROWS,
  BARTER_TOTAL_CELLS,
  barterSkeletonBody,
  QUEST_ACTIONS,
  QUEST_LIST_ROWS,
  questSkeletonBody,
} from "../panels/panel-skeletons.js";
import { marketSkeletonBody, partySkeletonBody, townSkeletonBody, TOWN_SECTIONS } from "../panels/skeletons.js";
import type {
  BarterTerms,
  Issue,
  IssueActionResult,
  IssueBoard,
  IssueState,
  PartyState,
  RulerState,
  SimSnapshot,
  SimulationProvider,
  TownState,
} from "../../data/types.js";

/** The stylesheet, read from the project root: jsdom rewrites `import.meta.url`. */
function uiCss(): string {
  return readFileSync(join(process.cwd(), "src", "ui", "ui.css"), "utf8");
}

/** The generated token stylesheet, where the type classes are defined. */
function tokensCss(): string {
  return readFileSync(join(process.cwd(), "src", "design", "tokens.css"), "utf8");
}

/** One CSS rule body, so a test asserts on the rule rather than on the file. */
function css_block(selector: string): string {
  const css = tokensCss();
  const at = css.indexOf(selector);
  if (at < 0) return "";
  return css.slice(at, css.indexOf("}", at));
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
    expect(live.querySelectorAll(".panel__section").length).toBe(3);
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

// -- the barter panel ----------------------------------------------------------
//
// Barter is the one panel with two tables facing each other, so the properties worth
// checking are the ones that could go wrong in a way a single-table panel cannot:
//
//  - The two sides are priced by the simulation, and the panel's only arithmetic is the
//    multiplication a player could do in their head. The worth column is read straight
//    off the terms the provider sent, which is asserted rather than assumed.
//  - The skeleton is the *pair*: two table stubs the same size, or the screen gives one
//    half of the decision more weight than the other before a number arrives.
//  - A refusal names the shortfall, because the shortfall is the number the player can go
//    and fix. A red border with no figure would have thrown that away.
//  - Changing one number drops an answer that was about a different table.
//  - A struck deal comes back with the simulation's own tables and empties the panel,
//    so nothing left on screen can disagree with the world.

describe("the barter panel", () => {
  let barterProvider: SimulationProvider;
  let barterSnapshot: SimSnapshot;
  let town: TownState;
  let trader: RulerState;
  let terms: BarterTerms;

  /** Its own provider: a struck deal moves the world, and the tests above share theirs. */
  beforeAll(async () => {
    barterProvider = createFixtureSimulationProvider();
    barterSnapshot = await barterProvider.getSnapshot();
    town = barterSnapshot.towns.find((t) => t.name === "Golden")!;
    trader = barterSnapshot.rulers.find((r) => r.id === town.holderId)!;
    terms = await barterProvider.barterTerms(trader.id, town.id);
  });

  function barter(
    opts: { terms?: BarterTerms | null; provider?: SimulationProvider; traderId?: string | null; loading?: boolean } = {},
  ): BarterPanelHandle {
    return barterPanel({
      partyId: barterSnapshot.party.id,
      partyName: barterSnapshot.party.name,
      townId: town.id,
      traderId: opts.traderId === undefined ? trader.id : opts.traderId,
      traderName: trader.name,
      terms: opts.terms === undefined ? terms : opts.terms,
      provider: opts.provider ?? barterProvider,
      loading: opts.loading ?? false,
      onError: noop,
    });
  }

  function setQuantity(handle: BarterPanelHandle, side: "offered" | "asked", itemId: string, value: number): void {
    const input = handle.root.querySelector<HTMLInputElement>(`[data-testid='barter-qty-${side}-${itemId}']`);
    expect(input, `no ${side} field for ${itemId}`).not.toBeNull();
    input!.value = String(value);
    input!.dispatchEvent(new Event("change"));
  }

  /** The count on a table's gold line, read by name rather than by column position. */
  function goldCell(root: HTMLElement, tableId: string): string | null {
    const row = Array.from(root.querySelectorAll(`[data-testid='${tableId}'] tbody tr`)).find(
      (tr) => tr.querySelector("td")?.textContent === "Gold",
    );
    return row?.querySelectorAll("td")[1]?.textContent ?? null;
  }

  it("shows both tables, priced by the simulation and never by the panel", () => {
    const handle = barter();
    const player = handle.root.querySelector("[data-testid='barter-offered-table']")!;
    const theirs = handle.root.querySelector("[data-testid='barter-asked-table']")!;
    expect(player.querySelectorAll("tbody tr").length).toBe(terms.playerItems.length);
    expect(theirs.querySelectorAll("tbody tr").length).toBe(terms.traderItems.length);
    // The worth column is the provider's figure to the cent, for every row on both sides.
    const worths = Array.from(player.querySelectorAll("[data-testid='barter-worth-offered']")).map((w) => w.textContent);
    for (const item of terms.playerItems) {
      expect(worths).toContain(`$${Math.round(item.unitValue).toLocaleString("en-US")}`);
    }
    // Three kinds of thing go on the same table, which is the point of the screen.
    const kinds = new Set(terms.playerItems.map((i) => i.kind));
    expect(kinds.has("gold")).toBe(true);
    expect(kinds.has("prisoner")).toBe(true);
  });

  it("adds up what is on each side, at the trader's own figures", () => {
    const handle = barter();
    const gold = terms.playerItems.find((i) => i.kind === "gold")!;
    setQuantity(handle, "offered", "gold", 10);
    setQuantity(handle, "asked", "gold", 4);
    const offeredTotal = handle.root.querySelector("[data-testid='barter-total-offered'] .data")!.textContent;
    expect(offeredTotal).toBe(`$${(10 * gold.unitValue).toLocaleString("en-US")}`);
    expect(visibleText(handle.root)).toMatch(/1 line on your side of the table/);
  });

  it("gives the barter screen a skeleton shaped like the pair of tables", () => {
    const live = barter().root;
    const sk = barterSkeletonBody();
    // Two table stubs of the same size, and two totals. The pair is the shape that
    // matters: one half of the decision must not arrive heavier than the other.
    expect(sk.querySelectorAll(".skeleton__table").length).toBe(2);
    expect(sk.querySelectorAll(".skeleton__tr").length).toBe(BARTER_TABLE_ROWS * 2);
    expect(sk.querySelectorAll(".skeleton__tr")[0]!.children.length).toBe(BARTER_TABLE_COLUMNS);
    expect(sk.querySelectorAll(".skeleton__costs .skeleton__block").length).toBe(BARTER_TOTAL_CELLS);
    expect(sk.querySelectorAll(".skeleton__actions .skeleton__block").length).toBe(BARTER_ACTIONS);
    expect(live.querySelectorAll(".costs .cost").length).toBe(BARTER_TOTAL_CELLS);
    expect(visibleText(sk)).toMatch(/reading both tables/i);
  });

  it("puts the skeleton up on the first frame, and only an error once the read has failed", async () => {
    let fail = true;
    const flaky: SimulationProvider = {
      ...barterProvider,
      barterTerms: async () => {
        if (fail) throw new Error("the socket closed");
        return barterProvider.barterTerms(trader.id, town.id);
      },
    };
    const handle = barter({ terms: null, provider: flaky });
    expect(handle.root.querySelector("[data-testid='barter-skeleton']")).not.toBeNull();
    await flush();
    const error = handle.root.querySelector("[data-testid='barter-error']");
    expect(error, "a failed read must leave a message, not a blank panel").not.toBeNull();
    expect(visibleText(error!)).toMatch(/could be read/i);
    // Developer detail to the console, never to the player.
    expect(visibleText(error!)).not.toMatch(/ECONNREFUSED|socket closed/);

    fail = false;
    handle.root.querySelector<HTMLButtonElement>("[data-testid='barter-error-retry']")!.click();
    await flush();
    // The retry is a request, not a re-render: it succeeds where the last one failed.
    expect(handle.root.querySelector("[data-testid='barter-error']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='barter-offered-table']")).not.toBeNull();
  });

  it("says so when a town has no lord to bargain with", () => {
    const handle = barter({ traderId: null, terms: null });
    const empty = handle.root.querySelector("[data-testid='empty-state']");
    expect(empty).not.toBeNull();
    expect(visibleText(empty!)).toMatch(/nobody here to bargain with/i);
    expect(visibleText(empty!)).toMatch(/no lord holds it/i);
    // No tables and no order button, because there is nobody to send an order to.
    expect(handle.root.querySelector("[data-testid='barter-ask']")).toBeNull();
  });

  it("shows the trader's refusal in full, shortfall and all", async () => {
    const handle = barter();
    setQuantity(handle, "offered", "gold", 1);
    setQuantity(handle, "asked", "gold", 30);
    handle.root.querySelector<HTMLButtonElement>("[data-testid='barter-ask']")!.click();
    await flush();
    const answer = handle.root.querySelector("[data-testid='barter-answer']")!;
    expect(answer).not.toBeNull();
    expect(answer.getAttribute("data-testid")).toBe("barter-answer");
    expect(visibleText(answer)).toMatch(/calls what you are asking/);
    // The number the player can act on, printed rather than left as a colour.
    const short = handle.root.querySelector("[data-testid='barter-short-by']")!;
    expect(short.textContent).toMatch(/^Short by \$[\d,]+\.$/);
    // And no commit button on a deal the trader refused.
    expect(handle.root.querySelector("[data-testid='barter-strike']")).toBeNull();
  });

  it("drops an answer as soon as the table it was about changes", async () => {
    const handle = barter();
    setQuantity(handle, "offered", "gold", 10);
    setQuantity(handle, "asked", "p-enemy-line", 1);
    handle.root.querySelector<HTMLButtonElement>("[data-testid='barter-ask']")!.click();
    await flush();
    expect(visibleText(handle.root)).toMatch(/takes the deal/);
    expect(handle.root.querySelector("[data-testid='barter-strike']")).not.toBeNull();

    setQuantity(handle, "asked", "p-enemy-line", 0);
    expect(handle.root.querySelector("[data-testid='barter-answer']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='barter-strike']")).toBeNull();
  });

  it("strikes a deal, and shows the simulation's own tables afterwards", async () => {
    const handle = barter();
    // Six captives for nine gold: two kinds of thing, one way across, and no purse on
    // either side of the table — both totals are the trader's own figures.
    setQuantity(handle, "offered", "p-militia", 6);
    setQuantity(handle, "asked", "gold", 9);
    handle.root.querySelector<HTMLButtonElement>("[data-testid='barter-ask']")!.click();
    await flush();
    handle.root.querySelector<HTMLButtonElement>("[data-testid='barter-strike']")!.click();
    await flush();

    const message = handle.root.querySelector("[data-testid='barter-message']")!;
    expect(visibleText(message)).toMatch(/Struck on day \d+/);
    const after = await barterProvider.getSnapshot();
    const ruler = after.rulers.find((r) => r.id === trader.id)!;
    expect(after.player.resources.gold).toBe(Math.round(barterSnapshot.player.resources.gold + 9));
    expect(ruler.wealth.gold).toBe(Math.round(trader.wealth.gold - 9));
    // The captives went into the lord's cage and off the player's table.
    expect(ruler.prisoners.find((p) => p.unitId === "p-militia")?.count).toBe(6);
    expect(after.party.prisoners.find((p) => p.unitId === "p-militia")).toBeUndefined();
    // And the counts on screen are the ones the simulation sent back, not the ones it had
    // before the deal: gold in hand is nine higher and the cage is six lighter.
    expect(goldCell(handle.root, "barter-offered-table")).toBe(String(after.player.resources.gold));
    expect(goldCell(handle.root, "barter-asked-table")).toBe(String(ruler.wealth.gold));
    // The table starts empty again: the gold line is back to zero and the captives are
    // gone from the player's table altogether, because the simulation no longer lists
    // them. There is no row left holding a stale count.
    expect(handle.root.querySelector<HTMLInputElement>("[data-testid='barter-qty-offered-gold']")!.value).toBe("0");
    expect(handle.root.querySelector("[data-testid='barter-qty-offered-p-militia']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='barter-answer']")).toBeNull();
  });

  it("keeps the keyboard in the field it was typed into", () => {
    const handle = barter();
    // Attached, because jsdom only moves focus to an element that is in the document —
    // which is also the only case where focus is worth keeping.
    document.body.appendChild(handle.root);
    const input = handle.root.querySelector<HTMLInputElement>("[data-testid='barter-qty-offered-gold']")!;
    input.focus();
    expect(document.activeElement).toBe(input);
    setQuantity(handle, "offered", "gold", 4);
    // The panel rebuilds itself on every change, so this is the one that has to survive it.
    const again = handle.root.querySelector<HTMLInputElement>("[data-testid='barter-qty-offered-gold']")!;
    expect(again).not.toBe(input);
    expect(document.activeElement).toBe(again);
    expect(again.value).toBe("4");
    handle.root.remove();
  });

  it("names every control, and gives both tables their column headings for the narrow layout", () => {
    const handle = barter();
    for (const el of Array.from(handle.root.querySelectorAll("button, input"))) {
      const label =
        el.getAttribute("aria-label") ??
        (el.id ? handle.root.querySelector(`label[for='${el.id}']`)?.textContent : null) ??
        el.textContent;
      expect(label?.trim().length ?? 0, `unnamed ${el.tagName}`).toBeGreaterThan(0);
      if (el.tagName === "BUTTON") expect(el.getAttribute("type")).toBe("button");
    }
    const table = handle.root.querySelector("[data-testid='barter-offered-table']")!;
    expect(table.classList.contains("table--stack")).toBe(true);
    const headings = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent ?? "");
    expect(headings).toEqual(["Item", "In hand", "Worth", "Putting down"]);
    for (const cell of Array.from(table.querySelectorAll("tbody td"))) {
      expect(headings).toContain(cell.getAttribute("data-label"));
    }
  });

  it("has no developer-speak in any of its states", () => {
    const BANNED_COPY = [/\bTODO\b/, /\bplaceholder\b/i, /\bundefined\b/, /\bNaN\b/, /\bnull\b/, /\[[\]]/, /!/];
    const states: [string, Node][] = [
      ["barter", barter().root],
      ["barter-skeleton", barter({ loading: true }).root],
      ["barter-no-trader", barter({ traderId: null, terms: null }).root],
      ["barter-empty-offer", barter({ terms: { ...terms, playerItems: [] } }).root],
      ["barter-empty-give", barter({ terms: { ...terms, traderItems: [] } }).root],
    ];
    const offenders: string[] = [];
    for (const [name, node] of states) {
      for (const line of visibleText(node).split(/(?<=[.:])\s+/)) {
        for (const pattern of BANNED_COPY) {
          if (pattern.test(line)) offenders.push(`${name}: ${pattern} in "${line.slice(0, 80)}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toHaveLength(0);
  });
});

// -- the quest panel -----------------------------------------------------------
//
// The quest log is the one panel whose buttons are chosen by a field rather than by the
// player, so the properties worth checking are the ones where a client that decided
// things for itself would be doing so plausibly and wrongly:
//
//  - The client's only arithmetic is `Math.round` on a figure the simulation sent. The
//    progress figure, the reward, the notice and the penalty are all read off the board
//    and asserted against it, because a quest log that computed its own progress would
//    agree with the world exactly when the world agreed with the quest log.
//  - The buttons are decided by `state` alone, and `state` is the simulation's. An offer
//    cannot be reported done and a settled request cannot be taken on.
//  - **The report button is shown even when the objective is not met.** `requirement.met`
//    is a reading taken when the board was read, and it is recomputed every tick, so
//    hiding the button until the gauge crossed a line would be the client settling a
//    matter the simulation exists to settle. What must appear is the refusal, in full,
//    in the simulation's own sentence.
//  - The cost of walking away is printed *before* the button, not only in the refusal.
//  - The board's order is the simulation's, and a settled request is replaced in place,
//    so pressing a button cannot shuffle the list under the cursor.

describe("the quest panel", () => {
  let questProvider: SimulationProvider;
  let questSnapshot: SimSnapshot;
  let board: IssueBoard;

  /** Its own provider: an order changes the world, and the tests above share theirs. */
  beforeAll(async () => {
    questProvider = createFixtureSimulationProvider();
    questSnapshot = await questProvider.getSnapshot();
    board = await questProvider.issueBoard(questSnapshot.party.id);
  });

  function quest(
    opts: {
      board?: IssueBoard | null;
      provider?: SimulationProvider;
      loading?: boolean;
      selectedId?: string;
      lastOutcome?: { tone: "good" | "critical"; text: string } | null;
      onAction?: (result: IssueActionResult) => void;
    } = {},
  ): QuestPanelHandle {
    return questPanel({
      partyId: questSnapshot.party.id,
      partyName: questSnapshot.party.name,
      board: opts.board === undefined ? board : opts.board,
      provider: opts.provider ?? questProvider,
      loading: opts.loading ?? false,
      onAction: opts.onAction ?? noop,
      onError: noop,
      ...(opts.selectedId === undefined ? {} : { selectedId: opts.selectedId }),
      ...(opts.lastOutcome === undefined ? {} : { lastOutcome: opts.lastOutcome }),
    });
  }

  /** The fixture seeds one request in each of the four states, which is what makes the
   *  four button sets testable at all. */
  function issueIn(state: IssueState): Issue {
    const found = board.issues.find((issue) => issue.state === state);
    expect(found, `the fixture seeds no ${state} request`).toBeDefined();
    return found!;
  }

  function press(root: HTMLElement, testId: string): void {
    const button = root.querySelector<HTMLButtonElement>(`[data-testid='${testId}']`);
    expect(button, `no control ${testId}`).not.toBeNull();
    button!.click();
  }

  it("shows every request on the board, in the simulation's own order", () => {
    const root = quest().root;
    const cards = Array.from(root.querySelectorAll("[data-testid^='quest-card-']"));
    expect(cards.length).toBe(board.issues.length);
    // The order is the simulation's, not a sort of the panel's own: read straight off the
    // board in the sequence it arrived.
    for (const [index, issue] of board.issues.entries()) {
      expect(cards[index]!.getAttribute("data-testid")).toBe(`quest-card-${issue.id}`);
    }
  });

  it("opens on a request that can still be acted on, and shows type, giver, reward, requirement and progress", () => {
    const root = quest().root;
    const open = board.issues.find((issue) => issue.state === "accepted")!;
    // Resolved by the panel, not handed in: the log must be useful the moment it opens.
    const pressed = root.querySelector("[aria-pressed='true']");
    expect(pressed?.getAttribute("data-testid")).toBe(`quest-card-${open.id}`);

    const detail = root.querySelector(`[data-testid='quest-detail-${open.id}']`)!;
    const text = visibleText(detail);
    // Type, in the player's words rather than the sim's key, and checked against the one
    // this request actually is rather than against any of the three.
    const KIND_WORD: Record<Issue["kind"], string> = {
      "deliver-goods": "Deliver goods",
      "clear-hideout": "Clear a hideout",
      escort: "Escort",
    };
    expect(visibleText(root.querySelector(`[data-testid='quest-kind-${open.id}']`)!)).toContain(KIND_WORD[open.kind]);
    expect(text).not.toContain(open.kind); // The raw key never reaches the screen.
    // Giver, with the role and the settlement.
    expect(text).toContain(open.notable.name);
    expect(text).toContain(open.notable.role);
    // The reward, all four parts, as the sim priced them.
    expect(root.querySelector("[data-testid='quest-reward-money'] .data")!.textContent).toBe(
      `$${Math.round(open.reward.money).toLocaleString("en-US")}`,
    );
    expect(root.querySelector("[data-testid='quest-reward-relation'] .data")!.textContent).toMatch(/^[+-]\d+$/);
    // The requirement, in the simulation's own sentence, verbatim.
    expect(visibleText(root.querySelector(`[data-testid='quest-requirement-${open.id}']`)!)).toContain(
      open.requirement.text,
    );
    expect(text).toContain(`${Math.round(open.requirement.amount).toLocaleString("en-US")} ${open.requirement.unit}`);
    // And progress, the only figure on the screen that moves, at the sim's own reading.
    const meter = root.querySelector(`[data-testid='quest-progress-${open.id}'] [role='meter']`)!;
    expect(meter.getAttribute("aria-valuenow")).toBe(String(Number(open.progress.toFixed(2))));
  });

  it("draws the step log the simulation wrote, in its own words", () => {
    const issue = issueIn("offered");
    const root = quest({ selectedId: issue.id }).root;
    const log = root.querySelector(`[data-testid='quest-log-${issue.id}']`)!;
    const steps = Array.from(log.querySelectorAll("li")).map((li) => li.textContent ?? "");
    expect(steps.length).toBe(issue.steps.length);
    for (const step of issue.steps) expect(steps.join(" ")).toContain(step.text);
  });

  it("offers the three buttons the request's state allows, and no others", () => {
    // An offer can only be taken on. Reporting it done would be reporting a fact, and
    // walking away from something never accepted is a refusal to help rather than a broken
    // promise.
    const offered = issueIn("offered");
    const offer = quest({ selectedId: offered.id }).root;
    expect(offer.querySelector(`[data-testid='quest-accept-${offered.id}']`)).not.toBeNull();
    expect(offer.querySelector(`[data-testid='quest-complete-${offered.id}']`)).toBeNull();
    expect(offer.querySelector(`[data-testid='quest-abandon-${offered.id}']`)).toBeNull();

    // An accepted one carries both remaining buttons.
    const accepted = issueIn("accepted");
    const live = quest({ selectedId: accepted.id }).root;
    expect(live.querySelector(`[data-testid='quest-accept-${accepted.id}']`)).toBeNull();
    expect(live.querySelector(`[data-testid='quest-complete-${accepted.id}']`)).not.toBeNull();
    expect(live.querySelector(`[data-testid='quest-abandon-${accepted.id}']`)).not.toBeNull();

    // A settled one has no order left to send, so it offers neither.
    const done = issueIn("succeeded");
    const shut = quest({ selectedId: done.id }).root;
    expect(shut.querySelector(`[data-testid='quest-accept-${done.id}']`)).toBeNull();
    expect(shut.querySelector(`[data-testid='quest-complete-${done.id}']`)).toBeNull();
    expect(shut.querySelector(`[data-testid='quest-abandon-${done.id}']`)).toBeNull();
  });

  it("keeps the report button up when the world does not meet the objective, and shows the refusal in full", async () => {
    const accepted = issueIn("accepted");
    const root = quest({ selectedId: accepted.id }).root;
    // The sim's own reading, taken when the board was read. Whatever it says, the button
    // is the player's to press and the sim is the one to refuse.
    const button = root.querySelector<HTMLButtonElement>(`[data-testid='quest-complete-${accepted.id}']`)!;
    expect(button).not.toBeNull();
    if (!accepted.requirement.met) {
      expect(button.getAttribute("title")).toMatch(/will refuse/);
    }

    press(root, `quest-complete-${accepted.id}`);
    await flush();

    const message = root.querySelector("[data-testid='quest-message']")!;
    expect(visibleText(message).length).toBeGreaterThan(0);
    if (!accepted.requirement.met) {
      // Refused, and refused in the simulation's own sentence rather than a red border.
      expect(visibleText(message)).toMatch(/met|reach|short|deliver/);
      expect(root.querySelector("[data-testid='quest-message-chip']")!.getAttribute("data-status")).toBe("critical");
    }
  });

  it("prints what walking away costs before the button, not only in the refusal", () => {
    const accepted = issueIn("accepted");
    const root = quest({ selectedId: accepted.id }).root;
    const penalty = root.querySelector("[data-testid='quest-abandon-penalty']")!;
    expect(penalty).not.toBeNull();
    expect(visibleText(penalty)).toContain(String(Math.abs(accepted.abandonPenalty)));
    // And it comes first in the row: the figure is above the control that spends it.
    const actions = root.querySelector("[data-testid='quest-actions']")!;
    const penaltyAt = Array.from(actions.children).indexOf(penalty);
    const abandonAt = Array.from(actions.children).indexOf(
      root.querySelector(`[data-testid='quest-abandon-${accepted.id}']`)!,
    );
    expect(penaltyAt).toBeGreaterThanOrEqual(0);
    expect(penaltyAt).toBeLessThan(abandonAt);
  });

  it("replaces a request with the simulation's version of it, in place, when an order lands", async () => {
    const offered = issueIn("offered");
    const results: IssueActionResult[] = [];
    const root = quest({ selectedId: offered.id, onAction: (r) => results.push(r) }).root;

    press(root, `quest-accept-${offered.id}`);
    await flush();

    // The app was told, so it can carry the confirmation across its own re-render.
    expect(results.length).toBe(1);
    expect(results[0]!.accepted).toBe(true);
    expect(results[0]!.action).toBe("accept");

    // The card is the one the sim sent back, with its new state and its new step.
    const fresh = await questProvider.issueBoard(questSnapshot.party.id);
    const settled = fresh.issues.find((issue) => issue.id === offered.id)!;
    expect(settled.state).toBe("accepted");
    expect(settled.steps.length).toBe(offered.steps.length + 1);
    // The list did not shuffle. The simulation sorts live work to the front, so the board
    // it would now send leads with issue-0 — but the panel holds the order it was given
    // and swaps the settled request into it, because a list that reorders under the
    // cursor on the same click that pressed the button is a list nobody can hit. The sim's
    // order is re-established on the next read, which is what the reload below checks.
    const before = board.issues.map((issue) => `quest-card-${issue.id}`);
    const cards = Array.from(root.querySelectorAll("[data-testid^='quest-card-']"));
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual(before);
    expect(fresh.issues.map((issue) => `quest-card-${issue.id}`)).not.toEqual(before);
    // And on a re-read the panel is in the simulation's order, because the simulation
    // decides it and this file has no sort of its own to impose.
    const reread = quest({ selectedId: offered.id });
    await reread.reload();
    expect(Array.from(reread.root.querySelectorAll("[data-testid^='quest-card-']")).map((c) => c.getAttribute("data-testid"))).toEqual(
      fresh.issues.map((issue) => `quest-card-${issue.id}`),
    );
    // And the card on screen says so, from the sim's state rather than a local flag.
    expect(visibleText(root.querySelector(`[data-testid='quest-card-${offered.id}']`)!)).toContain("Accepted");
    // The notice survives the action that produced it.
    expect(visibleText(root.querySelector("[data-testid='quest-message']")!)).toContain(results[0]!.verdict);
  });

  it("gives the quest screen a skeleton shaped like the list over the detail", () => {
    const sk = questSkeletonBody();
    const live = quest().root;
    // A page of request cards, then the open request with its gauge, then two buttons.
    expect(sk.querySelectorAll(".skeleton__list .skeleton__block").length).toBe(QUEST_LIST_ROWS);
    expect(sk.querySelectorAll(".skeleton__gauge").length).toBe(1);
    expect(sk.querySelectorAll(".skeleton__actions .skeleton__block").length).toBe(QUEST_ACTIONS);
    expect(sk.getAttribute("data-testid")).toBe("quest-skeleton");
    // And the live panel draws the gauge the skeleton reserved, so the two cannot drift.
    expect(live.querySelectorAll("[role='meter']").length).toBe(1);
    // Nothing in the skeleton rotates, so it is a placeholder and not a spinner in costume.
    expect(uiCss()).not.toMatch(/@keyframes\s+spin/);
  });

  it("puts the skeleton up before the request rather than a blank sheet", async () => {
    // Handed no board, the panel draws the shape of the screen and then asks for it.
    const handle = quest({ board: null, loading: false });
    expect(handle.root.querySelector("[data-testid='quest-skeleton']")).not.toBeNull();
    await handle.reload();
    expect(handle.root.querySelector("[data-testid='quest-skeleton']")).toBeNull();
    expect(handle.root.querySelectorAll("[data-testid^='quest-card-']").length).toBe(board.issues.length);
  });

  it("says a plain thing and offers a real retry when the log cannot be read", async () => {
    const broken: SimulationProvider = {
      ...questProvider,
      issueBoard: () => Promise.reject(new SimulationUnavailableError("The quest log could not be read.", "HTTP 503")),
    };
    const handle = quest({ board: null, provider: broken, loading: false });
    await flush();
    const error = handle.root.querySelector("[data-testid='quest-error']")!;
    expect(visibleText(error)).toContain("The quest log could not be read.");
    expect(error.getAttribute("role")).toBe("alert");
    // The retry is a request, not a repaint of the same missing data.
    expect(handle.root.querySelector("[data-testid='quest-error-retry']")).not.toBeNull();
    // A panel that is still loading says nothing about the failure.
    expect(handle.root.querySelector("[data-testid='quest-skeleton']")).toBeNull();
  });

  it("says what to do next when nobody has asked for anything", () => {
    const root = quest({ board: { ...board, issues: [] } }).root;
    const empty = root.querySelector("[data-testid='empty-state']")!;
    expect(visibleText(empty)).toMatch(/No one has asked you for anything/);
    // CONSTITUTION.md 3.3: the next move, not an apology.
    expect(visibleText(empty)).toMatch(/short of food|unsafe|troubled|go (somewhere|to a settlement)/i);
  });

  it("carries every status as a glyph as well as a colour, and every numeral in mono", () => {
    const root = quest().root;
    const glyphs = new Set<string>();
    for (const chip of Array.from(root.querySelectorAll(".chip"))) {
      const glyph = chip.querySelector<HTMLElement>(".chip__glyph")!;
      expect(glyph.textContent!.trim()).toMatch(/^(◆|▲|●|■|○)$/);
      expect(glyph.style.color).toMatch(/^var\(--/);
      expect(chip.getAttribute("aria-label")).toMatch(/^(Critical|Warning|Healthy|For information|No change):/);
      glyphs.add(glyph.textContent!.trim());
    }
    // Four states on the board, so the chips have to carry more than one mark between them.
    expect(glyphs.size).toBeGreaterThan(1);
    // Figures are set in mono with tabular figures, so a changing gauge cannot reflow.
    expect(css_block(".data")).toMatch(/font-family: var\(--font-mono\)/);
    expect(css_block(".data")).toMatch(/tabular-nums/);
  });

  it("names every control, and gives the whole card a name rather than a strip of text", () => {
    const root = quest().root;
    for (const el of Array.from(root.querySelectorAll("button"))) {
      expect(el.getAttribute("type")).toBe("button");
      const label = el.getAttribute("aria-label") ?? el.textContent;
      expect(label?.trim().length ?? 0, `unnamed ${el.textContent ?? "button"}`).toBeGreaterThan(0);
    }
    for (const card of Array.from(root.querySelectorAll(".quest"))) {
      // The whole card is the control, so the name has to be on the card and name the
      // request rather than repeating the settlement line.
      expect(card.getAttribute("aria-label")).toMatch(/asked by .+ of .+, (Offered|Accepted|Done|Failed)$/);
      expect(card.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
    }
  });

  it("keeps the keyboard on the request the player opened", () => {
    const handle = quest();
    document.body.appendChild(handle.root);
    const other = board.issues.find((issue) => issue.id !== board.issues[0]!.id)!;
    const card = handle.root.querySelector<HTMLButtonElement>(`[data-testid='quest-card-${other.id}']`)!;
    card.focus();
    expect(document.activeElement).toBe(card);
    card.click();
    // The panel rebuilds itself on every selection, so this is what has to survive it.
    const again = handle.root.querySelector<HTMLButtonElement>(`[data-testid='quest-card-${other.id}']`)!;
    expect(again).not.toBe(card);
    expect(document.activeElement).toBe(again);
    expect(again.getAttribute("aria-pressed")).toBe("true");
    handle.root.remove();
  });

  it("has no developer-speak in any of its states", () => {
    const BANNED_COPY = [/\bTODO\b/, /\bplaceholder\b/i, /\bundefined\b/, /\bNaN\b/, /\bnull\b/, /\[[\]]/, /!/];
    const offered = issueIn("offered");
    const states: [string, Node][] = [
      ["quest", quest().root],
      ["quest-skeleton", quest({ loading: true }).root],
      ["quest-empty", quest({ board: { ...board, issues: [] } }).root],
      ["quest-accepted", quest({ selectedId: issueIn("accepted").id }).root],
      ["quest-settled", quest({ selectedId: issueIn("failed").id }).root],
      ["quest-closed-notice", quest({ lastOutcome: { tone: "critical", text: "The request was not taken up." } }).root],
      ["quest-no-steps", quest({ board: { ...board, issues: [{ ...offered, steps: [] }] } }).root],
    ];
    const offenders: string[] = [];
    for (const [name, node] of states) {
      for (const line of visibleText(node).split(/(?<=[.:])\s+/)) {
        for (const pattern of BANNED_COPY) {
          if (pattern.test(line)) offenders.push(`${name}: ${pattern} in "${line.slice(0, 80)}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toHaveLength(0);
  });
});
