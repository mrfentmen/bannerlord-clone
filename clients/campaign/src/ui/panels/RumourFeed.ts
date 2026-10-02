/**
 * The rumour feed: what the simulation has heard about prices, and what it makes of them.
 *
 * A rumour is a claim about the world with three numbers in it — where a good is cheap,
 * where it is dear, and what the difference is worth per unit. It is not an order and it
 * is not a quote: the simulation generates it from live market prices on request and
 * forgets it, and the buying is done at a town's market by the market panel. This panel
 * draws the feed and nothing else.
 *
 * Four rules shape the code here, and all four are the simulation's rules rather than this
 * file's.
 *
 * **The feed arrives in the order the simulation sent it, and this file has no sort of its
 * own.** `rumours.Generate` publishes best margin first and breaks ties by good, and the
 * cards are drawn in the sequence the list arrived in. Re-sorting here would put the
 * client in charge of which tip a player reads first, which is a decision about what is
 * worth their attention and belongs to the place that knows the prices.
 *
 * **The margin is the simulation's subtraction and is printed as sent.** The panel prints
 * the two prices beside it and does not work the difference out a second time; a feed that
 * disagreed with its own arithmetic about a player's money would be worse than one that
 * trusts the simulation's figure.
 *
 * **Every word the simulation writes is printed as written.** `text` is the simulation's
 * own sentence and reaches the screen verbatim, its own key for the good and its own
 * rounding included. The panel's own job is the two headings around it: the good in this
 * client's words, and the day the feed was read.
 *
 * **The first frame is a skeleton, not a blank and not an error.** Handed no feed, the
 * panel draws `rumour-feed-skeleton` and then asks for one. Only a read that has actually
 * failed gets a plain message and a real way to retry (CONSTITUTION.md sections 3.2 and
 * 1.3).
 */

import { h, sectionHeader } from "../dom.js";
import { emptyState, errorState, panel, statusChip } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import { rumourSkeletonBody } from "./panel-skeletons.js";
import type { Rumour, RumourGood, SimulationProvider } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/**
 * The three goods the simulation scans, in the words this client uses for them.
 *
 * `food` is the one that differs: the simulation prices it as `PriceFood` and writes
 * `food` in its own sentence, while `GOODS` in `data/types.ts` calls the same good `grain`
 * and the top bar prints "Grain". Translating here is the point — a feed whose heading
 * says "Grain" and whose sentence says "food" is the simulation being quoted, and one
 * whose heading said "food" would be the client printing a field name at the player.
 */
const GOOD_WORD: Record<RumourGood, string> = {
  food: "Grain",
  medicine: "Medicine",
  metal: "Metal",
};

/**
 * The feed when the simulation found nothing worth publishing.
 *
 * It says what to do about it, because `CONSTITUTION.md` section 3.3 requires an empty
 * state to name the next move and this one's next move is to look at a market. It does not
 * claim to know the threshold a rumour had to clear: that number is the server's, it is not
 * in the payload, and a sentence that guessed it would be the client inventing a rule.
 */
const NOTHING_TO_TRADE =
  "The simulation has looked at every town it knows and found no good priced far enough apart to be worth a " +
  "journey. Prices move with every trade, every shipment and every shortage, so this is a reading of the world at " +
  "this moment rather than a standing absence. Open a town's market to see what it charges today, and open this " +
  "again once the numbers have moved.";

export interface RumourFeedOptions {
  /**
   * The feed, or `null` when the caller has not read it yet.
   *
   * `null` means the panel is about to go and get it, so it draws the skeleton rather than
   * complaining about a feed that was never on its way.
   */
  rumours: Rumour[] | null;
  provider: SimulationProvider;
  /**
   * The day this client's world was last read, or `null` when the caller has none.
   *
   * The payload carries no day of its own, so this is the app's clock and the panel says
   * so. It is here because a tip with no date is a tip nobody can weigh, and the honest
   * form of "when" here is the moment the world this client is drawing was last read.
   */
  day?: number | null;
  onClose?: () => void;
  onError?: (message: string) => void;
  /** The feed is still being read. */
  loading?: boolean;
  testId?: string;
}

export interface RumourFeedHandle {
  root: HTMLElement;
  body: HTMLElement;
  refresh(): void;
  /** Re-read the feed. Backs the "Try again" button, so it is a real request. */
  reload(): Promise<void>;
}

export function rumourFeedPanel(options: RumourFeedOptions): RumourFeedHandle {
  const { root, body } = panel({
    title: "Trade rumours",
    testId: options.testId ?? "rumour-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);

  // The panel's own copy of the feed, so a re-read cannot write back into whatever the
  // caller is holding. Copied rather than referenced for that reason alone.
  let feed: Rumour[] | null = copyFeed(options.rumours);
  let loading = options.loading ?? (options.rumours === null);
  /** A read failure, which `render` draws as an error state with a retry. */
  let failure: { message: string; detail: string } | null = null;
  let loadToken = 0;

  /**
   * Re-read the feed.
   *
   * A request, which is what makes the retry button honest: it can succeed where the last
   * one failed, and a button that only re-rendered the same missing feed would be a lie
   * told to the player. Rumours move with prices, so the second read is a different answer
   * rather than the same one twice.
   */
  async function reload(): Promise<void> {
    const token = ++loadToken;
    failure = null;
    loading = true;
    render();
    try {
      feed = copyFeed(await options.provider.rumours());
    } catch (err) {
      if (token !== loadToken) return;
      failure = {
        message: err instanceof SimulationUnavailableError ? err.playerMessage : "The trade rumours could not be read.",
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

  function render(): void {
    body.replaceChildren();

    if (loading) {
      body.appendChild(rumourSkeletonBody());
      return;
    }

    if (failure !== null) {
      body.appendChild(
        errorState({
          message: failure.message,
          detail: failure.detail,
          onRetry: () => void reload(),
          testId: "rumour-error",
        }),
      );
      return;
    }

    if (feed === null) {
      // Neither data nor a complaint yet: the request is still in flight, and the frame that
      // says so is the skeleton rather than a blank sheet.
      body.appendChild(rumourSkeletonBody());
      return;
    }

    body.appendChild(head());

    if (feed.length === 0) {
      body.appendChild(emptyState("No trade is worth travelling for right now.", NOTHING_TO_TRADE));
      return;
    }

    body.appendChild(sectionHeader("What the simulation has heard"));
    body.appendChild(countLine());

    const list = h("div", { class: "rumours", "data-testid": "rumour-list" });
    // In the sequence the feed arrived in, which is the simulation's order to decide.
    for (const [index, rumour] of feed.entries()) list.appendChild(rumourCard(rumour, index));
    body.appendChild(list);

    body.appendChild(
      h(
        "p",
        { class: "caption", style: "margin:var(--space-3) 0 0" },
        "Every price, town name and sentence on this screen is the simulation's own, read from the world's prices at " +
          "the moment it was drawn. Which rumours are worth publishing, and in what order, is settled there; this " +
          "panel adds nothing up and decides nothing. A rumour is a tip and not an order: buying is done at a " +
          "town's market, and the price you get there is the one the market holds today.",
      ),
    );
  }

  /**
   * When the feed was read, and how much of it there is.
   *
   * The day is the app's clock rather than the simulation's, because the payload has no day
   * on it, and a stamp that claimed otherwise would be the client dating a rumour the
   * simulation never dated. The chip's own tooltip says which of the two it is.
   */
  function head(): HTMLElement {
    const chips: HTMLElement[] = [];
    if (options.day !== null && options.day !== undefined) {
      chips.push(
        statusChip("neutral", `Day ${options.day}`, {
          testId: "rumour-day",
          title: "The day this client's world was last read. The feed carries no day of its own.",
        }),
      );
    }
    chips.push(
      statusChip("neutral", "Read only", {
        testId: "rumour-read-only",
        title: "A rumour is a tip, not an order. Buying happens at a town's market.",
      }),
    );
    return h(
      "div",
      { class: "field-row", "data-testid": "rumour-head", style: "margin-bottom:var(--space-3)" },
      h(
        "div",
        { style: "flex:1 1 auto;min-width:0" },
        h("p", { class: "caption", style: "margin:0 0 var(--space-1)" }, "Priced from"),
        h("p", { class: "label", style: "margin:0" }, "every market the simulation knows"),
      ),
      h("div", { class: "row__inline" }, ...chips),
    );
  }

  /** How many tips came back, and in whose order they are shown. */
  function countLine(): HTMLElement {
    return h(
      "p",
      { class: "caption", "data-testid": "rumour-count", role: "status", style: "margin:0 0 var(--space-2)" },
      `${countOf(feed?.length ?? 0, "rumour")}, best margin first.`,
    );
  }

  /**
   * One rumour: what it is worth, the two towns, the two prices, and the simulation's own
   * sentence about them.
   *
   * The two ends are drawn as a pair rather than as a line of text, because a rumour is two
   * places and the player's eye goes to the cheap one first. The margin sits above the pair
   * rather than inside it, because it is the one figure that belongs to neither town.
   */
  function rumourCard(rumour: Rumour, index: number): HTMLElement {
    return h(
      "article",
      { class: "rumour", "data-testid": `rumour-card-${index}`, "aria-label": marginName(rumour) },
      h(
        "div",
        { class: "rumour__head" },
        h("span", { class: "rumour__good label" }, GOOD_WORD[rumour.good]),
        h(
          "span",
          { class: "row__inline" },
          h("span", { class: "rumour__margin data", "data-testid": `rumour-margin-${index}` }, `+${price(rumour.margin)}`),
          h("span", { class: "caption" }, "per unit"),
        ),
      ),
      h("div", { class: "costs costs--two" }, ...endCells(rumour, index)),
      h("p", { class: "rumour__text", "data-testid": `rumour-text-${index}` }, rumour.text),
    );
  }

  /**
   * The two ends of the route, priced by the simulation.
   *
   * Both figures are the sim's own to two decimal places, the same convention the market
   * panel prints a price in, so a player comparing the two screens is comparing the same
   * numbers and not two roundings of them.
   */
  function endCells(rumour: Rumour, index: number): HTMLElement[] {
    return [
      endCell("Buy in", rumour.buyTown, rumour.buyPrice, "the cheap end", `rumour-buy-price-${index}`),
      endCell("Sell in", rumour.sellTown, rumour.sellPrice, "the dear end", `rumour-sell-price-${index}`),
    ];
  }

  /** One end of the route: the town, its price, and what that end of the trade is for. */
  function endCell(key: string, town: string, amount: number, note: string, testId: string): HTMLElement {
    return h(
      "div",
      { class: "cost", "data-testid": testId },
      h("div", { class: "cost__key" }, `${key} ${town}`),
      h("div", { class: "data" }, price(amount)),
      h("div", { class: "caption" }, `${note}, per unit`),
    );
  }

  render();
  // Handed no feed, and a provider to read it from: ask. Gated on what the caller passed,
  // not on `loading`, which is true precisely because of that.
  if (options.rumours === null) void reload();

  return { root, body, refresh: render, reload };
}

// -- wording ------------------------------------------------------------------

/**
 * A rumour's one-line name, for the card's accessible label.
 *
 * The card is not a control, so it carries no `aria-pressed` and no role; the label is here
 * so a screen reader announces what the card is instead of walking four unrelated figures.
 */
function marginName(rumour: Rumour): string {
  return `${GOOD_WORD[rumour.good]}: buy in ${rumour.buyTown} at ${price(rumour.buyPrice)}, sell in ${rumour.sellTown} at ${price(rumour.sellPrice)}, ${price(rumour.margin)} per unit.`;
}

/** A price or a margin, at the two decimal places the market panel prints prices in. */
function price(value: number): string {
  return value.toFixed(2);
}

/** A count and its noun, so a figure never has to be read on its own. */
function countOf(n: number, noun: string): string {
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}

/** A detached copy of the feed, so a re-read cannot write back into the caller's. */
function copyFeed(feed: Rumour[] | null): Rumour[] | null {
  return feed === null ? null : feed.map((rumour) => ({ ...rumour }));
}
