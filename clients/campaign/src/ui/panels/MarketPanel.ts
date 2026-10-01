/**
 * The market panel. `UI_UX.md` section 2, `ECONOMY.md` section 7.
 *
 * Buy and sell, with the price, its trend, and a price history sparkline, because
 * "prices respond to real supply and demand" is only meaningful if the player can see
 * them respond. Every rejection from the simulation is shown verbatim, in the
 * product's voice, because "not enough money" and "the market is empty" are different
 * problems with different answers.
 *
 * Two rules shape the code here.
 *
 * **The client sets no price.** A trade returns the price the market moved to; this
 * panel writes that number into its own copy of the market so the table is consistent
 * immediately, and nothing else. The sparkline draws the history the simulation sent.
 * It never smooths it, never extrapolates it, and never invents a point to fill a gap.
 *
 * **The first frame is a skeleton, not a blank and not an error.** If the panel is
 * asked for a market it does not have, it draws `market-skeleton` and then asks for
 * the snapshot. Only when that request has actually failed does it show a plain
 * message and a way to recover (CONSTITUTION.md sections 3.2 and 1.3). A retry button
 * that re-renders the same missing data would be a lie told to the player.
 */

import { h, numberField, sectionHeader, button } from "../dom.js";
import { emptyState, errorState, panel, statusChip, dataTable, type Column } from "../kit.js";
import { marketSkeletonBody } from "./skeletons.js";
import { asBottomSheet, stackable } from "./narrow.js";
import type { MarketGood, MarketState, PartyState, SimulationProvider, TradeResult } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/** The sell-side empty copy, verbatim from ART_DIRECTION.md section 10.2. */
const NOTHING_TO_SELL = "Caravan holds no goods. Buy something in a market before hauling.";

/**
 * How much price history this panel keeps on screen.
 *
 * A day of history is a day the player can scroll back through, and past about four
 * weeks a sparkline 64px wide stops being readable and starts being decoration.
 */
const HISTORY_POINTS = 24;

export interface MarketPanelOptions {
  townId: string;
  townName: string;
  market: MarketState | null;
  party: PartyState;
  money: number;
  day: number;
  provider: SimulationProvider;
  onClose?: () => void;
  onTraded?: (result: TradeResult) => void;
  onError?: (message: string) => void;
  /** Opens the Why panel on a good's price, when the caller has one to open. */
  onWhy?: (goodId: string) => void;
  /**
   * The outcome of the last trade, carried across a re-render.
   *
   * The panel rebuilds itself from a fresh snapshot after every trade so the table
   * shows the post-trade price. Without this the confirmation the player just earned
   * would be wiped by the refresh that displayed it.
   */
  lastTrade?: { tone: "good" | "critical"; text: string } | null;
  /** The size the player chose, carried across the re-render that follows a trade. */
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  /**
   * The market is still being read. `market-skeleton` goes up before the request, so
   * the context region keeps its shape from the first frame.
   */
  loading?: boolean;
  testId?: string;
}

export interface MarketPanelHandle {
  root: HTMLElement;
  body: HTMLElement;
  refresh(): void;
  /** Re-read the market from the simulation. Backs the "Try again" button. */
  reload(): Promise<void>;
}

export function marketPanel(options: MarketPanelOptions): MarketPanelHandle {
  const { root, body } = panel({
    title: `Market — ${options.townName}`,
    testId: options.testId ?? "market-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);

  // The panel's own copy of what it was handed, so a trade can update it without a
  // round trip. Never a second source of prices: every value here came back from the
  // simulation in a TradeResult. Copied rather than referenced, so applying a trade
  // cannot reach back and rewrite the snapshot the caller is holding.
  let market: MarketState | null = copyMarket(options.market);
  let party: PartyState = copyParty(options.party);
  let purse = options.money;
  let busy = false;
  // The day the prices on screen belong to. A trade is priced against this, because the
  // simulation refuses an order bought against a day the world has left
  // (`validateOrderDay` answers 409). The panel therefore tracks the day itself rather
  // than reading `options.day` every time: the caller hands it a snapshot's day when the
  // panel is built, and the clock keeps running after that.
  let day = options.day;
  // A panel asked for a market it does not have is, by definition, about to go and
  // get one, so the first frame is the skeleton rather than a complaint about data
  // that was never on its way.
  let loading = options.loading ?? options.market === null;
  let lastMessage = options.lastTrade ?? null;
  let quantity = options.quantity ?? 10;
  /** Player-facing failure text, or null. Drives the error state and its recovery. */
  let failure: string | null = null;
  let failureDetail = "";
  let loadToken = 0;

  function heldOf(goodId: string): number {
    return party.goods.find((g) => g.goodId === goodId)?.quantity ?? 0;
  }

  /** How much one order is worth at the price on screen. Shown before committing to it. */
  function orderValue(good: MarketGood): number {
    return good.price * quantity;
  }

  /**
   * Ask the simulation for the market again. This is a real request, which is why the
   * retry button is honest: it can succeed where the last one failed.
   *
   * `quiet` keeps the table on screen for the length of the request, for the calls that
   * are made because something went wrong rather than because there is nothing to show:
   * a skeleton over a market the player was just reading is a worse answer than a table
   * whose numbers are one request old.
   */
  async function reload(quiet = false): Promise<void> {
    const token = ++loadToken;
    failure = null;
    if (!quiet) {
      loading = true;
      render();
    }
    try {
      const snapshot = await options.provider.getSnapshot();
      if (token !== loadToken) return; // A newer request already answered.
      market = copyMarket(snapshot.markets[options.townId] ?? null);
      party = copyParty(snapshot.party);
      purse = snapshot.player.resources.money;
      day = snapshot.day;
      if (!market) {
        failure = `The market at ${options.townName} did not load. The snapshot carries no market record for this town.`;
        failureDetail = `getSnapshot returned no entry for ${options.townId}.`;
      }
    } catch (err) {
      if (token !== loadToken) return;
      failure =
        err instanceof SimulationUnavailableError
          ? err.playerMessage
          : "The market could not be read from the simulation.";
      failureDetail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      options.onError?.(`${failure} :: ${failureDetail}`);
    } finally {
      if (token === loadToken) {
        loading = false;
        render();
      }
    }
  }

  async function doTrade(good: MarketGood, side: "buy" | "sell"): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await options.provider.trade({
        partyId: party.id,
        townId: options.townId,
        goodId: good.goodId,
        side,
        quantity,
        expectedDay: day,
      });
      if (result.accepted) {
        applyTrade(good, side, result);
        lastMessage = {
          tone: "good",
          text:
            side === "buy"
              ? `Bought ${result.quantity} ${good.name.toLowerCase()} for ${money(result.total)}. ` +
                `The price here is now ${result.marketPriceAfter.toFixed(2)}.`
              : `Sold ${result.quantity} ${good.name.toLowerCase()} for ${money(result.total)}. ` +
                `The price here is now ${result.marketPriceAfter.toFixed(2)}.`,
        };
        options.onTraded?.(result);
      } else {
        // The simulation's own reason, verbatim. A refusal with a reason is an answer.
        lastMessage = { tone: "critical", text: result.reason ?? "The trade was refused." };
      }
    } catch (err) {
      const message =
        err instanceof SimulationUnavailableError ? err.playerMessage : "The trade could not be completed.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      lastMessage = { tone: "critical", text: message };
      options.onError?.(`${message} :: ${detail}`);
      if (isStaleOrder(err)) {
        // The world moved on: these prices belong to a day that has passed. The
        // simulation's sentence is shown as it was written, and the market is read again
        // so the numbers on screen match the world that refused the order. The order
        // itself is not repeated — a refusal is a refusal, and resending a buy on the
        // player's behalf is not this panel's decision to make.
        lastMessage = { tone: "critical", text: `${message} The prices below have been read again.` };
        void reload(true);
      }
    } finally {
      busy = false;
      render();
    }
  }

  /**
   * Whether the simulation refused the order because the world moved on.
   *
   * The provider marks a 409 — a conflict with a reason — as not retryable, which is
   * exactly this case and nothing else on this route. The stale day is the reason the
   * panel reads the market again; a network failure, which is retryable, is left to the
   * player's own retry because a re-read would fail the same way.
   */
  function isStaleOrder(err: unknown): boolean {
    return err instanceof SimulationUnavailableError && !err.retryable;
  }

  /**
   * Write the simulation's answer into the panel's copy of the world.
   *
   * Every number here is read out of the TradeResult. The panel moves no price and
   * draws no balance; it only stops showing a figure the simulation has already
   * superseded.
   */
  function applyTrade(good: MarketGood, side: "buy" | "sell", result: TradeResult): void {
    if (!market) return;
    const row = market.goods.find((g) => g.goodId === good.goodId);
    if (row) {
      row.previousPrice = result.unitPrice;
      row.price = result.marketPriceAfter;
      row.stock = side === "buy" ? row.stock - result.quantity : row.stock + result.quantity;
      row.history = [...row.history, { day, price: result.marketPriceAfter }].slice(-HISTORY_POINTS);
    }
    const held = party.goods.find((g) => g.goodId === good.goodId);
    if (held) held.quantity = result.partyQuantity;
    else if (result.partyQuantity > 0) {
      party.goods = [...party.goods, { goodId: good.goodId, name: good.name, quantity: result.partyQuantity, avgPaid: result.unitPrice }];
    }
    purse = side === "buy" ? purse - result.total : purse + result.total;
  }

  function render(): void {
    body.replaceChildren();

    if (loading) {
      body.appendChild(marketSkeletonBody());
      return;
    }

    if (failure !== null) {
      body.appendChild(
        errorState({
          message: failure,
          detail: failureDetail,
          onRetry: () => void reload(),
          testId: "market-error",
        }),
      );
      return;
    }

    if (lastMessage) {
      body.appendChild(
        h(
          "p",
          { class: "caption", "data-testid": "market-message", role: "status", style: "margin:0 0 var(--space-3)" },
          statusChip(lastMessage.tone, lastMessage.text, { testId: "market-message-chip" }),
        ),
      );
    }

    if (!market) {
      // Nothing to show and nothing to complain about: the request is still in flight.
      // Holding the skeleton is the honest frame, and it is the frame the constitution
      // asks for: no data and no placeholder is the state to avoid.
      body.appendChild(marketSkeletonBody());
      return;
    }

    const goods = market.goods;
    if (goods.length === 0) {
      body.appendChild(
        emptyState(
          "Nothing is traded here.",
          "This town has no market records. Buy somewhere with a market before you try to sell.",
        ),
      );
      return;
    }

    // -- the order, and what it will cost ------------------------------------
    const qty = numberField("market-quantity", "Quantity", quantity, {
      min: 1,
      step: 1,
      onChange: (v) => {
        quantity = Math.max(1, Math.floor(v));
        options.onQuantityChange?.(quantity);
        // The labels are rewritten in place rather than by re-rendering the panel: a
        // full re-render would pull the focused quantity field out of the document on
        // every keystroke, and a control that loses focus as you type it is unusable
        // without a mouse.
        refreshOrderLabels();
      },
    });
    body.appendChild(
      h(
        "div",
        { class: "field-row", style: "margin-bottom:var(--space-3)" },
        qty.field,
        h("p", { class: "caption", style: "margin:0 0 0;flex:1 1 var(--space-7)" },
          `Purse ${money(purse)}. Prices move when you trade, so the figure you see is the figure before.`),
      ),
    );

    // -- when these prices were read ------------------------------------------
    // The clock keeps running while this panel is open, so the numbers on screen belong
    // to a day rather than to now. Saying which day is the difference between a price
    // the player is looking at and a price they think is live, and the button is a real
    // read of the simulation, so it can succeed where the last one did not.
    body.appendChild(
      h(
        "p",
        { class: "caption", "data-testid": "market-freshness" },
        `Prices read on day ${day}.`,
      ),
    );
    body.appendChild(
      button("Read the prices again", () => void reload(), {
        variant: "quiet",
        testId: "market-refresh",
        disabled: busy,
      }),
    );

    // -- the prices ----------------------------------------------------------
    const columns: Column<MarketGood>[] = [
      { header: "Good", render: (g) => h("span", { class: "label" }, g.name) },
      {
        header: "Price",
        numeric: true,
        testId: "market-price",
        // Mono with tabular figures, so a column of prices does not jitter as the
        // market ticks. The numeric cell already carries the `data` class; the price
        // itself repeats it so it stays mono wherever it is rendered.
        render: (g) => h("span", { class: "data", "data-testid": `price-${g.goodId}` }, priceWithTrend(g)),
      },
      { header: "History", numeric: true, render: (g) => sparkline(g) },
      { header: "Stock", numeric: true, testId: "market-stock", render: (g) => String(g.stock) },
      { header: "Demand", numeric: true, testId: "market-demand", render: (g) => String(g.demand) },
      { header: "Held", numeric: true, testId: "market-held", render: (g) => String(heldOf(g.goodId)) },
      { header: "Trade", numeric: true, render: (g) => actionsFor(g) },
    ];

    body.appendChild(sectionHeader("Prices and stock"));
    body.appendChild(
      stackable(
        dataTable(`${options.townName} market prices and stock`, columns, goods, "market-table"),
      ),
    );

    // -- what the caravan is carrying -----------------------------------------
    body.appendChild(sectionHeader("Caravan hold"));
    const held = party.goods.filter((g) => g.quantity > 0);
    if (held.length === 0) {
      body.appendChild(
        emptyState(
          "Nothing to sell.",
          NOTHING_TO_SELL,
        ),
      );
    } else {
      body.appendChild(
        stackable(
          dataTable(
            "Goods carried by the party",
            [
              { header: "Good", render: (g) => h("span", { class: "label" }, g.name) },
              { header: "Quantity", numeric: true, testId: "party-good-qty", render: (g) => String(g.quantity) },
              { header: "Paid", numeric: true, render: (g) => money(g.avgPaid) },
            ],
            held,
            "market-hold",
          ),
        ),
      );
      body.appendChild(
        h(
          "p",
          { class: "caption" },
          `One order is ${quantity} units. Selling them here moves the price against you; the simulation decides by how much.`,
        ),
      );
    }

    // -- the honest note about where prices come from -------------------------
    body.appendChild(sectionHeader("What moved"));
    body.appendChild(
      h(
        "p",
        { class: "caption" },
        options.onWhy
          ? "Ask about any price to see the cause log behind it. Prices here are simulation output; this panel does not set them."
          : "Prices here are simulation output; this panel does not set them. The cause log for each price is recorded on the ledger.",
      ),
    );
  }

  function actionsFor(good: MarketGood): HTMLElement {
    const wrap = h("div", { class: "market__row-actions" });
    const buy = h("button", { type: "button", class: "btn", "data-testid": `buy-${good.goodId}` }, "Buy");
    buy.addEventListener("click", () => void doTrade(good, "buy"));
    const sell = h("button", { type: "button", class: "btn", "data-testid": `sell-${good.goodId}` }, "Sell");
    sell.addEventListener("click", () => void doTrade(good, "sell"));
    // Nothing held, nothing to sell. Disabled rather than hidden, so the reason the
    // player cannot sell here is visible in the layout rather than being a hole in it.
    sell.disabled = heldOf(good.goodId) < 1 || busy;
    labelOrder(good, buy, "buy");
    labelOrder(good, sell, "sell");
    wrap.append(buy, sell);
    return wrap;
  }

  /**
   * The accessible name of a trade button: what it will do, to how much, at what
   * price. A button reading "Buy" tells a screen reader nothing about the size of the
   * order, and the size is the decision the player is making.
   */
  function labelOrder(good: MarketGood, button: HTMLElement, side: "buy" | "sell"): void {
    const value = money(orderValue(good));
    const verb = side === "buy" ? "Buy" : "Sell";
    button.setAttribute("aria-label", `${verb} ${quantity} ${good.name} for ${value} at ${good.price.toFixed(2)} each`);
    if (side === "sell" && heldOf(good.goodId) < 1) {
      button.setAttribute("title", "The caravan is holding none of this. Buy some before selling it.");
    } else {
      button.setAttribute("title", `${verb} ${quantity} for ${value}.`);
    }
  }

  /** Re-label every trade button after the quantity changes. */
  function refreshOrderLabels(): void {
    if (!market) return;
    for (const good of market.goods) {
      const buy = body.querySelector<HTMLElement>(`[data-testid='buy-${good.goodId}']`);
      const sell = body.querySelector<HTMLElement>(`[data-testid='sell-${good.goodId}']`);
      if (buy) labelOrder(good, buy, "buy");
      if (sell) labelOrder(good, sell, "sell");
    }
  }

  render();
  // Handed a market it does not have: ask for one. Gated on what the caller passed,
  // not on `loading`, which is true precisely because of that.
  if (options.market === null) void reload();

  return { root, body, refresh: render, reload };
}

function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

/** A detached copy of a market, so a trade updates the panel and nothing else. */
function copyMarket(market: MarketState | null): MarketState | null {
  if (!market) return null;
  return { townId: market.townId, goods: market.goods.map((g) => ({ ...g, history: g.history.map((p) => ({ ...p })) })) };
}

/** A detached copy of the party's hold, for the same reason. */
function copyParty(party: PartyState): PartyState {
  return { ...party, goods: party.goods.map((g) => ({ ...g })) };
}

function trendArrow(g: MarketGood): "up" | "down" | "flat" {
  if (g.previousPrice === null || g.price === g.previousPrice) return "flat";
  return g.price > g.previousPrice ? "up" : "down";
}
function trendGlyph(g: MarketGood): string {
  const t = trendArrow(g);
  return t === "up" ? "▲" : t === "down" ? "▼" : "—";
}
function trendColour(g: MarketGood): "critical" | "good" | "neutral" {
  const t = trendArrow(g);
  return t === "up" ? "critical" : t === "down" ? "good" : "neutral";
}

/**
 * A price and its direction.
 *
 * The arrow is decorative and hidden from assistive technology; the number beside it
 * is the value, and the button's accessible name carries the same figure. A price
 * going up is not good news, so it takes the critical mark rather than the healthy
 * one (ART_DIRECTION.md section 5.3).
 */
function priceWithTrend(g: MarketGood): HTMLElement {
  return h(
    "span",
    {},
    h(
      "span",
      { class: "table__trend", "aria-hidden": "true", "data-trend": trendArrow(g), style: `color:var(--status-${trendColour(g)})` },
      trendGlyph(g),
    ),
    g.price.toFixed(2),
  );
}

/**
 * Price history, from the values the simulation sent. No smoothing, no invention.
 *
 * With fewer than two points there is no line to draw, so the cell says so rather than
 * showing an empty frame that reads as a flat price.
 */
function sparkline(g: MarketGood): Node {
  const prices = g.history.map((p) => p.price);
  if (prices.length < 2) {
    return h("span", { class: "caption", "data-testid": `history-${g.goodId}` }, "No history recorded");
  }
  const w = 64;
  const hgt = 18;
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "sparkline");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(hgt));
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  svg.setAttribute("role", "img");
  const first = g.history[0]!;
  const last = g.history[g.history.length - 1]!;
  svg.setAttribute(
    "aria-label",
    `${g.name} price history, day ${first.day} to day ${last.day}: ${prices.map((p) => p.toFixed(2)).join(", ")}.`,
  );

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const points = prices
    .map((p, i) => `${(i / (prices.length - 1)) * w},${hgt - 2 - ((p - min) / span) * (hgt - 4)}`)
    .join(" ");

  const base = document.createElementNS(svgNs, "line");
  base.setAttribute("class", "sparkline__base");
  base.setAttribute("x1", "0");
  base.setAttribute("y1", String(hgt - 1));
  base.setAttribute("x2", String(w));
  base.setAttribute("y2", String(hgt - 1));
  svg.appendChild(base);

  const path = document.createElementNS(svgNs, "polyline");
  path.setAttribute("class", "sparkline__path");
  path.setAttribute("points", points);
  svg.appendChild(path);
  return svg;
}

