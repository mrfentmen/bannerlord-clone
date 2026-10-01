/**
 * Named skeletons for the town, market and party panels, and the four phases every read
 * of a panel's data moves through.
 *
 * `CONSTITUTION.md` section 3.2: no spinners, and any panel that reads data shows a
 * placeholder shaped like the content that is coming. `ART_DIRECTION.md` section 11
 * says what that means in practice: each data-driven panel owns a *named* skeleton
 * with the same section count, the same gauge widths and the same table stub as the
 * real panel, because the shape is the thing that stops the layout jumping when the
 * data lands. A single grey block would satisfy the letter of the rule and defeat the
 * whole purpose of it.
 *
 * So each function below walks the same section list, in the same order, with the same
 * number of gauge and row blocks as the panel it stands in for. The counts are not
 * decorative: `src/ui/__tests__/panels.test.ts` asserts that the skeleton's section
 * count equals the live panel's, so the two cannot drift apart silently.
 *
 * The wash lives in the stylesheet and animates opacity only. Nothing here rotates,
 * and there is no travelling highlight, because a skeleton that spins is a spinner
 * wearing a costume. `prefers-reduced-motion` switches the wash off (section 12).
 *
 * A skeleton is drawn *before* the request goes out, so there is never a frame with
 * neither data nor placeholder. Each body function therefore takes no arguments and
 * does no I/O: building it is synchronous by design.
 */

import { h } from "../dom.js";

/** The shape names `ui.css` styles and the HUD passes through as `loadingShape`. */
export const TOWN_SHAPE = "town";
export const MARKET_SHAPE = "market";
export const PARTY_SHAPE = "party";

// -- loading states -----------------------------------------------------------
//
// What a panel shows while its data is in flight is the shape *and* where the read has
// got to, so both live here rather than in each panel. `CONSTITUTION.md` section 3.2
// says a skeleton is drawn before the request and section 1.3 says a failure offers a
// way out; the four phases below are the whole of that for the town and party panels.
//
// A `loading` boolean cannot carry it. A boolean says whether to draw a shape, and every
// question it leaves open is one a panel then answers its own way: which shape, what the
// failure was, whether repeating the request could help, and whether an answer that
// arrives late still belongs on screen. Those are four answers, so this is a small
// state machine with one transition function per panel rather than a flag.

/**
 * The four phases a read of a panel's data moves through.
 *
 * `idle` is nothing selected and nothing to ask for. `loading` is a request in flight.
 * `ready` is data on screen. `error` is a failed request with a way to recover. Nothing
 * else, and in particular no fifth phase for "probably about to fail".
 */
export type LoadPhase = "idle" | "loading" | "ready" | "error";

/** The four phases as a list, so a test can walk the machine rather than restate it. */
export const LOAD_PHASES: readonly LoadPhase[] = ["idle", "loading", "ready", "error"];

/**
 * One read, and where it has got to.
 *
 * `value` is what the simulation sent, never anything the client worked out: it is null
 * until a read answers and it is copied rather than referenced, so a panel cannot write
 * back into the snapshot the caller is holding.
 */
export interface LoadState<T> {
  phase: LoadPhase;
  value: T | null;
  /** A plain sentence for the player. Set in the `error` phase, and empty otherwise. */
  failure: string | null;
  /** Why, for the console. Never rendered to the screen. */
  detail: string;
  /** False when the simulation has said the request will not start working. */
  retryable: boolean;
}

/** Nothing selected and nothing asked for: the panel shows its empty state. */
export function idleLoad<T>(): LoadState<T> {
  return { phase: "idle", value: null, failure: null, detail: "", retryable: true };
}

/**
 * A request in flight. The skeleton is what gets drawn either way; the value survives
 * so the title bar and the trend arrows keep naming the town or party they belong to
 * while the fresh figure is on its way, and so a re-read knows what it is replacing.
 */
export function loadingLoad<T>(previous: LoadState<T> | null): LoadState<T> {
  return { phase: "loading", value: previous?.value ?? null, failure: null, detail: "", retryable: true };
}

/** A read that answered. */
export function readyLoad<T>(value: T): LoadState<T> {
  return { phase: "ready", value, failure: null, detail: "", retryable: true };
}

/** A read that failed. `failure` is the sentence the player reads, `detail` the console. */
export function failedLoad<T>(failure: string, detail: string, retryable = true): LoadState<T> {
  return { phase: "error", value: null, failure, detail, retryable };
}

/** How many blocks each kind of real element takes up, so the counts stay in step. */
const HEAD = "skeleton__block skeleton__head";
const GAUGE = "skeleton__block skeleton__gauge";
const ROW = "skeleton__block skeleton__row";
const STUB = "skeleton__block skeleton__stub";
/**
 * The hairline rule under a section heading, which is furniture and not content.
 *
 * It deliberately does *not* carry `skeleton__row`, which is what `panel-skeletons.ts`
 * does for the same reason and this file did not do. Two things were wrong with it: a
 * test counting a section's content rows counted the rule as one of them, and — because
 * `.skeleton__block.skeleton__row { height: 26px }` sits *after*
 * `.skeleton__block.skeleton__rule { height: 1px }` in `ui.css` at equal specificity — the
 * hairline was drawn 26px tall rather than 1px, on every section of the town, market and
 * party skeletons.
 */
const RULE = "skeleton__block";

/**
 * A block inside a skeleton. Kept to one line because there are a lot of them and the
 * only thing that varies is the size class.
 */
function block(size: string, extra?: string): HTMLElement {
  return h("div", { class: extra ? `${size} ${extra}` : size, "aria-hidden": "true" });
}

/** The wrapping region: busy, announced once, and never a focus trap. */
function region(shape: string, testId: string, label: string): HTMLElement {
  return h(
    "div",
    { class: `skeleton skeleton--${shape}`, "data-testid": testId, "aria-busy": "true", role: "status" },
    h("span", { class: "visually-hidden" }, label),
  );
}

/**
 * A section inside a skeleton: a header bar, the hairline rule the real header draws,
 * then whatever the real section holds. A count of `.skeleton__row` inside one of these
 * is a count of content.
 */
function section(children: HTMLElement[]): HTMLElement {
  return h("section", { class: "skeleton__section" }, block(HEAD, "skeleton__sectionhead"), block(RULE, "skeleton__rule"), ...children);
}

function gauges(count: number): HTMLElement[] {
  return Array.from({ length: count }, () => block(GAUGE));
}

function rows(count: number): HTMLElement[] {
  return Array.from({ length: count }, () => block(ROW));
}

/**
 * A table stub: one heading row and `rows` body rows of `columns` cells each.
 *
 * The market and the troop list are the only two tables in the client wide enough to
 * need a stub, and this is the shape both of them take, so the count is passed in
 * rather than guessed.
 */
function tableStub(columns: number, rows: number): HTMLElement {
  return h(
    "div",
    { class: "skeleton__table" },
    block(HEAD, "skeleton__tablehead"),
    ...Array.from({ length: rows }, () =>
      h("div", { class: "skeleton__tr" }, ...Array.from({ length: columns }, () => block(ROW))),
    ),
  );
}

// -- town ---------------------------------------------------------------------

/** The seven sections of the town panel, plus the header block and the three actions. */
export const TOWN_SECTIONS = 7;

/**
 * `town-skeleton`. Food, health, sanitation and housing, unrest and loyalty, media
 * trust, garrison and roads, money: seven sections, the same gauges and rows the real
 * panel draws, and the same three action buttons along the bottom, so the panel does
 * not change height when the town arrives.
 */
export function townSkeletonBody(): HTMLElement {
  const root = region(TOWN_SHAPE, "town-skeleton", "Reading the town survey.");
  // Holder, class and the unrest chip, then the three population rows.
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW), block(ROW), block(ROW)));
  // Food and supply: two gauges and the emptying note.
  root.appendChild(section([...gauges(2), block(ROW)]));
  // Health: the infection gauge, then the medicine row.
  root.appendChild(section([...gauges(1), ...rows(1)]));
  // Sanitation and housing: the sanitation gauge, then the crowding row.
  root.appendChild(section([...gauges(1), ...rows(1)]));
  // Unrest and loyalty: two gauges, then tax rate and prosperity.
  root.appendChild(section([...gauges(2), ...rows(2)]));
  // Media trust: one gauge.
  root.appendChild(section(gauges(1)));
  // Garrison and roads: the garrison row, then conduct and road safety.
  root.appendChild(section([...rows(1), ...gauges(2)]));
  // Money: money, gold and metal.
  root.appendChild(section(rows(3)));
  // The three actions, in the order the real panel puts them in.
  root.appendChild(
    h(
      "div",
      { class: "skeleton__actions" },
      block(STUB, "skeleton__action"),
      block(STUB, "skeleton__action"),
      block(STUB, "skeleton__action"),
    ),
  );
  return root;
}

/**
 * The whole town sheet, skeleton included, for a caller that has no panel chrome of its
 * own. The town and party panels hold their own chrome across the whole read and put
 * `townSkeletonBody` in the body, so their title bar does not change height when the
 * survey lands.
 */
export function townSkeleton(title = "Town"): HTMLElement {
  return sheetShell("town-skeleton", "town-skeleton-sheet", title, townSkeletonBody());
}

// -- market -------------------------------------------------------------------

/** The quantity field, the purse line, the table stub and the closing note. */
export function marketSkeletonBody(): HTMLElement {
  const root = region(MARKET_SHAPE, "market-skeleton", "Reading the market.");
  // The quantity field beside the purse line.
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW), block(ROW)));
  // The table: a header row and two priced rows, as ART_DIRECTION.md section 11 asks
  // for a two-row market stub.
  root.appendChild(section([tableStub(4, 2)]));
  // The sell-side stub: what the caravan is carrying.
  root.appendChild(section([block(ROW), block(ROW)]));
  // The closing note under "What moved".
  root.appendChild(section(rows(1)));
  return root;
}

export function marketSkeleton(title = "Market"): HTMLElement {
  return sheetShell("market-skeleton", "market-skeleton-sheet", title, marketSkeletonBody());
}

// -- party --------------------------------------------------------------------

/**
 * What the party panel draws, counted. `panel-skeletons.ts` keeps its numbers the same
 * way for the other panels: the counts live next to the skeleton that has to match the
 * live one, so the two cannot be restated in two places and drift.
 *
 * Shortages, supplies, condition and wages, roles, troops, goods.
 */
export const PARTY_SECTIONS = 6;

/**
 * A slot for every shortage the panel can raise in one frame.
 *
 * `deriveWarnings` in `PartyPanel.ts` raises at most one warning per field it watches —
 * grain, medicine, metal, morale and wages — so five is the whole of it and the
 * reservation is exact rather than a guess. Warnings the simulation itself raises are
 * unbounded and no placeholder can reserve those; those arrive into a tray that is
 * already the right height.
 */
export const PARTY_WARNING_SLOTS = 5;

/** Grain, medicine and ammunition. */
export const PARTY_SUPPLY_GAUGES = 3;
/** Morale and fatigue. */
export const PARTY_CONDITION_GAUGES = 2;
/**
 * Wages owed, the daily bill, the daily rations, the purse and the march speed: five
 * figures, and all five are drawn whether or not anything is owed.
 */
export const PARTY_CONDITION_ROWS = 5;
/** Quartermaster, surgeon, scout, engineer. All four are drawn, filled or not. */
export const PARTY_ROLE_ROWS = 4;
/** Unit, count, quality, morale, wage. */
export const PARTY_TROOP_COLUMNS = 5;
/** A company starts with a few units on the roll and grows from there. */
export const PARTY_TROOP_ROWS = 3;
/** Good, quantity, paid. */
export const PARTY_GOODS_COLUMNS = 3;
/** As with the market's hold, an empty wagon is one line, not a hole in the layout. */
export const PARTY_GOODS_ROWS = 2;

/**
 * `party-skeleton`. Shortages, supplies, condition and wages, roles, troops, goods:
 * six sections, in the order the real panel puts them, with the same gauges, rows and
 * table stubs. The shortages section is drawn whether or not anything is short, which
 * is why the real panel draws it either way too.
 */
export function partySkeletonBody(): HTMLElement {
  const root = region(PARTY_SHAPE, "party-skeleton", "Reading the party roll.");
  // Leader, headcount and the march chip.
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW), block(ROW)));
  // Shortages: one slot per warning the panel can raise, so a company short of grain,
  // medicine, metal, morale and wages at once still lands into a tray of the same height.
  root.appendChild(section(rows(PARTY_WARNING_SLOTS)));
  // Supplies: grain, medicine and ammunition gauges.
  root.appendChild(section(gauges(PARTY_SUPPLY_GAUGES)));
  // Condition and wages: morale and fatigue gauges, then wages owed and the four daily
  // figures under them.
  root.appendChild(section([...gauges(PARTY_CONDITION_GAUGES), ...rows(PARTY_CONDITION_ROWS)]));
  // Roles: four label and value pairs.
  root.appendChild(section(rows(PARTY_ROLE_ROWS)));
  // Troops: a header row and three unit rows of five columns.
  root.appendChild(section([tableStub(PARTY_TROOP_COLUMNS, PARTY_TROOP_ROWS)]));
  // Goods: a header row and two goods rows of three columns.
  root.appendChild(section([tableStub(PARTY_GOODS_COLUMNS, PARTY_GOODS_ROWS)]));
  return root;
}

export function partySkeleton(title = "Party"): HTMLElement {
  return sheetShell("party-skeleton", "party-skeleton-sheet", title, partySkeletonBody());
}

// -- shared -------------------------------------------------------------------

/**
 * A panel-shaped sheet: title bar, then body.
 *
 * The real panels get their chrome from `panel()` in `kit.ts`. A skeleton that did not
 * have the same chrome would change the context region's height on the first frame,
 * which is the jump the skeleton exists to prevent, so the bar is drawn here as blocks
 * rather than borrowed.
 */
function sheetShell(bodyTestId: string, testId: string, title: string, body: HTMLElement): HTMLElement {
  return h(
    "section",
    { class: "sheet panel", "data-testid": testId, tabindex: "-1" },
    h(
      "header",
      { class: "panel__header" },
      h("span", { class: "skeleton__block skeleton__titlebar", "data-testid": `${bodyTestId}-title`, "aria-hidden": "true" }),
      h("div", { class: "panel__actions" }),
    ),
    h("div", { class: "panel__body" }, h("span", { class: "visually-hidden" }, title), body),
  );
}
