/**
 * The barter screen. `ECONOMY.md` section 5, `docs/missing-vs-bannerlord.md` row 7.11.
 *
 * Two tables, one item against another, and no money moving at all: what the player is
 * willing to hand over, and what they are asking the trader for. Goods, gold and
 * prisoners all go on the same table, because that is the whole of what a barter screen
 * is for, and a screen that could only move one kind of thing would be a market panel
 * with the prices hidden.
 *
 * Four rules shape the code here.
 *
 * **The client sets no price and no verdict.** What a thing is worth at this table is
 * the trader's own figure, read from `provider.barterTerms`, and the only arithmetic in
 * this file is the multiplication a player can do in their head: units times the
 * figure on the row. Whether the deal is even worth shaking on is `provider.proposeBarter`
 * answering in words, and its answer is shown the way it was written. A client that
 * decided a deal was fair would be a second merchant.
 *
 * **The first frame is a skeleton, not a blank and not an error.** Handed no tables, the
 * panel draws `barter-skeleton`, shaped as the two equal tables it is about to draw, and
 * then asks for them. Only when the request has actually failed does it show a plain
 * message and a real way to retry (CONSTITUTION.md sections 3.2 and 1.3).
 *
 * **A deal is about one specific table.** Change a single number and any answer already
 * given is about a deal the player is no longer offering, so the answer is dropped with
 * the number. The same is true of a struck deal: the tables that come back replace the
 * ones on screen, because the simulation holds the only true copy of them.
 *
 * **Every refusal is shown, and it is shown in full.** A trader who wants forty dollars
 * more has said something the player can act on, and a screen that hid it behind a red
 * border would have thrown away the only number that mattered.
 */

import { h, sectionHeader } from "../dom.js";
import { dataTable, emptyState, errorState, panel, statusChip, type Column, type StatusKind } from "../kit.js";
import { asBottomSheet, stackable } from "./narrow.js";
import { barterSkeletonBody } from "./panel-skeletons.js";
import { gameAudio } from "../../audio/audio.js";
import type {
  BarterItem,
  BarterLine,
  BarterProposal,
  BarterResult,
  BarterTerms,
  SimulationProvider,
} from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/** Which side of the table a row belongs to. Also which input fills it in. */
type Side = "offered" | "asked";

/**
 * The copy for a caravan with nothing worth putting on the table.
 *
 * It is the market panel's sentence with the verb changed, because it is the same fact
 * and a player who has just been told it in the market should not have to work out
 * whether the two panels disagree.
 */
const NOTHING_TO_OFFER = "Caravan holds no goods. Buy something in a market before bargaining for anything.";

export interface BarterPanelOptions {
  partyId: string;
  partyName: string;
  /** The town the deal is struck at, which is also where the trader's tables come from. */
  townId: string;
  /**
   * The trader, or `null` when nobody holds this town.
   *
   * `null` is a real state rather than an error: a settlement on the map with no lord
   * on it has nobody to bargain with, and the panel says that rather than opening two
   * empty tables.
   */
  traderId: string | null;
  /** The trader's name, for the title bar. The tables carry the rest. */
  traderName: string;
  /**
   * The two tables, or `null` when the caller has not read them yet.
   *
   * `null` means the panel is about to go and get them, so it draws the skeleton rather
   * than complaining about data that was never on its way.
   */
  terms: BarterTerms | null;
  provider: SimulationProvider;
  onClose?: () => void;
  onDealt?: (result: BarterResult) => void;
  onError?: (message: string) => void;
  /** The tables are still being read. */
  loading?: boolean;
  /**
   * The outcome of the last deal, carried across a re-render.
   *
   * The app rebuilds this panel from a fresh snapshot after a deal, because the deal
   * moved the market, the lord's gold and the party's cage. Without this the
   * confirmation the player has just earned would be wiped by the refresh that showed it.
   */
  lastOutcome?: { tone: "good" | "critical"; text: string } | null;
  testId?: string;
}

export interface BarterPanelHandle {
  root: HTMLElement;
  body: HTMLElement;
  refresh(): void;
  /** Re-read both tables. Backs the "Try again" button, so it is a real request. */
  reload(): Promise<void>;
}

export function barterPanel(options: BarterPanelOptions): BarterPanelHandle {
  const { root, body } = panel({
    title: `Barter — ${options.traderName}`,
    testId: options.testId ?? "barter-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);

  // The panel's own copy of both tables, so a struck deal can be written back without a
  // round trip and without reaching into whatever the caller is holding. Copied rather
  // than referenced for that reason alone.
  let terms: BarterTerms | null = copyTerms(options.terms);
  let loading = options.loading ?? (options.terms === null && options.traderId !== null);
  /** What the player has put down, by line. Zero means nothing is on that side. */
  let offered = new Map<string, number>();
  /** What the player is asking for, by line. */
  let asked = new Map<string, number>();
  /** The trader's last answer about this exact table, or `null` if none has been asked. */
  let proposal: BarterProposal | null = null;
  let asking = false;
  let striking = false;
  /** A read failure, which `render` draws as an error state with a retry. */
  let failure: { message: string; detail: string } | null = null;
  /** The outcome of the last deal, carried across the re-render that shows it. */
  let notice: { tone: "good" | "critical"; text: string } | null = options.lastOutcome ?? null;
  let loadToken = 0;

  function traderTable(): BarterItem[] {
    return terms?.traderItems ?? [];
  }

  function playerTable(): BarterItem[] {
    return terms?.playerItems ?? [];
  }

  function quantitiesFor(side: Side): Map<string, number> {
    return side === "offered" ? offered : asked;
  }

  function tableFor(side: Side): BarterItem[] {
    return side === "offered" ? playerTable() : traderTable();
  }

  /**
   * What the table is worth, at the trader's own figures.
   *
   * The one multiplication in this file. It is displayed, never used for a decision: the
   * button beside it asks the simulation, and this number only tells the player roughly
   * what they are about to be asked.
   */
  function totalOf(side: Side): number {
    const quantities = quantitiesFor(side);
    let total = 0;
    for (const item of tableFor(side)) {
      total += item.unitValue * (quantities.get(lineKey(item.kind, item.itemId)) ?? 0);
    }
    return total;
  }

  function linesFor(side: Side): BarterLine[] {
    const quantities = quantitiesFor(side);
    const lines: BarterLine[] = [];
    for (const item of tableFor(side)) {
      const quantity = quantities.get(lineKey(item.kind, item.itemId)) ?? 0;
      if (quantity > 0) lines.push({ kind: item.kind, itemId: item.itemId, quantity });
    }
    return lines;
  }

  /**
   * Re-read both tables from the simulation.
   *
   * A request, which is what makes the retry button honest: it can succeed where the
   * last one failed, and a button that only re-rendered the same missing tables would be
   * a lie told to the player.
   */
  async function reload(): Promise<void> {
    if (options.traderId === null) return; // Nobody to read a table from.
    const token = ++loadToken;
    failure = null;
    loading = true;
    render();
    try {
      terms = copyTerms(await options.provider.barterTerms(options.traderId, options.townId));
      // Anything already on the table refers to lines the old tables had. A line that is
      // gone is dropped rather than sent, because the simulation would refuse the whole
      // deal over one number that no longer exists.
      offered = clampToTable(offered, playerTable());
      asked = clampToTable(asked, traderTable());
      proposal = null;
    } catch (err) {
      if (token !== loadToken) return;
      failure = {
        message:
          err instanceof SimulationUnavailableError
            ? err.playerMessage
            : `Neither of ${options.traderName}'s tables could be read.`,
        detail: err instanceof SimulationUnavailableError ? err.developerDetail : String(err),
      };
      options.onError?.(`${failure.message} :: ${failure.detail}`);
    } finally {
      if (token === loadToken) {
        loading = false;
        render();
      }
    }
  }

  async function ask(): Promise<void> {
    if (asking || striking || !terms || options.traderId === null) return;
    asking = true;
    render();
    try {
      proposal = await options.provider.proposeBarter({
        partyId: options.partyId,
        traderId: options.traderId,
        townId: terms.townId,
        offered: linesFor("offered"),
        asked: linesFor("asked"),
        expectedDay: terms.day,
      });
    } catch (err) {
      const message =
        err instanceof SimulationUnavailableError ? err.playerMessage : `${options.traderName} did not answer.`;
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      proposal = {
        accepted: false,
        playerValue: totalOf("offered"),
        traderValue: totalOf("asked"),
        verdict: "No answer.",
        reason: message,
        causedBy: "barter-unavailable",
      };
      options.onError?.(`${message} :: ${detail}`);
    } finally {
      asking = false;
      render();
    }
  }

  async function strike(): Promise<void> {
    if (striking || asking || !terms || options.traderId === null || !proposal?.accepted) return;
    striking = true;
    render();
    try {
      const result = await options.provider.commitBarter({
        partyId: options.partyId,
        traderId: options.traderId,
        townId: terms.townId,
        offered: linesFor("offered"),
        asked: linesFor("asked"),
        expectedDay: terms.day,
      });
      if (result.accepted) {
        gameAudio().playSfx("coin");
        // The tables that come back are the ones the simulation now holds. Everything on
        // screen is replaced by them, so nothing here can disagree with the world.
        terms = { ...copyTerms(terms)!, playerItems: result.playerItems, traderItems: result.traderItems };
        notice = { tone: "good", text: `${result.verdict} Struck on day ${result.day}.` };
        options.onDealt?.(result);
      } else {
        // A deal the trader agreed to and then would not take is a refusal, and its
        // reason is the one the player needs.
        notice = { tone: "critical", text: result.reason ?? "The deal was refused." };
        proposal = result;
      }
    } catch (err) {
      const message =
        err instanceof SimulationUnavailableError ? err.playerMessage : "The deal did not go through.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      notice = { tone: "critical", text: message };
      options.onError?.(`${message} :: ${detail}`);
    } finally {
      // The table is emptied either way: a refused deal was about numbers the player has
      // now seen, and leaving them there invites pressing the same button twice.
      offered = new Map();
      asked = new Map();
      proposal = null;
      striking = false;
      render();
    }
  }

  function takeItBack(): void {
    offered = new Map();
    asked = new Map();
    proposal = null;
    render();
    body.querySelector<HTMLElement>("[data-testid='barter-ask']")?.focus();
  }

  function setQuantity(side: Side, item: BarterItem, quantity: number): void {
    // Clamped to what the table says is in hand. The input's `max` says the same thing,
    // and this is the half of it a typed number cannot enforce.
    const next = Math.max(0, Math.min(item.available, Math.floor(quantity)));
    const quantities = quantitiesFor(side);
    if (next === 0) quantities.delete(lineKey(item.kind, item.itemId));
    else quantities.set(lineKey(item.kind, item.itemId), next);
    // An answer about a table that has just changed is about a deal nobody is offering.
    proposal = null;
    render();
  }

  function render(): void {
    // The focused control is remembered across the repaint, because the panel rebuilds
    // itself on every quantity change and a field that loses the keyboard as it is typed
    // into is unusable without a mouse.
    const focused = document.activeElement;
    const focusedId = focused instanceof HTMLElement && body.contains(focused) ? focused.dataset.testid : undefined;

    body.replaceChildren();

    if (loading) {
      body.appendChild(barterSkeletonBody());
      return;
    }

    if (failure !== null) {
      body.appendChild(
        errorState({
          message: failure.message,
          detail: failure.detail,
          onRetry: () => void reload(),
          testId: "barter-error",
        }),
      );
      return;
    }

    if (options.traderId === null) {
      // There is a town and nobody holding it. That is a real state, not a failed read,
      // so it gets the empty state and its way out rather than a retry that would read
      // the same nothing again. It is checked before the tables because there are never
      // any to wait for.
      body.appendChild(
        emptyState(
          "Nobody here to bargain with.",
          "This settlement is on the real map and the simulation runs a town for it, but no lord holds it, " +
            "so there is no table, no gold and no cage to bargain over. Choose a town somebody holds, or open the " +
            "market to buy and sell instead.",
        ),
      );
      return;
    }

    if (!terms) {
      // Neither data nor a complaint yet: the request is still in flight, and the frame
      // that says so is the skeleton rather than a blank sheet.
      body.appendChild(barterSkeletonBody());
      return;
    }

    body.appendChild(head());

    if (notice) {
      body.appendChild(
        h(
          "p",
          { class: "caption", "data-testid": "barter-message", role: "status", style: "margin:0 0 var(--space-3)" },
          statusChip(notice.tone, notice.text, { testId: "barter-message-chip" }),
        ),
      );
    }

    sideTable("offered", "What you can put down", "In hand", "Putting down");
    sideTable("asked", `What ${terms.traderName} can give`, "On offer", "Asking for");

    body.appendChild(totals());

    if (proposal) {
      body.appendChild(answer(proposal));
    }

    body.appendChild(actions());

    body.appendChild(
      h(
        "p",
        { class: "caption" },
        "Every figure here is the trader's own, sent by the simulation. This panel adds them up and nothing more: " +
          "whether a deal is struck is decided there, in words.",
      ),
    );

    if (focusedId) {
      const again = body.querySelector<HTMLElement>(`[data-testid="${escapeAttribute(focusedId)}"]`);
      again?.focus();
    }
  }

  /** The trader's name, and where they stand with the player. */
  function head(): HTMLElement {
    if (!terms) return h("div", {});
    return h(
      "div",
      { class: "field-row", "data-testid": "barter-head", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, "At the table"),
        h("p", { class: "label", style: "margin:0" }, `${terms.traderName} · ${options.partyName}`),
      ),
      statusChip(standingKind(terms.relationToPlayer), `Standing ${signed(terms.relationToPlayer)}`, {
        testId: "barter-standing",
        title: `This trader is ${standingWords(terms.relationToPlayer)} with you. Tables read on day ${terms.day}.`,
      }),
    );
  }

  /**
   * One side of the table, as four columns: the item, what there is of it, what the
   * trader calls a unit worth, and the number going on or coming off it.
   *
   * The quantity is an input rather than a run of plus buttons because the size of a
   * barter is a number the player wants to set directly, not one they want to click up
   * to forty times. It is a real `<input>` with a real `<label>`, so it is reachable and
   * named, and the label is hidden because the column heading is already on screen and
   * repeated eight times down a table is noise.
   */
  function sideTable(side: Side, heading: string, countHeader: string, quantityHeader: string): void {
    const items = tableFor(side);
    body.appendChild(sectionHeader(heading));

    if (items.length === 0) {
      body.appendChild(
        emptyState(
          side === "offered" ? "Nothing to put down." : `${options.traderName} has nothing to give.`,
          side === "offered"
            ? NOTHING_TO_OFFER
            : "This trader's table is empty. Move to a town with a market or a lord with stock, and come back.",
        ),
      );
      return;
    }

    const quantities = quantitiesFor(side);
    const columns: Column<BarterItem>[] = [
      { header: "Item", render: (item) => h("span", { class: "label" }, item.name) },
      {
        header: countHeader,
        numeric: true,
        testId: `barter-available-${side}`,
        render: (item) => String(item.available),
      },
      {
        header: "Worth",
        numeric: true,
        testId: `barter-worth-${side}`,
        render: (item) => money(item.unitValue),
      },
      {
        header: quantityHeader,
        numeric: true,
        render: (item) =>
          quantityField(side, item, quantities.get(lineKey(item.kind, item.itemId)) ?? 0),
      },
    ];

    body.appendChild(
      stackable(
        dataTable(
          `${options.partyName} ${side === "offered" ? "offer" : "request"}, ${options.traderName}`,
          columns,
          items,
          `barter-${side}-table`,
        ),
      ),
    );
  }

  /** The two totals, in the cost cells the march planner already uses. */
  function totals(): HTMLElement {
    const wrap = h("div", { class: "costs", "data-testid": "barter-totals" });
    wrap.append(
      totalCell("You put down", totalOf("offered"), `${countLines("offered")} on your side of the table`, "barter-total-offered"),
      totalCell(
        "You take",
        totalOf("asked"),
        `${countLines("asked")} asked of ${options.traderName}`,
        "barter-total-asked",
      ),
    );
    return wrap;
  }

  /**
   * The trader's answer, in full.
   *
   * A refusal is not a failed transaction, it is the most useful thing this screen can
   * say: it names the shortfall, and the shortfall is the number the player can go and
   * fix. So the reason is printed in a paragraph rather than reduced to a status colour.
   */
  function answer(proposal: BarterProposal): HTMLElement {
    const tone: StatusKind = proposal.accepted ? "good" : "critical";
    const wrap = h("section", { class: "panel__section", "data-testid": "barter-answer" });
    wrap.appendChild(sectionHeader("What they make of it"));
    wrap.appendChild(
      h(
        "p",
        { class: "caption", style: "margin:0 0 var(--space-2)" },
        statusChip(tone, proposal.verdict, { testId: "barter-verdict-chip" }),
      ),
    );
    if (proposal.reason) {
      wrap.appendChild(
        h("p", { class: "caption", "data-testid": "barter-reason", style: "margin:0" }, proposal.reason),
      );
    }
    if (proposal.shortBy !== undefined && proposal.shortBy > 0) {
      wrap.appendChild(
        h(
          "p",
          { class: "data", "data-testid": "barter-short-by", style: "margin:var(--space-2) 0 0" },
          `Short by ${money(proposal.shortBy)}.`,
        ),
      );
    }
    return wrap;
  }

  /**
   * The two buttons, and only the second one moves anything.
   *
   * `Ask` sends the table to the trader and changes nothing in the world. `Strike the
   * deal` appears only after the trader has said yes, so the commit is never the first
   * thing on screen and a player cannot hand over a load of grain by pressing the only
   * button they were shown.
   */
  function actions(): HTMLElement {
    const row = h("div", { class: "field-row", "data-testid": "barter-actions" });

    const askBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn--primary",
        "data-testid": "barter-ask",
        disabled: asking || striking,
      },
      asking ? `Asking ${options.traderName}` : `Ask ${options.traderName}`,
    );
    askBtn.addEventListener("click", () => void ask());
    row.appendChild(askBtn);

    if (proposal?.accepted) {
      const strikeBtn = h(
        "button",
        { type: "button", class: "btn", "data-testid": "barter-strike", disabled: striking },
        striking ? "Striking the deal" : "Strike the deal",
      );
      strikeBtn.addEventListener("click", () => void strike());
      const back = h("button", { type: "button", class: "btn btn--quiet", "data-testid": "barter-clear" }, "Take it back");
      back.addEventListener("click", takeItBack);
      row.append(strikeBtn, back);
    }

    return row;
  }

  /**
   * The quantity input for one row.
   *
   * Its `max` is the count the simulation says is in hand, and `setQuantity` clamps to
   * the same figure, so a number the world cannot honour cannot be sent from here.
   *
   * A real `<input>` with a real `<label>`, so it is reachable and named. The label is
   * visually hidden because the column heading is already on screen and repeating it
   * down a table is noise.
   */
  function quantityField(side: Side, item: BarterItem, value: number): HTMLElement {
    const id = `barter-${side}-${slug(item.itemId)}`;
    const verb = side === "offered" ? "Put down" : "Ask for";
    const label = `${verb} up to ${item.available} ${item.name}`;
    const input = h("input", {
      type: "number",
      id,
      class: "field__input data",
      value: String(value),
      min: "0",
      max: String(item.available),
      step: "1",
      inputmode: "numeric",
      "data-testid": `barter-qty-${side}-${slug(item.itemId)}`,
      title: `${label}. ${item.available} in hand.`,
    });
    input.addEventListener("change", () => setQuantity(side, item, Number(input.value)));
    return h("div", { class: "field" }, h("label", { class: "visually-hidden", for: id }, label), input);
  }

  /** How many lines are on one side of the table, in words rather than as a number. */
  function countLines(side: Side): string {
    const lines = linesFor(side);
    if (lines.length === 0) return "nothing";
    return lines.length === 1 ? "1 line" : `${lines.length} lines`;
  }

  /**
   * One total, in the cost cell the march planner already uses.
   *
   * The figure is the trader's own valuation of what is on the table, multiplied out.
   * It is a preview of the question, not the answer: whether the trader agrees is what
   * the button beside it asks.
   */
  function totalCell(key: string, value: number, note: string, testId: string): HTMLElement {
    return h(
      "div",
      { class: "cost", "data-testid": testId },
      h("div", { class: "cost__key" }, key),
      h("div", { class: "data" }, money(value)),
      h("div", { class: "caption" }, "at the trader's prices"),
      h("div", { class: "caption" }, note),
    );
  }

  render();
  // Handed tables it does not have, and somebody to read them from: ask. Gated on what
  // the caller passed, not on `loading`, which is true precisely because of that.
  if (options.terms === null && options.traderId !== null) void reload();

  return { root, body, refresh: render, reload };
}

/** A line's identity: kind and id together, because a unit can be both a good and a prisoner. */
function lineKey(kind: BarterItem["kind"], itemId: string): string {
  return `${kind}:${itemId}`;
}

/** Drop any quantity whose line the new tables do not carry, and clamp the rest. */
function clampToTable(quantities: Map<string, number>, items: BarterItem[]): Map<string, number> {
  const next = new Map<string, number>();
  for (const item of items) {
    const quantity = quantities.get(lineKey(item.kind, item.itemId)) ?? 0;
    if (quantity > 0) next.set(lineKey(item.kind, item.itemId), Math.min(quantity, item.available));
  }
  return next;
}

/** A detached copy of both tables, so a struck deal cannot write back into the caller's. */
function copyTerms(terms: BarterTerms | null): BarterTerms | null {
  if (!terms) return null;
  return {
    townId: terms.townId,
    traderId: terms.traderId,
    traderName: terms.traderName,
    traderItems: terms.traderItems.map((item) => ({ ...item })),
    playerItems: terms.playerItems.map((item) => ({ ...item })),
    relationToPlayer: terms.relationToPlayer,
    day: terms.day,
  };
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function signed(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

/** `RULERS.md` section 2 relation, as one of the five status kinds the kit already has. */
function standingKind(relation: number): StatusKind {
  if (relation >= 30) return "good";
  if (relation >= 5) return "info";
  if (relation >= -30) return "warning";
  return "critical";
}

function standingWords(relation: number): string {
  if (relation >= 30) return "well disposed";
  if (relation >= 5) return "friendly";
  if (relation >= -30) return "wary";
  return "hostile";
}

/** An id or test id has to survive being put in a selector. */
function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function escapeAttribute(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}