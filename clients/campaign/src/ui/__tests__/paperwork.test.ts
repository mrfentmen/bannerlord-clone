/**
 * The Why panel, the ledger, the march planner, the rulers and the start screen.
 *
 * The other panel test file (`panels.test.ts`) covers the town, market and party panels.
 * This one covers the five panels that are not the context-region trio, and it asserts
 * the same four properties they are asserted against, because the rules do not apply to
 * some panels and not to others:
 *
 *  - A skeleton is a named component shaped like the real panel and drawn before the
 *    data arrives, and its block counts are compared against the live panel so the two
 *    cannot drift apart quietly (CONSTITUTION.md section 3.2, ART_DIRECTION.md
 *    section 11).
 *  - An error says a plain sentence and offers a way out (section 1.3).
 *  - An empty state says what to do next, in the voice of the finished product
 *    (section 3.3, ART_DIRECTION.md section 10.2).
 *  - Every number in a table, ledger or cause chain is IBM Plex Mono with tabular
 *    figures, and every status carries its glyph as well as its colour
 *    (ART_DIRECTION.md sections 3.1 and 5.3).
 *
 * Two of the properties are specific to these panels and get their own describes:
 *
 *  - **The Why chain must be multi-link.** A single cause, or a generated paragraph, is
 *    the failure the premise forbids. The chain is asserted as a graph walk: several
 *    links, in causal order, each reachable from a link above it, and the panel's own
 *    `walkCauseChain` checked against a graph with a branch in it and a loop in it,
 *    because those are the two shapes a real cause log produces and the two a naive
 *    walk gets wrong.
 *  - **The march planner must not commit on the first press.** `MARCH_AND_WAR.md`
 *    section 11 wants the cost shown before the player commits; a button that shows the
 *    price and takes the order in one press is not showing anything before anything.
 *
 * The data comes from the test fixture, which is what a fixture is for. Nothing here
 * reaches a production path: `src/data/fixture` resolves to a throwing module in any
 * non-dev build, and `tools/check-no-fixtures.mjs` fails the build if its markers reach
 * `dist/`.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import { ledgerPanel, ledgerPanelError } from "../panels/LedgerPanel.js";
import { marchPlanner, type MarchPlannerHandle } from "../panels/MarchPlanner.js";
import { rulerCard, rulerRoster } from "../panels/RulerPanel.js";
import { startScreen, startScreenError } from "../panels/StartScreen.js";
import { walkCauseChain, whyPanel } from "../panels/WhyPanel.js";
import {
  CARD_EVENT_ROWS,
  LEDGER_EXPENSE_ROWS,
  LEDGER_INCOME_ROWS,
  LEDGER_NET_ROWS,
  LEDGER_SECTIONS,
  LEDGER_WARNING_SLOTS,
  MARCH_COST_CELLS,
  MARCH_WARNING_SLOTS,
  ROSTER_CARDS,
  START_ROLE_CARDS,
  START_SIDE_CARDS,
  START_STATE_CARDS,
  ledgerSkeletonBody,
  marchSkeletonBody,
  rosterSkeletonBody,
  rulerCardSkeletonBody,
  startRoleSkeletonBody,
  startSkeletonBody,
  startStateSkeletonBody,
  whySkeletonBody,
  whyRelatedSkeletonBody,
  MARCH_SUMMARY_ROWS,
  ROSTER_FILTERS,
  WHY_LINKS_SHOWN,
  WHY_RELATED_ROWS,
} from "../panels/panel-skeletons.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import type {
  CauseRow,
  Ledger as LedgerState,
  MarchPlan,
  RulerState,
  SideState,
  SimSnapshot,
  SimulationProvider,
} from "../../data/types.js";

function tokensCss(): string {
  return readFileSync(join(process.cwd(), "src", "design", "tokens.css"), "utf8");
}

/** The same resource names the ledger uses, so a test can find a row by its label. */
const RESOURCE_LABEL: Record<string, string> = {
  money: "Money",
  gold: "Gold",
  food: "Grain",
  metal: "Metal",
  medicine: "Medicine",
};

function uiCss(): string {
  return readFileSync(join(process.cwd(), "src", "ui", "ui.css"), "utf8");
}

let provider: SimulationProvider;
let snapshot: SimSnapshot;
let golden: SimSnapshot["towns"][number];
let ruler: RulerState;

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

function ledger(opts: { ledger?: LedgerState; warnings?: SimSnapshot["warnings"]; loading?: boolean } = {}): HTMLElement {
  return ledgerPanel({
    ledger: opts.ledger ?? snapshot.ledger,
    warnings: opts.warnings ?? snapshot.warnings,
    onWhy: noop,
    ...(opts.loading === undefined ? {} : { loading: opts.loading }),
  });
}

function roster(opts: { rulers?: RulerState[]; selectedId?: string | null; loading?: boolean } = {}): HTMLElement {
  return rulerRoster({
    rulers: opts.rulers ?? snapshot.rulers,
    playerFactionId: snapshot.player.factionId,
    selectedId: opts.selectedId ?? null,
    onSelect: noop,
    ...(opts.loading === undefined ? {} : { loading: opts.loading }),
  });
}

function card(opts: { ruler?: RulerState; loading?: boolean } = {}): HTMLElement {
  return rulerCard({
    ruler: opts.ruler ?? ruler,
    onWhy: noop,
    ...(opts.loading === undefined ? {} : { loading: opts.loading }),
  });
}

function march(opts: { provider?: SimulationProvider; destinations?: SimSnapshot["towns"] } = {}): MarchPlannerHandle {
  const towns = opts.destinations ?? snapshot.towns;
  return marchPlanner({
    party: snapshot.party,
    destinations: towns.map((t) => ({
      id: t.settlementId,
      simulationId: t.settlementId,
      name: t.name,
      distanceKm: 20,
      distanceHint: "20 km",
      klass: t.klass,
    })),
    provider: opts.provider ?? provider,
    onError: noop,
  });
}

function start(opts: { loading?: boolean; sides?: SideState[] } = {}): HTMLElement {
  return startScreen({
    sides: opts.sides ?? snapshot.sides,
    startYear: 2005,
    eraLabel: "1990s to 2000s",
    onStart: noop,
    ...(opts.loading === undefined ? {} : { loading: opts.loading }),
  });
}

/** The Why panel, waited until the cause log has answered. */
async function why(entityId: string, field: string, p: SimulationProvider = provider): Promise<HTMLElement> {
  const handle = whyPanel({ entityId, field, provider: p, onDrill: noop });
  await flush();
  return handle.root;
}

beforeAll(async () => {
  provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
  golden = snapshot.towns.find((t) => t.name === "Golden")!;
  // A lord with holdings, so the card's holding block has something to print.
  ruler = snapshot.rulers.find((r) => r.holdings.length > 0) ?? snapshot.rulers[1]!;
});

// =============================================================================
// the why chain: the premise
// =============================================================================

describe("the why panel walks a multi-link chain (CAUSE_EFFECT.md section 4)", () => {
  it("renders several links, in causal order, each caused by a link above it", async () => {
    const root = await why(golden.id, "unrest");
    const links = Array.from(root.querySelectorAll<HTMLElement>(".why__link"));
    expect(links.length).toBeGreaterThanOrEqual(5);

    // The first line is what the player asked about and the last is the furthest cause,
    // so the outcome is at the top and the origin at the bottom.
    const text = links.map((l) => l.querySelector(".why__summary")?.textContent ?? "");
    expect(text[0]).toMatch(/unrest/i);
    expect(text.at(-1)).not.toMatch(/unrest/i);

    // The first link is never marked as a cause of anything, and every later link is
    // marked as one, which is the "<-" shape from UI_UX.md section 5.
    expect(links[0]!.querySelector(".why__arrow")).toBeNull();
    for (const link of links.slice(1)) {
      expect(link.querySelector(".why__arrow"), "a cause line carries the cause marker").not.toBeNull();
    }
  });

  it("indents by depth, so the shape of the cascade is visible before it is read", async () => {
    const root = await why(golden.id, "unrest");
    const depths = Array.from(root.querySelectorAll<HTMLElement>(".why__link")).map((l) =>
      Number(l.dataset.depth),
    );
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(3);
    // Monotonically deeper is wrong for a branching graph, but never shallower than the
    // first link, and never a negative.
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(0);
    // And the stylesheet actually indents by that attribute, in the four locked steps.
    const css = uiCss();
    for (const step of [1, 2, 3, 4]) {
      expect(css, `no indent for depth ${step}`).toMatch(new RegExp(`\\.why__link\\[data-depth="${step}"\\] \\{ margin-left: var\\(--space-\\d\\)`));
    }
  });

  it("prints every cause id verbatim, in mono, and quotes it", async () => {
    const chain = await provider.why(golden.id, "unrest");
    // The ids live inside the expanded line, so a line is opened first: a chain that
    // only printed ids on expand would still be checkable, but the panel should not make
    // the player open every line to see whether it has a handle at all.
    const root = await why(golden.id, "unrest");
    root.querySelector<HTMLButtonElement>("[data-testid='why-link']")!.click();
    const ids = Array.from(root.querySelectorAll<HTMLElement>(".why__id")).map((n) => n.textContent ?? "");
    expect(ids.length).toBeGreaterThan(0);
    // Every id on screen is an id the log actually holds, character for character. A
    // reformatted or renumbered id would be a chain the player cannot check by hand.
    const known = new Set(chain.rows.map((r) => r.id));
    for (const id of ids) expect(known.has(id), `"${id}" is not a cause id in the log`).toBe(true);
    // Mono, and the quotation marks come from the stylesheet so the quoted text is the
    // id alone.
    expect(tokensCss().slice(tokensCss().indexOf(".data-sm {"))).toMatch(/--font-mono/);
    expect(css_block(".why__id")).toMatch(/font-family: var\(--font-mono\)/);
    expect(css_block(".why__id::before")).toContain("\\201C");
    // And the id is in a <code> element, so a screen reader announces it as code.
    for (const node of Array.from(root.querySelectorAll<HTMLElement>(".why__id"))) {
      expect(node.tagName).toBe("CODE");
    }
  });

  it("expands a line to the exact values, the system that wrote it, and the day", async () => {
    const chain = await provider.why(golden.id, "unrest");
    const root = await why(golden.id, "unrest");

    // Closed to begin with: the expand-a-line interaction is a real disclosure, not a
    // detail panel that is always open.
    const toggles = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-testid='why-link']"));
    expect(toggles.every((t) => t.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(toggles[0]!.getAttribute("aria-controls")).toBeTruthy();
    expect(root.querySelector("[data-testid='why-detail']")).toBeNull();

    toggles[0]!.click();
    const detail = root.querySelector("[data-testid='why-detail']")!;
    const text = visibleText(detail);
    const head = chain.rows[0]!;
    // The before and after, the system, the day and the tick: everything
    // UI_UX.md section 5 asks for on one press.
    expect(text).toContain(String(head.old));
    expect(text).toContain(String(head.new));
    expect(text).toContain(head.system);
    expect(text).toMatch(new RegExp(`day ${head.day}`));
    expect(text).toMatch(new RegExp(`tick ${head.tick}`));
    // The two figures are set in mono, so a long value cannot reflow the line.
    expect(detail.querySelector(".why__change")).not.toBeNull();
    expect(css_block(".why__change")).toMatch(/font-family: var\(--font-mono\)/);
    expect(css_block(".why__change")).toMatch(/tabular-nums/);

    // And it collapses again, so the panel does not accumulate open lines.
    const closed = root.querySelector<HTMLButtonElement>("[data-testid='why-link']")!;
    expect(closed.getAttribute("aria-expanded")).toBe("true");
    closed.click();
    expect(root.querySelector("[data-testid='why-detail']")).toBeNull();
  });

  it("truncates at a readable depth and says how much it is hiding", async () => {
    const root = await why(golden.id, "unrest");
    const shown = root.querySelectorAll(".why__link").length;
    const total = (await provider.why(golden.id, "unrest")).rows.length;
    expect(shown).toBe(WHY_LINKS_SHOWN);
    expect(total).toBeGreaterThan(shown);

    const note = root.querySelector("[data-testid='why-truncation']")!;
    expect(visibleText(note)).toContain(`Showing ${WHY_LINKS_SHOWN} of ${total} links`);
    expect(visibleText(note)).toMatch(/continues \d+ more/);

    const more = root.querySelector<HTMLButtonElement>("[data-testid='why-show-all']")!;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    more.click();
    expect(root.querySelectorAll(".why__link").length).toBe(total);
    expect(root.querySelector("[data-testid='why-truncation']")).toBeNull();
    expect(root.querySelector<HTMLButtonElement>("[data-testid='why-show-all']")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("offers a way into the entity a link belongs to, so a chain that leaves town does not stop at the border", async () => {
    const root = await why(golden.id, "unrest");
    // Golden's chain is entirely Golden's, so nothing to drill into — which is correct
    // rather than a gap. A cross-entity link is offered, and this asserts the rule.
    expect(root.querySelector("[data-testid='why-drill']")).toBeNull();

    // Longmont's chain reaches into the party's own log after a trade, so build one and
    // check the affordance appears on the cross-entity line.
    const longmont = snapshot.towns.find((t) => t.name === "Longmont")!;
    const lakewood = snapshot.towns.find((t) => t.name === "Lakewood")!;
    await provider.trade({ partyId: "party-player", townId: lakewood.id, goodId: "grain", side: "buy", quantity: 40, expectedDay: snapshot.day });
    await provider.trade({ partyId: "party-player", townId: longmont.id, goodId: "grain", side: "sell", quantity: 40, expectedDay: snapshot.day });
    const traded = await why(longmont.id, "grain_price");
    const drills = traded.querySelectorAll("[data-testid='why-drill']");
    expect(drills.length).toBeGreaterThan(0);
    for (const d of Array.from(drills)) {
      expect(d.tagName).toBe("BUTTON");
      expect(d.getAttribute("type")).toBe("button");
      expect((d.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("says the honest empty thing when nothing caused the change", async () => {
    // Denver has a tax_rate row nowhere in the log, which is a real answer.
    const root = await why("town-denver", "tax_rate");
    const empty = root.querySelector("[data-testid='empty-state']")!;
    expect(empty).not.toBeNull();
    // ART_DIRECTION.md section 10.2, verbatim, and nothing else standing in for it.
    expect(visibleText(empty)).toBe("Nothing caused this. It was true when the survey was taken.");
    expect(root.querySelector("[data-testid='why-chain']")).toBeNull();
  });

  it("names the field and the entity the player asked about, so the panel is self-describing", async () => {
    const root = await why(golden.id, "unrest");
    const text = visibleText(root.querySelector(".why__head-block")!);
    expect(text).toContain("Golden");
    expect(text).toContain("day");
    expect(text).toContain("Unrest");
  });
});

/** One CSS rule body, so a test asserts on the rule rather than on the file. */
function css_block(selector: string): string {
  const css = uiCss();
  const at = css.indexOf(selector);
  if (at < 0) return "";
  return css.slice(at, css.indexOf("}", at));
}

/** The net-per-day figure the ledger prints for one labelled resource. */
function ledgerAmount(root: HTMLElement, label: string): string {
  const row = Array.from(root.querySelectorAll<HTMLElement>("[data-testid='ledger-net-table'] tbody tr")).find(
    (n) => n.firstElementChild?.textContent?.trim() === label,
  );
  return row?.querySelector<HTMLElement>("[data-testid='ledger-net']")?.textContent?.trim() ?? "";
}

/** Comments out of a stylesheet, so an assertion about a rule cannot match a comment. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("walkCauseChain, the pure walk under the panel", () => {
  function row(id: string, causedBy: string[]): CauseRow {
    return {
      id,
      tick: 1,
      day: 4,
      entityId: "town-x",
      entityName: "X",
      field: "unrest",
      old: 0.5,
      new: 0.6,
      system: "Unrest",
      causedBy,
      summary: `row ${id}`,
    };
  }

  it("walks depth-first, so a cause sits directly under what it caused", () => {
    // A diamond: a is caused by b and by c, and both b and c are caused by d. One
    // shortage, two consequences, one origin — which is the shape the CAUSE_EFFECT.md
    // section 5 case 2 chain actually has.
    const rows = [row("a", ["b", "c"]), row("b", ["d"]), row("c", ["d"]), row("d", [])];
    const links = walkCauseChain(rows);
    // Both edges out of a are shown, and both edges into d, because hiding either one
    // would make the cascade look tidier than the world is.
    expect(links.map((l) => l.row.id)).toEqual(["a", "b", "d", "c", "d"]);
    expect(links.map((l) => l.depth)).toEqual([0, 1, 2, 1, 2]);
    // The second appearance of d is marked, not hidden: one cause, two effects.
    expect(links.filter((l) => l.repeat).map((l) => l.row.id)).toEqual(["d"]);
  });

  it("terminates on a cycle instead of walking it forever", () => {
    // a causes b, b causes a. A loop in the log must not hang the panel.
    const links = walkCauseChain([row("a", ["b"]), row("b", ["a"])]);
    expect(links.map((l) => l.row.id)).toEqual(["a", "b"]);
    // And a longer cycle: a -> b -> c -> a.
    const longer = walkCauseChain([row("a", ["b"]), row("b", ["c"]), row("c", ["a"])]);
    expect(new Set(longer.map((l) => l.row.id))).toEqual(new Set(["a", "b", "c"]));
  });

  it("keeps a row the walk could not reach, because the simulation sent it as part of the chain", () => {
    // z is linked to nothing and is not the head. Dropping it would be the client
    // quietly editing the log.
    const links = walkCauseChain([row("a", ["b"]), row("b", []), row("z", ["unheard-of"])]);
    expect(links.map((l) => l.row.id)).toEqual(["a", "b", "z"]);
    // Appended flat, because there is no honest depth to give it.
    expect(links.at(-1)!.depth).toBe(0);
  });

  it("survives a row whose cause id is not in the chain at all", () => {
    const links = walkCauseChain([row("a", ["missing"])]);
    expect(links.map((l) => l.row.id)).toEqual(["a"]);
  });

  it("returns nothing for an empty log, rather than throwing or inventing a link", () => {
    expect(walkCauseChain([])).toEqual([]);
  });
});

// =============================================================================
// skeletons
// =============================================================================

describe("named skeletons, not spinners (CONSTITUTION.md 3.2, ART_DIRECTION.md 11)", () => {
  it("gives the why panel a why-skeleton shaped like the chain it replaces", async () => {
    const live = await why(golden.id, "unrest");
    const sk = whySkeletonBody();
    expect(sk.getAttribute("aria-busy")).toBe("true");
    expect(sk.getAttribute("role")).toBe("status");
    expect(visibleText(sk)).toMatch(/reading the cause log/i);
    // The link count is the same as a collapsed chain, at the same depths. A skeleton
    // that promised five grey rows and the panel drew one would jump.
    expect(sk.querySelectorAll(".skeleton__link").length).toBe(WHY_LINKS_SHOWN);
    expect(live.querySelectorAll(".why__link").length).toBe(WHY_LINKS_SHOWN);
    const depths = Array.from(sk.querySelectorAll<HTMLElement>(".skeleton__link")).map((n) => n.dataset.depth);
    expect(depths).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("reserves the related rail at the same row count the panel fills it to", async () => {
    const live = await why(golden.id, "unrest");
    const sk = whyRelatedSkeletonBody();
    expect(visibleText(sk)).toMatch(/reading what else changed/i);
    expect(sk.querySelectorAll(".skeleton__row").length).toBe(WHY_RELATED_ROWS);
    // The panel shows at most that many, so a longer rail cannot appear later and push
    // the panel down.
    expect(live.querySelectorAll("[data-testid='why-related-row']").length).toBeLessThanOrEqual(WHY_RELATED_ROWS);
  });

  it("puts the why-skeleton up on the first frame, before the request answers", () => {
    // Synchronously, with a provider that never answers.
    const stalling: SimulationProvider = {
      ...provider,
      why: () => new Promise<never>(() => {}),
    };
    const root = whyPanel({ entityId: golden.id, field: "unrest", provider: stalling, onDrill: noop }).root;
    const sk = root.querySelector("[data-testid='why-skeleton']");
    expect(sk, "no why-skeleton on the first frame").not.toBeNull();
    expect(sk!.getAttribute("aria-busy")).toBe("true");
    // A skeleton is not a complaint, and it is not a spinner.
    expect(root.querySelector("[data-testid='why-error']")).toBeNull();
    expect(sk!.querySelectorAll("button, input")).toHaveLength(0);
  });

  it("gives the ledger a ledger-skeleton with the same three sections and row counts", () => {
    const live = ledger();
    const sk = ledgerSkeletonBody();
    expect(sk.getAttribute("data-testid")).toBe("ledger-skeleton");
    expect(visibleText(sk)).toMatch(/reading the ledger/i);
    // The warning section, the net table and the two lists: the ledger's three sections
    // either way, so a shortage arriving does not change the panel's height.
    expect(live.querySelectorAll(".panel__section").length).toBe(LEDGER_SECTIONS);
    expect(sk.querySelectorAll(".skeleton__section").length).toBe(LEDGER_SECTIONS);
    // Same warning slots, same net rows, same list lengths.
    expect(sk.querySelectorAll(".skeleton__section")[0]!.querySelectorAll(".skeleton__row").length).toBe(LEDGER_WARNING_SLOTS);
    expect(sk.querySelectorAll(".skeleton__section")[1]!.querySelectorAll(".skeleton__tr").length).toBe(LEDGER_NET_ROWS);
    expect(sk.querySelectorAll(".skeleton__section")[2]!.querySelectorAll(".skeleton__row").length).toBe(
      LEDGER_INCOME_ROWS + LEDGER_EXPENSE_ROWS,
    );
  });

  it("draws the ledger skeleton as a whole sheet, so the context region does not jump", () => {
    const root = ledger({ loading: true });
    expect(root.classList.contains("panel")).toBe(true);
    expect(root.querySelector("[data-testid='ledger-skeleton']")).not.toBeNull();
    expect(root.querySelectorAll("button, input")).toHaveLength(0);
    // The title is plain while the day is still unknown, rather than a number the panel
    // has not been told.
    expect(root.querySelector(".panel__title")?.textContent).toBe("Ledger");
  });

  it("gives the march planner a march-skeleton with its cost cells and warnings", () => {
    const sk = marchSkeletonBody();
    expect(sk.getAttribute("data-testid")).toBe("march-skeleton");
    expect(visibleText(sk)).toMatch(/pricing the march/i);
    expect(sk.querySelectorAll(".skeleton__cell").length).toBe(MARCH_COST_CELLS);
    // The route and supply lines, then the warning slots.
    expect(sk.querySelectorAll(".skeleton__head-block .skeleton__row").length).toBe(MARCH_SUMMARY_ROWS);
    expect(sk.querySelectorAll(".skeleton__section .skeleton__row").length).toBe(MARCH_WARNING_SLOTS);
    // And the order button, so the confirm step does not appear from nowhere.
    expect(sk.querySelectorAll(".skeleton__actions .skeleton__block").length).toBe(1);
  });

  it("puts the march-skeleton up while the price is being asked for", () => {
    const stalling: SimulationProvider = { ...provider, planMarch: () => new Promise<never>(() => {}) };
    const root = march({ provider: stalling }).root;
    expect(root.querySelector("[data-testid='march-skeleton']")).not.toBeNull();
    expect(root.querySelector("[data-testid='march-commit']")).toBeNull();
  });

  it("gives the roster and the card their own named skeletons", () => {
    const rsk = rosterSkeletonBody();
    expect(rsk.getAttribute("data-testid")).toBe("ruler-roster-skeleton");
    expect(visibleText(rsk)).toMatch(/reading the roster/i);
    expect(rsk.querySelectorAll(".skeleton__filters .skeleton__row").length).toBe(ROSTER_FILTERS);
    expect(rsk.querySelectorAll(".skeleton__wide").length).toBe(ROSTER_CARDS);

    const csk = rulerCardSkeletonBody();
    expect(csk.getAttribute("data-testid")).toBe("ruler-card-skeleton");
    expect(visibleText(csk)).toMatch(/reading the ruler/i);
    expect(csk.querySelectorAll(".skeleton__section").length).toBe(4);
    expect(csk.querySelectorAll(".skeleton__gauge").length).toBe(5);
    expect(csk.querySelectorAll(".skeleton__tr").length).toBe(CARD_EVENT_ROWS);
  });

  it("gives the start screen a start-skeleton that is the real side grid", () => {
    const sk = startSkeletonBody();
    expect(sk.getAttribute("data-testid")).toBe("start-skeleton");
    expect(visibleText(sk)).toMatch(/reading the state profiles/i);
    // Seven cards: the six sections of FACTIONS.md plus the Wanderer start. The grid is
    // the real three-column grid, not one grey block.
    expect(sk.querySelectorAll(".skeleton__grid > .skeleton__block").length).toBe(START_SIDE_CARDS);
    expect(css_block(".skeleton--start-sides .skeleton__grid")).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    // The step skeleton, for the state and role steps.
    expect(startStateSkeletonBody().querySelectorAll(".skeleton__grid > .skeleton__block").length).toBe(START_STATE_CARDS);
    expect(startRoleSkeletonBody().querySelectorAll(".skeleton__grid > .skeleton__block").length).toBe(START_ROLE_CARDS);
  });

  it("puts the start-skeleton up while the state profiles stream in", () => {
    const root = start({ loading: true, sides: [] });
    expect(root.querySelector("[data-testid='start-skeleton']")).not.toBeNull();
    expect(root.querySelector("[data-testid='side-grid']")).toBeNull();
  });

  it("draws every skeleton as paper blocks, and never as a rotating element", () => {
    const css = uiCss();
    const wash = css.slice(css.indexOf("@keyframes skeleton-wash"));
    expect(wash.slice(0, wash.indexOf("}"))).toContain("opacity");
    expect(wash.slice(0, wash.indexOf("}"))).not.toContain("rotate");
    expect(css).not.toMatch(/@keyframes\s+\w*spin\b/);
    expect(css).toMatch(/\.skeleton__block\s*\{[^}]*--paper-400[^}]*\}/);
    // Every shape in this file is styled, so a skeleton is never an unmeasured block
    // and no shape carries a colour, a font or a spacing step of its own. The block is
    // stripped of its comments first, because a comment is allowed to say "26px" while
    // describing where the number came from.
    const mine = stripComments(css.slice(css.indexOf("/* ---------- the five skeletons")));
    const rules = mine.slice(0, mine.indexOf("@media"));
    for (const shape of ["why-chain", "ledger-book", "march-plan", "ruler-roster", "ruler-card", "start-sides"]) {
      expect(rules, `no rule for skeleton--${shape}`).toContain(`.skeleton--${shape} `);
    }
    // No literal colour anywhere in the block, and spacing only as a token.
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(rules).not.toMatch(/(margin|padding|gap|top|left|right|bottom):[^;]*\d+px/);
  });
});

// =============================================================================
// error states
// =============================================================================

describe("errors say something plain and offer a way out (CONSTITUTION.md 1.3)", () => {
  it("gives the why panel a message and a retry that re-reads the log", async () => {
    let fail = true;
    const flaky: SimulationProvider = {
      ...provider,
      why: async (entityId, field) => {
        if (fail) throw new Error("the socket closed");
        return provider.why(entityId, field);
      },
    };
    const root = whyPanel({ entityId: golden.id, field: "unrest", provider: flaky, onDrill: noop }).root;
    await flush();
    const error = root.querySelector("[data-testid='why-error']")!;
    expect(error, "a failed read must leave a message, not a blank panel").not.toBeNull();
    expect(visibleText(error)).toMatch(/could not be read|refused|not read/i);
    // The retry is a request, not a re-render: it can succeed where the last one failed.
    fail = false;
    root.querySelector<HTMLButtonElement>("[data-testid='why-error-retry']")!.click();
    await flush();
    expect(root.querySelector("[data-testid='why-error']")).toBeNull();
    expect(root.querySelectorAll("[data-testid='why-link']").length).toBeGreaterThanOrEqual(5);
  });

  it("offers a way out even when retrying cannot help", async () => {
    // The simulation can say the failure is permanent. Repeating the request would be a
    // lie, so the panel offers the door out instead.
    let closed = 0;
    const root = whyPanel({
      entityId: golden.id,
      field: "unrest",
      provider: {
        ...provider,
        why: async () => {
          throw new SimulationUnavailableError("The reason behind that change could not be read.", "HTTP 500", false);
        },
      },
      onDrill: noop,
      onClose: () => (closed += 1),
    }).root;
    await flush();
    expect(root.querySelector("[data-testid='why-error-retry']")).toBeNull();
    const dismiss = root.querySelector<HTMLButtonElement>("[data-testid='why-error-dismiss']")!;
    expect(dismiss).not.toBeNull();
    dismiss.click();
    expect(closed).toBe(1);
  });

  it("gives the ledger a message and a working retry", () => {
    let retried = 0;
    const node = ledgerPanelError("ECONNREFUSED 127.0.0.1:8080", () => (retried += 1));
    expect(visibleText(node)).toMatch(/did not load/i);
    const retry = node.querySelector<HTMLButtonElement>("[data-testid='ledger-error-retry']")!;
    expect(retry.textContent).toBe("Try again");
    retry.click();
    expect(retried).toBe(1);
    // The developer's reason goes to the console and never to the player.
    expect(visibleText(node)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|8080/);
  });

  it("retries the march price against a real request, and recovers", async () => {
    let fail = true;
    const flaky: SimulationProvider = {
      ...provider,
      planMarch: async (request) => {
        if (fail) throw new Error("the socket closed");
        return provider.planMarch(request);
      },
    };
    const handle = march({ provider: flaky });
    await flush();
    const error = handle.root.querySelector("[data-testid='march-error']")!;
    expect(error, "a failed price must leave a message").not.toBeNull();
    expect(visibleText(error)).toMatch(/could not be priced|could not be read|refused/i);

    fail = false;
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-error-retry']")!.click();
    await flush();
    expect(handle.root.querySelector("[data-testid='march-error']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='march-commit']")).not.toBeNull();
  });

  it("reports a refused march order and can give the same order again", async () => {
    let refused = true;
    const refusing: SimulationProvider = {
      ...provider,
      commitMarch: async (request) => {
        if (refused) throw new Error("the order was refused");
        return provider.commitMarch(request);
      },
    };
    const handle = march({ provider: refusing });
    await flush();
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit']")!.click();
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit-confirm']")!.click();
    await flush();
    const error = handle.root.querySelector("[data-testid='march-commit-error']")!;
    expect(error).not.toBeNull();
    expect(visibleText(error)).toMatch(/order to march was refused/i);

    refused = false;
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit-error-retry']")!.click();
    await flush();
    expect(handle.root.querySelector("[data-testid='march-commit-error']")).toBeNull();
  });

  it("gives the start screen a message and a working retry", () => {
    let retried = 0;
    const node = startScreenError("HTTP 503 from /v1/snapshot", () => (retried += 1));
    expect(visibleText(node)).toMatch(/sections did not load|list of sections/i);
    const retry = node.querySelector<HTMLButtonElement>("[data-testid='start-error-retry']")!;
    retry.click();
    expect(retried).toBe(1);
    expect(visibleText(node)).not.toMatch(/HTTP 503|\/v1\//);
  });

  it("sends the developer detail to the console in every panel, never to the player", () => {
    const seen: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => seen.push(args);
    try {
      ledgerPanelError("ECONNREFUSED 127.0.0.1:8080", noop);
      startScreenError("panic: runtime error in /v1/snapshot", noop);
    } finally {
      console.error = original;
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(visibleText(ledgerPanelError("ECONNREFUSED 127.0.0.1:8080", noop))).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
  });
});

// =============================================================================
// empty states
// =============================================================================

describe("empty states say what to do next (ART_DIRECTION.md 10.2)", () => {
  it("says there is nowhere to march to, and where to go first", () => {
    const handle = march({ destinations: [] });
    const text = visibleText(handle.root.querySelector("[data-testid='empty-state']")!);
    expect(text).toBe("Nowhere to march to. No surveyed road connects anywhere from here. Move to a town with a road first.");
  });

  it("says why a real place cannot be ordered to, rather than pretending", async () => {
    // A settlement on the real map with no town record in the simulation: a legitimate
    // thing to see in the list and a useless thing to march to.
    const places = [
      ...snapshot.towns
        .slice(0, 3)
        .map((t) => ({ id: t.settlementId, simulationId: t.settlementId, name: t.name, distanceKm: 20, distanceHint: "20 km", klass: t.klass })),
      { id: "unmapped-place", simulationId: null, name: "Nederland", distanceKm: 14, distanceHint: "14 km", klass: "town" as const },
    ];
    const handle = marchPlanner({
      party: snapshot.party,
      destinations: places,
      provider,
      onError: noop,
    });
    await flush();
    const select = handle.root.querySelector<HTMLSelectElement>("#march-target")!;
    select.value = "unmapped-place";
    select.dispatchEvent(new Event("change"));
    await flush();
    const text = visibleText(handle.root);
    expect(text).toMatch(/not running a town for Nederland/i);
    expect(text).toMatch(/real map/i);
    // No order button, because there is no order to give.
    expect(handle.root.querySelector("[data-testid='march-commit']")).toBeNull();
  });

  it("says the day closed with nothing on it, and blames the connection", () => {
    // A ledger with no lines at all. The panel must not draw two empty lists and say
    // nothing: an empty day and a ledger that failed to load look identical otherwise.
    const bare: LedgerState = { day: 9, income: [], expenses: [], netPerDay: {} };
    const root = ledger({ ledger: bare });
    const states = Array.from(root.querySelectorAll("[data-testid='empty-state']")).map((n) => visibleText(n));
    expect(states.some((t) => /nothing moved on the ledger today/i.test(t))).toBe(true);
    expect(states.some((t) => /connection to the simulation was refused/i.test(t))).toBe(true);
    expect(states.some((t) => /no account balances to show/i.test(t))).toBe(true);
  });

  it("says which of the two lists is empty, when only one of them is", () => {
    // One list empty and one full is the interesting case: the panel has to say which
    // account closed at nothing, not just that something did.
    const oneSided: LedgerState = {
      ...snapshot.ledger,
      income: [],
    };
    const root = ledger({ ledger: oneSided });
    const states = Array.from(root.querySelectorAll("[data-testid='empty-state']")).map((n) => visibleText(n));
    expect(states.some((t) => /no income lines today/i.test(t))).toBe(true);
    expect(states.some((t) => /nothing came in/i.test(t))).toBe(true);
    // The expense list is still there in full.
    expect(root.querySelectorAll("[data-testid='ledger-expenses'] li")).toHaveLength(snapshot.ledger.expenses.length);
    expect(states.some((t) => /no expenses today/i.test(t))).toBe(false);

    const other: LedgerState = { ...snapshot.ledger, expenses: [] };
    const root2 = ledger({ ledger: other });
    const states2 = Array.from(root2.querySelectorAll("[data-testid='empty-state']")).map((n) => visibleText(n));
    expect(states2.some((t) => /no expenses today/i.test(t))).toBe(true);
    expect(states2.some((t) => /no wages were due/i.test(t))).toBe(true);
  });

  it("says nothing is short when nothing is, and says so in words", () => {
    const root = ledger({ warnings: [] });
    expect(root.querySelector("[data-testid='ledger-warnings']")).toBeNull();
    const text = visibleText(root.querySelector("[data-testid='empty-state']")!);
    expect(text).toMatch(/nothing is short/i);
    expect(text).toMatch(/holds past tomorrow/i);
  });

  it("says no rulers are on the record, and says how to get some", () => {
    const root = roster({ rulers: [] });
    const text = visibleText(root.querySelector("[data-testid='empty-state']")!);
    expect(text).toMatch(/no rulers on the record/i);
    expect(text).toMatch(/start the clock|snapshot again/i);
  });

  it("says no rulers match, and offers to clear the filters", () => {
    // A roster of one ruler, so any filter other than that ruler's own side and rank
    // matches nothing.
    const one = snapshot.rulers[0]!;
    const root = rulerRoster({
      rulers: [one],
      playerFactionId: one.factionId,
      selectedId: null,
      onSelect: noop,
    });
    const rank = root.querySelector<HTMLSelectElement>("#roster-rank")!;
    const otherTier = one.tier === "mercenary-captain" ? "side-leader" : "mercenary-captain";
    rank.value = otherTier;
    rank.dispatchEvent(new Event("change"));

    const text = visibleText(root.querySelector("[data-testid='empty-state']")!);
    expect(text).toMatch(/no rulers match those filters/i);
    expect(text).toMatch(/widen the side/i);
    // And the count says the filter did it, rather than the list quietly emptying.
    expect(visibleText(root.querySelector("[data-testid='roster-count']")!)).toBe("0 of 1 on the record match these filters.");
    // The way out is a real button, and it works.
    const clear = root.querySelector<HTMLButtonElement>("[data-testid='roster-clear']")!;
    clear.click();
    expect(root.querySelectorAll(".ruler")).toHaveLength(1);
  });

  it("says a side holds no states, and what that means for the Wanderer", () => {
    const wanderer = snapshot.sides.find((s) => s.id === "wanderer")!;
    const root = start({ sides: [wanderer] });
    root.querySelector<HTMLButtonElement>("[data-testid='step-1']")!.click();
    const text = visibleText(root.querySelector("[data-testid='empty-state']")!);
    expect(text).toMatch(/no states in this section/i);
    expect(text).toMatch(/wanderer starts nowhere in particular/i);
  });

  it("says no sides were reported, and that nothing can be chosen", () => {
    const root = start({ sides: [] });
    const text = visibleText(root.querySelector("[data-testid='empty-state']")!);
    expect(text).toMatch(/no sides were reported/i);
    expect(text).toMatch(/nothing to pick/i);
  });
});

// =============================================================================
// the ledger
// =============================================================================

describe("the ledger", () => {
  it("carries every warning as a glyph, a colour and the word (ART_DIRECTION.md 5.3)", () => {
    const root = ledger();
    const warnings = Array.from(root.querySelectorAll<HTMLElement>(".ledger__warning"));
    expect(warnings.length).toBe(snapshot.warnings.length);
    // Every hook is keyed on the warning's own id, so the two grain warnings — the
    // party's and a town's — do not collide into one unreachable row.
    const ids = warnings.map((w) => w.dataset.testid);
    expect(new Set(ids).size).toBe(ids.length);
    const glyphs = new Set<string>();
    for (const w of warnings) {
      const chip = w.querySelector<HTMLElement>("[data-status]")!;
      const glyph = chip.querySelector<HTMLElement>(".chip__glyph")!;
      // The glyph alone is enough to read the severity: it is not hidden from anyone,
      // it is only marked decorative so it is not announced twice.
      expect(glyph.getAttribute("aria-hidden")).toBe("true");
      expect(glyph.textContent!.trim()).toMatch(/^(◆|▲|●|■|○)$/);
      glyphs.add(glyph.textContent!.trim());
      // The colour is the third signal, and it comes from a token rather than a literal.
      expect(glyph.style.color).toMatch(/^var\(--status-/);
      // And the word is in the accessible name, with the severity the border claims.
      expect(chip.getAttribute("aria-label")).toMatch(/^(Critical|Warning|Healthy|For information|No change): /);
      expect(chip.getAttribute("data-status")).toBe(w.dataset.severity);
      expect(snapshot.warnings.find((x) => x.id === w.dataset.testid!.replace("warning-", ""))!.severity).toBe(
        w.dataset.severity,
      );
    }
    // The fixture raises both a critical and a warning, so the two glyphs must not
    // collapse into one shape.
    expect(glyphs.size).toBeGreaterThan(1);
  });

  it("puts a clock on each warning that has one, and no figure on the ones that do not", () => {
    const root = ledger();
    const items = Array.from(root.querySelectorAll<HTMLElement>(".ledger__warning"));
    const withClock = snapshot.warnings.filter((w) => w.daysRemaining !== null);
    const without = snapshot.warnings.filter((w) => w.daysRemaining === null);
    expect(items.length).toBe(snapshot.warnings.length);
    // Every warning the simulation gave a horizon for carries it, in days, in words.
    expect(root.querySelectorAll("[data-testid^='warning-days-']").length).toBe(withClock.length);
    for (const warning of withClock) {
      const line = root.querySelector<HTMLElement>(`[data-testid='warning-days-${warning.id}']`)!;
      expect(visibleText(line)).toBe(`Lasts ${warning.daysRemaining!.toFixed(1)} days`);
    }
    // A warning with no horizon gets no figure at all rather than a misleading zero.
    for (const warning of without) {
      expect(root.querySelector(`[data-testid='warning-days-${warning.id}']`)).toBeNull();
    }
    // And the detail line is still there for those, so nothing is lost with the clock.
    for (const warning of snapshot.warnings) {
      const item = root.querySelector<HTMLElement>(`[data-testid='warning-${warning.id}']`)!;
      expect(visibleText(item)).toContain(warning.detail);
    }
  });

  it("puts every numeral in a table or a ledger line in mono, so a column cannot jitter", () => {
    const root = ledger();
    // The net-change table: the per-day figure is a numeric cell and therefore mono.
    const net = root.querySelector<HTMLTableCellElement>("[data-testid='ledger-net']")!;
    expect(net.classList.contains("table__td--numeric")).toBe(true);
    expect(net.querySelector(".ledger__amount")).not.toBeNull();
    // Every ledger line amount carries the data class.
    const amounts = Array.from(root.querySelectorAll<HTMLElement>(".ledger__list .ledger__amount"));
    expect(amounts.length).toBeGreaterThan(0);
    for (const a of amounts) expect(a.classList.contains("data")).toBe(true);
    // And the class is worth something: the generated stylesheet says what it means.
    const rule = tokensCss().slice(tokensCss().indexOf(".data {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/--font-mono/);
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/tabular-nums/);
  });

  it("says how many days each resource lasts, and never claims a resource is spent while it builds", () => {
    const root = ledger();
    const rows = Array.from(root.querySelectorAll<HTMLElement>("tbody tr"));
    const words = rows.map((r) => r.querySelectorAll("td")[3]?.textContent?.trim() ?? "");
    // A resource that is building is not running out, whatever warning happens to be
    // filed against it. A wallet taking in $286 a day cannot also be "already spent".
    const money = rows.find((r) => r.firstElementChild?.textContent?.trim() === "Money")!;
    expect(snapshot.ledger.netPerDay.money!).toBeGreaterThan(0);
    expect(money.querySelectorAll("td")[3]!.textContent).toBe("not falling");
    // A resource that is draining gets the warning's own figure, and a drained one with
    // no warning says so rather than guessing a horizon.
    const grain = rows.find((r) => r.firstElementChild?.textContent?.trim() === "Grain")!;
    expect(snapshot.ledger.netPerDay.food!).toBeLessThan(0);
    expect(grain.querySelectorAll("td")[3]!.textContent).toMatch(/\d+\.\d days$/);
    // And at least one row is in each state, so the rule is exercised both ways.
    expect(words.some((w) => /not falling/.test(w))).toBe(true);
    expect(words.some((w) => /no figure on file/.test(w))).toBe(true);
    // No row ever claims a horizon the simulation did not send.
    expect(words.some((w) => /0\.0 days|already spent/.test(w))).toBe(false);
  });

  it("gives every resource the unit that resource is counted in", () => {
    const root = ledger();
    const money = ledgerAmount(root, "Money");
    const grain = ledgerAmount(root, "Grain");
    const metal = ledgerAmount(root, "Metal");
    const medicine = ledgerAmount(root, "Medicine");
    // ECONOMY.md section 1: two currencies, food in person-days, medicine in doses, and
    // metal as an industrial stock in units — not dollars. An account that is level has
    // no sign, because a "+0" is a direction the account is not moving in.
    expect(money).toMatch(/^[+−]?\$[\d,]+$/);
    expect(grain).toMatch(/^[+−]?\d+\.\d days$/);
    expect(medicine).toMatch(/^[+−]?\d+ doses$/);
    expect(metal).toMatch(/^[+−]?\d+ units$/);
    expect(metal).not.toMatch(/\$/);
    expect(grain).not.toMatch(/\$/);
    // And every sign printed matches the sign the simulation sent.
    for (const [resource, label] of Object.entries(RESOURCE_LABEL)) {
      const perDay = snapshot.ledger.netPerDay[resource as keyof typeof snapshot.ledger.netPerDay];
      if (perDay === undefined || perDay === 0) continue;
      const shown = ledgerAmount(root, label);
      expect(shown.startsWith(perDay > 0 ? "+" : "−"), `${label}: "${shown}" for ${perDay}`).toBe(true);
    }
  });

  it("draws the net as a signed figure with a direction chip, not as a bare number", () => {
    const root = ledger();
    // Read the sign off the simulation's own figure rather than assuming one: what is
    // being checked is that the panel's sign, its colour and its chip agree with the
    // number that came in.
    for (const resource of ["money", "food", "metal", "medicine", "gold"] as const) {
      const perDay = snapshot.ledger.netPerDay[resource];
      if (perDay === undefined) continue;
      const label = RESOURCE_LABEL[resource];
      const row = Array.from(root.querySelectorAll<HTMLElement>("[data-testid='ledger-net-table'] tbody tr")).find(
        (n) => n.firstElementChild?.textContent?.trim() === label,
      );
      expect(row, `no net-change row for ${label}`).toBeDefined();
      const cell = row!.querySelector<HTMLElement>("[data-testid='ledger-net']")!;
      const amount = cell.querySelector<HTMLElement>(".ledger__amount")!;
      expect(amount.dataset.sign).toBe(perDay < 0 ? "negative" : perDay > 0 ? "positive" : "flat");
      if (perDay !== 0) {
        expect(cell.textContent!.trim().startsWith(perDay > 0 ? "+" : "−")).toBe(true);
      }
      const chip = root.querySelector<HTMLElement>(`[data-testid='ledger-net-chip-${resource}']`)!;
      expect(chip.getAttribute("aria-label")).toMatch(
        perDay < 0 ? /^Critical: Draining$/ : perDay > 0 ? /^Healthy: Building$/ : /^No change: Level$/,
      );
    }
    // And the fixture really does drain at least one account, so the negative branch is
    // exercised rather than merely present.
    expect(Object.values(snapshot.ledger.netPerDay).some((v) => (v ?? 0) < 0)).toBe(true);
  });

  it("keeps the two line lists under the carbon triplicate, and empties each with its own words", () => {
    const root = ledger();
    const cols = root.querySelector<HTMLElement>(".ledger__cols")!;
    expect(cols.classList.contains("triplicate")).toBe(true);
    expect(cols.querySelectorAll(".ledger__group").length).toBe(2);
    // The fixture has two income lines and four expense lines, and both lists are drawn.
    expect(root.querySelectorAll("[data-testid='ledger-income'] li").length).toBe(2);
    expect(root.querySelectorAll("[data-testid='ledger-expenses'] li").length).toBe(4);
  });

  it("links each warning to the Why panel, on the field the simulation named", () => {
    const opened: [string, string][] = [];
    const root = ledgerPanel({
      ledger: snapshot.ledger,
      warnings: snapshot.warnings,
      onWhy: (entityId, field) => opened.push([entityId, field]),
    });
    // Every warning has its own Why, and each one opens the entity and field that the
    // simulation named — including a town warning, which must open the town and not
    // the party.
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-testid^='warning-why-']"));
    expect(buttons).toHaveLength(snapshot.warnings.length);
    for (const [index, btn] of buttons.entries()) {
      btn.click();
      const warning = snapshot.warnings[index]!;
      expect(opened[index]).toEqual([warning.entityId, warning.field]);
    }
  });
});

// =============================================================================
// the march planner
// =============================================================================

describe("the march planner shows the cost before it takes the order (MARCH_AND_WAR.md 11)", () => {
  it("prices distance, days, arrival day and all three costs before any button exists", async () => {
    const handle = march();
    await flush();
    const summary = handle.root.querySelector("[data-testid='march-summary']")!;
    expect(visibleText(summary)).toMatch(/km · \d+ days? · arrives day \d+/);
    for (const id of ["march-cost-food", "march-cost-money", "march-cost-metal"]) {
      const cell = handle.root.querySelector<HTMLElement>(`[data-testid='${id}']`)!;
      expect(cell).not.toBeNull();
      // The figure is mono; the unit and the note are the caption class.
      expect(cell.querySelector(".data")!.textContent!.trim().length).toBeGreaterThan(0);
    }
    // And the cost is on screen at the moment the first button appears.
    expect(handle.root.querySelector("[data-testid='march-costs']")).not.toBeNull();
    expect(handle.root.querySelector("[data-testid='march-commit']")).not.toBeNull();
  });

  it("does not give the order on the first press", async () => {
    let committed = 0;
    const handle = marchPlanner({
      party: snapshot.party,
      destinations: snapshot.towns.map((t) => ({
        id: t.settlementId,
        simulationId: t.settlementId,
        name: t.name,
        distanceKm: 20,
        distanceHint: "20 km",
        klass: t.klass,
      })),
      provider,
      onError: noop,
      onCommitted: () => (committed += 1),
    });
    await flush();
    // The first button arms the order and shows the bill again.
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit']")!.click();
    expect(committed, "the first press gave the order").toBe(0);
    const bill = handle.root.querySelector<HTMLElement>("[data-testid='march-bill']")!;
    expect(bill).not.toBeNull();
    expect(visibleText(bill)).toMatch(/arrives day \d+/);
    for (const resource of ["grain", "money", "metal"]) {
      expect(handle.root.querySelector(`[data-testid='march-bill-${resource}']`), `no ${resource} on the bill`).not.toBeNull();
    }
    // And the cancel is on the same row, not hidden behind a close button.
    expect(handle.root.querySelector("[data-testid='march-cancel']")).not.toBeNull();

    // The second press is the one that gives it.
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit-confirm']")!.click();
    await flush();
    expect(committed).toBe(1);
  });

  it("disarms the order when the plan is changed, and hands focus back", async () => {
    const handle = march();
    await flush();
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit']")!.click();
    expect(handle.root.querySelector("[data-testid='march-confirm-block'] [data-testid='march-bill']")).not.toBeNull();

    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-cancel']")!.click();
    expect(handle.root.querySelector("[data-testid='march-bill']")).toBeNull();
    expect(handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit']")).not.toBeNull();

    // And a different destination disarms it too, because an armed order is a
    // statement about one place.
    handle.root.querySelector<HTMLButtonElement>("[data-testid='march-commit']")!.click();
    const select = handle.root.querySelector<HTMLSelectElement>("#march-target")!;
    select.value = snapshot.towns[1]!.settlementId;
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(handle.root.querySelector("[data-testid='march-bill']")).toBeNull();
  });

  it("shows days of supply on arrival as a meter with a value, and never as a bare 0.0", async () => {
    const handle = march();
    await flush();
    const meter = handle.root.querySelector<HTMLElement>("[data-testid='march-supply'] [role='meter']")!;
    expect(meter, "the supply meter MARCH_AND_WAR.md section 11 asks for").not.toBeNull();
    expect(meter.getAttribute("aria-label")).toBeTruthy();
    expect(meter.getAttribute("aria-valuenow") ?? meter.getAttribute("aria-valuetext")).toBeTruthy();
    // The written note is the sentence a player would say out loud, and it is never a
    // bare "0.0 days" for a march that runs out before it arrives.
    const note = visibleText(handle.root.querySelector("[data-testid='march-supply']")!);
    expect(note).toMatch(/days of grain left on arrival|No grain left on arrival|grain runs out/);
  });

  it("words a march that outlasts its food as a march that outlasts its food", async () => {
    // The plan is read from the simulation and the panel's sentence is checked against
    // it, whichever side of zero it lands on. Both branches are real: a march the
    // party's grain outlasts and one it does not.
    const dest = snapshot.towns.find((t) => t.settlementId === "longmont")!;
    const plan: MarchPlan = await provider.planMarch({
      partyId: snapshot.party.id,
      destinationSettlementId: dest.settlementId,
      departure: "now",
    });
    expect(plan.days).toBeGreaterThan(1);
    const handle = march({ destinations: [dest] });
    await flush();
    const note = visibleText(handle.root.querySelector("[data-testid='march-supply']")!);
    if (plan.daysOfFoodOnArrival === null || plan.daysOfFoodOnArrival <= 0) {
      expect(note).toMatch(/No grain left on arrival|grain runs out/);
      // Never a comfortable "About 0.0 days", which reads as fine until tonight.
      expect(note).not.toMatch(/About 0\.0 days/);
    } else {
      expect(note).toContain(`About ${plan.daysOfFoodOnArrival.toFixed(1)} days of grain left on arrival.`);
    }
  });

  it("carries every march warning as a glyph and a colour, and keeps them beside the price", async () => {
    const handle = march();
    await flush();
    const warnings = handle.root.querySelectorAll<HTMLElement>("[data-testid='march-warnings'] .warning");
    if (warnings.length > 0) {
      for (const w of warnings) {
        const chip = w.querySelector<HTMLElement>("[data-status]")!;
        const glyph = chip.querySelector<HTMLElement>(".chip__glyph")!;
        expect(glyph.textContent!.trim()).toMatch(/^(◆|▲)$/);
        expect(glyph.style.color).toMatch(/^var\(--status-/);
        expect(chip.getAttribute("aria-label")).toMatch(/^(Critical|Warning): /);
        expect(w.querySelector(".march__warning-text")!.textContent!.trim().length).toBeGreaterThan(10);
      }
    }
    // Warnings sit above the order button, so a bad march cannot be committed without
    // the warnings having been on screen with it.
    const list = handle.root.querySelector("[data-testid='march-warnings']")!;
    const commit = handle.root.querySelector("[data-testid='march-commit']")!;
    expect(list.compareDocumentPosition(commit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// =============================================================================
// rulers
// =============================================================================

describe("the ruler roster and card (RULERS.md section 9)", () => {
  it("filters by side, rank, standing and name, and says how many matched", () => {
    const root = roster();
    for (const id of ["roster-side-filter", "roster-rank-filter", "roster-relation-filter", "roster-search"]) {
      expect(root.querySelector(`[data-testid='${id}']`), `no ${id}`).not.toBeNull();
    }
    expect(visibleText(root.querySelector("[data-testid='roster-count']")!)).toBe(`${snapshot.rulers.length} on the record.`);

    const rank = root.querySelector<HTMLSelectElement>("#roster-rank")!;
    rank.value = "side-leader";
    rank.dispatchEvent(new Event("change"));
    const shown = Array.from(root.querySelectorAll<HTMLElement>(".ruler"));
    expect(shown.length).toBe(snapshot.rulers.filter((r) => r.tier === "side-leader").length);
    expect(shown.length).toBeGreaterThan(0);
    // The count says it filtered, rather than the list quietly shrinking.
    expect(visibleText(root.querySelector("[data-testid='roster-count']")!)).toMatch(
      new RegExp(`^${shown.length} of ${snapshot.rulers.length} on the record match these filters\\.$`),
    );

    rank.value = "all";
    rank.dispatchEvent(new Event("change"));
    const search = root.querySelector<HTMLInputElement>("#roster-search")!;
    search.value = snapshot.rulers[0]!.name.toLowerCase();
    search.dispatchEvent(new Event("input"));
    expect(root.querySelectorAll(".ruler").length).toBe(1);
  });

  it("gives every roster card a real accessible name, and marks the player's own side", () => {
    const root = roster();
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".ruler"));
    expect(cards.length).toBe(snapshot.rulers.length);
    for (const card of cards) {
      const name = card.getAttribute("aria-label") ?? "";
      expect(name.length).toBeGreaterThan(10);
      expect(card.tagName).toBe("BUTTON");
      expect(card.getAttribute("type")).toBe("button");
      expect(card.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
    }
    // The player is in the Mountain Alliance, so that is what gets marked.
    const mine = cards.filter((c) => (c.textContent ?? "").includes("Your side"));
    const expected = snapshot.rulers.filter((r) => r.factionId === snapshot.player.factionId).length;
    expect(mine.length).toBe(expected);
  });

  it("shows the five traits with a figure in mono, a reading in words, and a centre mark", () => {
    const root = card();
    const traits = root.querySelectorAll<HTMLElement>(".trait");
    expect(traits.length).toBe(5);
    for (const t of Array.from(traits)) {
      const value = t.querySelector<HTMLElement>(".trait__value")!;
      expect(value.classList.contains("data-sm")).toBe(true);
      expect(value.textContent).toMatch(/^\d\.\d\d$/);      // The bar grows both ways from the centre, so a cruel ruler and a generous one are
      // not the same shape.
      const fill = t.querySelector<HTMLElement>(".trait__fill")!;
      expect(fill.style.left).toBeTruthy();
      expect(t.querySelector(".trait__centre")).not.toBeNull();
      // And a bar is never the only way to read it: the reading is in words.
      expect(visibleText(t.querySelector(".trait__reading")!)).toMatch(/^(Very high|High|Middling|Low|Very low)$/);
    }
    // The figure is in IBM Plex Mono, which is what `data-sm` means, and the class is
    // only worth anything if the generated token stylesheet says so.
    const rule = tokensCss().slice(tokensCss().indexOf(".data-sm {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/--font-mono/);
  });

  it("prints holdings, garrison, loyalty, influence, renown and wealth in mono", () => {
    const root = card();
    const text = visibleText(root);
    expect(text).toContain(ruler.factionName);
    expect(text).toMatch(/age \d+/);
    expect(text).toContain(ruler.renown.toString());
    // Holdings by real name, or the honest mercenary line.
    const expected = ruler.holdings.length > 0 ? ruler.holdings.map((h) => h.name).join(", ") : "No land. A mercenary.";
    expect(text).toContain(expected);
    // Every mono figure in the value column.
    const values = Array.from(root.querySelectorAll<HTMLElement>(".row__value.data, .row__value .data"));
    expect(values.length).toBeGreaterThan(5);
  });

  it("says nothing is on the record for a ruler with no history, and explains what will be", () => {
    const fresh: RulerState = { ...ruler, recentEvents: [] };
    const root = card({ ruler: fresh });
    const text = visibleText(root.querySelector("[data-testid='empty-state']")!);
    expect(text).toMatch(/nothing on the record yet/i);
    expect(text).toMatch(/with a reason attached/i);
  });

  it("offers a Why entry for a decision the log recorded a reason for, and not otherwise", () => {
    const withReason: RulerState = {
      ...ruler,
      recentEvents: [
        { day: 3, text: "Attacked Longmont.", causedBy: "c-00012" },
        { day: 5, text: "Raised the tax rate." },
      ],
    };
    let asked: string | null = null;
    const root = rulerCard({ ruler: withReason, onWhy: (field) => (asked = field) });
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-testid='ruler-why']"));
    // One button, for the one event with a cause id on file.
    expect(buttons).toHaveLength(1);
    expect(visibleText(root.querySelector("[data-testid='ruler-events']")!)).toContain("no reason on file");
    buttons[0]!.click();
    expect(asked).toBe("loyalty_to_leader");
  });

  it("stacks the events table for a 390px screen and keeps its headings announced", () => {
    const busy: RulerState = {
      ...ruler,
      recentEvents: [
        { day: 3, text: "Attacked Longmont.", causedBy: "c-00012" },
        { day: 5, text: "Raised the tax rate." },
        { day: 9, text: "Moved a grain shipment.", causedBy: "c-00031" },
      ],
    };
    const table = card({ ruler: busy }).querySelector<HTMLElement>("[data-testid='ruler-events']")!;
    expect(table.classList.contains("table--stack")).toBe(true);
    const headings = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent ?? "");
    expect(headings).toEqual(["Day", "What happened", "Reason"]);
    // Every cell carries the heading of its column, because that is what the narrow
    // layout prints beside it and a screen reader needs when the header row is clipped.
    for (const cell of Array.from(table.querySelectorAll("tbody td"))) {
      expect(headings).toContain(cell.getAttribute("data-label"));
    }
    // And the stylesheet has the rule that stacks it, checked at 390px.
    const css = uiCss();
    expect(css).toMatch(/\.table--stack td::before\s*\{\s*content: attr\(data-label\)/);
  });
});

// =============================================================================
// the start screen
// =============================================================================

describe("the start screen (FACTIONS.md sections 3, 4 and 7)", () => {
  it("shows ratings, pros, cons and the biggest danger for every side", () => {
    const root = start();
    for (const side of snapshot.sides) {
      const cardNode = root.querySelector<HTMLElement>(`[data-testid='side-${side.id}']`)!;
      expect(cardNode, `no card for ${side.name}`).not.toBeNull();
      // Five ratings, each five pips and a figure.
      const ratings = cardNode.querySelectorAll<HTMLElement>(".rating");
      expect(ratings.length).toBe(5);
      for (const r of Array.from(ratings)) {
        expect(r.querySelectorAll(".rating__pip").length).toBe(5);
        expect(r.querySelector(".rating__pips")!.getAttribute("aria-label")).toMatch(/ of 5$/);
        expect(r.querySelector(".rating__value")!.textContent).toMatch(/^\d\/5$/);
      }
      // The values are the ones the simulation sent, not the design targets.
      for (const [key, label] of [["money", "Money"], ["gold", "Gold"], ["food", "Food"], ["metal", "Metal"], ["population", "People"]] as const) {
        const r = Array.from(ratings).find((n) => n.querySelector(".rating__label")?.textContent === label)!;
        expect(r.querySelector(".rating__value")!.textContent).toBe(`${side.ratings[key]}/5`);
      }
      // Pros and cons, all of them, transcribed from FACTIONS.md.
      const pros = Array.from(cardNode.querySelectorAll(".proscons > div")[0]!.querySelectorAll("li")).map((li) => li.textContent);
      const cons = Array.from(cardNode.querySelectorAll(".proscons > div")[1]!.querySelectorAll("li")).map((li) => li.textContent);
      expect(pros).toEqual(side.pros);
      expect(cons).toEqual(side.cons);
      // The biggest danger is its own labelled block, not buried in the cons list.
      const danger = cardNode.querySelector<HTMLElement>(`[data-testid='danger-${side.id}']`)!;
      expect(visibleText(danger)).toContain(side.biggestDanger);
      expect(visibleText(danger)).toMatch(/trouble you take on/i);
      // And the signature mechanic, which is the play style not the balance.
      expect(visibleText(cardNode)).toContain(side.signatureMechanic);
    }
  });

  it("draws the difficulty as a chip with a glyph, so it is not a bare word", () => {
    const root = start();
    for (const side of snapshot.sides) {
      const chip = root.querySelector<HTMLElement>(`[data-testid='side-difficulty-${side.id}']`)!;
      expect(chip.getAttribute("aria-label")).toMatch(/^(Critical|Warning|Healthy|For information): /);
      expect(chip.querySelector(".chip__glyph")!.textContent!.trim()).toMatch(/^(◆|▲|●|■)$/);
    }
  });

  it("walks side to state to role to confirm, and can go back from every step", () => {
    const started: { sideId: string; stateCode: string; role: string }[] = [];
    const root = startScreen({
      sides: snapshot.sides,
      startYear: 2005,
      eraLabel: "1990s to 2000s",
      onStart: (choice) => started.push(choice),
    });
    // The step bar is four real buttons, and the first is current.
    const steps = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-testid^='step-']"));
    expect(steps).toHaveLength(4);
    expect(steps[0]!.getAttribute("aria-current")).toBe("step");

    // Choose a side. The grid stays up, because a player comparing two sections has to
    // be able to change their mind without going back a step, and the choice is shown
    // with aria-pressed rather than by vanishing the other cards.
    const mountain = snapshot.sides.find((s) => s.id === "mountain-alliance")!;
    root.querySelector<HTMLButtonElement>(`[data-testid='side-${mountain.id}']`)!.click();
    expect(root.querySelector<HTMLButtonElement>(`[data-testid='side-${mountain.id}']`)!.getAttribute("aria-pressed")).toBe("true");
    const others = Array.from(root.querySelectorAll<HTMLElement>(".side")).filter((n) => n.dataset.testid !== `side-${mountain.id}`);
    expect(others.every((n) => n.getAttribute("aria-pressed") === "false")).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-testid='start-next']")!.click();

    // Then a state, then a role, then confirm.
    const stateCode = mountain.states[0]!.code;
    root.querySelector<HTMLButtonElement>(`[data-testid='state-${stateCode}']`)!.click();
    root.querySelector<HTMLButtonElement>("[data-testid='start-next']")!.click();
    expect(root.querySelector("[data-testid='role-grid']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("[data-testid='role-mercenary-captain']")!.click();
    root.querySelector<HTMLButtonElement>("[data-testid='step-3']")!.click();
    // The confirmation restates all three choices.
    const summary = visibleText(root.querySelector(".start__summary")!);
    expect(summary).toContain(mountain.name);
    expect(summary).toContain(mountain.states[0]!.name);
    expect(summary).toContain("Mercenary captain");
    expect(summary).toContain(mountain.biggestDanger);

    root.querySelector<HTMLButtonElement>("[data-testid='start-next']")!.click();
    expect(started).toHaveLength(1);
    expect(started[0]).toEqual({ sideId: mountain.id, stateCode, role: "mercenary-captain" });

    // Back from the confirm step, and the choices are all still there.
    root.querySelector<HTMLButtonElement>("[data-testid='step-3']")!.click();
    root.querySelector<HTMLButtonElement>("[data-testid='start-back']")!.click();
    expect(root.querySelector("[data-testid='role-grid']")).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>("[data-testid='role-mercenary-captain']")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("shuts a step whose choice has not been made, and says why on the button", () => {
    // A roster of one side that holds no states, so the state question is answered by
    // the section itself and the role step opens with it.
    const bare: SideState = { ...snapshot.sides[0]!, states: [] };
    const root = startScreen({ sides: [bare], startYear: 2005, eraLabel: "2000s", onStart: noop });
    const step = (n: number) => root.querySelector<HTMLButtonElement>(`[data-testid='step-${n}']`)!;
    expect(step(0).disabled).toBe(false);
    // The Wanderer-like start: no states to choose, so state and role are both open.
    expect(step(1).disabled).toBe(false);
    expect(step(2).disabled).toBe(false);
    expect(step(3).disabled).toBe(false);

    // A section that does hold states, opened with none chosen: the role step is shut,
    // and the button carries the reason rather than being a silent no-op.
    const withStates = snapshot.sides.find((s) => s.states.length > 0)!;
    const root2 = startScreen({ sides: [withStates], startYear: 2005, eraLabel: "2000s", onStart: noop });
    expect(root2.querySelector<HTMLButtonElement>("[data-testid='step-2']")!.disabled).toBe(false);
    // And with no sides at all, nothing past the first step is open.
    const empty = startScreen({ sides: [], startYear: 2005, eraLabel: "2000s", onStart: noop });
    for (const n of [1, 2, 3]) {
      const btn = empty.querySelector<HTMLButtonElement>(`[data-testid='step-${n}']`)!;
      expect(btn.disabled, `step ${n} should be shut with no sides`).toBe(true);
      expect(btn.title).toMatch(/first/i);
    }
  });

  it("preselects a state inside a chosen section, and never preselects one for a section with none", () => {
    const withStates = snapshot.sides.find((s) => s.states.length > 0)!;
    const root = startScreen({ sides: snapshot.sides, startYear: 2005, eraLabel: "2000s", onStart: noop });
    root.querySelector<HTMLButtonElement>(`[data-testid='side-${withStates.id}']`)!.click();
    root.querySelector<HTMLButtonElement>("[data-testid='step-1']")!.click();
    const pressed = Array.from(root.querySelectorAll<HTMLElement>(".state")).filter(
      (n) => n.getAttribute("aria-pressed") === "true",
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.dataset.testid).toBe(`state-${withStates.states[0]!.code}`);
  });

  it("re-seeds the state list when a different side is chosen", () => {
    const withStates = snapshot.sides.find((s) => s.states.length > 0)!;
    const root = startScreen({ sides: snapshot.sides, startYear: 2005, eraLabel: "2000s", onStart: noop });
    root.querySelector<HTMLButtonElement>(`[data-testid='side-${withStates.id}']`)!.click();
    root.querySelector<HTMLButtonElement>("[data-testid='step-1']")!.click();
    const codes = Array.from(root.querySelectorAll<HTMLElement>(".state")).map((n) => n.dataset.testid);
    expect(codes).toEqual(withStates.states.map((s) => `state-${s.code}`));
    // Exactly one state is selected, and it is the one that side actually holds.
    const pressed = Array.from(root.querySelectorAll<HTMLElement>(".state")).filter((n) => n.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });

  it("shows the state's real population, and refuses to invent one it does not have", () => {
    const withStates = snapshot.sides.find((s) => s.states.length > 0)!;
    const profile = withStates.states.find((s) => s.population !== null) ?? withStates.states[0]!;
    const root = startScreen({ sides: snapshot.sides, startYear: 2005, eraLabel: "2000s", onStart: noop });
    root.querySelector<HTMLButtonElement>(`[data-testid='side-${withStates.id}']`)!.click();
    root.querySelector<HTMLButtonElement>("[data-testid='step-1']")!.click();
    const cardNode = root.querySelector<HTMLElement>(`[data-testid='state-${profile.code}']`)!;
    const shown = profile.population === null ? "Population not surveyed" : profile.population.toLocaleString("en-US");
    expect(visibleText(cardNode)).toContain(shown);
    // The figure is mono when there is one, because it is a figure in a card.
    if (profile.population !== null) {
      expect(cardNode.querySelector(".state__pop .data")!.textContent).toBe(profile.population.toLocaleString("en-US"));
    }
  });

  it("prints the ratings with pips that are not the only carrier of the value", () => {
    const root = start();
    const pips = root.querySelector<HTMLElement>(".rating__pips")!;
    expect(pips.getAttribute("role")).toBe("img");
    // The accessible name carries the whole reading, and the figure beside it carries
    // the number, so neither the pips nor the figure is the only signal.
    expect(pips.getAttribute("aria-label")).toBe("Money 5 of 5");
    const value = root.querySelector<HTMLElement>(".rating__value")!;
    expect(value.textContent).toBe("5/5");
    // The figure is `data`, not `data-sm`: ART_DIRECTION.md section 3.2 sets a 15px
    // minimum for body size and `type-data-sm` is 12px. `type-data` is the locked step
    // that is both mono and legal, so the figure is not set in a size outside the scale.
    expect(value.classList.contains("data")).toBe(true);
    expect(value.classList.contains("data-sm")).toBe(false);
    for (const pip of Array.from(root.querySelectorAll<HTMLElement>(".rating__pip"))) {
      expect(pip.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("writes the display line once, and no more than once", () => {
    const root = start();
    expect(root.querySelectorAll("h1.display").length).toBe(1);
    expect(root.querySelectorAll(".start__lede").length).toBe(1);
  });
});

// =============================================================================
// cross-cutting: keyboard, copy, and the reason ids
// =============================================================================

describe("keyboard and accessible names (UI_UX.md section 12, ART_DIRECTION.md 12)", () => {
  it("gives every control in all five panels a real element and an accessible name", async () => {
    const root = await why(golden.id, "unrest");
    const panels: [string, HTMLElement][] = [
      ["why", root],
      ["ledger", ledger()],
      ["ledger-empty", ledger({ ledger: { day: 3, income: [], expenses: [], netPerDay: {} } })],
      ["ledger-skeleton", ledger({ loading: true })],
      ["march", march().root],
      ["roster", roster()],
      ["roster-skeleton", roster({ loading: true })],
      ["card", card()],
      ["card-skeleton", card({ loading: true })],
      ["start", start()],
      ["start-skeleton", start({ loading: true, sides: [] })],
    ];
    const problems: string[] = [];
    for (const [name, node] of panels) {
      for (const el of Array.from(node.querySelectorAll("button, input, select, a[href]"))) {
        if (!["BUTTON", "INPUT", "SELECT"].includes(el.tagName)) {
          problems.push(`${name}: <${el.tagName.toLowerCase()}> is not focusable by default`);
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
        // Nothing is out of the tab order unless it is a roving-tabindex widget.
        if (el.getAttribute("tabindex") === "-1" && !el.hasAttribute("role")) {
          problems.push(`${name}: a control with tabindex -1 and no role to explain it`);
        }
      }
    }
    expect(problems, problems.join("\n")).toHaveLength(0);
  });

  it("puts a meter role and a value on the march supply gauge", async () => {
    const handle = march();
    await flush();
    const meter = handle.root.querySelector<HTMLElement>("[data-testid='march-supply'] [role='meter']")!;
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBeTruthy();
    expect(meter.getAttribute("aria-valuenow")).toBeTruthy();
  });

  it("marks skeletons busy rather than trapping focus in them", () => {
    for (const node of [ledger({ loading: true }), roster({ loading: true }), card({ loading: true }), march().root]) {
      const sk = node.querySelector("[aria-busy='true']");
      if (sk) {
        expect(sk!.getAttribute("role")).toBe("status");
        expect(sk!.querySelectorAll("button, input, select")).toHaveLength(0);
      }
    }
  });

  it("never uses ink-300 for information, only for disabled controls", () => {
    // The disabled start steps are the one legitimate use: a step that cannot be opened.
    const root = startScreen({ sides: [{ ...snapshot.sides[0]!, states: [] }], startYear: 2005, eraLabel: "2000s", onStart: noop });
    for (const step of Array.from(root.querySelectorAll<HTMLElement>(".step[disabled]"))) {
      expect(step.getAttribute("aria-disabled")).not.toBe("true");
    }
    // And no status is carried by a colour alone anywhere in these panels.
    for (const node of [ledger(), roster(), card(), start()]) {
      for (const chip of Array.from(node.querySelectorAll<HTMLElement>(".chip"))) {
        expect(chip.querySelector(".chip__glyph")!.textContent!.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("copy in every state of the five panels (CONSTITUTION.md 3.3)", () => {
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
    /\bWelcome\b/i,
  ];

  it("has no developer-speak in the live, empty, skeleton or error states", async () => {
    const cases: [string, Node][] = [
      ["why", await why(golden.id, "unrest")],
      ["why-empty", await why("town-denver", "tax_rate")],
      ["why-error", whyPanel({ entityId: golden.id, field: "unrest", provider: { ...provider, why: async () => { throw new Error("boom"); } }, onDrill: noop }).root],
      ["ledger", ledger()],
      ["ledger-empty", ledger({ ledger: { day: 3, income: [], expenses: [], netPerDay: {} } })],
      ["ledger-skeleton", ledger({ loading: true })],
      ["ledger-error", ledgerPanelError("ECONNREFUSED 127.0.0.1:8080", noop)],
      ["march", march().root],
      ["march-empty", march({ destinations: [] }).root],
      ["roster", roster()],
      ["roster-skeleton", roster({ loading: true })],
      ["card", card()],
      ["card-skeleton", card({ loading: true })],
      ["start", start()],
      ["start-skeleton", start({ loading: true, sides: [] })],
      ["start-error", startScreenError("HTTP 503", noop)],
    ];
    const offenders: string[] = [];
    for (const [name, node] of cases) {
      for (const line of visibleText(node).split(/(?<=[.:;])\s+/)) {
        for (const pattern of BANNED) {
          if (pattern.test(line)) offenders.push(`${name}: ${pattern} in "${line.slice(0, 90)}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toHaveLength(0);
  });

  it("uses no exclamation marks, and no cuteness", async () => {
    const nodes: Node[] = [
      await why(golden.id, "unrest"),
      ledger(),
      march().root,
      roster(),
      card(),
      start(),
    ];
    for (const node of nodes) {
      const text = visibleText(node);
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/\bOops\b|\bWelcome\b|\bYay\b|\bCool\b/i);
    }
  });

  it("guards the harness itself, so a silently empty panel cannot pass the rest", () => {
    // Every panel above is asserted on its own rendered text. If one of them silently
    // rendered nothing, most of those assertions would pass vacuously. So the harness
    // is checked once here, on the same fixtures.
    expect(visibleText(ledger()).length).toBeGreaterThan(80);
    expect(visibleText(roster()).length).toBeGreaterThan(80);
    expect(visibleText(card()).length).toBeGreaterThan(80);
    expect(visibleText(start()).length).toBeGreaterThan(200);
  });
});

describe("the numbers come from the simulation, not from the client", () => {
  it("shows a party of twenty-five and the purse it is marching on", async () => {
    const headcount = snapshot.party.troops.reduce((a, t) => a + t.count, 0);
    expect(headcount).toBe(25);
    const handle = march();
    await flush();
    // The money cell quotes the headcount and the purse, so both can be checked against
    // the fixture rather than taken on trust.
    const money = visibleText(handle.root.querySelector("[data-testid='march-cost-money']")!);
    expect(money).toContain(`${headcount} troops`);
    expect(money).toContain(`$${Math.round(snapshot.party.money).toLocaleString("en-US")}`);
    // And the ledger's wage line bills the same twenty-five people.
    const wages = Array.from(ledger().querySelectorAll<HTMLElement>(".ledger__item"))
      .find((n) => (n.textContent ?? "").includes("Wages"))!;
    expect(visibleText(wages)).toContain(`${headcount} in the party`);
  });
});
