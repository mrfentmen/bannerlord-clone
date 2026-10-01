/**
 * The daily ledger and resource warnings. `ECONOMY.md` section 10.
 *
 * Every income and expense line, by source, with the net change per day per resource,
 * how long each resource lasts, and the warnings that fire *before* a resource reaches
 * zero. Warnings are the reason this panel exists in this form: "you are out of money"
 * is a state, not a warning, and by the time it is a state there is nothing left to do
 * about it.
 *
 * Two rules from the locked direction are load-bearing here rather than decorative:
 *
 *  - **The shape rule** (`ART_DIRECTION.md` section 5.3). Every warning carries its
 *    glyph — ◆ critical, ▲ warning — as well as its colour and the word, so the
 *    severity is legible with no colour vision at all and the colour is the third
 *    signal rather than the only one. Severity is never printed in ink-300, which
 *    section 5.2 reserves for decoration.
 *  - **The mono rule** (`ART_DIRECTION.md` section 3.1). Every numeral in the tables,
 *    the net-change column and the per-line amounts is IBM Plex Mono with tabular
 *    figures, so a column of prices does not jitter as the day ticks over.
 *
 * The panel computes no balances. Every figure arrives from the simulation; the only
 * arithmetic here is the sign of a number the player can already see.
 */

import { h, sectionHeader } from "../dom.js";
import { dataTable, emptyState, errorState, panel, statusChip, type Column, type StatusKind } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import { ledgerSkeletonBody } from "./panel-skeletons.js";
import {
  ENTITY_KIND_LABEL,
  formatEntityRefId,
  isEntityRef,
  type EntityNameIndex,
  type EntityRef,
  type Ledger as LedgerState,
  type ReferencedLedgerLine,
  type ReferencedLedger,
  type ResourceId,
  type ResourceWarning,
} from "../../data/types.js";

export interface LedgerPanelOptions {
  /**
   * Display names for the entities ledger lines point at, keyed by the serialised id
   * (`stl:golden`). Optional, and a ledger without it still renders every line — the
   * links simply degrade, one per missing name, which is the honest reading of a name
   * the client does not have rather than a reason to drop the whole panel.
   */
  entities?: EntityNameIndex;
  ledger: LedgerState | ReferencedLedger;
  warnings: ResourceWarning[];
  onWhy?: (entityId: string, field: string) => void;
  /**
   * Fired when the player follows an entity link in a ledger line.
   *
   * This is the panel's existing callback seam — the same shape `onWhy` and `onClose`
   * already use, and no new global bus. The panel navigates nowhere itself: it is handed
   * the day's figures, and a panel that quietly changed the screen behind itself would
   * be a second thing deciding what the player is looking at.
   */
  onSelect?: (ref: EntityRef) => void;
  onClose?: () => void;
  /**
   * The day is still closing. Renders `ledger-skeleton`, drawn before the numbers
   * arrive, never after (CONSTITUTION.md section 3.2).
   */
  loading?: boolean;
  testId?: string;
}

const RESOURCE_LABEL: Record<ResourceId, string> = {
  money: "Money",
  gold: "Gold",
  food: "Grain",
  metal: "Metal",
  medicine: "Medicine",
};

/** The resources the net-change table always lists, in the order `ECONOMY.md` section 1 gives. */
const NET_ORDER: ResourceId[] = ["money", "gold", "food", "metal", "medicine"];

export function ledgerPanel(options: LedgerPanelOptions): HTMLElement {
  if (options.loading) return ledgerSkeleton();

  const { root, body } = panel({
    title: `Ledger — day ${options.ledger.day}`,
    testId: options.testId ?? "ledger-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);

  // -- warnings first. They are the reason to open this panel. ---------------
  body.appendChild(warningsBlock(options.warnings, options.onWhy));

  // -- the net, per resource -------------------------------------------------
  body.appendChild(netBlock(options.ledger, options.warnings));

  // -- income and expense lines ---------------------------------------------
  body.appendChild(linesBlock(options.ledger, options.entities ?? {}, options.onSelect));

  return root;
}

// -- warnings ----------------------------------------------------------------

function warningsBlock(warnings: ResourceWarning[], onWhy: ((entityId: string, field: string) => void) | undefined): HTMLElement {
  const block = sectionHeader("Resource warnings");
  if (warnings.length === 0) {
    // Drawn whether or not anything is short, so the panel is the same height either
    // way and a shortage arriving does not shove the ledger down the screen.
    block.appendChild(
      emptyState(
        "Nothing is short.",
        "Every resource is holding. Wages and upkeep are covered, and the grain holds past tomorrow.",
      ),
    );
    return block;
  }
  const list = h("ul", { class: "warnings ledger__warnings", "data-testid": "ledger-warnings" });
  for (const warning of warnings) {
    const kind: StatusKind = warning.severity === "critical" ? "critical" : "warning";
    // The test id and the data attribute are keyed on the warning's own id, not on its
    // resource: the simulation can raise two warnings about the same resource — the
    // party's grain and a town's — and a panel that gave them the same hook would make
    // the second one unreachable and untestable.
    const item = h(
      "li",
      {
        class: "warning ledger__warning",
        "data-severity": warning.severity,
        "data-resource": warning.resource,
        "data-testid": `warning-${warning.id}`,
      },
      h(
        "div",
        { class: "ledger__warning-main" },
        // Glyph, colour and the word. Three signals, and the first is enough on its own.
        statusChip(kind, warning.headline, { testId: `warning-chip-${warning.id}` }),
        h("p", { class: "caption ledger__warning-detail" }, warning.detail),
        // A clock, but only where a clock means something. `daysRemaining` is `null`
        // when the simulation has no horizon for the warning — an unrest warning, or a
        // resource that is already at nothing — and printing "0.0 days" there would
        // tell the player something the simulation never said. So the line is drawn only
        // when there is a figure to draw, and the absence is not dressed up as zero.
        warning.daysRemaining === null
          ? null
          : h(
              "p",
              { class: "caption ledger__warning-days", "data-testid": `warning-days-${warning.id}` },
              `Lasts ${daysPhrase(warning.daysRemaining)}`,
            ),
      ),
    );
    if (onWhy) {
      const why = h(
        "button",
        { type: "button", class: "why__disclose", "data-testid": `warning-why-${warning.id}` },
        "Why?",
      );
      why.addEventListener("click", () => onWhy(warning.entityId, warning.field));
      item.appendChild(h("div", { class: "ledger__warning-why" }, why));
    }
    list.appendChild(item);
  }
  block.appendChild(list);
  return block;
}

/**
 * The clock on a warning.
 *
 * `daysRemaining` is `null` when the simulation holds no horizon, and a number when it
 * does. The three numbered cases are worded separately, because "0.0 days" and "0.9
 * days" are not the same situation and a player who reads them as the same will be
 * surprised at the wrong moment.
 */
function daysPhrase(days: number): string {
  if (days <= 0) return "no longer: it ends today";
  return `${days.toFixed(1)} days`;
}

// -- net change per day -------------------------------------------------------

/**
 * The net-change table.
 *
 * Takes the union rather than plain `Ledger` because `ReferencedLedger` carries its
 * line lists as `readonly`, and a table that only reads them does not need to be able
 * to write them.
 */
function netBlock(ledger: LedgerState | ReferencedLedger, warnings: ResourceWarning[]): HTMLElement {
  const block = sectionHeader("Net change per day");
  const rows = NET_ORDER.map((resource) => ({
    resource,
    perDay: ledger.netPerDay[resource] ?? 0,
    warning: warnings.find((w) => w.resource === resource) ?? null,
  })).filter((r) => r.resource in ledger.netPerDay);

  if (rows.length === 0) {
    block.appendChild(
      emptyState("No account balances to show.", "The ledger closed with nothing moving on any account today."),
    );
    return block;
  }

  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Resource", render: (r) => RESOURCE_LABEL[r.resource] },
    {
      header: "Per day",
      numeric: true,
      testId: "ledger-net",
      render: (r) =>
        h(
          "span",
          { class: "ledger__amount", "data-sign": r.perDay < 0 ? "negative" : r.perDay > 0 ? "positive" : "flat" },
          `${r.perDay > 0 ? "+" : r.perDay < 0 ? "−" : ""}${formatResource(r.resource, Math.abs(r.perDay))}`,
        ),
    },
    {
      header: "Direction",
      render: (r) => statusChip(kindOf(r.perDay), directionText(r.perDay), { testId: `ledger-net-chip-${r.resource}` }),
    },
    {
      // ECONOMY.md section 10: hovering a resource shows its net change per day and how
      // many days it lasts. The days come from the warning the simulation raised, never
      // from arithmetic the client invented.
      //
      // Two rules keep the column honest. A resource that is *building* is not running
      // out, so no days are claimed for it however a warning happens to be filed — a
      // wallet taking in $286 a day and a claim that it is "already spent" is a
      // contradiction, and the contradiction is worse than the missing figure. And where
      // the simulation holds no figure at all, the cell says so rather than printing a
      // zero the player would read as "fine until tonight".
      header: "Days left",
      numeric: true,
      testId: "ledger-days",
      render: (r) => {
        if (r.perDay >= 0) return h("span", { class: "caption" }, "not falling");
        if (r.warning && r.warning.daysRemaining !== null) {
          return h("span", { class: "data" }, daysPhrase(r.warning.daysRemaining));
        }
        // A warning with no horizon on it, or none at all. Either way there is no figure
        // to print, and the panel says so rather than printing a zero.
        return h("span", { class: "caption" }, "no figure on file");
      },
    },
  ];
  block.appendChild(dataTable("Net change per day, by resource", columns, rows, "ledger-net-table"));
  return block;
}

function kindOf(perDay: number): StatusKind {
  if (perDay < 0) return "critical";
  if (perDay > 0) return "good";
  return "neutral";
}

function directionText(perDay: number): string {
  if (perDay < 0) return "Draining";
  if (perDay > 0) return "Building";
  return "Level";
}

// -- income and expense lines ------------------------------------------------

function linesBlock(
  ledger: LedgerState | ReferencedLedger,
  entities: EntityNameIndex,
  onSelect: ((ref: EntityRef) => void) | undefined,
): HTMLElement {
  const block = sectionHeader("Where it comes from and where it goes");
  if (ledger.income.length === 0 && ledger.expenses.length === 0) {
    block.appendChild(
      emptyState(
        "Nothing moved on the ledger today.",
        "No account closed a line. If the day should have billed you, the connection to the simulation was refused.",
      ),
    );
    return block;
  }
  // Carbon triplicate, ART_DIRECTION.md section 6.4: the ledger is a copy from a pad
  // with a copy behind it.
  const cols = h("div", { class: "ledger__cols triplicate" });
  cols.append(
    lineList("Income", ledger.income, "ledger-income", entities, onSelect),
    lineList("Expense", ledger.expenses, "ledger-expenses", entities, onSelect),
  );
  block.appendChild(cols);
  return block;
}
function lineList(
  caption: string,
  lines: readonly ReferencedLedgerLine[],
  testId: string,
  entities: EntityNameIndex,
  onSelect: ((ref: EntityRef) => void) | undefined,
): HTMLElement {
  const wrap = h("section", { class: "ledger__group" });
  wrap.appendChild(h("h4", { class: "section-header" }, caption));
  if (lines.length === 0) {
    wrap.appendChild(
      emptyState(
        caption === "Income" ? "No income lines today." : "No expenses today.",
        caption === "Income"
          ? "Nothing came in. Trade, tolls and taxes all closed at nothing."
          : "Nothing was spent. No wages were due, and the party is not drawing rations.",
      ),
    );
    return wrap;
  }
  const list = h("ul", { class: "ledger__list", "data-testid": testId });
  for (const line of lines) {
    const amount = h(
      "span",
      { class: "ledger__amount data", "data-sign": line.perDay < 0 ? "negative" : "positive" },
      `${line.perDay > 0 ? "+" : "−"}${formatResource(line.resource, Math.abs(line.perDay))}`,
    );
    const label = h("span", { class: "ledger__item-label" }, line.label);
    // A line that carries a cause id was written by a system that recorded why, so the
    // id is printed verbatim in mono (ECONOMY.md section 10: the Why panel can explain
    // any shortage). It is an identifier, not a control: the cause log names a *write*,
    // not a place, so there is nothing honest to navigate to from here.
    const ref = line.causedBy
      ? h("code", { class: "why__id data-sm ledger__ref", "data-testid": `ledger-ref-${line.id}` }, line.causedBy)
      : null;
    list.appendChild(
      h(
        "li",
        {},
        h(
          "span",
          { class: "ledger__item" },
          label,
          // The entities this line accounts for. These *are* things in the world, so
          // unlike the cause id they can be links — provided the client holds a name for
          // them, and provided somewhere was handed a way to act on the click.
          entityLinks(line, entities, onSelect),
          ref ?? null,
          amount,
        ),
      ),
    );
  }
  wrap.appendChild(list);
  return wrap;
}

// -- entity links --------------------------------------------------------------

/**
 * The entities a ledger line points at, each as a link or as a marked-up dead end.
 *
 * Three rules decide what comes out, and each of them is a case that really happens:
 *
 *  - A line with no `refs` prints nothing. `LedgerLine` is the contract as it stands and
 *    most lines in it carry no entity at all, so the common case has to be free.
 *  - A reference the client has no name for prints as text with the ○ glyph and a
 *    `title`, not as a button. A button that opens nothing is worse than no button: it
 *    tells the player the ledger knows something it does not know.
 *  - A reference that is not a well-formed `EntityRef` is treated the same way. The
 *    value came off the wire, so "malformed" is a runtime answer rather than a type
 *    error, and `isEntityRef` is what makes that distinction without a cast.
 */
function entityLinks(
  line: ReferencedLedgerLine,
  entities: EntityNameIndex,
  onSelect: ((ref: EntityRef) => void) | undefined,
): DocumentFragment | null {
  if (!line.refs || line.refs.length === 0) return null;
  const out = document.createDocumentFragment();
  line.refs.forEach((ref, index) => {
    const node = entityNode(ref, entities, onSelect, `ledger-entity-${line.id}-${index}`);
    if (node) out.appendChild(node);
  });
  return out;
}

function entityNode(
  ref: EntityRef,
  entities: EntityNameIndex,
  onSelect: ((ref: EntityRef) => void) | undefined,
  testId: string,
): HTMLElement | null {
  if (!isEntityRef(ref)) return null;
  const key = formatEntityRefId(ref);
  const name = entities[key];

  if (name === undefined || onSelect === undefined) {
    // A stale reference. The glyph carries the state, the word carries it again, and the
    // tooltip names what is missing — three signals, per ART_DIRECTION.md section 5.3,
    // so it reads with no colour vision and with the mouse nowhere near it. The id stays
    // in mono because that is exactly what it is: an identifier, not a name we invented.
    return h(
      "span",
      {
        class: "ledger__stale",
        "data-testid": testId,
        "data-ref": key,
        title: `This line names a ${ENTITY_KIND_LABEL[ref.kind]} this copy of the ledger does not hold. ${key}`,
      },
      h("span", { class: "ledger__stale-glyph", "aria-hidden": "true" }, "○"),
      h("span", { class: "ledger__stale-word" }, "Stale reference"),
      h("span", { class: "ledger__ref data-sm" }, key),
    );
  }

  // A link. A real `<button type="button">` rather than an `<a href="#">`: there is no
  // URL to go to — the target is a selection in this client, not a page — and a fake
  // href is a control that lies about being one. The accessible name carries the kind,
  // so a screen-reader user hears "settlement Golden" and not two identical "Golden"s
  // from two different lines of the same account.
  const button = h(
    "button",
    {
      type: "button",
      class: "btn btn--quiet ledger__entity",
      "data-testid": testId,
      "data-ref": key,
      "aria-label": `${ENTITY_KIND_LABEL[ref.kind]} ${name}`,
      title: `${name}, ${ENTITY_KIND_LABEL[ref.kind]} · ${key}`,
    },
    name,
  );
  button.addEventListener("click", () => onSelect(ref));
  return button;
}

// -- formatting ---------------------------------------------------------------

/**
 * A resource figure with the unit that makes it mean something.
 *
 * `ECONOMY.md` section 1: money and gold are currency, food is person-days, medicine is
 * doses, and metal is an industrial stock counted in units. Printing a raw `−21.25` next
 * to a wallet is a number rather than a bill, and printing a dollar sign on a tonne of
 * metal is a lie about what the resource is.
 */
function formatResource(resource: string, v: number): string {
  switch (resource) {
    case "food":
      return `${v.toFixed(1)} days`;
    case "medicine":
      return `${Math.round(v)} doses`;
    case "metal":
      return `${Math.round(v)} units`;
    default:
      return `$${Math.round(v).toLocaleString("en-US")}`;
  }
}

// -- the failure state --------------------------------------------------------

/**
 * The ledger's error state, shared with the HUD so both read the same.
 *
 * A plain sentence and a way to recover (CONSTITUTION.md section 1.3). The cause goes
 * to the console, never to the screen: `ART_DIRECTION.md` section 10.3 bans a file path
 * or a developer string in anything the player can read.
 */
export function ledgerPanelError(detail: string, onRetry: () => void): HTMLElement {
  return errorState({
    message: "The ledger did not load. The connection to the simulation was refused.",
    detail,
    onRetry,
    testId: "ledger-error",
  });
}

// -- the loading state --------------------------------------------------------

/**
 * The whole ledger sheet at skeleton scale, so the context region does not jump.
 *
 * The title is plain "Ledger" rather than a day number, because the day the ledger will
 * close on is part of the data that has not arrived. Putting a figure in the title bar
 * before the figure is known would be inventing it.
 */
export function ledgerSkeleton(): HTMLElement {
  const { root, body } = panel({ title: "Ledger", testId: "ledger-panel" });
  asBottomSheet(root);
  body.appendChild(ledgerSkeletonBody());
  return root;
}
