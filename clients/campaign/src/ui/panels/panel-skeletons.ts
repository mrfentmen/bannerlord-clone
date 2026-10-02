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
export const BARTER_SHAPE = "barter-table";
export const QUEST_SHAPE = "quest-log";
export const RUMOUR_SHAPE = "rumour-feed";

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

/**
 * The barter screen: the trader's name and standing, the player's table, the trader's
 * table, the two totals, and the two buttons. Exported for the same reason the rest of
 * this file exports its counts — a panel cannot grow a row without its placeholder
 * growing with it.
 */
export const BARTER_TABLE_COLUMNS = 4;
export const BARTER_TABLE_ROWS = 2;
export const BARTER_TOTAL_CELLS = 2;
export const BARTER_ACTIONS = 2;

/**
 * The quest log: a page of requests, then the one open request in full, then its buttons.
 *
 * A page and not the whole board, because `QUESTS_AND_NOTABLES.md` section 7 caps the
 * requests a region can hold and a log that grew without bound would be the one screen on
 * the map that pushed everything else off it. Exported for the same reason the rest of
 * this file exports its counts.
 */
export const QUEST_LIST_ROWS = 5;
/** Who asked, what is wanted, what it pays, and the log heading. */
export const QUEST_DETAIL_ROWS = 4;
/** An accepted request shows two buttons: report it done, and walk away from it. */
export const QUEST_ACTIONS = 2;

/**
 * The rumour feed: a page of tips, each one a headline, a pair of price cells and the
 * simulation's own sentence.
 *
 * A page rather than the whole feed, for the reason the quest log pages its board: the
 * server caps what it publishes and the panel draws what it is given, so the skeleton
 * reserves the first few and the rest arrive as the list does.
 */
export const RUMOUR_LIST_ROWS = 3;
/** A rumour has two ends — where to buy and where to sell — and they weigh the same. */
export const RUMOUR_COST_CELLS = 2;
/** The one line the simulation wrote about the pair. */
export const RUMOUR_SENTENCES = 1;

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

// -- barter --------------------------------------------------------------------

/**
 * `barter-skeleton`. Two tables and a pair of totals, in the order the player reads them.
 *
 * The shape that matters here is the pair: two table stubs of the same size, one under
 * the other, because "what I put down" and "what I get for it" are the two halves of
 * every decision this screen asks for. A single stub would collapse the screen into a
 * list on the first frame and give the halves different weights once the data landed.
 */
export function barterSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: BARTER_SHAPE, testId: "barter-skeleton", label: "Reading both tables." });
  // The trader's name and where they stand with the player.
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW, "skeleton__headline"), block(ROW)));
  // Your table, then theirs.
  root.appendChild(section(tableStub(BARTER_TABLE_COLUMNS, BARTER_TABLE_ROWS)));
  root.appendChild(section(tableStub(BARTER_TABLE_COLUMNS, BARTER_TABLE_ROWS)));
  // The two totals, side by side, in the cost cells the real panel uses.
  root.appendChild(h("div", { class: "skeleton__costs" }, ...count(CELL, BARTER_TOTAL_CELLS)));
  // Ask, then strike the deal.
  root.appendChild(actions(BARTER_ACTIONS));
  return root;
}

// -- quest log ----------------------------------------------------------------

/**
 * `quest-skeleton`. A page of request cards, then the selected request in full: the
 * progress gauge, then the rows that carry the giver, the requirement, the reward and
 * the log, then the two buttons an accepted request is allowed to show.
 *
 * The shape that matters is the two halves, list above and detail below, because a quest
 * log is a list the player picks from and one open request they are reading. A single
 * undifferentiated block of grey would stand in for neither.
 */
export function questSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: QUEST_SHAPE, testId: "quest-skeleton", label: "Reading the quest log." });
  // Whose log this is, and the day it was read on.
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW, "skeleton__headline"), block(ROW)));
  // The page of requests, each a card of the size the real cards are.
  root.appendChild(section(h("div", { class: "skeleton__list" }, ...count(WIDE, QUEST_LIST_ROWS))));
  // The open request: how far along it is, then who asked and what is wanted.
  root.appendChild(section(block(GAUGE), ...count(ROW, QUEST_DETAIL_ROWS)));
  // Report it done, walk away.
  root.appendChild(actions(QUEST_ACTIONS));
  return root;
}

// -- rumour feed ---------------------------------------------------------------

/**
 * `rumour-feed-skeleton`. Tips, one after another, each a headline, the pair of prices and
 * the sentence the simulation wrote about them.
 *
 * The shape that matters is the pair inside each card. A rumour is two towns and a
 * difference, and a stub that drew one column for the lot would give the buy end and the
 * sell end the same width on the first frame and then take it away, which is the exact
 * weight the barter screen goes to some trouble to keep even. Each card is a `section`
 * because each one is a heading above its own contents, which is how the real card reads.
 */
export function rumourSkeletonBody(): HTMLElement {
  const root = skeleton({ shape: RUMOUR_SHAPE, testId: "rumour-skeleton", label: "Reading the trade rumours." });
  // When the feed was read, and how much of it there is.
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW, "skeleton__headline"), block(ROW)));
  const list = h("div", { class: "skeleton__list" });
  for (let index = 0; index < RUMOUR_LIST_ROWS; index += 1) {
    list.appendChild(
      section(
        h("div", { class: "skeleton__head-block" }, block(ROW, "skeleton__headline"), block(ROW)),
        h("div", { class: "skeleton__costs" }, ...count(CELL, RUMOUR_COST_CELLS)),
        ...count(ROW, RUMOUR_SENTENCES),
      ),
    );
  }
  root.appendChild(list);
  return root;
}
