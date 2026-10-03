/**
 * The market panel against a real HTTP provider rather than the fixture.
 *
 * `marketPanel.test.ts` drives this panel through the fixture provider, which is the
 * provider the client is developed against. That is what made the failure this file
 * exists to prevent invisible: a provider method can exist, be implemented perfectly in
 * the fixture, be covered by passing tests, and still not work against the campaign
 * server, because nothing ever put the two halves of the conversation next to each
 * other. `POST /v1/encounters/flee` and `POST /v1/encounters/defeat` were both missing
 * from the server while the fixture implemented them flawlessly and their tests passed.
 *
 * So every reply below is written in the exact JSON the Go server emits, field for field
 * and omission for omission, and the panel is driven through `HttpSimulationProvider`
 * with nothing stubbed except `fetch` itself. The shapes come from:
 *
 *   - `services/simulation/cmd/apiserver/wire/wire.go` — `MarketState`, `MarketGood`
 *     (`previousPrice` is a `*float64` with no `omitempty`, so it is `null` on a town's
 *     first priced read; `history` is a non-nil slice, so it is `[]` and never `null`),
 *   - `wire/orders.go` — `TradeRequest` and `TradeResult` (`reason` and `goodName` are
 *     `omitempty`; `causedBy` is not, so a refusal carries `""` and not a missing key),
 *   - `api/api.go` — `ErrorBody`, which puts the player's sentence at the top level as
 *     `reason`, beside the developer-facing `error.code` and `error.message`.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpSimulationProvider } from "../../data/provider.js";
import { SNAPSHOT_SCHEMA_VERSION } from "../../data/wire.js";
import type { MarketGood } from "../../data/types.js";
import { marketPanel, type MarketPanelHandle } from "../panels/MarketPanel.js";

/** One turn of the event loop, which is all a stubbed fetch round trip needs. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

const TOWN_ID = "town1";
const TOWN_NAME = "Golden";
const PARTY_ID = "p1";
const DAY = 12;

/** A `wire.MarketGood` as the server sends one on a town's first priced read. */
function serverMarketGood(over: Partial<MarketGood> = {}): Record<string, unknown> {
  return {
    goodId: "grain",
    name: "Grain",
    price: 1.02,
    previousPrice: null,
    history: [{ day: 11, price: 1 }, { day: 12, price: 1.02 }],
    stock: 480,
    demand: 900,
    ...over,
  };
}

/** A snapshot shaped as `api.getSnapshot` writes one, markets keyed by town id. */
function serverSnapshot(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    day: DAY,
    year: 2005,
    eraTier: 4,
    player: {
      partyId: PARTY_ID,
      characterName: "Surveyor",
      factionId: "f1",
      resources: { money: 2500, gold: 10, food: 40, metal: 5, medicine: 2 },
      influence: 3,
      renown: 1,
    },
    party: { id: PARTY_ID, name: "Caravan", troops: [], morale: 0.9, goods: [] },
    ledger: { day: DAY, income: [], expenses: [], netPerDay: { money: 1 } },
    towns: [],
    markets: {
      [TOWN_ID]: {
        townId: TOWN_ID,
        goods: [serverMarketGood(), serverMarketGood({ goodId: "metal", name: "Metal", price: 0.97 })],
      },
    },
    sides: [],
    rulers: [],
    warnings: [],
    notifications: [],
    causeLog: {},
    ...over,
  };
}

/** A `wire.TradeResult` for an accepted order. `reason` is `omitempty`, so it is absent. */
function acceptedTrade(): Record<string, unknown> {
  return {
    accepted: true,
    side: "buy",
    goodName: "Grain",
    unitPrice: 12.24,
    quantity: 10,
    total: 122.4,
    partyQuantity: 10,
    marketPriceAfter: 1.09,
    causedBy: "row7",
  };
}

/**
 * A refusal as the server sends it: HTTP 200, `accepted` false, the sentence, and an
 * empty `causedBy` because that field has no `omitempty` and the refusal wrote to no row.
 */
function refusedTrade(reason: string): Record<string, unknown> {
  return {
    accepted: false,
    side: "buy",
    goodName: "Grain",
    unitPrice: 12.24,
    quantity: 10,
    total: 122.4,
    partyQuantity: 0,
    marketPriceAfter: 1.02,
    reason,
    causedBy: "",
  };
}

/** The `api.ErrorBody` a 409 carries, with the player's sentence at the top level. */
function conflictBody(reason: string): Record<string, unknown> {
  return {
    error: { code: "conflict", message: `stale order: expectedDay 11 but the world is on tick ${DAY}` },
    reason,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Conflict",
    json: async () => body,
  } as unknown as Response;
}

/** One request the panel made, as a reader would want it recorded. */
interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/**
 * A provider whose fetch answers from a routing table, recording what it was asked.
 *
 * `trade` is a function so a test can hand back an acceptance, a refusal or a conflict
 * without rebuilding the provider. Anything the routing table does not know is a 404 in
 * the shape the server's own not-found handler writes, so an unexpected call fails as the
 * player would see it rather than as a test error.
 */
function providerAnswering(trade: () => Response, snapshot: () => Response = () => jsonResponse(serverSnapshot())) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url,
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    if (url.endsWith("/v1/snapshot")) return snapshot();
    if (url.endsWith("/v1/trade")) return trade();
    return jsonResponse(
      { error: { code: "not_found", message: "not found" }, reason: "That path is not part of the campaign API." },
      404,
    );
  });
  const provider = new HttpSimulationProvider({
    kind: "http",
    httpUrl: "http://sim.invalid",
    wsUrl: "ws://sim.invalid/ws",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    timeoutMs: 50,
  });
  return { provider, calls };
}

/** A panel over the market the server's snapshot carries, as `main.marketNode` builds it. */
async function openPanel(provider: HttpSimulationProvider): Promise<MarketPanelHandle> {
  const snapshot = await provider.getSnapshot();
  return marketPanel({
    townId: TOWN_ID,
    townName: TOWN_NAME,
    market: snapshot.markets[TOWN_ID] ?? null,
    party: snapshot.party,
    money: snapshot.player.resources.money,
    day: snapshot.day,
    provider,
    quantity: 10,
  });
}

function q(handle: MarketPanelHandle, testId: string): HTMLElement | null {
  return handle.root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function text(handle: MarketPanelHandle, testId: string): string {
  const el = q(handle, testId);
  expect(el, testId).not.toBeNull();
  return el!.textContent ?? "";
}

function click(handle: MarketPanelHandle, testId: string): void {
  const el = q(handle, testId);
  expect(el, testId).not.toBeNull();
  el!.click();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the market panel reads what the campaign server actually sends", () => {
  it("renders a market from the server's own wire shape", async () => {
    // `previousPrice` arrives as null on a town's first priced read, because the server's
    // field is a `*float64` with no `omitempty`. A client that assumed a number here would
    // draw a trend arrow against `null`, and `toFixed` on it would throw.
    const { provider } = providerAnswering(() => jsonResponse(acceptedTrade()));
    const handle = await openPanel(provider);

    expect(text(handle, "price-grain")).toContain("1.02");
    // Flat, because there is no previous price to compare against — not an arrow and not
    // a number the client made up.
    expect(q(handle, "price-grain")!.querySelector("[data-trend]")!.getAttribute("data-trend")).toBe("flat");
    expect(text(handle, "market-stock")).toBe("480");
    expect(text(handle, "market-demand")).toBe("900");
    // The purse comes from the snapshot, not from a client-side balance.
    expect(text(handle, "market-freshness")).toContain(`day ${DAY}`);
  });

  it("posts the order in the shape wire.TradeRequest decodes, priced against the day on screen", async () => {
    const { provider, calls } = providerAnswering(() => jsonResponse(acceptedTrade()));
    const handle = await openPanel(provider);

    click(handle, "buy-grain");
    await flush();

    const trade = calls.find((call) => call.url.endsWith("/v1/trade"));
    expect(trade, "the Buy button did not send an order").toBeDefined();
    expect(trade!.method).toBe("POST");
    expect(trade!.url).toBe("http://sim.invalid/v1/trade");
    // Field for field what `wire.TradeRequest` unmarshals. `expectedDay` is the field
    // `validateOrderDay` checks, and it is the panel's job to send the day whose prices
    // the player is looking at rather than the day the panel happened to be built.
    expect(trade!.body).toEqual({
      partyId: PARTY_ID,
      townId: TOWN_ID,
      goodId: "grain",
      side: "buy",
      quantity: 10,
      expectedDay: DAY,
    });
  });

  it("shows the coin total and the new price, because the client cannot work either out", async () => {
    // `unitCost` is server config — `market.base_price`, or
    // `campaign.medicine_unit_price` for medicine — and the snapshot never sends it, so
    // there is no arithmetic on the client that could produce a total. Both figures
    // below arrive in the reply and are printed verbatim.
    const { provider } = providerAnswering(() => jsonResponse(acceptedTrade()));
    const handle = await openPanel(provider);

    click(handle, "buy-grain");
    await flush();

    expect(text(handle, "market-message")).toContain("Bought 10 grain");
    expect(text(handle, "market-message")).toContain("$122");
    expect(text(handle, "market-message")).toContain("1.09");
    // The table shows the price the trade moved the market to, not the one it was placed
    // against, so the screen and the world agree after the order lands.
    expect(text(handle, "price-grain")).toContain("1.09");
  });

  it("takes a refused order as the server's answer, not as a failure", async () => {
    // A refusal is a 200. The simulation says no, and says why, in a sentence written for
    // the player. Treating that as an error would replace the reason with a generic
    // apology, throwing away the only part that helps.
    const { provider } = providerAnswering(() =>
      jsonResponse(refusedTrade("Golden has 480 to sell, not 5000.")),
    );
    const handle = await openPanel(provider);

    click(handle, "buy-grain");
    await flush();

    expect(text(handle, "market-message")).toContain("Golden has 480 to sell, not 5000.");
    // An empty `causedBy` on a refusal is not a broken payload: the field has no
    // `omitempty`, so a refusal that wrote to no row sends `""`, and the client's
    // validation requires the key to be a string rather than requiring it to be full.
    // Had it required a non-empty string, the refusal would have been refused as
    // unreadable and the sentence above would never have reached the player at all.
    expect(q(handle, "market-error"), "a refusal must not raise the error state").toBeNull();
  });

  it("shows a stale-order conflict and reads the market again", async () => {
    // `validateOrderDay` answers 409 when the world has moved past the day the order was
    // priced against. The order is not re-sent, but the prices on screen are stale, so the
    // panel has to re-read them — and the player's sentence is `reason` at the top level
    // of `api.ErrorBody`, which is where the server puts it.
    let snapshots = 0;
    const { provider, calls } = providerAnswering(
      () => jsonResponse(conflictBody("The world is on day 12. That order was priced against day 11."), 409),
      () => {
        snapshots++;
        return jsonResponse(serverSnapshot());
      },
    );
    const handle = await openPanel(provider);
    snapshots = 0;

    click(handle, "buy-grain");
    await flush();

    expect(text(handle, "market-message")).toContain("The world is on day 12");
    expect(text(handle, "market-message")).toContain("read again");
    expect(snapshots, "the panel kept showing prices the world has left").toBeGreaterThan(0);
    // The refused order was not re-sent behind the player's back.
    expect(calls.filter((call) => call.url.endsWith("/v1/trade"))).toHaveLength(1);
  });

  it("shows the server's own sentence when the route is not there, not a generic one", async () => {
    // The order is sent once and the server has no route for it. What the player must get
    // is the cause, which the server states exactly: an unmounted path is the 404 the
    // server's own not-found handler writes. "The trade did not go through" is also true
    // and tells a player nothing they can act on — and it is what the client used to say,
    // because only the 409 branch read `reason` out of the reply.
    const { provider } = providerAnswering(() =>
      jsonResponse(
        { error: { code: "not_found", message: "not found" }, reason: "That path is not part of the campaign API." },
        404,
      ),
    );
    const handle = await openPanel(provider);

    click(handle, "buy-grain");
    await flush();

    expect(text(handle, "market-message")).toContain("That path is not part of the campaign API.");
  });
});