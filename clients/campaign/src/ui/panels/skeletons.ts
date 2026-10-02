/**
 * Named skeletons for the town, market and party panels.
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

/** How many blocks each kind of real element takes up, so the counts stay in step. */
const HEAD = "skeleton__block skeleton__head";
const GAUGE = "skeleton__block skeleton__gauge";
const ROW = "skeleton__block skeleton__row";
const STUB = "skeleton__block skeleton__stub";

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
 * then whatever the real section holds.
 */
function section(children: HTMLElement[]): HTMLElement {
  return h("section", { class: "skeleton__section" }, block(HEAD, "skeleton__sectionhead"), block(ROW, "skeleton__rule"), ...children);
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
export const TOWN_SECTIONS = 10;

/**
 * `town-skeleton`. Food, health, sanitation and housing, unrest and loyalty, taxes,
 * projects, media trust, garrison and roads, money: nine sections, the same gauges
 * and rows the real panel draws, and the same three action buttons along the bottom,
 * so the panel does not change height when the town arrives.
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
  // Unrest and loyalty: two gauges, then prosperity.
  root.appendChild(section([...gauges(2), ...rows(1)]));
  // Taxes: the town rate and the state rate steppers.
  root.appendChild(section(rows(2)));
  // Projects: the building list.
  root.appendChild(section(rows(4)));
  // Media trust: one gauge.
  root.appendChild(section(gauges(1)));
  // Garrison and roads: the garrison row, then conduct and road safety.
  root.appendChild(section([...rows(1), ...gauges(2)]));
  // Money: money, gold and metal.
  root.appendChild(section(rows(3)));
  // Trade agreement: the three term fields and the propose button.
  root.appendChild(section([...rows(3), block(STUB)]));
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

/** The whole town sheet, skeleton included, for the context region before selection. */
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
  // Price alerts: the fired-alert lines and the set-alert form.
  root.appendChild(section([block(ROW), block(ROW)]));
  // Smuggling preview: the good/volume/heat form and the analysis line.
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
 * `party-skeleton`. Shortages, supplies, condition and wages, roles, troops, goods:
 * six sections, in the order the real panel puts them, with the same gauges, rows and
 * table stubs. The shortages section is drawn whether or not anything is short, which
 * is why the real panel draws it either way too.
 */
export function partySkeletonBody(): HTMLElement {
  const root = region(PARTY_SHAPE, "party-skeleton", "Reading the party roll.");
  // Leader, headcount and the march chip.
  root.appendChild(h("div", { class: "skeleton__head-block" }, block(ROW), block(ROW)));
  // Shortages: three rows, which is what a full tray of grain, medicine and metal
  // warnings comes to. An empty tray leaves the section short and the panel shorter.
  root.appendChild(section(rows(3)));
  // Supplies: grain, medicine and ammunition gauges.
  root.appendChild(section(gauges(3)));
  // Condition and wages: morale and fatigue gauges, then wages and the daily figures.
  root.appendChild(section([...gauges(2), ...rows(4)]));
  // Roles: four label and value pairs.
  root.appendChild(section(rows(4)));
  // Troops: a header row and three unit rows of five columns.
  root.appendChild(section([tableStub(5, 3)]));
  // Goods: a header row and two goods rows of three columns.
  root.appendChild(section([tableStub(3, 2)]));
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
