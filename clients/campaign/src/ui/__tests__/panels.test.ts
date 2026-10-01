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
import { ledgerPanel, ledgerPanelError } from "../panels/LedgerPanel.js";
import { explainWhy, MIN_CAUSE_LINKS, whyPanel } from "../panels/WhyPanel.js";
import { partyPanel, partyPanelError, partyPanelWithLoad, type PartyPanelHandle } from "../panels/PartyPanel.js";
import { townPanel, townPanelError, townPanelWithLoad, type TownPanelHandle } from "../panels/TownPanel.js";
import {
  ROSTER_PAGE_SIZE,
  ROSTER_ROW_PITCH_PX,
  rulerRoster,
} from "../panels/RulerPanel.js";
import {
  LOAD_PHASES,
  PARTY_CONDITION_GAUGES,
  PARTY_CONDITION_ROWS,
  PARTY_ROLE_ROWS,
  PARTY_SECTIONS,
  PARTY_SUPPLY_GAUGES,
  PARTY_WARNING_SLOTS,
  failedLoad,
  idleLoad,
  loadingLoad,
  marketSkeletonBody,
  partySkeletonBody,
  readyLoad,
  townSkeletonBody,
  TOWN_SECTIONS,
} from "../panels/skeletons.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import {
  ENTITY_REF_PREFIX,
  formatEntityRefId,
  isEntityRef,
  parseEntityRefId,
  type CauseRow,
  type EntityNameIndex,
  type EntityRef,
  type Ledger,
  type PartyState,
  type ReferencedLedgerLine,
  type ResourceWarning,
  type RulerState,
  type SimSnapshot,
  type SimulationProvider,
  type TownState,
} from "../../data/types.js";

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

// -- the read: a seam that is slow, and one that refuses -----------------------
//
// The delay and the failure both live in the provider, never in the panel. A panel that
// owns a timer could only ever be tested against its own timer, and the constitution
// asks the question about a slow read rather than about the clock.

interface SeamOptions {
  /** How long the read takes. The panel is told nothing about this. */
  delayMs?: number;
  /** What to throw instead of answering. `null` answers. */
  failure?: () => Error | null;
}

function seam(base: SimulationProvider, opts: SeamOptions = {}): SimulationProvider {
  return {
    ...base,
    getSnapshot: async () => {
      if (opts.delayMs) await new Promise<void>((r) => setTimeout(r, opts.delayMs));
      const failure = opts.failure?.();
      if (failure) throw failure;
      return base.getSnapshot();
    },
  };
}

/** The town panel reading Golden through a provider, with no survey in its hand. */
function townRead(source: SimulationProvider, opts: { town?: TownState | null } = {}): TownPanelHandle {
  return townPanelWithLoad({
    town: opts.town === undefined ? null : opts.town,
    townId: golden.id,
    townName: golden.name,
    provider: source,
    previous: null,
    onWhy: noop,
    onOpenMarket: noop,
    onMarchHere: noop,
    onRoster: noop,
  });
}

/** The party panel reading the roll through a provider, with no roll in its hand. */
function partyRead(source: SimulationProvider, opts: { party?: PartyState | null } = {}): PartyPanelHandle {
  return partyPanelWithLoad({
    party: opts.party === undefined ? null : opts.party,
    provider: source,
    previous: null,
    onWhy: noop,
  });
}

/** The town's own error state, reached through a connection that was refused. */
async function townReadError(): Promise<HTMLElement> {
  const handle = townRead(
    seam(provider, { failure: () => new Error("ECONNREFUSED 127.0.0.1:8080") }),
  );
  await handle.settled();
  return handle.root;
}

/** The party's own error state, reached through a connection that was refused. */
async function partyReadError(): Promise<HTMLElement> {
  const handle = partyRead(
    seam(provider, { failure: () => new Error("ECONNREFUSED 127.0.0.1:8080") }),
  );
  await handle.settled();
  return handle.root;
}

/**
 * The `.row` figures under one section heading, which is how a panel's rows are laid
 * out: each heading is followed by one wrapper holding that section's content, and the
 * next heading is where that stops. A count of a section's rows is therefore a count of
 * what the section itself draws, and nothing else.
 */
function rowsUnder(root: HTMLElement, heading: string): number {
  const kids = Array.from(root.querySelector(".panel__body")!.children);
  const start = kids.findIndex((n) => n.classList.contains("panel__section") && n.textContent?.includes(heading));
  if (start < 0) throw new Error(`no ${heading} section to measure`);
  const end = kids.findIndex((n, i) => i > start && n.classList.contains("panel__section"));
  return kids
    .slice(start + 1, end < 0 ? kids.length : end)
    .reduce((total, node) => total + node.querySelectorAll(".row").length, 0);
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
    expect(live.querySelectorAll(".panel__section").length).toBe(PARTY_SECTIONS);
    expect(sk.querySelectorAll(".skeleton__section").length).toBe(PARTY_SECTIONS);
    // Three supply gauges and two condition gauges, as the live panel draws them.
    expect(sk.querySelectorAll(".skeleton__gauge").length).toBe(PARTY_SUPPLY_GAUGES + PARTY_CONDITION_GAUGES);
    // And the same two table stubs, with the same column counts.
    expect(sk.querySelectorAll(".skeleton__table").length).toBe(2);
    expect(sk.querySelectorAll(".skeleton__tr").length).toBe(5);
  });

  it("reserves a row for every figure the condition section prints", () => {
    // The live panel prints wages owed, the daily bill, the daily rations, the purse and
    // the march speed whatever any of them say. A skeleton that reserved fewer rows
    // would be shorter than the panel it stands in for, and the layout would jump the
    // moment the roll landed.
    const live = party();
    const sk = partySkeletonBody();
    const condition = sk.querySelectorAll(".skeleton__section")[2]!;
    expect(condition.querySelectorAll(".skeleton__row").length).toBe(PARTY_CONDITION_ROWS);
    expect(rowsUnder(live, "Condition and wages")).toBe(PARTY_CONDITION_ROWS);
    // Roles is four label and value pairs, and all four are drawn filled or not.
    expect(sk.querySelectorAll(".skeleton__section")[3]!.querySelectorAll(".skeleton__row").length).toBe(PARTY_ROLE_ROWS);
    expect(rowsUnder(live, "Roles")).toBe(PARTY_ROLE_ROWS);
  });

  it("reserves a slot for every shortage the party panel can raise at once", () => {
    // A company short of grain, medicine, metal, morale and wages at the same time: the
    // worst frame the panel can draw, and therefore the one the placeholder has to hold.
    const starving: PartyState = {
      ...snapshot.party,
      food: 5,
      medicine: 0,
      metal: 0,
      morale: 0.1,
      wagesOwed: 9000,
    };
    const live = party({ party: starving });
    const raised = live.querySelectorAll("[data-testid^='party-warning-']:not([data-testid*='chip'])").length;
    expect(raised).toBe(PARTY_WARNING_SLOTS);
    // And the placeholder reserves exactly that many, so the worst frame still lands
    // into a tray of the same height.
    expect(partySkeletonBody().querySelectorAll(".skeleton__section")[0]!.querySelectorAll(".skeleton__row").length).toBe(
      PARTY_WARNING_SLOTS,
    );
  });

  it("gives the market a market-skeleton with a two-row table stub (ART_DIRECTION 11)", () => {
    const live = market().root;
    const sk = marketSkeletonBody();
    expect(sk.querySelectorAll(".skeleton__section").length).toBe(live.querySelectorAll(".panel__section").length);
    expect(sk.querySelectorAll(".skeleton__tr").length).toBe(2);
    expect(live.querySelectorAll(".panel__section").length).toBe(3);
    expect(sk.getAttribute("aria-busy")).toBe("true");
  });

  it("keeps a section's hairline rule out of its content rows", () => {
    // `ui.css` sets the rule to 1px and the row to 26px at equal specificity, with the
    // row rule later, so a rule that also carried `skeleton__row` was drawn 26px tall on
    // every section of all three panels. It is furniture, and a count of a section's
    // rows is a count of content.
    for (const skeleton of [townSkeletonBody(), marketSkeletonBody(), partySkeletonBody()]) {
      const rules = Array.from(skeleton.querySelectorAll(".skeleton__rule"));
      expect(rules.length).toBe(skeleton.querySelectorAll(".skeleton__section").length);
      for (const rule of rules) {
        expect(rule.classList.contains("skeleton__row")).toBe(false);
      }
    }
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

// -- the read: four phases, not a boolean --------------------------------------

describe("a panel reads through four phases, not a loading boolean (CONSTITUTION.md 3.2, 1.3)", () => {
  it("knows four phases and no more", () => {
    expect(LOAD_PHASES).toEqual(["idle", "loading", "ready", "error"]);
    // And each transition is the one thing it claims to be. A flag could only ever say
    // "draw a shape", which is why these four had to become a machine.
    expect(idleLoad<TownState>().phase).toBe("idle");
    expect(loadingLoad(idleLoad<TownState>()).phase).toBe("loading");
    expect(readyLoad(golden).phase).toBe("ready");
    expect(failedLoad<TownState>("The ledger did not load.", "ECONNREFUSED").phase).toBe("error");
    // A re-read knows what it is replacing: the value survives the round trip.
    expect(loadingLoad(readyLoad(golden)).value).toBe(golden);
    // Nothing is invented in any phase: only a read produces a value.
    expect(idleLoad<TownState>().value).toBeNull();
    expect(failedLoad<TownState>("The ledger did not load.", "ECONNREFUSED").value).toBeNull();
  });

  it("starts idle when there is nothing to show and nothing to ask for", () => {
    const town = townPanelWithLoad({
      town: null,
      onWhy: noop,
      onOpenMarket: noop,
      onMarchHere: noop,
      onRoster: noop,
    });
    expect(town.phase()).toBe("idle");
    expect(town.root.querySelector("[data-testid='empty-state']")).not.toBeNull();
    const party = partyPanelWithLoad({ party: null, onWhy: noop });
    expect(party.phase()).toBe("idle");
    expect(party.root.querySelector("[data-testid='empty-state']")).not.toBeNull();
  });

  it("draws what it was handed when there is no provider to read through", () => {
    // The context region has always been able to render a snapshot it was given. Handing
    // the panel no seam must not take that away, and must not send it looking for one.
    const town = townRead(seam(provider), { town: golden });
    expect(town.phase()).toBe("ready");
    expect(town.root.querySelector("[data-testid='town-population']")!.textContent).toBe("20,415");
    const party = partyRead(seam(provider), { party: snapshot.party });
    expect(party.phase()).toBe("ready");
    expect(party.root.querySelector("[data-testid='party-purse']")!.textContent).toBe(
      `$${Math.round(snapshot.party.money).toLocaleString("en-US")}`,
    );
  });
});

describe("the town panel holds its shape through a slow read", () => {
  it("puts the town-skeleton up before the request answers, and no complaint", async () => {
    const handle = townRead(seam(provider, { delayMs: 320 }));
    // Synchronously, before a single tick has passed: the request is in flight and the
    // panel has not failed yet, so it has nothing to apologise for.
    expect(handle.phase()).toBe("loading");
    const skeleton = handle.root.querySelector("[data-testid='town-skeleton']");
    expect(skeleton, "no town-skeleton on the first frame").not.toBeNull();
    expect(skeleton!.getAttribute("aria-busy")).toBe("true");
    expect(visibleText(skeleton!)).toMatch(/reading the town survey/i);
    expect(handle.root.querySelector("[data-testid='town-error']")).toBeNull();
    // Shaped like the panel it stands in for, so the context region does not jump.
    expect(skeleton!.querySelectorAll(".skeleton__section").length).toBe(TOWN_SECTIONS);
    expect(handle.root.classList.contains("panel")).toBe(true);

    const started = Date.now();
    await handle.settled();
    // A read this slow really was waited out rather than raced: the panel held the
    // placeholder for the whole of it and swapped in the survey at the end.
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(handle.phase()).toBe("ready");
  });

  it("replaces the skeleton with the survey when the read answers", async () => {
    const handle = townRead(seam(provider));
    expect(handle.root.querySelector("[data-testid='town-skeleton']")).not.toBeNull();
    await handle.settled();
    expect(handle.root.querySelector("[data-testid='town-skeleton']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='empty-state']")).toBeNull();
    // Golden's own figures, read out of the snapshot rather than stood in for.
    expect(handle.root.querySelector("[data-testid='town-population']")!.textContent).toBe(
      golden.population!.toLocaleString("en-US"),
    );
    expect(handle.root.querySelector("[data-testid='town-workers']")!.textContent).toBe(
      golden.workers.toLocaleString("en-US"),
    );
    expect(handle.root.querySelectorAll(".panel__section").length).toBe(TOWN_SECTIONS);
    // And the title bar names the town that actually arrived.
    expect(handle.root.querySelector(".panel__title")?.textContent).toBe(golden.name);
  });

  it("says a failed read in plain words and offers a way out of the panel", async () => {
    const handle = townRead(
      seam(provider, { failure: () => new Error("ECONNREFUSED 127.0.0.1:8080") }),
    );
    await handle.settled();
    expect(handle.phase()).toBe("error");
    const error = handle.root.querySelector("[data-testid='town-error']")!;
    expect(error, "a failed read must leave a message, not a blank panel").not.toBeNull();
    const said = visibleText(error);
    // The sentence names the town and the reason, in the product's voice.
    expect(said).toMatch(/The town ledger did not load/);
    expect(said).toContain(`and ${golden.name} could not be read`);
    expect(said).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|8080|Error:/);
    expect(said).not.toMatch(/something went wrong/i);
    // Two ways out, both real buttons: the request, and somewhere else to go.
    expect(handle.root.querySelector("[data-testid='town-error-roster']")).not.toBeNull();
    const retry = handle.root.querySelector<HTMLButtonElement>("[data-testid='town-error-retry']")!;
    expect(retry.tagName).toBe("BUTTON");
    expect(retry.getAttribute("type")).toBe("button");
    expect(retry.getAttribute("tabindex")).not.toBe("-1");
    expect(retry.textContent).toBe("Try again");
  });

  it("blames the snapshot, not the connection, when the answer came back without this town", async () => {
    // The request worked. Saying the connection was refused here would send the player
    // looking for a server that is answering perfectly well.
    const withoutIt: SimulationProvider = {
      ...provider,
      getSnapshot: async () => ({ ...snapshot, towns: snapshot.towns.filter((t) => t.id !== golden.id) }),
    };
    const handle = townRead(withoutIt);
    await handle.settled();
    expect(handle.phase()).toBe("error");
    const said = visibleText(handle.root.querySelector("[data-testid='town-error']")!);
    expect(said).toMatch(/The town ledger for Golden did not load/);
    expect(said).toMatch(/it carries no survey for that town/i);
    expect(said).not.toMatch(/connection to the simulation was refused/i);
  });

  it("recovers when the retry is pressed, because the retry is a request", async () => {
    let broken = true;
    const flaky = seam(provider, { failure: () => (broken ? new Error("the socket closed") : null) });
    const handle = townRead(flaky);
    await handle.settled();
    expect(handle.phase()).toBe("error");

    broken = false;
    handle.root.querySelector<HTMLButtonElement>("[data-testid='town-error-retry']")!.click();
    // The placeholder is up again before the request answers. A retry that re-rendered
    // the same missing data would be a lie told to the player.
    expect(handle.phase()).toBe("loading");
    expect(handle.root.querySelector("[data-testid='town-skeleton']")).not.toBeNull();
    await handle.settled();

    expect(handle.phase()).toBe("ready");
    expect(handle.root.querySelector("[data-testid='town-error']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='town-population']")!.textContent).toBe("20,415");
  });

  it("offers the door out instead of a retry when repeating cannot help", async () => {
    // The simulation can say the read is permanently unavailable. A button that repeats
    // a request it knows will fail is as much of a lie as one that re-renders missing
    // data, so the roster is offered in its place.
    const handle = townRead(
      seam(provider, {
        failure: () => new SimulationUnavailableError("The town ledger is not being kept.", "HTTP 500", false),
      }),
    );
    await handle.settled();
    expect(handle.phase()).toBe("error");
    expect(visibleText(handle.root)).toContain("The town ledger is not being kept.");
    expect(handle.root.querySelector("[data-testid='town-error-retry']")).toBeNull();
    const out = handle.root.querySelector<HTMLButtonElement>("[data-testid='town-error-roster']")!;
    expect(out.tagName).toBe("BUTTON");
    expect(out.textContent).toBe("Open the roster");
  });

  it("drops an answer from a request nobody is waiting for any more", async () => {
    // A slow first read answering after a faster second one must not flick the panel
    // back to a stale survey.
    const queued: ((snap: SimSnapshot) => void)[] = [];
    const pending: SimulationProvider = {
      ...provider,
      getSnapshot: () => new Promise<SimSnapshot>((r) => queued.push(r)),
    };
    const handle = townRead(pending);
    const first = handle.settled();
    const second = handle.reload();
    expect(queued).toHaveLength(2);

    queued[1]!({ ...snapshot, towns: [{ ...golden, population: 11111 }] });
    await second;
    expect(handle.phase()).toBe("ready");
    expect(handle.root.querySelector("[data-testid='town-population']")!.textContent).toBe("11,111");

    queued[0]!({ ...snapshot, towns: [{ ...golden, population: 22222 }] });
    await first;
    expect(handle.phase(), "a superseded answer must not move the panel back").toBe("ready");
    expect(handle.root.querySelector("[data-testid='town-population']")!.textContent).toBe("11,111");
  });
});

describe("the party panel holds its shape through a slow read", () => {
  it("puts the party-skeleton up before the request answers, and no complaint", async () => {
    const handle = partyRead(seam(provider, { delayMs: 320 }));
    expect(handle.phase()).toBe("loading");
    const skeleton = handle.root.querySelector("[data-testid='party-skeleton']");
    expect(skeleton, "no party-skeleton on the first frame").not.toBeNull();
    expect(skeleton!.getAttribute("aria-busy")).toBe("true");
    expect(visibleText(skeleton!)).toMatch(/reading the party roll/i);
    expect(handle.root.querySelector("[data-testid='party-error']")).toBeNull();
    expect(skeleton!.querySelectorAll(".skeleton__section").length).toBe(PARTY_SECTIONS);
    expect(handle.root.classList.contains("panel")).toBe(true);

    const started = Date.now();
    await handle.settled();
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(handle.phase()).toBe("ready");
  });

  it("replaces the skeleton with the roll when the read answers", async () => {
    const handle = partyRead(seam(provider));
    expect(handle.root.querySelector("[data-testid='party-skeleton']")).not.toBeNull();
    await handle.settled();
    expect(handle.root.querySelector("[data-testid='party-skeleton']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='party-troops']")).not.toBeNull();
    expect(handle.root.querySelectorAll("[data-testid='troop-count']")).toHaveLength(snapshot.party.troops.length);
    expect(handle.root.querySelector("[data-testid='party-purse']")!.textContent).toBe(
      `$${Math.round(snapshot.party.money).toLocaleString("en-US")}`,
    );
    expect(handle.root.querySelectorAll(".panel__section").length).toBe(PARTY_SECTIONS);
  });

  it("says a failed read in plain words and offers a way to recover", async () => {
    const handle = partyRead(
      seam(provider, { failure: () => new Error("ECONNREFUSED 127.0.0.1:8080") }),
    );
    await handle.settled();
    expect(handle.phase()).toBe("error");
    const error = handle.root.querySelector("[data-testid='party-error']")!;
    expect(error, "a failed read must leave a message, not a blank panel").not.toBeNull();
    const said = visibleText(error);
    expect(said).toMatch(/The party roll did not load/);
    expect(said).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|8080|Error:/);
    expect(said).not.toMatch(/something went wrong/i);
    const retry = handle.root.querySelector<HTMLButtonElement>("[data-testid='party-error-retry']")!;
    expect(retry.tagName).toBe("BUTTON");
    expect(retry.getAttribute("type")).toBe("button");
    expect(retry.getAttribute("tabindex")).not.toBe("-1");
  });

  it("recovers when the retry is pressed, because the retry is a request", async () => {
    let broken = true;
    const flaky = seam(provider, { failure: () => (broken ? new Error("the socket closed") : null) });
    const handle = partyRead(flaky);
    await handle.settled();
    expect(handle.phase()).toBe("error");

    broken = false;
    handle.root.querySelector<HTMLButtonElement>("[data-testid='party-error-retry']")!.click();
    expect(handle.phase()).toBe("loading");
    expect(handle.root.querySelector("[data-testid='party-skeleton']")).not.toBeNull();
    await handle.settled();

    expect(handle.phase()).toBe("ready");
    expect(handle.root.querySelector("[data-testid='party-error']")).toBeNull();
    expect(handle.root.querySelector("[data-testid='party-troops']")).not.toBeNull();
  });

  it("takes the simulation's own warnings off the snapshot the roll came from", async () => {
    // A re-read that left an empty warning tray beside a fresh roll would tell the
    // player nothing is short while the simulation has something filed against them, and
    // the two come off the same reply.
    const healthy: PartyState = {
      ...snapshot.party,
      food: 900,
      medicine: 40,
      metal: 300,
      morale: 0.9,
      wagesOwed: 0,
    };
    const filed: ResourceWarning = {
      id: "w-medicine-reserved",
      resource: "medicine",
      severity: "warning",
      headline: "MEDICINE RESERVED FOR THE GARRISON",
      detail: "Half the surgeon's stock is committed to the town until the garrison is paid.",
      daysRemaining: 4,
      entityId: healthy.id,
      field: "medicine",
    };
    const carrying: SimulationProvider = {
      ...provider,
      getSnapshot: async () => ({ ...snapshot, party: healthy, warnings: [filed] }),
    };
    // Handed the roll to find but no warnings, so the tray can only be filled from the
    // snapshot that answered.
    const handle = partyRead(carrying);
    await handle.settled();
    const row = handle.root.querySelector("[data-testid='party-warning-w-medicine-reserved']")!;
    expect(row).not.toBeNull();
    // Shown as the simulation sent it, not rewritten into this panel's voice.
    expect(visibleText(row)).toContain("MEDICINE RESERVED FOR THE GARRISON");
    // And nothing derived beside it: that party is short of nothing.
    expect(handle.root.querySelectorAll("[data-testid^='party-warning-']:not([data-testid*='chip'])")).toHaveLength(1);
  });

  it("drops an answer from a request nobody is waiting for any more", async () => {
    const queued: ((snap: SimSnapshot) => void)[] = [];
    const pending: SimulationProvider = {
      ...provider,
      getSnapshot: () => new Promise<SimSnapshot>((r) => queued.push(r)),
    };
    const handle = partyRead(pending);
    const first = handle.settled();
    const second = handle.reload();
    queued[1]!({ ...snapshot, party: { ...snapshot.party, money: 4321 } });
    await second;
    expect(handle.phase()).toBe("ready");
    expect(handle.root.querySelector("[data-testid='party-purse']")!.textContent).toBe("$4,321");

    queued[0]!({ ...snapshot, party: { ...snapshot.party, money: 9999 } });
    await first;
    expect(handle.phase()).toBe("ready");
    expect(handle.root.querySelector("[data-testid='party-purse']")!.textContent).toBe("$4,321");
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
  it("gives every control a real element and an accessible name", async () => {
    const panels: [string, HTMLElement][] = [
      ["town", town()],
      ["town-empty", town({ town: null })],
      ["town-skeleton", town({ loading: true })],
      ["town-error", await townReadError()],
      ["party", party()],
      ["party-empty", party({ party: null })],
      ["party-skeleton", party({ loading: true })],
      ["party-error", await partyReadError()],
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

  it("has no developer-speak in the empty, skeleton, error or live states", async () => {
    const cases: [string, Node][] = [
      ["town", town()],
      ["town-empty", town({ town: null })],
      ["town-skeleton", town({ loading: true })],
      ["town-error", townPanelError("Longmont", "ECONNREFUSED", noop)],
      // The two error states the panels draw themselves, off a refused read. The copy
      // in a state nobody renders by hand is the copy most likely to go unchecked.
      ["town-error-live", await townReadError()],
      ["market", market().root],
      ["market-skeleton", market({ loading: true }).root],
      ["party", party()],
      ["party-empty", party({ party: null })],
      ["party-skeleton", party({ loading: true })],
      ["party-error", partyPanelError("ECONNREFUSED", noop)],
      ["party-error-live", await partyReadError()],
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

// -- the ledger's entity references --------------------------------------------

describe("ledger entries link to real entities (typed EntityRef)", () => {
  /** A ledger with one line per kind of reference, plus one that has none. */
  const REF_LINES: ReferencedLedgerLine[] = [
    {
      id: "l-toll",
      label: "Road tolls, Clear Creek",
      resource: "money",
      amount: 0,
      perDay: 86,
      causedBy: "c-401",
      refs: [{ kind: "settlement", id: "golden" }, { kind: "ruler", id: "ruler-0" }],
    },
    {
      id: "l-convoy",
      label: "Convoy wages",
      resource: "money",
      amount: 0,
      perDay: -120,
      refs: [{ kind: "party", id: "party-player" }, { kind: "route", id: "golden->longmont" }],
    },
    {
      id: "l-plain",
      label: "Ammunition and repair",
      resource: "metal",
      amount: 3,
      perDay: -3,
    },
  ];

  const NAMES: EntityNameIndex = {
    "stl:golden": "Golden",
    "rlr:ruler-0": "Vashti Holdane",
    "pty:party-player": "The Oxbow Caravan",
    "rte:golden->longmont": "Golden to Longmont",
  };

  function refLedger(opts: {
    lines?: ReferencedLedgerLine[];
    entities?: EntityNameIndex;
    onSelect?: (ref: EntityRef) => void;
  } = {}): { root: HTMLElement; picked: EntityRef[] } {
    const lines = opts.lines ?? REF_LINES;
    const ledger: Ledger = { day: 212, income: [], expenses: lines, netPerDay: { money: -34, metal: -3 } };
    const picked: EntityRef[] = [];
    const root = ledgerPanel({
      ledger,
      warnings: [],
      ...(opts.entities === undefined ? { entities: NAMES } : { entities: opts.entities }),
      ...(opts.onSelect === undefined ? { onSelect: (ref: EntityRef) => picked.push(ref) } : { onSelect: opts.onSelect }),
    });
    return { root, picked };
  }

  it("gives every kind a documented prefix, and reads each id back to what it was", () => {
    // The format is the contract, so it is asserted rather than described: four kinds,
    // three-letter prefixes, and a round trip through the parser.
    expect(ENTITY_REF_PREFIX).toEqual({ settlement: "stl", ruler: "rlr", party: "pty", route: "rte" });
    for (const [kind, prefix] of Object.entries(ENTITY_REF_PREFIX)) {
      expect(prefix, `${kind} prefix must be three characters`).toHaveLength(3);
      expect(prefix).toMatch(/^[a-z]{3}$/);
    }
    const ref: EntityRef = { kind: "settlement", id: "idaho-springs" };
    expect(formatEntityRefId(ref)).toBe("stl:idaho-springs");
    expect(parseEntityRefId("stl:idaho-springs")).toEqual(ref);
    // A hyphenated slug survives, because that is what the imported data uses.
    expect(parseEntityRefId("stl:central-city")).toEqual({ kind: "settlement", id: "central-city" });
    // And a route keeps both ends legible rather than collapsing them.
    expect(parseEntityRefId("rte:golden->longmont")).toEqual({ kind: "route", id: "golden->longmont" });
  });

  it("rejects a malformed id rather than guessing at one", () => {
    const BAD = [
      "stl:",              // prefix with no id
      "s:golden",          // prefix too short
      "town:golden",       // a bare entity id that forgot the format
      "stl:Golden",        // capitals
      "stl:golden city",   // spaces
      "stl:-golden",       // leading dash
      "stl:golden-",       // trailing dash
      "stl:golden--town",  // doubled dash
      "stl:golden/longmont", // a path, which is not an id
      "stl:golden->longmont", // a route id claiming to be a settlement
      "rte:golden",        // a route missing its second end
      "rte:golden->",      // a route with an empty end
      "rte:golden->a->b",  // three ends
      "stl:undefined",     // a leaked JS value, which the slug grammar alone permits
      "stl:NaN",
      "stl:null",
      "",
    ];
    for (const raw of BAD) {
      expect(parseEntityRefId(raw), `${raw} should not parse`).toBeNull();
    }
    // Non-strings are not ids either, and saying so is the point of the guard.
    for (const raw of [null, undefined, 7, {}, [], true]) {
      expect(parseEntityRefId(raw)).toBeNull();
      expect(isEntityRef(raw)).toBe(false);
    }
    // An over-long slug is rejected rather than truncated.
    expect(parseEntityRefId(`stl:${"a".repeat(65)}`)).toBeNull();
    expect(parseEntityRefId(`stl:${"a".repeat(64)}`)).not.toBeNull();
    // And a well-formed pair passes the guard the renderer actually calls.
    expect(isEntityRef({ kind: "party", id: "party-player" })).toBe(true);
    expect(isEntityRef({ kind: "widget", id: "golden" })).toBe(false);
  });

  it("renders a reference with a name as a keyboard-reachable link that fires selection", () => {
    const { root, picked } = refLedger();
    const links = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-testid^='ledger-entity-']"));
    // Four refs across two lines, all resolved.
    expect(links).toHaveLength(4);
    for (const link of links) {
      // A real button: focusable by default, in the tab order, and an explicit type so
      // it cannot submit anything.
      expect(link.tagName).toBe("BUTTON");
      expect(link.getAttribute("type")).toBe("button");
      expect(link.getAttribute("tabindex")).not.toBe("-1");
      expect(link.disabled).toBe(false);
      // The visible text is the entity's own name, and the accessible name says which
      // kind of thing it is, so two accounts with the same name are distinguishable.
      expect(link.textContent!.trim()).toBeTruthy();
      expect(link.getAttribute("aria-label")).toMatch(
        /^(settlement|ruler|party|route) .+$/,
      );
      expect(link.getAttribute("data-ref")).toMatch(/^(stl|rlr|pty|rte):.+$/);
    }
    expect(links.map((l) => l.textContent)).toEqual(["Golden", "Vashti Holdane", "The Oxbow Caravan", "Golden to Longmont"]);

    // Clicking emits the reference itself, through the panel's own callback seam — no
    // global bus, and no navigation the panel invented for itself.
    links[0]!.click();
    links[3]!.click();
    expect(picked).toEqual([
      { kind: "settlement", id: "golden" },
      { kind: "route", id: "golden->longmont" },
    ]);
  });

  it("leaves a line with no references exactly as it was", () => {
    const { root } = refLedger();
    // The line that names no entity at all is unchanged by any of this: no link, no
    // glyph, no placeholder, and the amount exactly where it was.
    const plainLine = Array.from(root.querySelectorAll("[data-testid='ledger-expenses'] li")).find((li) =>
      li.textContent!.includes("Ammunition"),
    )!;
    expect(plainLine).toBeDefined();
    expect(plainLine.querySelectorAll("[data-testid^='ledger-entity-']")).toHaveLength(0);
    expect(plainLine.querySelectorAll(".ledger__stale")).toHaveLength(0);
    expect(plainLine.querySelector("button")).toBeNull();
    expect(plainLine.textContent).toContain("Ammunition and repair");
    expect(plainLine.textContent).toContain("−3 units");
    // And the cause id is still printed as mono text, not as a control.
    const causeId = root.querySelector("[data-testid='ledger-ref-l-toll']")!;
    expect(causeId.tagName).toBe("CODE");
    expect(causeId.classList.contains("data-sm")).toBe(true);
    expect(causeId.textContent).toBe("c-401");
  });

  it("degrades a missing entity to plain text with a glyph, a word and a tooltip", () => {
    // `NAMES` has no entry for the second settlement, so that one reference is stale.
    const lines: ReferencedLedgerLine[] = [
      {
        id: "l-toll",
        label: "Road tolls",
        resource: "money",
        amount: 0,
        perDay: 86,
        refs: [{ kind: "settlement", id: "golden" }, { kind: "settlement", id: "atlantis" }],
      },
    ];
    const { root } = refLedger({ lines });
    const stale = root.querySelector<HTMLElement>(".ledger__stale")!;
    expect(stale).not.toBeNull();
    // Not a control. A button that opens nothing is a lie about what the ledger knows.
    expect(stale.tagName).toBe("SPAN");
    expect(stale.querySelector("button")).toBeNull();
    // The glyph carries the state and is not read aloud as a character; the word carries
    // it again; the tooltip names what is missing.
    const glyph = stale.querySelector(".ledger__stale-glyph")!;
    expect(glyph.textContent).toBe("○");
    expect(glyph.getAttribute("aria-hidden")).toBe("true");
    expect(visibleText(stale)).toContain("Stale reference");
    expect(stale.getAttribute("title")).toMatch(/does not hold/);
    // The id is printed in mono, because it is an identifier and not a name we invented.
    expect(stale.getAttribute("data-ref")).toBe("stl:atlantis");
    expect(stale.querySelector(".ledger__ref")!.classList.contains("data-sm")).toBe(true);
    // And the sibling that *can* be resolved is still a working link, so one stale entry
    // never takes the rest of the line down with it.
    expect(root.querySelectorAll("button.ledger__entity")).toHaveLength(1);
  });

  it("degrades every reference when the client has no names at all, without crashing", () => {
    const { root } = refLedger({ entities: {} });
    expect(root.querySelectorAll("button.ledger__entity")).toHaveLength(0);
    expect(root.querySelectorAll(".ledger__stale")).toHaveLength(4);
    // Nothing anywhere in the panel reads as a leaked value or a broken render.
    const text = visibleText(root);
    expect(text).not.toMatch(/undefined|NaN|\bnull\b/);
  });

  it("degrades a reference it cannot read, rather than printing the broken value", () => {
    // The value came off the wire, so a malformed reference is a runtime case. Each of
    // these is something a sloppy serialiser could genuinely produce.
    const malformed = [
      { kind: "settlement", id: "Golden" },
      { kind: "settlement", id: "" },
      { kind: "settlement", id: "golden longmont" },
      { kind: "route", id: "golden" },
      { kind: "settlement", id: "undefined" },
      // A kind the simulation invented is not one of ours; the `as unknown` cast
      // above makes this an honest runtime case rather than a type error.
      { kind: "weather", id: "front" },
    ] as unknown as EntityRef[];
    const lines: ReferencedLedgerLine[] = [
      { id: "l-bad", label: "A line with a broken reference", resource: "money", amount: 0, perDay: 5, refs: malformed },
    ];
    const { root } = refLedger({ lines });
    // Every one of them is dropped rather than rendered: a malformed reference has no
    // honest label, so the only honest thing to show is the absence of one.
    expect(root.querySelectorAll(".ledger__stale")).toHaveLength(0);
    expect(root.querySelectorAll("button.ledger__entity")).toHaveLength(0);
    const text = visibleText(root);
    expect(text).toContain("A line with a broken reference");
    expect(text).not.toMatch(/undefined|NaN|\bnull\b|\[object/);
    // The line itself still renders in full — the amount and all.
    expect(text).toContain("+$5");
  });

  it("gives a stale reference no name to press, so a stale ledger cannot select anything", () => {
    // With no handler there is nothing honest to press, so even a resolvable reference
    // degrades rather than rendering a control that would do nothing.
    const { root } = refLedger({ onSelect: () => {} });
    expect(root.querySelectorAll("button.ledger__entity")).toHaveLength(4);
    const bare = ledgerPanel({
      ledger: { day: 212, income: [], expenses: REF_LINES, netPerDay: { money: -34 } },
      warnings: [],
      entities: NAMES,
    });
    expect(bare.querySelectorAll("button")).toHaveLength(0);
    expect(bare.querySelectorAll(".ledger__stale")).toHaveLength(4);
  });

  it("puts every id in mono, and no name on screen is a leaked value (ART_DIRECTION 3.1)", () => {
    const { root } = refLedger();
    for (const node of Array.from(root.querySelectorAll<HTMLElement>(".ledger__ref, .ledger__stale .data-sm"))) {
      expect(node.classList.contains("data-sm"), `${node.textContent} must be mono`).toBe(true);
    }
    // And the class means what the token stylesheet says it means.
    const rule = tokensCss().slice(tokensCss().indexOf(".data-sm {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/--font-mono/);
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/tabular-nums/);
  });

  it("gives every control in the ledger a real element and an accessible name", () => {
    for (const [name, root] of [
      ["ledger-refs", refLedger().root],
      ["ledger-stale", refLedger({ entities: {} }).root],
      ["ledger-error", ledgerPanelError("the socket closed", noop)],
    ] as [string, HTMLElement][]) {
      for (const el of Array.from(root.querySelectorAll("button, input, select, a[href]"))) {
        const label =
          el.getAttribute("aria-label") ??
          (el.id ? root.querySelector(`label[for='${el.id}']`)?.textContent : null) ??
          el.textContent ??
          "";
        expect(label.trim(), `${name}: a ${el.tagName.toLowerCase()} with no name`).not.toBe("");
        if (el.tagName === "BUTTON") {
          expect(el.getAttribute("type"), `${name}: a button that would submit its form`).toBe("button");
        }
      }
    }
  });

  it("says nothing developer-ish about a stale reference (CONSTITUTION.md 3.3)", () => {
    const { root } = refLedger({ entities: {} });
    const text = visibleText(root);
    for (const banned of [/TODO/, /FIXME/, /placeholder/i, /undefined/, /NaN/, /\bnull\b/, /\[[\]]/, /!/]) {
      expect(text, `${banned} in the stale copy`).not.toMatch(banned);
    }
  });
});

// =============================================================================
// the Why panel: a chain is links, not sentences
// =============================================================================
//
// `README.md` calls traceability the premise of the whole game, and `UI_UX.md` section 5
// is the only place it is specified. So this block asserts the panel's rule as a property
// of what it built rather than of what it was told:
//
//  - A chain is at least `MIN_CAUSE_LINKS` links, every link naming a system that wrote
//    one of its two rows. A single canned cause is not an answer, so neither is one
//    padded out to look like a chain.
//  - Every printed step carries the whole link — cause, effect, and the numbers with the
//    system that wrote them — and every number the panel formatted itself is in mono.
//  - Where the log cannot chain, the panel says which information is missing, by name,
//    and prints the links it does have. It does not invent the one it is missing.
//  - Nothing in any of those states is placeholder, developer-speak or a bare number.

/** One CSS rule body, so a test asserts on the rule rather than on the file. */
function css_block(selector: string): string {
  const css = uiCss();
  const at = css.indexOf(selector);
  if (at < 0) return "";
  return css.slice(at, css.indexOf("}", at));
}

/** A cause row, for the scenarios the fixture's cause log does not carry yet. */
function causeRow(over: Partial<CauseRow> & { id: string; field: string }): CauseRow {
  return {
    tick: 412,
    day: 214,
    entityId: "party-player",
    entityName: "Wren Calloway's party",
    old: 0,
    new: 0,
    system: "Food",
    causedBy: [],
    summary: "A write the log made.",
    ...over,
  };
}

/**
 * A cause log of this block's own.
 *
 * The market tests above trade on the shared provider, and a trade writes new rows into
 * its cause log — so the chain the panel would walk for a town the tests above traded in
 * is a different chain by the time these run. One fresh log for the whole block keeps
 * every scenario reading the same simulated history.
 */
let ownLog: SimulationProvider | null = null;
function ownProvider(): SimulationProvider {
  ownLog ??= createFixtureSimulationProvider();
  return ownLog;
}

/** A provider whose cause log holds exactly the rows a test hands it. */
function logWith(rows: CauseRow[]): SimulationProvider {
  return {
    ...ownProvider(),
    why: async (entityId, field) => ({
      entityId,
      field,
      rows,
      related: [],
      totalDepth: rows.length,
      truncated: false,
    }),
  };
}

/** The Why panel, waited until the cause log has answered. */
async function why(entityId: string, field: string, p: SimulationProvider = ownProvider()): Promise<HTMLElement> {
  const handle = whyPanel({ entityId, field, provider: p, onDrill: noop });
  await flush();
  return handle.root;
}

/**
 * The party bleeding out on a forced march: `CAUSE_EFFECT.md` section 10, case 6, in the
 * systems of sections 3 and 9. Morale gone, the Attrition system taking the four who
 * walked off, the grain store the march emptied, and the fatigue that emptied it. Four
 * rows, three links, four systems, listed the way `WhyChain.rows` arrives: the
 * observable result first, then its causes.
 */
const PARTY_ATTRITION: CauseRow[] = [
  causeRow({
    id: "a-4",
    field: "morale",
    old: 0.71,
    new: 0.44,
    system: "Military upkeep",
    causedBy: ["a-3"],
    summary: "Morale in the column fell from 0.71 to 0.44.",
  }),
  causeRow({
    id: "a-3",
    field: "troop_count",
    old: 25,
    new: 21,
    system: "Attrition",
    causedBy: ["a-2"],
    summary: "Four of twenty-five soldiers fell out of the column on the road.",
  }),
  causeRow({
    id: "a-2",
    field: "food",
    old: 31.4,
    new: 12.2,
    system: "Supply",
    causedBy: ["a-1"],
    summary: "Grain in the wagons fell from 31.4 to 12.2 person-days.",
  }),
  causeRow({
    id: "a-1",
    field: "fatigue",
    old: 0.41,
    new: 0.78,
    system: "March",
    summary: "Fatigue in the column rose from 0.41 to 0.78 on the sixth day of forced march.",
  }),
];
/**
 * Ruler hostility, from a real relation between two rulers rather than a mood. Vashti's
 * regard for the player falls, his standing with Halloway follows it down, he taxes his
 * own town harder to hold it, and the town turns on him — which is the first half of the
 * famine-to-vote chain in `CAUSE_EFFECT.md` section 5. Four rows, three links, and the
 * two ends of it sit on different entities, so the chain leaves the town on the way.
 */
const RULER_HOSTILITY: CauseRow[] = [
  causeRow({
    id: "r-4",
    entityId: "town-longmont",
    entityName: "Longmont",
    field: "unrest",
    old: 0.44,
    new: 0.58,
    system: "Unrest",
    causedBy: ["r-3"],
    summary: "Unrest in Longmont rose from 0.44 to 0.58.",
  }),
  causeRow({
    id: "r-3",
    entityId: "town-longmont",
    entityName: "Longmont",
    field: "tax_rate",
    old: 0.22,
    new: 0.34,
    system: "Ruler decision",
    causedBy: ["r-2"],
    summary: "The tax rate Vashti set on Longmont rose from 0.22 to 0.34.",
  }),
  causeRow({
    id: "r-2",
    entityId: "ruler-vashti",
    entityName: "Corin Vashti",
    field: "influence",
    old: 61,
    new: 44,
    system: "Influence",
    causedBy: ["r-1"],
    summary: "Vashti's influence in the Mountain Alliance fell from 61 to 44.",
  }),
  causeRow({
    id: "r-1",
    entityId: "ruler-vashti",
    entityName: "Corin Vashti",
    field: "relation_to_player",
    old: 34,
    new: 12,
    system: "Relation",
    summary: "Vashti's regard for the player fell from 34 to 12.",
  }),
];
describe("every explanation the Why panel can give is a real chain of links", () => {
  /**
   * The campaign situations the panel has to answer, and the systems each answer them
   * with. Read off the fixture's own cause log wherever the log holds one, so what is
   * checked is the simulation's graph rather than a graph invented here; the two the
   * fixture does not carry yet — a party on a forced march, a ruler turning on the player
   * — are the rows the systems of `CAUSE_EFFECT.md` sections 3 and 9 would write.
   *
   * `rows` is absent for the scenarios read from the log, which is the point: the panel
   * is asked a question the simulation has already answered.
   */
  const SCENARIOS: {
    name: string;
    entityId: string;
    field: string;
    rows?: CauseRow[];
    systems: string[];
  }[] = [
    {
      name: "a town's unrest after an outbreak",
      entityId: "town-golden",
      field: "unrest",
      systems: ["Food", "Labor", "Disease", "Logistics", "Security"],
    },
    {
      name: "a town's supply shortage, priced by its market",
      entityId: "town-longmont",
      field: "grain_price",
      systems: ["Market", "Logistics", "Security", "Military upkeep"],
    },
    {
      name: "a road left undefended, so the medicine never arrived",
      entityId: "town-idaho-springs",
      field: "medicine_stock",
      systems: ["Logistics", "Security", "Military upkeep"],
    },
    {
      name: "a party bleeding out on a forced march",
      entityId: "party-player",
      field: "morale",
      rows: PARTY_ATTRITION,
      systems: ["Military upkeep", "Attrition", "Supply", "March"],
    },
    {
      name: "a ruler's hostility reaching the town he holds",
      entityId: "town-longmont",
      field: "unrest",
      rows: RULER_HOSTILITY,
      systems: ["Unrest", "Ruler decision", "Influence", "Relation"],
    },
  ];

  /** The provider that answers a scenario: the fixture's own log, or a stand-in for it. */
  function providerFor(scenario: (typeof SCENARIOS)[number]): SimulationProvider {
    return scenario.rows ? logWith(scenario.rows) : ownProvider();
  }

  /** A scenario whose entity the snapshot does not have would silently test nothing. */
  function assertEntityIsReal(scenario: (typeof SCENARIOS)[number]): void {
    const known = new Set([...snapshot.towns.map((t) => t.id), snapshot.party.id]);
    expect(known.has(scenario.entityId), `no entity ${scenario.entityId} in the snapshot`).toBe(true);
  }

  for (const scenario of SCENARIOS) {
    it(`walks ${scenario.name} as at least ${MIN_CAUSE_LINKS} links, each naming a system`, async () => {
      assertEntityIsReal(scenario);
      const chain = await providerFor(scenario).why(scenario.entityId, scenario.field);
      const result = explainWhy(chain.rows);

      // The rule itself: fewer links than this is not a chain, and the panel says so
      // rather than presenting it as one.
      expect(result.status, `${scenario.name} should read as a chain`).toBe("chain");
      expect(result.links.length).toBeGreaterThanOrEqual(MIN_CAUSE_LINKS);
      // A chain long enough to walk can still stop short at its origin, and where it does
      // it has to name a row that really is a dead end rather than one the walk skipped.
      for (const note of result.missing) {
        const row = result.steps.find((s) => s.row.id === note.rowId)!.row;
        expect(row.causedBy.filter((id) => chain.rows.some((r) => r.id === id)), note.rowId).toHaveLength(0);
        expect(note.sentence).toMatch(/^Not on file:/);
      }

      for (const link of result.links) {
        // Every link names a game system on both of its rows, which is the only honest
        // name a cause has while systems never call each other (section 2).
        expect(link.cause.system.length).toBeGreaterThan(0);
        expect(link.effect.system.length).toBeGreaterThan(0);
        // And the effect really is downstream of the cause, in the log's own graph.
        expect(link.effect.causedBy, `${link.cause.id} does not cause ${link.effect.id}`).toContain(link.cause.id);
        // The evidence is figures, not adjectives.
        expect(Number.isFinite(link.evidence.before)).toBe(true);
        expect(Number.isFinite(link.evidence.after)).toBe(true);
        expect(link.evidence.delta).toBeCloseTo(link.evidence.after - link.evidence.before, 10);
        expect(link.evidence.day).toBeGreaterThan(0);
        expect(link.evidence.tick).toBeGreaterThanOrEqual(0);
        expect(link.evidence.field).toBe(link.effect.field);
        expect(link.evidence.system).toBe(link.effect.system);
      }

      // The systems that answer it are the ones the situation calls for, so a chain that
      // quietly lost a link would fail here rather than pass on length alone.
      const named = new Set(result.links.flatMap((l) => [l.cause.system, l.effect.system]));
      for (const system of scenario.systems) {
        expect(named.has(system), `${scenario.name} no longer passes through the ${system} system`).toBe(true);
      }
      expect(named.size, "a chain through one system is a single cause wearing a chain's clothes").toBeGreaterThanOrEqual(3);
    });

    it(`prints the whole link on every step of ${scenario.name}`, async () => {
      const chain = await providerFor(scenario).why(scenario.entityId, scenario.field);
      const root = await why(scenario.entityId, scenario.field, providerFor(scenario));

      const edges = Array.from(root.querySelectorAll<HTMLElement>("[data-testid='why-edge']"));
      expect(edges.length).toBeGreaterThan(0);
      // The outcome is at the top and the origin at the bottom, so the effect of the
      // first link is the change that was asked about.
      expect(chain.rows[0]!.field).toBe(scenario.field);
      expect(edges[0]!.dataset.causeId).toBeDefined();

      for (const edge of edges) {
        const text = visibleText(edge);
        expect(text, "a link prints its cause").toContain("Cause");
        expect(text, "a link prints its effect").toContain("Effect");
        expect(text, "a link prints its evidence").toContain("Evidence");
        // Both ends of the link are named, and both are rows the log really holds.
        const ids = Array.from(edge.querySelectorAll<HTMLElement>(".why__id")).map((n) => n.textContent ?? "");
        expect(ids).toHaveLength(2);
        for (const id of ids) {
          expect(chain.rows.some((r) => r.id === id), `"${id}" is not a cause id in the log`).toBe(true);
        }
        // The figures are the log's, in mono with tabular figures, so an evidence column
        // cannot shift as the chain updates (ART_DIRECTION.md 3.1).
        const change = edge.querySelector<HTMLElement>(".why__change")!;
        expect(change, "a link prints its figures").not.toBeNull();
        expect(css_block(".why__change")).toMatch(/font-family: var\(--font-mono\)/);
        expect(css_block(".why__change")).toMatch(/tabular-nums/);
        expect(visibleText(change)).toMatch(/→/);
        // And every numeral the panel formatted itself is wrapped in the mono class.
        for (const small of Array.from(edge.querySelectorAll<HTMLElement>(".data-sm:not(.why__id)"))) {
          expect(small.textContent!.trim()).toMatch(/^[\d.,]+$/);
          const rule = tokensCss().slice(tokensCss().indexOf(".data-sm {"));
          expect(rule.slice(0, rule.indexOf("}"))).toMatch(/--font-mono/);
        }
        // The day and the tick are on the evidence, because a write is dated.
        expect(text).toMatch(/day \d+/);
        expect(text).toMatch(/tick \d+/);
      }

      // Nothing is hidden behind a disclosure: the edge is the panel's purpose, and a
      // chain the player has to open line by line is a chain they will not check.
      expect(root.querySelectorAll("[data-testid='why-detail']")).toHaveLength(0);
      // A chain long enough to walk never claims to be short.
      expect(root.querySelector("[data-testid='why-short-chain']")).toBeNull();
    });
  }

  it("explains the player's own trade into a starving town, back to the order they gave", async () => {
    // A fresh provider, so this test's market does not disturb the panel tests above.
    const trade = createFixtureSimulationProvider();
    const snap = await trade.getSnapshot();
    const starving = snap.towns.find((t) => t.name === "Golden")!;
    const source = snap.towns.find((t) => t.name === "Lakewood")!;
    const bought = await trade.trade({
      partyId: "party-player",
      townId: source.id,
      goodId: "grain",
      side: "buy",
      quantity: 40,
      expectedDay: snap.day,
    });
    expect(bought.accepted).toBe(true);
    await trade.trade({
      partyId: "party-player",
      townId: starving.id,
      goodId: "grain",
      side: "sell",
      quantity: 40,
      expectedDay: snap.day,
    });

    const chain = await trade.why(starving.id, "foodStock");
    const result = explainWhy(chain.rows);
    expect(result.status).toBe("chain");
    expect(result.links.length).toBeGreaterThanOrEqual(MIN_CAUSE_LINKS);
    // The chain reaches the player's own order, and the panel offers the way into it,
    // because a link about another entity is a question about that entity.
    expect(result.links.some((l) => l.cause.entityId === "party-player"), "the chain does not reach the player's own order").toBe(true);
    const root = await why(starving.id, "foodStock", trade);
    const drills = root.querySelectorAll<HTMLButtonElement>("[data-testid='why-drill']");
    expect(drills.length).toBeGreaterThan(0);
    for (const drill of drills) {
      expect(drill.tagName).toBe("BUTTON");
      expect(drill.getAttribute("type")).toBe("button");
      expect((drill.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});

describe("a chain the log cannot support is reported as one that is missing", () => {
  it("says the record stops, and names the field it stops at, when a change has no cause", async () => {
    // Longmont's food store is a single write in the fixture's log, with nothing behind
    // it: the honest reading is one change and no cause, and a panel that dressed it up
    // as a chain would be inventing the second link.
    const chain = await ownProvider().why(longmont.id, "foodStock");
    const result = explainWhy(chain.rows);
    expect(result.status).toBe("incomplete");
    expect(result.links).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]!.sentence).toMatch(/food stock/);
    expect(result.missing[0]!.sentence).toMatch(/Not on file/);

    const root = await why(longmont.id, "foodStock", ownProvider());
    const short = root.querySelector<HTMLElement>("[data-testid='why-short-chain']");
    expect(short, "a change with no cause must say so").not.toBeNull();
    const text = visibleText(short!);
    expect(text).toContain("One change on the record. No cause behind it.");
    expect(text).toContain("A chain needs at least two links");
    expect(visibleText(root.querySelector<HTMLElement>("[data-testid='why-missing']")!)).toBe(
      result.missing[0]!.sentence,
    );
    // What the log does hold is still printed, because a change on the record is a fact.
    expect(root.querySelector("[data-testid='why-chain']")).not.toBeNull();
    // And no link is invented to fill the gap.
    const edges = Array.from(root.querySelectorAll<HTMLElement>("[data-testid='why-edge']"));
    expect(edges.filter((e) => e.dataset.edge !== undefined)).toHaveLength(0);
    expect(root.querySelector("[data-testid='why-edge-nocause']")).not.toBeNull();
  });

  it("counts one link once when both of its ends are printed, rather than calling it two", async () => {
    // Two rows and one edge: the outcome, and the one write behind it. The panel shows
    // the edge from both ends — the outcome names the nearest cause, the cause names
    // what it did — and both halves carry the same edge id, so the record holds one link
    // and the panel says one link.
    const oneLink = [
      causeRow({
        id: "s-1",
        entityId: "town-longmont",
        entityName: "Longmont",
        field: "unrest",
        old: 0.28,
        new: 0.44,
        system: "Unrest",
        causedBy: ["s-2"],
        summary: "Unrest in Longmont rose from 0.28 to 0.44.",
      }),
      causeRow({
        id: "s-2",
        entityId: "town-longmont",
        entityName: "Longmont",
        field: "foodStock",
        old: 880229,
        new: 603370,
        system: "Food",
        summary: "Longmont's grain store fell from 8.9 days to 6.1 days of food.",
      }),
    ];
    const result = explainWhy(oneLink);
    expect(result.status).toBe("incomplete");
    expect(result.links).toHaveLength(1);
    expect(result.missing.map((m) => m.rowId)).toEqual(["s-2"]);

    const root = await why("town-longmont", "unrest", logWith(oneLink));
    const short = root.querySelector<HTMLElement>("[data-testid='why-short-chain']")!;
    expect(visibleText(short)).toContain("One link on the record. The chain stops there.");
    expect(visibleText(short)).toContain("Not on file: what moved Longmont's food stock");
    // Two lines print the link, from its two ends, and they are the same link.
    const edges = Array.from(root.querySelectorAll<HTMLElement>("[data-testid='why-edge']"));
    const distinct = new Set(edges.map((e) => e.dataset.edge));
    expect(distinct).toEqual(new Set(["s-2>s-1"]));
    // Which is one link, not the two a padded chain would need.
    expect(distinct.size).toBe(1);
  });

  it("says the log named a cause the chain did not carry, rather than calling the field causeless", async () => {
    const dangling = [
      causeRow({
        id: "d-1",
        entityId: "town-golden",
        entityName: "Golden",
        field: "medicine_convoy",
        old: 0,
        new: 0,
        system: "Logistics",
        causedBy: ["d-2"],
        summary: "The medicine caravan bound for Golden was robbed on the Golden road.",
      }),
    ];
    const result = explainWhy(dangling);
    expect(result.status).toBe("incomplete");
    expect(result.missing[0]!.sentence).toMatch(/names a cause for Golden's medicine convoy/);
    expect(result.missing[0]!.sentence).toMatch(/did not carry it/);
  });

  it("still prints the real answer when the log holds nothing at all", async () => {
    // ART_DIRECTION.md 10.2, verbatim. An empty chain is a fact about the field, not a
    // failure to find one, so it does not get the missing-information treatment.
    const result = explainWhy([]);
    expect(result.status).toBe("nothing");
    const root = await why("town-denver", "tax_rate", ownProvider());
    expect(visibleText(root.querySelector("[data-testid='empty-state']")!)).toBe(
      "Nothing caused this. It was true when the survey was taken.",
    );
    expect(root.querySelector("[data-testid='why-short-chain']")).toBeNull();
    expect(root.querySelector("[data-testid='why-chain']")).toBeNull();
  });

  it("offers a way back from a failure to read the log, and never shows a spinner for it", async () => {
    const failing: SimulationProvider = {
      ...ownProvider(),
      why: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:8080");
      },
    };
    const root = await why(golden.id, "unrest", failing);
    const error = root.querySelector<HTMLElement>("[data-testid='why-error']")!;
    expect(error).not.toBeNull();
    expect(visibleText(error)).toMatch(/could not be read/i);
    // The socket address is the developer's, not the player's.
    expect(visibleText(error)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
    expect(root.querySelector<HTMLButtonElement>("[data-testid='why-error-retry']")).not.toBeNull();
  });
});

describe("the Why panel's copy in every state (CONSTITUTION.md 3.3, ART_DIRECTION.md 10.3)", () => {
  const BANNED = [
    /\bTODO\b/,
    /\bFIXME\b/,
    /\blorem ipsum\b/i,
    /\bcoming soon\b/i,
    /\bfeature not available\b/i,
    /\bplaceholder\b/i,
    /\bundefined\b/,
    /\bNaN\b/,
    /\bnull\b/,
    /\[[\]]/,
    /\bsomething went wrong\b/i,
    /\bOops\b/,
    /!/,
  ];

  /** Every state the panel can be in, on purpose rather than by accident. */
  async function everyState(): Promise<[string, HTMLElement][]> {
    const goldenRoot = await why("town-golden", "unrest", ownProvider());
    goldenRoot.querySelector<HTMLButtonElement>("[data-testid='why-link']")!.click();
    goldenRoot.querySelector<HTMLButtonElement>("[data-testid='why-show-all']")!.click();
    const stalling: SimulationProvider = { ...ownProvider(), why: () => new Promise<never>(() => {}) };
    return [
      ["chain, collapsed", await why("town-golden", "unrest", ownProvider())],
      ["chain, expanded", goldenRoot],
      ["trade chain", await why(longmont.id, "grain_price")],
      ["ruler chain", await why("town-longmont", "unrest", logWith(RULER_HOSTILITY))],
      ["attrition chain", await why("party-player", "morale", logWith(PARTY_ATTRITION))],
      ["no cause on record", await why(longmont.id, "foodStock", ownProvider())],
      ["one link only", await why("town-longmont", "unrest", logWith([RULER_HOSTILITY[0]!, RULER_HOSTILITY[1]!]))],
      ["nothing at all", await why("town-denver", "tax_rate", ownProvider())],
      ["skeleton", whyPanel({ entityId: golden.id, field: "unrest", provider: stalling, onDrill: noop }).root],
      ["error", await why("town-golden", "unrest", { ...ownProvider(), why: async () => { throw new Error("the socket closed"); } })],
    ];
  }

  it("has no placeholder, developer-speak or exclamation mark in any of them", async () => {
    const offenders: string[] = [];
    for (const [name, node] of await everyState()) {
      for (const line of visibleText(node).split(/(?<=[.:])\s+/)) {
        for (const pattern of BANNED) {
          if (pattern.test(line)) offenders.push(`${name}: ${pattern} in "${line.slice(0, 90)}"`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toHaveLength(0);
  });

  it("reaches every control by keyboard, with a name, in every state", async () => {
    for (const [name, node] of await everyState()) {
      for (const el of Array.from(node.querySelectorAll("button, input, select, a[href]"))) {
        expect(el.tagName, `${name}: <${el.tagName.toLowerCase()}> is not focusable by default`).toBe("BUTTON");
        expect(el.getAttribute("tabindex"), `${name}: out of the tab order`).not.toBe("-1");
        const label = el.getAttribute("aria-label") ?? el.textContent ?? "";
        expect(label.trim(), `${name}: a control with no accessible name`).not.toBe("");
        expect(el.getAttribute("type"), `${name}: a button that would submit its form`).toBe("button");
      }
    }
  });

  it("says what is missing in words, and a full chain never does", async () => {
    const short = await why(longmont.id, "foodStock", ownProvider());
    const text = visibleText(short.querySelector("[data-testid='why-short-chain']")!);
    expect(text).toMatch(/Not on file:/);
    expect(text).toMatch(/what moved Longmont's food stock/);
    // It names the gap in terms of the field and the system, not in the abstract.
    expect(text).not.toMatch(/insufficient|unknown|error|cannot determine/i);
    expect(visibleText(await why("town-golden", "unrest", ownProvider()))).not.toContain("One link on the record");
  });
});

// =============================================================================
// the ruler roster at world size (RULERS.md section 2: 300 to 800 rulers)
// =============================================================================

/**
 * Eight hundred rulers, built by cloning the fixture's own ruler.
 *
 * The fixture is a test fixture, and this is a test: `src/data/fixture` never reaches a
 * production path, and `tools/check-no-fixtures.mjs` fails the build if it does. So the
 * roster under test is made of real fixture rulers with the identifying fields rewritten,
 * which is closer to the real thing than a hand-written stub would be — the clone keeps
 * the holdings, the traits and the wealth, so the cards are full height and the row
 * arithmetic is being tested against a real card rather than a stub with three fields in
 * it.
 *
 * The index is zero-padded into the name because the roster searches names, and
 * substring search means an unpadded `... 42` also matches `... 426`. Padding makes one
 * ruler findable by one string, which is what a player types.
 */
function worldRulers(count: number): RulerState[] {
  const base = snapshot.rulers[0]!;
  const sides = [...new Set(snapshot.rulers.map((r) => r.factionName))];
  return Array.from({ length: count }, (_, i) => {
    const seed = snapshot.rulers[i % snapshot.rulers.length]!;
    return {
      ...base,
      id: `world-ruler-${i}`,
      name: `${seed.name} ${String(i).padStart(4, "0")}`,
      factionId: sides[i % sides.length]!.toLowerCase().replace(/\s+/g, "-"),
      factionName: sides[i % sides.length]!,
      tier: seed.tier,
      relationToPlayer: (i * 37) % 121 - 60,
      renown: i % 100,
      holdings: seed.holdings,
    };
  });
}

function rosterOf(count: number, opts: { onSelect?: (id: string) => void; selectedId?: string | null } = {}): HTMLElement {
  return rulerRoster({
    rulers: worldRulers(count),
    playerFactionId: snapshot.player.factionId,
    selectedId: opts.selectedId ?? null,
    onSelect: opts.onSelect ?? noop,
  });
}

/** The row indices currently in the document, in the order the panel put them there. */
function paintedRows(root: HTMLElement): number[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-roster-index]")).map((r) =>
    Number(r.getAttribute("data-roster-index")),
  );
}

/** The scroll window, which is the thing a scroll event is dispatched on. */
function windowOf(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>("[data-testid='ruler-list']")!;
}

/** One frame, which is what the panel's scroll handler coalesces on. */
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function scrollTo(win: HTMLElement, top: number): Promise<void> {
  win.scrollTop = top;
  win.dispatchEvent(new Event("scroll"));
  await frame();
}

/** The roster index the keyboard is on, read off whatever currently has focus. */
function focusedRowIndex(): number {
  const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-roster-index]");
  return Number(row?.dataset.rosterIndex);
}

/** Whatever holds the keyboard right now, as an element a key can be sent to. */
function focusTarget(): HTMLElement {
  const active = document.activeElement as HTMLElement | null;
  if (!active) throw new Error("nothing in the panel holds focus");
  return active;
}

describe("the roster windowed rather than dumped (RULERS.md section 2)", () => {
  it("renders eight hundred rulers and completes, without hanging the panel", () => {
    const started = performance.now();
    const root = rosterOf(800);
    const elapsed = performance.now() - started;

    // It completed, and it says how much of the world it is showing.
    expect(root.getAttribute("data-testid")).toBe("ruler-roster");
    expect(visibleText(root.querySelector("[data-testid='roster-count']")!)).toBe("800 on the record.");
    // Generous, because this is a guard against a regression that re-introduces an
    // O(rulers) build, not a benchmark. A windowed roster is single-digit milliseconds.
    expect(elapsed, `eight hundred rulers took ${elapsed.toFixed(1)}ms to draw`).toBeLessThan(2000);
  });

  it("puts only the visible window in the document, not all eight hundred", () => {
    const root = rosterOf(800);
    const cards = root.querySelectorAll(".ruler");
    // Six rows of window plus three either side of overscan, so a dozen or so. The
    // point is the order of magnitude: a windowed roster is not 800 nodes.
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(40);
    expect(cards.length).toBeLessThan(800 / 10);

    // And the scrollbar is honest about the whole of it: the spacer is the full height,
    // so the player can see there are eight hundred even though a dozen are drawn.
    const sizer = root.querySelector<HTMLElement>(".ruler-roster__sizer")!;
    expect(sizer.style.height).toBe(`${800 * ROSTER_ROW_PITCH_PX}px`);
  });

  it("gives every drawn row its place in the whole list, so a screen reader knows", () => {
    const root = rosterOf(800);
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-roster-index]"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // Without these a windowed list announces as a list of twelve, which is a lie.
      expect(row.getAttribute("aria-setsize")).toBe("800");
      const position = Number(row.getAttribute("aria-posinset"));
      expect(position).toBe(Number(row.getAttribute("data-roster-index")) + 1);
    }
    // The row heights are the documented fixed pitch, so the window maths and the
    // painted pixels cannot drift apart.
    expect(rows[0]!.style.height).toBe("88px");
    expect(Number(rows[0]!.style.top.replace("px", ""))).toBe(0);
    expect(Number(rows[1]!.style.top.replace("px", ""))).toBe(ROSTER_ROW_PITCH_PX);
  });

  it("moves the window as the list is scrolled, and keeps the row count flat", () => {
    const root = rosterOf(800);
    const win = windowOf(root);
    const before = paintedRows(root);

    return scrollTo(win, ROSTER_ROW_PITCH_PX * 300).then(() => {
      const after = paintedRows(root);
      // A different slice of the roster, drawn in about the same number of nodes.
      expect(after[0]).toBeGreaterThan(before[0]! + 100);
      expect(after.length).toBeLessThan(40);
      // The last row drawn is still the last row drawn: the window did not run off the
      // end of the roster and wrap.
      expect(after[after.length - 1]!).toBeLessThan(800);
    });
  });

  it("survives being scrolled to the far end without losing the last rulers", async () => {
    const root = rosterOf(800);
    const win = windowOf(root);
    await scrollTo(win, ROSTER_ROW_PITCH_PX * 799);
    const rows = paintedRows(root);
    // The final ruler is drawn and named, not an empty box past the end.
    expect(rows[rows.length - 1]).toBe(800 - 1);
    expect(root.querySelector("[data-testid='ruler-world-ruler-799']")).not.toBeNull();
  });

  it("still selects, still filters, and still counts, at world size", () => {
    const picked: string[] = [];
    const root = rosterOf(800, { onSelect: (id) => picked.push(id) });

    // Selection reaches the caller from a row that is on screen.
    windowOf(root).querySelector<HTMLButtonElement>(".ruler")!.click();
    expect(picked).toHaveLength(1);
    expect(picked[0]).toMatch(/^world-ruler-\d+$/);

    // Filtering re-windows from the top and re-counts, rather than leaving the scroll
    // offset pointing into a list that no longer exists.
    // Filter by name, the way a player looking for a person actually would. Only the
    // forty-second name matches it, and the count says so rather than the list quietly
    // emptying.
    const search = root.querySelector<HTMLInputElement>("#roster-search")!;
    search.value = worldRulers(800)[42]!.name;
    search.dispatchEvent(new Event("input"));
    expect(visibleText(root.querySelector("[data-testid='roster-count']")!)).toBe(
      "1 of 800 on the record match these filters.",
    );
    expect(windowOf(root).querySelectorAll(".ruler")).toHaveLength(1);

    search.value = "";
    search.dispatchEvent(new Event("input"));
    expect(windowOf(root).querySelectorAll(".ruler").length).toBeLessThan(40);
    expect(windowOf(root).scrollTop).toBe(0);
  });
});

describe("the pager, as a fallback for a list too long to sweep (page size 50)", () => {
  it("says which page it is on, in tabular numerals", () => {
    const root = rosterOf(800);
    const label = root.querySelector("[data-testid='roster-page']")!;
    expect(label.textContent).toBe("1 of 16");

    // The figures are `data`, so IBM Plex Mono with tabular figures. A count that
    // re-flows as it ticks is a count nobody can read quickly.
    expect(label.classList.contains("data")).toBe(true);
    const rule = tokensCss().slice(tokensCss().indexOf(".data {"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/--font-mono/);
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/tabular-nums/);
    // And it is stated in the product's words, beside the buttons that move it.
    expect(visibleText(root.querySelector("[data-testid='roster-pager']")!)).toMatch(/Page 1 of 16/);
  });

  it("advances a page and comes back, and the window follows it", () => {
    const root = rosterOf(800);
    const next = root.querySelector<HTMLButtonElement>("[data-testid='roster-page-next']")!;
    const prev = root.querySelector<HTMLButtonElement>("[data-testid='roster-page-prev']")!;
    const win = windowOf(root);

    expect(prev.disabled, "there is no page before the first").toBe(true);
    expect(paintedRows(root)[0]).toBe(0);

    next.click();
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("2 of 16");
    expect(win.scrollTop).toBe(ROSTER_PAGE_SIZE * ROSTER_ROW_PITCH_PX);
    // Page two is the fiftieth ruler onward, not the same twelve again.
    expect(paintedRows(root)[0]).toBeGreaterThanOrEqual(ROSTER_PAGE_SIZE - 3);
    expect(prev.disabled).toBe(false);

    prev.click();
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("1 of 16");
    expect(win.scrollTop).toBe(0);
    expect(paintedRows(root)[0]).toBe(0);
    expect(prev.disabled).toBe(true);
  });

  it("walks to the last page and stops there", async () => {
    const root = rosterOf(800);
    const win = windowOf(root);
    const next = root.querySelector<HTMLButtonElement>("[data-testid='roster-page-next']")!;
    const prev = root.querySelector<HTMLButtonElement>("[data-testid='roster-page-prev']")!;
    for (let i = 0; i < 40; i += 1) {
      if (next.disabled) break;
      next.click();
    }
    // Eight hundred rulers is sixteen pages, and the pager says so rather than
    // inventing a seventeenth.
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("16 of 16");
    expect(next.disabled, "there is no page after the last").toBe(true);
    // The window is on the last page, not on empty paper past the end of the world.
    // The topmost drawn row is up to three above the page, because that is the
    // overscan doing its job of hiding the window boundary.
    const shown = paintedRows(root);
    const lastPage = 15 * ROSTER_PAGE_SIZE;
    expect(shown[0]).toBeGreaterThanOrEqual(lastPage - 3);
    expect(shown[shown.length - 1]).toBeLessThan(800);
    expect(win.scrollTop).toBe(lastPage * ROSTER_ROW_PITCH_PX);

    // And the very last ruler is reachable by scrolling within that page, which is what
    // a windowed list has to be able to do: page sixteen holds fifty rulers and the
    // window holds six.
    await scrollTo(win, ROSTER_ROW_PITCH_PX * 799);
    expect(root.querySelector("[data-testid='ruler-world-ruler-799']")).not.toBeNull();
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("16 of 16");

    for (let i = 0; i < 40; i += 1) {
      if (prev.disabled) break;
      prev.click();
    }
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("1 of 16");
  });

  it("offers the pager as real, named, keyboard-reachable buttons", () => {
    const root = rosterOf(800);
    for (const id of ["roster-page-prev", "roster-page-next"]) {
      const button = root.querySelector<HTMLButtonElement>(`[data-testid='${id}']`)!;
      expect(button, `no ${id}`).not.toBeNull();
      // A real button, in the tab order, with a name that says what it does.
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("tabindex")).not.toBe("-1");
      expect((button.getAttribute("aria-label") ?? "").length).toBeGreaterThan(4);
    }
    // And it is a region with a name, so a screen reader can be sent to it.
    const pager = root.querySelector("[data-testid='roster-pager']")!;
    expect(pager.tagName).toBe("NAV");
    expect(pager.getAttribute("aria-label")).toBeTruthy();
  });

  it("collapses to a single page on a roster that fits in the window", () => {
    // Six rulers is one screenful of the window, so every one of them is drawn and
    // there is nothing to page to.
    const root = rosterOf(6);
    expect(root.querySelectorAll(".ruler")).toHaveLength(6);
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("1 of 1");
    expect(root.querySelector<HTMLButtonElement>("[data-testid='roster-page-prev']")!.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-testid='roster-page-next']")!.disabled).toBe(true);
    // And the scroll window is not a scrollbar over nothing.
    expect(windowOf(root).querySelector(".ruler-roster__sizer")!.getAttribute("style")).toContain("height");
  });
});

describe("the windowed roster is operable by keyboard (UI_UX.md section 12)", () => {
  /** A mounted roster, so focus behaves as it does in a page rather than in a fragment. */
  function mounted(count: number): { root: HTMLElement; win: HTMLElement } {
    const root = rosterOf(count);
    document.body.appendChild(root);
    return { root, win: windowOf(root) };
  }

  function press(target: HTMLElement, key: string): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }

  it("reaches the list, the cards and the pager by Tab, in that order", () => {
    const { root } = mounted(800);
    const focusable = Array.from(root.querySelectorAll<HTMLElement>("button, input, select")).filter(
      (el) => el.getAttribute("tabindex") !== "-1",
    );
    expect(focusable.length).toBeGreaterThan(6);
    // Filters first, because filtering is how you find a name in eight hundred.
    expect(focusable[0]!.id).toBe("roster-side");
    expect(focusable[1]!.id).toBe("roster-rank");
    expect(focusable[2]!.id).toBe("roster-relation");
    expect(focusable[3]!.id).toBe("roster-search");
    // Then the cards, then the pager. Nothing is out of the tab order.
    expect(focusable.some((el) => el.classList.contains("ruler"))).toBe(true);
    const pagerAt = focusable.findIndex((el) => el.dataset.testid === "roster-page-next");
    const lastCard = focusable.map((el) => el.classList.contains("ruler")).lastIndexOf(true);
    expect(pagerAt).toBeGreaterThan(lastCard);
    root.remove();
  });

  it("moves down the list with the arrow keys, and focuses what it moved to", () => {
    const { root, win } = mounted(800);
    const first = win.querySelector<HTMLButtonElement>(".ruler")!;
    first.focus();
    expect(document.activeElement).toBe(first);

    press(first, "ArrowDown");
    const second = win.querySelector<HTMLElement>("[data-roster-index='1'] .ruler")!;
    expect(document.activeElement, "ArrowDown must move the keyboard, not just the scrollbar").toBe(second);
    expect(document.activeElement!.getAttribute("data-testid")).toMatch(/^ruler-world-ruler-/);

    press(second, "ArrowUp");
    expect(document.activeElement).toBe(win.querySelector("[data-roster-index='0'] .ruler"));
    root.remove();
  });

  it("jumps to the first and last ruler with Home and End", () => {
    const { root, win } = mounted(800);
    const card = win.querySelector<HTMLButtonElement>(".ruler")!;
    card.focus();

    press(card, "End");
    // The end of eight hundred rulers, which means the window scrolled there first —
    // the card has to exist before the keyboard can be put on it.
    const last = win.querySelector<HTMLElement>("[data-roster-index='799'] .ruler");
    expect(last, "End must window to the last ruler, not stop at the last drawn row").not.toBeNull();
    expect(document.activeElement).toBe(last);
    expect(last!.getAttribute("data-testid")).toBe("ruler-world-ruler-799");

    press(last!, "Home");
    expect(document.activeElement).toBe(win.querySelector("[data-roster-index='0'] .ruler"));
    root.remove();
  });

  it("moves a page with Page Down and Page Up, like the pager does", () => {
    const { root, win } = mounted(800);
    const card = win.querySelector<HTMLButtonElement>(".ruler")!;
    card.focus();

    press(card, "PageDown");
    expect(focusedRowIndex()).toBe(ROSTER_PAGE_SIZE);
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("2 of 16");

    const onFifty = focusTarget();
    press(onFifty, "PageUp");
    expect(focusedRowIndex()).toBe(0);
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("1 of 16");
    root.remove();
  });

  it("stops at the ends rather than running off them", () => {
    const { root, win } = mounted(800);
    const first = win.querySelector<HTMLButtonElement>(".ruler")!;
    first.focus();

    press(first, "ArrowUp");
    expect(focusedRowIndex()).toBe(0);

    press(first, "End");
    const last = focusTarget();
    press(last, "ArrowDown");
    expect(focusedRowIndex()).toBe(799);
    press(focusTarget(), "PageDown");
    expect(focusedRowIndex()).toBe(799);
    root.remove();
  });

  it("keeps the caret in the search box while the player types in it", () => {
    const { root } = mounted(800);
    const search = root.querySelector<HTMLInputElement>("#roster-search")!;
    search.focus();

    // Filtering must not rebuild the controls around the field the player is typing in.
    // Detaching a focused input throws the caret away mid-word, which is the one bug a
    // filter box cannot have.
    search.value = worldRulers(800)[7]!.name;
    search.dispatchEvent(new Event("input"));
    expect(document.activeElement, "the search field lost focus while being typed into").toBe(search);
    expect(search.value).toBe(worldRulers(800)[7]!.name);
    root.remove();
  });

  it("keeps the keyboard on the same ruler when the window repaints around it", async () => {
    const { root, win } = mounted(800);
    const third = win.querySelector<HTMLElement>("[data-roster-index='3'] .ruler")!;
    third.focus();
    expect(focusedRowIndex()).toBe(3);

    // A scroll that grows the window destroys and rebuilds every row in it, including
    // the one holding focus. The keyboard has to land on the new node for the same
    // ruler, not on the document body — which is where a naive rebuild drops it.
    await scrollTo(win, ROSTER_ROW_PITCH_PX * 2);
    expect(win.querySelector("[data-roster-index='3']")).not.toBeNull();
    expect(focusedRowIndex(), "the keyboard was dropped when the window repainted").toBe(3);
    expect(document.activeElement!.getAttribute("data-testid")).toMatch(/^ruler-world-ruler-/);
    root.remove();
  });

  it("hands focus to the list, not the document, when the focused ruler scrolls away", async () => {
    const { root, win } = mounted(800);
    win.querySelector<HTMLElement>("[data-roster-index='3'] .ruler")!.focus();

    // Scrolling the focused row out of the window cannot keep focus on it. It goes to
    // the list itself, which is focusable and named, so a keyboard-only player is still
    // somewhere they can see and can arrow away from.
    await scrollTo(win, ROSTER_ROW_PITCH_PX * 400);
    expect(win.contains(document.activeElement), "focus was dropped on the document body").toBe(true);
    expect(document.activeElement).toBe(win);
    expect(win.getAttribute("aria-label")).toBe("Rulers on the record");
    root.remove();
  });

  it("does not steal the arrows from the filter controls", () => {
    const { root } = mounted(800);
    const rank = root.querySelector<HTMLSelectElement>("#roster-rank")!;
    rank.focus();
    press(rank, "ArrowDown");
    // The roster's own handler is scoped to the list, so a select keeps its arrows.
    expect(document.activeElement).toBe(rank);
    expect(root.querySelector("[data-testid='roster-page']")!.textContent).toBe("1 of 16");
    root.remove();
  });

  it("still gives every drawn card an accessible name and a pressed state", () => {
    const root = rosterOf(300, { selectedId: "world-ruler-7" });
    // Row seven is not in the first window, so nothing is drawn pressed at first. The
    // attribute must still be a real boolean token on whatever is drawn.
    for (const card of Array.from(root.querySelectorAll<HTMLElement>(".ruler"))) {
      expect((card.getAttribute("aria-label") ?? "").length).toBeGreaterThan(10);
      expect(card.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
      expect(card.getAttribute("type")).toBe("button");
    }
    // Scrolling to it draws it, pressed, because selection is what the panel is for.
    return scrollTo(windowOf(root), ROSTER_ROW_PITCH_PX * 7).then(() => {
      expect(root.querySelector("[data-testid='ruler-world-ruler-7']")!.getAttribute("aria-pressed")).toBe("true");
    });
  });
});
