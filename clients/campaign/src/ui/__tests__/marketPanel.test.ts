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
import type { SimSnapshot, SimulationProvider, TradeRequest } from "../../data/types.js";
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
});