/**
 * The market panel's honesty about time.
 *
 * The clock runs while the panel is open, and the simulation refuses a trade priced
 * against a day the world has left (`validateOrderDay` answers 409). So the panel has to
 * say which day its prices belong to, price the next order against that same day, and
 * re-read the market when the world refuses one — which is what these tests are about.
 *
 * The data is the test fixture's own, as in `panels.test.ts`.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import type { SimSnapshot, SimulationProvider, TradeRequest, TradeResult } from "../../data/types.js";
import { marketPanel, type MarketPanelHandle } from "../panels/MarketPanel.js";

let fixture: SimulationProvider;
let snapshot: SimSnapshot;
let townId: string;
let townName: string;

/** One turn of the event loop, which is all a fixture round trip needs. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

const noop = (): void => {};

/** A panel over the fixture market, with the calls it made recorded. */
function open(provider: SimulationProvider, day = snapshot.day): MarketPanelHandle {
  return marketPanel({
    townId,
    townName,
    market: snapshot.markets[townId] ?? null,
    party: snapshot.party,
    money: snapshot.player.resources.money,
    day,
    provider,
    onError: noop,
  });
}

function q(handle: MarketPanelHandle, testId: string): HTMLElement | null {
  return handle.root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function click(handle: MarketPanelHandle, testId: string): void {
  const el = q(handle, testId);
  expect(el, testId).not.toBeNull();
  el!.click();
}

beforeAll(async () => {
  fixture = createFixtureSimulationProvider();
  snapshot = await fixture.getSnapshot();
  const town = snapshot.towns.find((t) => snapshot.markets[t.id] !== undefined)!;
  townId = town.id;
  townName = town.name;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the market panel says which day its prices are from", () => {
  it("names the day, and keeps naming the day the prices were actually read", async () => {
    const handle = open(fixture);
    expect(q(handle, "market-freshness")!.textContent).toContain(`day ${snapshot.day}`);

    click(handle, "market-refresh");
    await flush();

    expect(q(handle, "market-freshness")!.textContent).toContain(`day ${snapshot.day}`);
  });

  it("prices an order against the day on screen, not the day the panel was built", async () => {
    const requests: TradeRequest[] = [];
    let day = snapshot.day;
    const ahead: SimulationProvider = {
      ...fixture,
      getSnapshot: async () => {
        day += 1;
        return { ...snapshot, day };
      },
      trade: async (request) => {
        requests.push(request);
        return {
          accepted: false,
          side: request.side,
          goodName: "Grain",
          unitPrice: 1,
          quantity: request.quantity,
          total: request.quantity,
          partyQuantity: 0,
          marketPriceAfter: 1,
          reason: "refused for the test",
          causedBy: "c-1",
        };
      },
    };

    const handle = open(ahead);
    click(handle, "market-refresh");
    await flush();
    expect(q(handle, "market-freshness")!.textContent).toContain(`day ${day}`);

    click(handle, "buy-grain");
    await flush();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.expectedDay).toBe(day);
  });

  it("reads the market again after the world refuses an order, and says so", async () => {
    const conflict = new SimulationUnavailableError(
      "The world is on day 412. That order was priced against day 410.",
      "POST /v1/trade -> HTTP 409",
      false,
    );
    let trades = 0;
    let snapshots = 0;
    const moved: SimulationProvider = {
      ...fixture,
      getSnapshot: async () => {
        snapshots += 1;
        return { ...snapshot, day: snapshot.day + 2 };
      },
      trade: async () => {
        trades += 1;
        throw conflict;
      },
    };

    const handle = open(moved);
    click(handle, "buy-grain");
    await flush();

    // The simulation's own sentence, not a paraphrase of it.
    const message = q(handle, "market-message")!.textContent ?? "";
    expect(message).toContain("The world is on day 412.");
    expect(message).toContain("read again");
    expect(q(handle, "market-freshness")!.textContent).toContain(`day ${snapshot.day + 2}`);
    // The refused order is not re-sent: a refusal is a refusal.
    expect(trades).toBe(1);
    expect(snapshots).toBe(1);
  });

  it("does not re-read after a network failure, which a re-read would not fix", async () => {
    let snapshots = 0;
    const flaky: SimulationProvider = {
      ...fixture,
      getSnapshot: async () => {
        snapshots += 1;
        return snapshot;
      },
      trade: async () => {
        throw new SimulationUnavailableError(
          "The world simulation is not answering.",
          "POST /v1/trade threw",
          true,
        );
      },
    };

    const handle = open(flaky);
    click(handle, "buy-grain");
    await flush();

    expect(q(handle, "market-message")!.textContent).toContain("not answering");
    expect(snapshots).toBe(0);
  });

  it("shows the market's demand beside its stock, because that is what moves the price", () => {
    const handle = open(fixture);
    const good = snapshot.markets[townId]!.goods[0]!;
    const headings = Array.from(
      handle.root.querySelectorAll("[data-testid='market-table'] thead th"),
    ).map((th) => th.textContent ?? "");
    expect(headings).toContain("Demand");
    expect(headings).toContain("Stock");

    const cells = Array.from(
      handle.root.querySelectorAll("[data-testid='market-table'] tbody tr"),
    ).map((row) => row.textContent ?? "");
    expect(cells.some((text) => text.includes(String(good.demand)))).toBe(true);
  });

  it("prints the simulation's own refusal, verbatim", async () => {
    const stingy: SimulationProvider = {
      ...fixture,
      trade: async (request) => ({
        accepted: false,
        side: request.side,
        goodName: "Grain",
        unitPrice: 12,
        quantity: request.quantity,
        total: 120,
        partyQuantity: 0,
        marketPriceAfter: 12,
        reason: "Longmont has 4 to sell, not 10.",
        causedBy: "c-9",
      }),
    };
    const handle = open(stingy);
    click(handle, "buy-grain");
    await flush();

    expect(q(handle, "market-message")!.textContent).toContain("Longmont has 4 to sell, not 10.");
  });
});/**
 * A good's price and a good's unit price are two different numbers, and the panel has
 * to keep them apart.
 *
 * `price` is the market's multiplier near one — a market at normal stock trades at
 * about 1, and scarcity moves it from there. `unitPrice` is coins per unit, which the
 * server works out as `price * unitCost` against config the client never receives. The
 * two are the same kind of figure only by accident, and reading one as the other puts
 * a number on screen that the simulation never said.
 */
describe("the market panel keeps a price multiplier out of the coin column", () => {
  /** A provider whose trades succeed, with the figures the server would send back. */
  function trading(over: Partial<TradeAnswer> = {}): SimulationProvider {
    const answers: TradeAnswer = {
      accepted: true,
      unitPrice: 26.4,
      total: 264,
      partyQuantity: 30,
      marketPriceAfter: 1.08,
      causedBy: "c-trade",
      ...over,
    };
    return {
      ...fixture,
      trade: async (request) => {
        const answer: TradeResult = {
          accepted: answers.accepted,
          side: request.side,
          goodName: "Grain",
          quantity: request.quantity,
          partyQuantity: answers.partyQuantity,
          marketPriceAfter: answers.marketPriceAfter,
          unitPrice: answers.unitPrice,
          total: answers.total,
          causedBy: answers.causedBy,
        };
        // reason rides along only when there is one: exactOptionalPropertyTypes treats
        // an explicit undefined as different from an absent key.
        return answers.reason === undefined ? answer : { ...answer, reason: answers.reason };
      },
    };
  }

  /** The trend arrow on a good's price cell, as the panel drew it. */
  function trend(handle: MarketPanelHandle, goodId: string): string | null {
    const cell = q(handle, `price-${goodId}`);
    return cell?.querySelector("[data-trend]")?.getAttribute("data-trend") ?? null;
  }

  /**
   * A panel over one good sitting at a known multiplier.
   *
   * The fixture's own prices are rolled per run, so a test that asserts on a direction
   * cannot also assert on the value it started from unless it sets that value itself.
   */
  function atPrice(price: number, options: { held?: boolean; provider?: SimulationProvider } = {}): MarketPanelHandle {
    const good = snapshot.markets[townId]!.goods[0]!;
    return marketPanel({
      townId,
      townName,
      market: { townId, goods: [{ ...good, price, previousPrice: null, history: [] }] },
      party: options.held
        ? {
            ...snapshot.party,
            goods: [
              ...snapshot.party.goods.filter((g) => g.goodId !== good.goodId),
              { goodId: good.goodId, name: good.name, quantity: 30, avgPaid: 26.4 },
            ],
          }
        : snapshot.party,
      money: snapshot.player.resources.money,
      day: snapshot.day,
      provider: options.provider ?? fixture,
      onError: noop,
    });
  }

  it("reads a price the market pushed up after a buy as a rise", async () => {
    // The market moves by inertia rather than snapping, so a trade can leave the price
    // higher than it was, however unlikely that reads. Whichever way it went, the arrow
    // has to follow what the simulation said. When previousPrice was filled in with
    // unitPrice — some 26.4 coins against a multiplier near 1 — the arrow read every
    // trade as a fall.
    const good = snapshot.markets[townId]!.goods[0]!;
    const panel = atPrice(1.1, { provider: trading({ marketPriceAfter: 1.14 }) });

    click(panel, `buy-${good.goodId}`);
    await flush();

    expect(trend(panel, good.goodId)).toBe("up");
  });

  it("reads a price the market pushed down after a buy as a fall", async () => {
    const good = snapshot.markets[townId]!.goods[0]!;
    const panel = atPrice(1.1, { provider: trading({ marketPriceAfter: 1.08 }) });

    click(panel, `buy-${good.goodId}`);
    await flush();

    expect(trend(panel, good.goodId)).toBe("down");
  });

  it("reads a price the market pushed up after a sell as a rise", async () => {
    const good = snapshot.markets[townId]!.goods[0]!;
    const panel = atPrice(1.1, {
      held: true,
      provider: trading({ marketPriceAfter: 1.14, unitPrice: 27.9 }),
    });

    click(panel, `sell-${good.goodId}`);
    await flush();

    expect(trend(panel, good.goodId)).toBe("up");
  });

  it("does not put a made-up coin total on the buy button", () => {
    const good = snapshot.markets[townId]!.goods[0]!;
    const panel = atPrice(1.05);

    const label = q(panel, `buy-${good.goodId}`)!.getAttribute("aria-label") ?? "";

    // 1.05 x the default order of 10 is 10.5, which the old label printed as "$11" —
    // an order that really costs 26.4 a unit, some 264 in all.
    expect(label).not.toMatch(/\$/);
    expect(label).not.toMatch(/\b10\.50?\b/);
    // What it does say is the decision the player is making: how many, and at what price.
    expect(label).toContain("10 Grain");
    expect(label).toContain("1.05");
  });
});

/** The fields a trade answer carries that these tests set explicitly. */
interface TradeAnswer {
  accepted: boolean;
  unitPrice: number;
  total: number;
  partyQuantity: number;
  marketPriceAfter: number;
  causedBy: string;
  reason?: string;
}