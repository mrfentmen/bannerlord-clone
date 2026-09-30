/**
 * Named skeletons for the Why, ledger, march, ruler and start screens.
 *
 * `CONSTITUTION.md` section 3.2 bans spinners, and `ART_DIRECTION.md` section 11 says
 * what replaces them: a placeholder shaped like the content that is coming, because the
 * shape is what stops the layout jumping when the data lands. A single grey block would
 * satisfy the letter of the rule and defeat the whole purpose of it.
 *
 * So every function below walks the same section list, in the same order, with the same
 * number of rows, gauges, cost cells and table cells as the panel it stands in for. The
 * counts are not decorative: they are exported, and `src/ui/__tests__/paperwork.test.ts`
 * compares each one against the live panel, so a panel cannot grow a section without
 * its skeleton growing with it.
 *
 * The wash lives in `ui.css` and animates opacity only. Nothing here rotates and there
 * is no travelling highlight, because a skeleton that spins is a spinner wearing a
 * costume. `prefers-reduced-motion` switches the wash off (ART_DIRECTION.md section 12).
 *
 * A skeleton is drawn *before* the request goes out, so there is never a frame with
 * neither data nor placeholder. Every function here therefore takes no arguments and
 * does no I/O: building one is synchronous by design.
 *
 * The shape names are distinct from the town, market and party shapes in
 * `skeletons.ts` so that neither file can restyle the other's blocks.
 */

import { h } from "../dom.js";
import { skeleton } from "../kit.js";

/** The shape names `ui.css` styles. */
export const WHY_SHAPE = "why-chain";
export const LEDGER_SHAPE = "ledger-book";
export const MARCH_SHAPE = "march-plan";
export const ROSTER_SHAPE = "ruler-roster";
export const CARD_SHAPE = "ruler-card";
export const START_SHAPE = "start-sides";

// -- what the real panels draw -----------------------------------------------
//
// These are the numbers the skeletons have to match. They live here, next to the
// skeletons, and the panels import them rather than restating them, so a panel and its
// placeholder cannot disagree about how many rows a list has.

/** The Why panel: the outcome, then four causes, before it asks. `UI_UX.md` section 5. */
export const WHY_LINKS_SHOWN = 5;
/** Rows in the "also changed here" rail under the chain. */
export const WHY_RELATED_ROWS = 8;

/** The ledger always draws its warning section, so the panel is the same height either way. */
export const LEDGER_SECTIONS = 3;
export const LEDGER_WARNING_SLOTS = 3;
export const LEDGER_NET_ROWS = 5;
export const LEDGER_INCOME_ROWS = 2;
export const LEDGER_EXPENSE_ROWS = 4;

/** The march planner: three cost cells, then up to two warnings, then one order button. */
export const MARCH_COST_CELLS = 3;
export const MARCH_WARNING_SLOTS = 2;

/** The roster shows a page of cards, not all of them; the filter says how many matched. */
export const ROSTER_CARDS = 3;

/** The ruler card: five traits, five holding rows, five wealth rows, three events. */
export const CARD_TRAITS = 5;
export const CARD_HOLDING_ROWS = 5;
export const CARD_WEALTH_ROWS = 5;
export const CARD_EVENT_ROWS = 3;

/** Six sections plus the Wanderer start (`FACTIONS.md` sections 2 and 4). */
export const START_SIDE_CARDS = 7;
export const START_STATE_CARDS = 4;
export const START_ROLE_CARDS = 3;

// -- shared block vocabulary --------------------------------------------------
//
// The same class names `skeletons.ts` uses for the town, market and party panels, so
// one set of measured heights in `ui.css` covers every skeleton in the client.

const HEAD = "skeleton__block skeleton__head";
/** A content row. Only content rows carry this class, so a section's header and rule
 *  are not counted as content by a test that counts the rows. */
const ROW = "skeleton__block skeleton__row";
const GAUGE = "skeleton__block skeleton__gauge";
const STUB = "skeleton__block skeleton__stub";
const WIDE = "skeleton__block skeleton__wide";
const CELL = "skeleton__block skeleton__cell";

function block(size: string, extra?: string): HTMLElement {
  return h("div", { class: extra ? `${size} ${extra}` : size, "aria-hidden": "true" });
}

function count(size: string, n: number): HTMLElement[] {
  return Array.from({ length: n }, () => block(size));
}

/**
 * A section: a header bar, the hairline rule the real header draws, then its contents.
 *
 * The rule is deliberately *not* a `skeleton__row`, so a test that counts a section's
 * content rows counts content and not the two blocks of furniture above it.
 */
function section(...children: HTMLElement[]): HTMLElement {
  return h(
    "section",
    { class: "skeleton__section" },
    block(HEAD, "skeleton__sectionhead"),
    h("div", { class: "skeleton__block skeleton__rule", "aria-hidden": "true" }),
    ...children,
  );
}

/** A table stub: one heading row, then `rows` body rows of `columns` cells each. */
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

/** An action row: real buttons are 36px tall, so these are. */
function actions(n: number): HTMLElement {
  return h("div", { class: "skeleton__actions" }, ...count(STUB, n));
}

// -- why ----------------------------------------------------------------------

/**
 * `why-skeleton`. A headline and a meta line, then five chain links at increasing
 * indent, then the disclose button. The indent is the point: the real panel shows the
 * shape of the cascade by indentation before a word is read, so a flat block of grey
 * would stand in for the one thing this panel exists to communicate.
 */
export function whySkeletonBody(): HTMLElement {
  const root = skeleton({ shape: WHY_SHAPE, testId: "why-skeleton", label: "Reading the cause log." });
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW, "skeleton__headline"), block(ROW)));
  const chain = h("div", { class: "skeleton__chain" });
  for (let depth = 0; depth < WHY_LINKS_SHOWN; depth += 1) {
    const link = block(ROW, "skeleton__link");
    link.dataset.depth = String(depth);
    chain.appendChild(link);
  }
  root.appendChild(chain);
  root.appendChild(actions(1));
  return root;
}

/** The related rail, for a panel that wants to reserve the space before the log answers. */
export function whyRelatedSkeletonBody(rows = WHY_RELATED_ROWS): HTMLElement {
  const root = skeleton({ shape: WHY_SHAPE, testId: "why-related-skeleton", label: "Reading what else changed." });
  root.appendChild(section(...count(ROW, rows)));
  return root;
}

// -- ledger -------------------------------------------------------------------

/**
 * `ledger-skeleton`. Warnings, the net-change table and the two column lists: the three
 * sections the ledger always draws, at the same row counts. The warning slots are drawn
 * whether or not anything is short, because the real panel draws that section either
 * way, and a panel that changed height when the news changed would be the wrong place
 * to find out.
 */
export function ledgerSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: LEDGER_SHAPE, testId: "ledger-skeleton", label: "Reading the ledger." });
  root.appendChild(section(...count(ROW, LEDGER_WARNING_SLOTS)));
  root.appendChild(section(tableStub(3, LEDGER_NET_ROWS)));
  const cols = h("div", { class: "skeleton__cols" });
  cols.append(
    h("div", { class: "skeleton__col" }, ...count(ROW, LEDGER_INCOME_ROWS)),
    h("div", { class: "skeleton__col" }, ...count(ROW, LEDGER_EXPENSE_ROWS)),
  );
  root.appendChild(section(cols));
  return root;
}

// -- march planner ------------------------------------------------------------

/** The route and supply line, then the warning slots, as two separate sections. */
export const MARCH_SUMMARY_ROWS = 2;

/**
 * `march-skeleton`. The destination field, the priced route, three cost cells, the
 * supply line, the warnings and the order button — in that order, because that is the
 * order `MARCH_AND_WAR.md` section 11 requires the player to read them in.
 */
export function marchSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: MARCH_SHAPE, testId: "march-skeleton", label: "Pricing the march." });
  root.appendChild(h("div", { class: "skeleton__head-block" }, ...count(ROW, MARCH_SUMMARY_ROWS)));
  const costs = h("div", { class: "skeleton__costs" }, ...count(CELL, MARCH_COST_CELLS));
  root.appendChild(costs);
  root.appendChild(section(...count(ROW, MARCH_WARNING_SLOTS)));
  root.appendChild(actions(1));
  return root;
}

// -- ruler --------------------------------------------------------------------

/** The roster's four filters: side, rank, standing and the name search. */
export const ROSTER_FILTERS = 4;

/** `ruler-roster-skeleton`: the four filters, the count line, and a page of cards. */
export function rosterSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: ROSTER_SHAPE, testId: "ruler-roster-skeleton", label: "Reading the roster." });
  const filters = h("div", { class: "skeleton__filters" }, ...count(ROW, ROSTER_FILTERS));
  root.appendChild(filters);
  root.appendChild(h("div", { class: "skeleton__list" }, ...count(WIDE, ROSTER_CARDS)));
  return root;
}

/**
 * `ruler-card-skeleton`. Identity, five traits, holdings, wealth and three events, in
 * the order `RULERS.md` section 3 lists them.
 */
export function rulerCardSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: CARD_SHAPE, testId: "ruler-card-skeleton", label: "Reading the ruler." });
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW, "skeleton__headline"), block(ROW), block(ROW)));
  root.appendChild(section(...count(GAUGE, CARD_TRAITS)));
  root.appendChild(section(...count(ROW, CARD_HOLDING_ROWS)));
  root.appendChild(section(...count(ROW, CARD_WEALTH_ROWS)));
  root.appendChild(section(tableStub(2, CARD_EVENT_ROWS)));
  return root;
}

// -- start screen -------------------------------------------------------------

/**
 * `start-skeleton`. One block per side card, in the same three-column grid the real
 * screen uses, so the grid does not reflow when the sides arrive. Seven of them: the
 * six sections of `FACTIONS.md` plus the Wanderer start.
 */
export function startSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: START_SHAPE, testId: "start-skeleton", label: "Reading the state profiles." });
  root.appendChild(h("div", { class: "skeleton__grid" }, ...count(WIDE, START_SIDE_CARDS)));
  return root;
}

/** The state step, at the same two-column grid the real screen uses. */
export function startStateSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: START_SHAPE, testId: "start-state-skeleton", label: "Reading the state profiles." });
  root.appendChild(h("div", { class: "skeleton__grid skeleton__grid--narrow" }, ...count(WIDE, START_STATE_CARDS)));
  return root;
}

/** The role step: three role cards. */
export function startRoleSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: START_SHAPE, testId: "start-role-skeleton", label: "Reading the starting roles." });
  root.appendChild(h("div", { class: "skeleton__grid" }, ...count(WIDE, START_ROLE_CARDS)));
  return root;
}
