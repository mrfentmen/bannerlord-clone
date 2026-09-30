/**
 * The market panel. `UI_UX.md` section 2, `ECONOMY.md` section 7.
 *
 * Buy and sell, with the price, its trend, and a price history sparkline, because
 * "prices respond to real supply and demand" is only meaningful if the player can see
 * them respond. Every rejection from the simulation is shown verbatim, in the
 * product's voice, because "not enough money" and "the market is empty" are different
 * problems with different answers.
 */

import { h, numberField, sectionHeader } from "../dom.js";
import { emptyState, errorState, panel, statusChip, dataTable, type Column } from "../kit.js";
import type { MarketGood, MarketState, PartyState, SimulationProvider, TradeResult } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

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
  testId?: string;
}

export interface MarketPanelHandle {
  root: HTMLElement;
  body: HTMLElement;
  refresh(): void;
}

export function marketPanel(options: MarketPanelOptions): MarketPanelHandle {
  const { root, body } = panel({
    title: `Market — ${options.townName}`,
    testId: options.testId ?? "market-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  let busy = false;
  let lastMessage = options.lastTrade ?? null;
  let quantity = options.quantity ?? 10;

  function heldOf(goodId: string): number {
    return options.party.goods.find((g) => g.goodId === goodId)?.quantity ?? 0;
  }

  async function doTrade(good: MarketGood, side: "buy" | "sell"): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const result = await options.provider.trade({
        partyId: options.party.id,
        townId: options.townId,
        goodId: good.goodId,
        side,
        quantity,
        expectedDay: options.day,
      });
      if (result.accepted) {
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
        lastMessage = { tone: "critical", text: result.reason ?? "The trade was refused." };
      }
    } catch (err) {
      const message =
        err instanceof SimulationUnavailableError
          ? err.playerMessage
          : "The trade could not be completed.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      lastMessage = { tone: "critical", text: message };
      options.onError?.(`${message} :: ${detail}`);
    } finally {
      busy = false;
      render();
    }
  }

  function render(): void {
    body.replaceChildren();

    if (lastMessage) {
      body.appendChild(
        h(
          "p",
          { class: "caption", "data-testid": "market-message", role: "status", style: "margin:0 0 var(--space-3)" },
          statusChip(lastMessage.tone, lastMessage.text, { testId: "market-message-chip" }),
        ),
      );
    }

    if (!options.market) {
      body.appendChild(
        errorState({
          message: `The market at ${options.townName} did not load.`,
          detail: "The snapshot carried no market record for this town.",
          onRetry: render,
          testId: "market-error",
        }),
      );
      return;
    }

    const goods = options.market.goods;
    if (goods.length === 0) {
      body.appendChild(
        emptyState(
          "Nothing is traded here.",
          "This town has no market records. Buy somewhere with a market before you try to sell.",
        ),
      );
      return;
    }

    const qty = numberField("market-quantity", "Quantity", quantity, {
      min: 1,
      step: 1,
      onChange: (v) => {
        quantity = Math.max(1, Math.floor(v));
        options.onQuantityChange?.(quantity);
      },
    });
    body.appendChild(
      h(
        "div",
        { class: "field-row", style: "margin-bottom:var(--space-3)" },
        qty.field,
        h("p", { class: "caption", style: "margin:0 0 0;flex:1 1 var(--space-7)" },
          `Purse ${money(options.money)}. Prices move when you trade, so the figure you see is the figure before.`),
      ),
    );

    const columns: Column<MarketGood>[] = [
      { header: "Good", render: (g) => h("span", { class: "label" }, g.name) },
      {
        header: "Price",
        numeric: true,
        testId: "market-price",
        render: (g) =>
          h(
            "span",
            {},
            h("span", { class: "table__trend", "aria-hidden": "true", "data-trend": trendArrow(g), style: `color:var(--status-${trendColour(g)})` }, trendGlyph(g)),
            h("span", { "data-testid": `price-${g.goodId}` }, g.price.toFixed(2)),
          ),
      },
      { header: "History", numeric: true, render: (g) => sparkline(g) },
      { header: "Stock", numeric: true, render: (g) => String(g.stock) },
      { header: "Held", numeric: true, testId: "market-held", render: (g) => String(heldOf(g.goodId)) },
      {
        header: "Trade",
        numeric: true,
        render: (g) => {
          const wrap = h("div", { class: "market__row-actions" });
          const buy = h("button", { type: "button", class: "btn", "data-testid": `buy-${g.goodId}`, "aria-label": `Buy ${quantity} ${g.name} at ${g.price.toFixed(2)} each` }, "Buy");
          buy.addEventListener("click", () => void doTrade(g, "buy"));
          const sell = h("button", { type: "button", class: "btn", "data-testid": `sell-${g.goodId}`, "aria-label": `Sell ${quantity} ${g.name} at ${g.price.toFixed(2)} each` }, "Sell");
          sell.addEventListener("click", () => void doTrade(g, "sell"));
          sell.disabled = heldOf(g.goodId) < 1 || busy;
          wrap.append(buy, sell);
          return wrap;
        },
      },
    ];

    body.appendChild(dataTable(`${options.townName} market prices and stock`, columns, goods, "market-table"));
    body.appendChild(sectionHeader("What moved"));
    body.appendChild(
      h(
        "p",
        { class: "caption" },
        "Ask about any price to see the cause log behind it. Prices here are simulation output; this panel does not set them.",
      ),
    );
  }

  render();
  return { root, body, refresh: render };
}

function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

function trendGlyph(g: MarketGood): string {
  if (g.previousPrice === null) return "—";
  if (g.price > g.previousPrice) return "▲";
  if (g.price < g.previousPrice) return "▼";
  return "—";
}
function trendArrow(g: MarketGood): "up" | "down" | "flat" {
  if (g.previousPrice === null || g.price === g.previousPrice) return "flat";
  return g.price > g.previousPrice ? "up" : "down";
}
function trendColour(g: MarketGood): "critical" | "good" | "neutral" {
  const t = trendArrow(g);
  return t === "up" ? "critical" : t === "down" ? "good" : "neutral";
}

/** Price history, from the values the simulation sent. No smoothing, no invention. */
function sparkline(g: MarketGood): SVGElement {
  const w = 64;
  const hgt = 18;
  const prices = g.history.map((p) => p.price);
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "sparkline");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(hgt));
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${g.name} price history: ${prices.map((p) => p.toFixed(2)).join(", ")}`);

  if (prices.length < 2) return svg;
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
