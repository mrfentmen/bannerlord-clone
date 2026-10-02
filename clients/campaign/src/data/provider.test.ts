/**
 * The provider boundary, which is the only place in the client that touches data it
 * did not produce.
 *
 * CONSTITUTION.md section 1.3 says every external call is untrusted. These tests hold
 * the boundary to that: a malformed reply has to be refused with a sentence a player
 * can read, never handed to the UI as a half-built snapshot, and never quietly
 * swallowed. They also pin the fixture quarantine, which is the rule
 * `tools/check-no-fixtures.mjs` proves at build time and `readConfig` proves at runtime.
 */

import { describe, expect, it, vi } from "vitest";
import {
  HttpSimulationProvider,
  SimulationUnavailableError,
  createSimulationProvider,
  readConfig,
} from "./provider.js";
import type { TickUpdate } from "./types.js";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "",
    json: async () => body,
  } as unknown as Response;
}

function providerWith(fetchImpl: typeof fetch, wsUrl = "ws://127.0.0.1:8080/ws"): HttpSimulationProvider {
  return new HttpSimulationProvider({ kind: "http", httpUrl: "http://sim.invalid", wsUrl, fetchImpl });
}

/** A snapshot that passes every check, for the tests that need a good baseline. */
function goodSnapshot(): Record<string, unknown> {
  return {
    day: 1,
    year: 2005,
    eraTier: 4,
    player: {
      partyId: "p1",
      characterName: "Surveyor",
      factionId: "f1",
      resources: { money: 100, gold: 10, food: 40, metal: 5, medicine: 2 },
      influence: 3,
      renown: 1,
    },
    party: { troops: [], morale: 0.9 },
    ledger: { day: 1, income: [], expenses: [], netPerDay: { money: 1 } },
    towns: [],
    markets: {},
    sides: [],
    rulers: [],
    warnings: [],
    notifications: [],
    causeLog: {},
  };
}

describe("an untrusted snapshot is checked before the UI sees it", () => {
  it("accepts a well-formed snapshot", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse(goodSnapshot())) as unknown as typeof fetch);
    const snapshot = await provider.getSnapshot();
    expect(snapshot.day).toBe(1);
    expect(snapshot.player.resources.money).toBe(100);
  });

  const REJECTED: [string, unknown][] = [
    ["a reply that is not an object", "not json at all"],
    ["a missing day", { ...goodSnapshot(), day: undefined }],
    ["a day that is not a number", { ...goodSnapshot(), day: "1" }],
    ["a day that is not finite", { ...goodSnapshot(), day: Number.NaN }],
    ["an era tier outside the four the design defines", { ...goodSnapshot(), eraTier: 7 }],
    ["no player", { ...goodSnapshot(), player: undefined }],
    ["a player with no name", { ...goodSnapshot(), player: { resources: { money: 1, gold: 1, food: 1, metal: 1, medicine: 1 } } }],
    [
      "resources missing a field the top bar reads",
      { ...goodSnapshot(), player: { characterName: "X", resources: { money: 1, gold: 1, food: 1, metal: 1 } } },
    ],
    ["no ledger", { ...goodSnapshot(), ledger: undefined }],
    ["a ledger with no net-per-day table", { ...goodSnapshot(), ledger: { day: 1 } }],
    ["towns that are not a list", { ...goodSnapshot(), towns: { golden: {} } }],
    ["a cause log that is not a table", { ...goodSnapshot(), causeLog: [] }],
  ];

  for (const [what, body] of REJECTED) {
    it(`refuses ${what}`, async () => {
      const provider = providerWith(vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch);
      const error = await provider.getSnapshot().catch((e: unknown) => e);
      expect(error, `${what} was handed to the UI`).toBeInstanceOf(SimulationUnavailableError);
      const failure = error as SimulationUnavailableError;
      // A player has to be told in words, with something they can do about it.
      expect(failure.playerMessage.length).toBeGreaterThan(20);
      expect(failure.retryable, "a malformed payload will not fix itself on retry").toBe(false);
      // And a developer has to be told what was actually wrong.
      expect(failure.developerDetail).toMatch(/failed validation/);
    });
  }

  it("does not put a file path or a developer name in the player-facing sentence", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse({ day: "x" })) as unknown as typeof fetch);
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    for (const banned of [/undefined/, /\bNaN\b/, /\bnull\b/, /\/src\//, /\.ts\b/, /Error/, /Something went wrong/]) {
      expect(banned.test(error.playerMessage), `player message contains ${banned}: ${error.playerMessage}`).toBe(false);
    }
  });
});

describe("a cause chain is checked before the Why panel walks it", () => {
  it("accepts a chain whose rows carry the fields the chain walk reads", async () => {
    const body = {
      entityId: "town-golden",
      field: "unrest",
      rows: [{ id: "c1", tick: 4, day: 1, entityId: "town-golden", entityName: "Golden", field: "unrest", old: 0.1, new: 0.4, system: "unrest", causedBy: [], summary: "A tax was cut." }],
      related: [],
      totalDepth: 1,
      truncated: false,
    };
    const provider = providerWith(vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch);
    const chain = await provider.why("town-golden", "unrest");
    expect(chain.rows[0]?.new).toBe(0.4);
  });

  it("refuses a chain with no rows, rather than rendering an empty Why panel", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse({ entityId: "x", field: "y" })) as unknown as typeof fetch);
    const error = (await provider.why("x", "y").catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error.developerDetail).toMatch(/failed validation/);
  });

  it("refuses a row with no before or after figure, which would draw as a blank line", async () => {
    const body = {
      entityId: "x",
      field: "y",
      rows: [{ id: "c1", tick: 1, causedBy: [] }],
      related: [],
    };
    const provider = providerWith(vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch);
    const error = (await provider.why("x", "y").catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
  });
});

/**
 * One rumour as the server sends it.
 *
 * The keys are the Go field names, because the struct the server marshals carries no JSON
 * tags and `json.NewEncoder` writes the declared name. This fixture is the shape the client
 * is written against, so it is deliberately not camelCase.
 */
function goodRumour(): Record<string, unknown> {
  return {
    Good: "food",
    BuyTown: "Thornton",
    BuyTownID: 4,
    BuyPrice: 145.6,
    SellTown: "Golden",
    SellTownID: 8,
    SellPrice: 218.4,
    Margin: 72.8,
    Text: "Buy food cheap in Thornton (146), sell dear in Golden (218). Margin 73 per unit.",
  };
}

describe("a rumour feed is checked before the panel sees it", () => {
  it("reads the Go field names off the wire and hands the panel its own spelling", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse({ rumours: [goodRumour()] })) as unknown as typeof fetch);
    const feed = await provider.rumours();
    expect(feed).toHaveLength(1);
    // A cast would have left the panel reading `good` and drawing nothing, so the rewrite
    // is the whole point of decoding here.
    expect(feed[0]).toEqual({
      good: "food",
      buyTown: "Thornton",
      buyTownId: 4,
      buyPrice: 145.6,
      sellTown: "Golden",
      sellTownId: 8,
      sellPrice: 218.4,
      margin: 72.8,
      text: "Buy food cheap in Thornton (146), sell dear in Golden (218). Margin 73 per unit.",
    });
  });

  it("reads the camelCase spelling too, so a JSON tag on the server is not a broken client", async () => {
    const provider = providerWith(
      vi.fn(async () =>
        jsonResponse({
          rumours: [
            {
              good: "metal",
              buyTown: "Lakewood",
              buyTownId: 2,
              buyPrice: 56,
              sellTown: "Denver",
              sellTownId: 0,
              sellPrice: 65.68,
              margin: 9.68,
              text: "Buy metal cheap in Lakewood (56), sell dear in Denver (66). Margin 10 per unit.",
            },
          ],
        }),
      ) as unknown as typeof fetch,
    );
    const feed = await provider.rumours();
    expect(feed[0]?.good).toBe("metal");
    expect(feed[0]?.buyTown).toBe("Lakewood");
  });

  it("treats a null feed as an empty one, because that is what the server writes when it found nothing", async () => {
    // Go marshals a nil slice as `null`. The simulation looked at every town and published
    // nothing, which is an answer; refusing it would have put an error state on the screen
    // for a world that simply has no trade worth doing.
    const provider = providerWith(vi.fn(async () => jsonResponse({ rumours: null })) as unknown as typeof fetch);
    await expect(provider.rumours()).resolves.toEqual([]);
  });

  const REJECTED: [string, unknown][] = [
    ["a reply that is not an object", []],
    ["a feed that is neither a list nor null", { rumours: { good: "food" } }],
    ["a rumour with no good", { rumours: [{ ...goodRumour(), Good: undefined }] }],
    ["a good the generator does not scan", { rumours: [{ ...goodRumour(), Good: "grain" }] }],
    ["a rumour with no town to buy in", { rumours: [{ ...goodRumour(), BuyTown: "" }] }],
    ["a rumour with no sentence", { rumours: [{ ...goodRumour(), Text: undefined }] }],
    ["a price that is not a number", { rumours: [{ ...goodRumour(), BuyPrice: "145.60" }] }],
    ["a price that is not finite", { rumours: [{ ...goodRumour(), SellPrice: Number.POSITIVE_INFINITY }] }],
    ["a town id that is not a number", { rumours: [{ ...goodRumour(), BuyTownID: null }] }],
    [
      "a margin that is not the difference between its own two prices",
      { rumours: [{ ...goodRumour(), Margin: 3 }] },
    ],
  ];

  for (const [what, body] of REJECTED) {
    it(`refuses ${what}`, async () => {
      const provider = providerWith(vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch);
      const error = (await provider.rumours().catch((e: unknown) => e)) as SimulationUnavailableError;
      expect(error, `${what} was handed to the panel`).toBeInstanceOf(SimulationUnavailableError);
      expect(error.playerMessage.length).toBeGreaterThan(20);
      expect(error.retryable, "a malformed payload will not fix itself on retry").toBe(false);
      expect(error.developerDetail).toMatch(/failed validation/);
      // And nothing about the payload reaches the player.
      for (const banned of [/undefined/, /\bNaN\b/, /\bnull\b/, /Good|Buy|Sell|Margin/, /\b0\b/]) {
        expect(banned.test(error.playerMessage), `player message contains ${banned}`).toBe(false);
      }
    });
  }

  it("tolerates a margin that differs from the two prices by a rounding step", async () => {
    // The sim's prices are floats and the difference is computed in the same place, so the
    // check allows a hundredth of a unit rather than demanding bit equality.
    const provider = providerWith(
      vi.fn(async () => jsonResponse({ rumours: [{ ...goodRumour(), Margin: 72.804 }] })) as unknown as typeof fetch,
    );
    await expect(provider.rumours()).resolves.toHaveLength(1);
  });
});

describe("every failure is handled, not swallowed (section 1.3)", () => {
  it("reports a transport failure with a sentence the player can act on", async () => {
    const provider = providerWith(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    );
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error.retryable).toBe(true);
    expect(error.playerMessage).toMatch(/not answering/i);
    // The transport detail is for the console, not the screen.
    expect(error.playerMessage).not.toMatch(/fetch failed/);
    expect(error.developerDetail).toMatch(/fetch failed/);
  });

  it("reports an unreadable body rather than throwing a raw parse error", async () => {
    const provider = providerWith(
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => {
            throw new SyntaxError("Unexpected token <");
          },
        }) as unknown as Response,
      ) as unknown as typeof fetch,
    );
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error.playerMessage).not.toMatch(/Unexpected token/);
  });

  it("records why a 409 body could not be read instead of swallowing it", async () => {
    const provider = providerWith(
      vi.fn(async () =>
        ({
          ok: false,
          status: 409,
          statusText: "Conflict",
          json: async () => {
            throw new SyntaxError("not json");
          },
        }) as unknown as Response,
      ) as unknown as typeof fetch,
    );
    const error = (await provider
      .trade({ partyId: "p", townId: "t", goodId: "grain", side: "buy", quantity: 1, expectedDay: 1 })
      .catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    // The player still gets a usable sentence...
    expect(error.playerMessage).toMatch(/moved on/i);
    // ...and the developer learns the reply was unreadable rather than empty.
    expect(error.developerDetail).toMatch(/could not be read/);
  });

  it("passes a 409 reason through to the player when the server sent one", async () => {
    const provider = providerWith(
      vi.fn(async () => jsonResponse({ reason: "Grain is cheaper in Longmont." }, 409)) as unknown as typeof fetch,
    );
    const error = (await provider
      .trade({ partyId: "p", townId: "t", goodId: "grain", side: "buy", quantity: 1, expectedDay: 1 })
      .catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error.playerMessage).toBe("Grain is cheaper in Longmont.");
  });

  it("reports an unreadable reply to an accepted order", async () => {
    const provider = providerWith(
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => {
            throw new SyntaxError("truncated");
          },
        }) as unknown as Response,
      ) as unknown as typeof fetch,
    );
    const error = (await provider
      .planMarch({ partyId: "p", destinationSettlementId: "s", departure: "now" })
      .catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error.playerMessage).toMatch(/nothing this client can read/i);
  });
});

describe("fixtures stay out of a production path", () => {
  it("asks for the live simulation by default", () => {
    expect(readConfig({}).simulationSource).toBe("http");
    expect(readConfig({ VITE_SIMULATION_SOURCE: "something-else" }).simulationSource).toBe("http");
  });

  it("will not resolve to a fixture outside a fixture build", () => {
    // Even with the environment asking for one. `vite.config.ts` only leaves the real
    // fixture in the bundle for the dev server and the fixtures build, so a production
    // bundle would get the module that throws; resolving to "fixture" there would just
    // be a slower failure. This test process runs in mode "test".
    const asked = { VITE_SIMULATION_SOURCE: "fixture" };
    expect(readConfig(asked).simulationSource).toBe("http");
  });

  it("is asked for the fixture by the environment, not assumed", () => {
    // The default has to be live. A client that quietly came up on test data would be
    // indistinguishable from the real game, which is the one mistake the fixture rules
    // exist to prevent.
    expect(readConfig({}).simulationSource).toBe("http");
    expect(readConfig({ VITE_SIMULATION_SOURCE: "true" }).simulationSource).toBe("http");
    expect(readConfig({ VITE_SIMULATION_SOURCE: "FIXTURE" }).simulationSource).toBe("http");
  });

  it("keeps quality a closed set", () => {
    expect(readConfig({}).quality).toBe("high");
    expect(readConfig({ VITE_QUALITY: "low" }).quality).toBe("low");
    expect(readConfig({ VITE_QUALITY: "ultra" }).quality).toBe("high");
  });

  it("refuses an unknown provider kind rather than falling through", () => {
    expect(() => createSimulationProvider({ kind: "guess" as never })).toThrow(SimulationUnavailableError);
  });

  it("names the HTTP provider for the data-source panel", () => {
    expect(providerWith(vi.fn() as unknown as typeof fetch).label).toBe("Live simulation");
  });
});

describe("the tick subscription reports instead of dropping frames silently", () => {
  /** A socket that records what the provider sent it. */
  function fakeSocket() {
    const socket = {
      sent: [] as string[],
      closed: false,
      onopen: null as ((ev: unknown) => void) | null,
      onclose: null as ((ev: unknown) => void) | null,
      onerror: null as ((ev: unknown) => void) | null,
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      send(data: string) {
        this.sent.push(data);
      },
      close() {
        this.closed = true;
      },
    };
    return socket;
  }

  it("delivers a good frame and reports a bad one as degraded", () => {
    const socket = fakeSocket();
    const provider = new HttpSimulationProvider({
      kind: "http",
      httpUrl: "http://sim.invalid",
      wsUrl: "ws://sim.invalid/ws",
      socketFactory: () => socket as never,
    });
    const ticks: unknown[] = [];
    const statuses: string[] = [];
    provider.subscribeTicks(
      (t) => ticks.push(t),
      (s) => statuses.push(s.state),
    );
    socket.onopen?.({});
    socket.onmessage?.({ data: JSON.stringify({ tick: 1, day: 1, notifications: [] }) });
    expect(ticks).toHaveLength(1);

    // A frame with no tick number is not a tick. It is reported and skipped, and the
    // connection is left alone so the rest of the campaign keeps arriving.
    socket.onmessage?.({ data: JSON.stringify({ day: 2 }) });
    expect(ticks).toHaveLength(1);
    expect(statuses).toContain("degraded");

    // A frame that is not JSON at all is likewise reported, not swallowed.
    socket.onmessage?.({ data: "<html>gateway timeout</html>" });
    expect(statuses.filter((s) => s === "degraded")).toHaveLength(2);

    socket.onclose?.({});
    socket.close();
  });

  it("asks to subscribe to the tick channel once connected", () => {
    const socket = fakeSocket();
    const provider = new HttpSimulationProvider({
      kind: "http",
      httpUrl: "http://sim.invalid",
      wsUrl: "ws://sim.invalid/ws",
      socketFactory: () => socket as never,
    });
    provider.subscribeTicks(() => {}, () => {});
    socket.onopen?.({});
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: "subscribe", channel: "ticks" });
    socket.onclose?.({});
  });

  it("delivers a frame's fog block, which is what makes the map move while marching", () => {
    const socket = fakeSocket();
    const provider = new HttpSimulationProvider({
      kind: "http",
      httpUrl: "http://sim.invalid",
      wsUrl: "ws://sim.invalid/ws",
      socketFactory: () => socket as never,
    });
    const ticks: TickUpdate[] = [];
    const statuses: string[] = [];
    provider.subscribeTicks(
      (t) => ticks.push(t),
      (s) => statuses.push(s.state),
    );
    socket.onopen?.({});
    // Shaped like `buildFog` in `cmd/apiserver/snapshot.go`, clock and last-seen ticks
    // included: the frame's fog has to be a whole FogState and not a delta, or the merge
    // would have to guess which of ten fields this frame happened to carry.
    socket.onmessage?.({
      data: JSON.stringify({
        tick: 61,
        day: 61,
        fog: {
          sideId: "side-1",
          sightRadiusKm: 50,
          sightRadiusLeagues: 10.356,
          sightingMemoryDays: 10,
          tick: 61,
          visibleTowns: ["town-3"],
          knownTowns: ["town-3", "town-7"],
          unseenTowns: ["town-9"],
          lastSeen: { "town-3": 61, "town-7": 12 },
          counts: { visible: 1, known: 2, unseen: 1, total: 3 },
        },
      }),
    });
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.fog?.visibleTowns).toEqual(["town-3"]);
    // The clock and the ages travel with it, so a remembered town can be dated on the
    // tick path rather than waiting for the next snapshot.
    expect(ticks[0]!.fog?.tick).toBe(61);
    expect(ticks[0]!.fog?.lastSeen?.["town-7"]).toBe(12);
    expect(statuses).not.toContain("degraded");
    socket.onclose?.({});
  });

  it("accepts a frame with no fog at all, because an older server sends none", () => {
    // The merge falls back to the last full snapshot, which is the most recent thing this
    // client was told. Refusing the frame would stop the clock as well as the fog.
    const socket = fakeSocket();
    const provider = new HttpSimulationProvider({
      kind: "http",
      httpUrl: "http://sim.invalid",
      wsUrl: "ws://sim.invalid/ws",
      socketFactory: () => socket as never,
    });
    const ticks: TickUpdate[] = [];
    const statuses: string[] = [];
    provider.subscribeTicks(
      (t) => ticks.push(t),
      (s) => statuses.push(s.state),
    );
    socket.onopen?.({});
    socket.onmessage?.({ data: JSON.stringify({ tick: 2, day: 2 }) });
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.fog).toBeUndefined();
    expect(statuses).not.toContain("degraded");
    socket.onclose?.({});
  });

  it("refuses a frame whose fog block cannot be read, rather than merging half of it", () => {
    // A fog list that is not a list of ids would become Set entries no town id could ever
    // match, which reads as "every town is unseen" and blanks the map. This frame arrives
    // every in-game day with nobody watching, so it gets the same check as the snapshot.
    const socket = fakeSocket();
    const provider = new HttpSimulationProvider({
      kind: "http",
      httpUrl: "http://sim.invalid",
      wsUrl: "ws://sim.invalid/ws",
      socketFactory: () => socket as never,
    });
    const ticks: unknown[] = [];
    const statuses: string[] = [];
    provider.subscribeTicks(
      (t) => ticks.push(t),
      (s) => statuses.push(s.state),
    );
    socket.onopen?.({});
    socket.onmessage?.({
      data: JSON.stringify({
        tick: 3,
        day: 3,
        fog: {
          sideId: "side-1",
          sightRadiusKm: 50,
          sightRadiusLeagues: 10.356,
          sightingMemoryDays: 10,
          visibleTowns: "town-3",
          knownTowns: [],
          unseenTowns: [],
          counts: { visible: 1, known: 1, unseen: 0, total: 1 },
        },
      }),
    });
    expect(ticks).toHaveLength(0);
    expect(statuses).toContain("degraded");

    // A last-seen entry that is not a tick is refused too: it compares as NaN, which is
    // neither "now" nor "never", and would land a town in whichever band came first.
    socket.onmessage?.({
      data: JSON.stringify({
        tick: 4,
        day: 4,
        fog: {
          sideId: "side-1",
          sightRadiusKm: 50,
          sightRadiusLeagues: 10.356,
          sightingMemoryDays: 10,
          tick: 4,
          lastSeen: { "town-3": "yesterday" },
          visibleTowns: [],
          knownTowns: [],
          unseenTowns: [],
          counts: { visible: 0, known: 0, unseen: 0, total: 0 },
        },
      }),
    });
    expect(ticks).toHaveLength(0);
    socket.onclose?.({});
  });
});
