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
  RECONNECT_DELAYS_MS,
  SAME_ORIGIN_API_PATH,
  SimulationUnavailableError,
  createSimulationProvider,
  providerFromConfig,
  readConfig,
  reconnectDelayMs,
  wsUrlFor,
} from "./provider.js";
import { SNAPSHOT_SCHEMA_MAX, SNAPSHOT_SCHEMA_MIN, SNAPSHOT_SCHEMA_VERSION, WHY_MAX_EDGES } from "./wire.js";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "",
    json: async () => body,
  } as unknown as Response;
}

function providerWith(fetchImpl: typeof fetch, wsUrl = "ws://sim.invalid/ws"): HttpSimulationProvider {
  return new HttpSimulationProvider({ kind: "http", httpUrl: "http://sim.invalid", wsUrl, fetchImpl });
}

/**
 * A provider whose per-call timeout is instant rather than eight seconds, so the tests
 * below do not spend real time waiting for a hang they are only asserting on.
 */
function fastProviderWith(fetchImpl: typeof fetch, timeoutMs = 5): HttpSimulationProvider {
  return new HttpSimulationProvider({
    kind: "http",
    httpUrl: "http://sim.invalid",
    wsUrl: "ws://sim.invalid/ws",
    fetchImpl,
    timeoutMs,
  });
}

/** A snapshot that passes every check, for the tests that need a good baseline. */
function goodSnapshot(): Record<string, unknown> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
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
    party: { id: "p1", name: "Caravan", troops: [], morale: 0.9 },
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
    const provider = providerWith(vi.fn(async () => jsonResponse({ ...goodSnapshot(), day: "x" })) as unknown as typeof fetch);
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    for (const banned of [/undefined/, /\bNaN\b/, /\bnull\b/, /\/src\//, /\.ts\b/, /Error/, /Something went wrong/]) {
      expect(banned.test(error.playerMessage), `player message contains ${banned}: ${error.playerMessage}`).toBe(false);
    }
  });

  it("refuses a town list whose third entry is broken, naming which one", async () => {
    // The whole point of checking element by element: "towns is invalid" sends a
    // developer back to the server, and "town 2 has no name" does not.
    const payload = {
      ...goodSnapshot(),
      towns: [
        { id: "t1", settlementId: "s1", name: "Golden", klass: "town", unrest: 0.2, loyalty: 0.7, security: 0.6, taxRate: 0.1, stateTaxRate: 0.05, updatedTick: 3, buildings: [] },
        { id: "t2", settlementId: "s2", name: "Aurora", klass: "town", unrest: 0.2, loyalty: 0.7, security: 0.6, taxRate: 0.1, stateTaxRate: 0.05, updatedTick: 3, buildings: [] },
        { id: "t3", settlementId: "s3", klass: "town", unrest: 0.2, loyalty: 0.7, security: 0.6, taxRate: 0.1, stateTaxRate: 0.05, updatedTick: 3, buildings: [] },
      ],
    };
    const provider = providerWith(vi.fn(async () => jsonResponse(payload)) as unknown as typeof fetch);
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error.developerDetail).toMatch(/town 2 has no name/);
  });
});

describe("a snapshot from a different schema version is refused as a skew", () => {
  it("says the world is too new rather than listing fields it has never heard of", async () => {
    const provider = providerWith(
      vi.fn(async () => jsonResponse({ ...goodSnapshot(), schemaVersion: SNAPSHOT_SCHEMA_MAX + 5 })) as unknown as typeof fetch,
    );
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    // "Update the game", not "field X is not a number": the latter would be a list of
    // complaints about a perfectly good snapshot written by a newer simulation.
    expect(error.playerMessage).toMatch(/newer than this version of the game/);
    expect(error.retryable, "updating is the fix, retrying is not").toBe(false);
    expect(error.developerDetail).toMatch(/too new/);
  });

  it("says the world is too old", async () => {
    const provider = providerWith(
      vi.fn(async () => jsonResponse({ ...goodSnapshot(), schemaVersion: SNAPSHOT_SCHEMA_MIN - 1 })) as unknown as typeof fetch,
    );
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error.playerMessage).toMatch(/older version of the simulation/);
    expect(error.developerDetail).toMatch(/too old/);
  });

  it("accepts every version in the supported range", async () => {
    for (let version = SNAPSHOT_SCHEMA_MIN; version <= SNAPSHOT_SCHEMA_MAX; version += 1) {
      const provider = providerWith(
        vi.fn(async () => jsonResponse({ ...goodSnapshot(), schemaVersion: version })) as unknown as typeof fetch,
      );
      const snapshot = await provider.getSnapshot();
      expect(snapshot.schemaVersion, `version ${version}`).toBe(version);
    }
  });

  it("treats a missing version as a malformed payload, not as a skew", async () => {
    // Telling a player to update the game because of a server bug would send them away
    // from the one thing that would fix it.
    const { schemaVersion: _dropped, ...withoutVersion } = goodSnapshot();
    const provider = providerWith(vi.fn(async () => jsonResponse(withoutVersion)) as unknown as typeof fetch);
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error.playerMessage).not.toMatch(/update the game/i);
    expect(error.developerDetail).toMatch(/failed validation.*schemaVersion/s);
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

describe("a chain deeper than a reader can follow is cut, and says so", () => {
  /** A chain of `depth` rows, each caused by the next, newest first. */
  function deepChain(depth: number): unknown {
    const rows = Array.from({ length: depth }, (_unused, index) => ({
      id: `c-${index}`,
      tick: index,
      day: index,
      entityId: "town-golden",
      entityName: "Golden",
      field: "unrest",
      old: 0.1 + index * 0.01,
      new: 0.2 + index * 0.01,
      system: "unrest",
      causedBy: index + 1 < depth ? [`c-${index + 1}`] : [],
      summary: `Step ${index}.`,
    }));
    return { entityId: "town-golden", field: "unrest", rows, related: [], totalDepth: depth, truncated: false };
  }

  it("keeps a chain that fits and does not claim to have cut it", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse(deepChain(10))) as unknown as typeof fetch);
    const chain = await provider.why("town-golden", "unrest");
    expect(chain.rows).toHaveLength(10);
    expect(chain.truncated).toBe(false);
    expect(chain.droppedEdges).toBe(0);
  });

  it("cuts a chain past the cap and counts what it dropped", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse(deepChain(80))) as unknown as typeof fetch);
    const chain = await provider.why("town-golden", "unrest");
    expect(chain.rows.length, "the walk has to stay followable").toBeLessThanOrEqual(WHY_MAX_EDGES);
    expect(chain.truncated, "a quiet cut looks exactly like a chain that ended").toBe(true);
    expect(chain.droppedEdges).toBeGreaterThan(0);
    expect(chain.totalDepth, "the full depth is still reported").toBe(80);
  });

  it("says how many edges went, so the panel can print the count rather than shrug", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse(deepChain(80))) as unknown as typeof fetch);
    const chain = await provider.why("town-golden", "unrest");
    expect(chain.droppedEdges).toBe(80 - WHY_MAX_EDGES);
    expect(chain.totalDepth, "the depth the simulation holds is still reported").toBe(80);
  });

  it("keeps the row nearest the player, because that is the question that was asked", async () => {
    const provider = providerWith(vi.fn(async () => jsonResponse(deepChain(80))) as unknown as typeof fetch);
    const chain = await provider.why("town-golden", "unrest");
    expect(chain.rows[0]?.id).toBe("c-0");
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

  it("gives up on a hung endpoint rather than spinning forever", async () => {
    // `fetch` against a server that accepted the connection and then stopped writing will
    // hang for as long as the socket lives. An infinite spinner is the failure this
    // prevents; a retryable error with the retry affordance is the honest response.
    const hung = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const provider = fastProviderWith(hung as unknown as typeof fetch, 5);
    const started = Date.now();
    const error = (await provider.getSnapshot().catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error.retryable, "a hang usually clears on its own").toBe(true);
    // "Stopped answering" rather than "is not answering": the two mean different things
    // to a player deciding whether to wait or to reload.
    expect(error.playerMessage).toMatch(/stopped answering/i);
    expect(error.developerDetail).toMatch(/aborted after 5ms/);
    expect(Date.now() - started, "the wait must be the timeout, not longer").toBeLessThan(2_000);
  });

  it("aborts a hung POST as well as a hung GET", async () => {
    const hung = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const provider = fastProviderWith(hung as unknown as typeof fetch, 5);
    const error = (await provider
      .trade({ partyId: "p", townId: "t", goodId: "grain", side: "buy", quantity: 1, expectedDay: 1 })
      .catch((e: unknown) => e)) as SimulationUnavailableError;
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error.playerMessage).toMatch(/stopped answering/i);
  });

  it("actually sends an abort signal, so the hang is ended rather than merely reported", async () => {
    // Without this the abort would be decoration: the promise would still be pending
    // forever, and the error would only arrive because the test's own timeout fired.
    let sawSignal: AbortSignal | undefined;
    const hung = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          sawSignal = init?.signal ?? undefined;
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const provider = fastProviderWith(hung as unknown as typeof fetch, 5);
    await provider.getSnapshot().catch(() => undefined);
    expect(sawSignal, "no signal reached fetch").toBeDefined();
    expect(sawSignal?.aborted, "the signal was never fired").toBe(true);
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

  it("refuses to construct the fixture outside a dev-only build", () => {
    // The third gate, at the point of construction rather than at the point of reading
    // the environment. `vite.config.ts` has already replaced the module in a production
    // build, so this is the belt to that pair of braces: even a caller that bypassed
    // `readConfig` gets a refusal with a sentence, not a module that throws on use.
    const error = (() => {
      try {
        createSimulationProvider({ kind: "fixture" });
        return null;
      } catch (err) {
        return err as SimulationUnavailableError;
      }
    })();
    // This test process runs in mode "test", which is not a fixture build.
    expect(error).toBeInstanceOf(SimulationUnavailableError);
    expect(error?.playerMessage).toMatch(/development build/i);
    expect(error?.retryable, "no retrying will make a production build a dev build").toBe(false);
  });

  it("names the HTTP provider for the data-source panel", () => {
    expect(providerWith(vi.fn() as unknown as typeof fetch).label).toBe("Live simulation");
  });
});

describe("the simulation's address is checked before it is used", () => {
  it("falls back to the same-origin /api path in a production build", () => {
    // Not merely a default: the production bundle must contain no `127.0.0.1`, because a
    // shipped game pointing at the player's own loopback address is a bug that only
    // shows up on someone else's machine.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // In this process the build mode is "test", which is not a fixture build, so the
      // production default is the one under test.
      expect(readConfig({}).simulationHttpUrl).toBe(SAME_ORIGIN_API_PATH);
      expect(readConfig({}).simulationHttpUrl).not.toMatch(/127\.0\.0\.1/);
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps an address the environment gave, once it parses", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(readConfig({ VITE_SIMULATION_HTTP_URL: "https://sim.example.com" }).simulationHttpUrl).toBe(
        "https://sim.example.com",
      );
      // A trailing slash is dropped rather than doubled into `//v1/snapshot`.
      expect(readConfig({ VITE_SIMULATION_HTTP_URL: "https://sim.example.com/" }).simulationHttpUrl).toBe(
        "https://sim.example.com",
      );
      expect(warn, "a valid address must not warn").not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses a malformed address and says so, rather than fetching nothing", async () => {
    // A bad URL is worse than no URL: it produces a request to nowhere behind a
    // plausible path, and the failure reads as "the simulation is down".
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const bad of ["not a url", "http//missing-colon", "ftp://files.example.com", "://nope"]) {
        const config = readConfig({ VITE_SIMULATION_HTTP_URL: bad });
        expect(config.simulationHttpUrl, `"${bad}" was accepted`).toBe(SAME_ORIGIN_API_PATH);
      }
      expect(warn, "a misconfigured build should say so in the console").toHaveBeenCalled();
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/VITE_SIMULATION_HTTP_URL/);
    } finally {
      warn.mockRestore();
    }
  });

  it("derives the tick socket from the HTTP address, so one variable configures both", () => {
    expect(wsUrlFor("http://127.0.0.1:8080")).toBe("ws://127.0.0.1:8080/ws");
    expect(wsUrlFor("https://sim.example.com")).toBe("wss://sim.example.com/ws");
    expect(wsUrlFor("https://sim.example.com/")).toBe("wss://sim.example.com/ws");
  });

  it("builds a socket URL for the same-origin default, which has no scheme of its own", () => {
    // `/api` is the production default and a WebSocket is not fetch, so it cannot be left
    // relative. The page's own origin is the only honest thing to build it from, and the
    // scheme has to follow the page's: `wss` on an https page, or the browser refuses the
    // connection as mixed content.
    expect(wsUrlFor(SAME_ORIGIN_API_PATH, "https://play.example.com")).toBe("wss://play.example.com/api/ws");
    expect(wsUrlFor(SAME_ORIGIN_API_PATH, "http://localhost:5178")).toBe("ws://localhost:5178/api/ws");
  });

  it("keeps a separately-configured socket, and refuses a malformed one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(readConfig({ VITE_SIMULATION_WS_URL: "wss://sim.example.com/live" }).simulationWsUrl).toBe(
        "wss://sim.example.com/live",
      );
      // Not a socket scheme: falling back to the HTTP host is better than building
      // `http://` into a WebSocket URL and failing at the handshake.
      expect(readConfig({ VITE_SIMULATION_WS_URL: "http://sim.example.com/ws" }).simulationWsUrl).toBe(
        wsUrlFor(SAME_ORIGIN_API_PATH),
      );
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("reads the configured address at startup, which is what main.ts does", () => {
    // `providerFromConfig` is the seam: the address that is read is the one that is used,
    // so a build cannot read one host and talk to another.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const config = readConfig({ VITE_SIMULATION_HTTP_URL: "http://sim.example.com:9000" });
      expect(providerFromConfig(config)).toBeInstanceOf(HttpSimulationProvider);
    } finally {
      warn.mockRestore();
    }
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

  describe("reconnect backs off, and the attempt count is visible", () => {
    /** A provider whose socket factory hands out a fresh fake each attempt. */
    function backingOffProvider(): { provider: HttpSimulationProvider; sockets: ReturnType<typeof fakeSocket>[] } {
      const sockets: ReturnType<typeof fakeSocket>[] = [];
      const provider = new HttpSimulationProvider({
        kind: "http",
        httpUrl: "http://sim.invalid",
        wsUrl: "ws://sim.invalid/ws",
        socketFactory: () => {
          const socket = fakeSocket();
          sockets.push(socket);
          return socket as never;
        },
      });
      return { provider, sockets };
    }

    it("holds at 30 seconds rather than growing without limit", () => {
      // The schedule is one exported list so the HUD can show "next attempt in Ns" from
      // the same numbers the provider actually uses, rather than a second guess that
      // drifts out of step with it.
      expect(RECONNECT_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
      expect(reconnectDelayMs(1), "first retry is quick enough not to feel broken").toBe(1000);
      expect(reconnectDelayMs(3)).toBe(4000);
      expect(reconnectDelayMs(6)).toBe(30000);
      expect(reconnectDelayMs(50), "bounded, however long it has been down").toBe(30000);
    });

    it("counts every failed attempt, so the player can see it is trying", () => {
      vi.useFakeTimers();
      try {
        const { provider, sockets } = backingOffProvider();
        const attempts: number[] = [];
        const stop = provider.subscribeTicks(
          () => {},
          (status) => {
            if (status.state === "reconnecting") attempts.push(status.attempt);
          },
        );
        for (let i = 0; i < 4; i += 1) {
          sockets[sockets.length - 1]?.onclose?.({ code: 1006 });
          vi.advanceTimersToNextTimer();
        }
        stop();
        expect(attempts).toEqual([1, 2, 3, 4]);
        // One socket per attempt: a reconnect that reused the closed socket would be a
        // reconnect that never succeeds.
        expect(sockets).toHaveLength(5);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not retry a socket the caller closed deliberately", () => {
      vi.useFakeTimers();
      try {
        const { provider, sockets } = backingOffProvider();
        const statuses: string[] = [];
        const stop = provider.subscribeTicks(() => {}, (status) => statuses.push(status.state));
        stop();
        sockets[0]?.onclose?.({ code: 1000 });
        vi.advanceTimersByTime(60_000);
        expect(sockets, "unsubscribing must not bring the socket back").toHaveLength(1);
        expect(statuses.filter((s) => s === "reconnecting"), "a deliberate close is not a failure").toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops retrying once told to, so a closed tab does not keep a timer alive", () => {
      vi.useFakeTimers();
      try {
        const { provider, sockets } = backingOffProvider();
        const stop = provider.subscribeTicks(() => {}, () => {});
        sockets[0]?.onclose?.({});
        expect(vi.getTimerCount(), "a reconnect is pending").toBeGreaterThan(0);
        stop();
        expect(vi.getTimerCount(), "unsubscribing must clear the pending retry").toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("counts attempts from zero again after a successful connect", () => {
      // An attempt count that never resets would show "attempt 47" to a player whose
      // connection has been fine for an hour.
      vi.useFakeTimers();
      try {
        const { provider, sockets } = backingOffProvider();
        const attempts: number[] = [];
        const stop = provider.subscribeTicks(
          () => {},
          (status) => {
            if (status.state === "connected") attempts.push(status.attempt);
          },
        );
        sockets[0]?.onclose?.({});
        vi.advanceTimersToNextTimer();
        sockets[1]?.onopen?.({});
        expect(attempts, "a fresh connection reports attempt 0").toEqual([0]);
        stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("a force in encounter range is refused rather than half-read", () => {
  // What the campaign sends for a party it is not simulating: no composition,
  // because model.Party is a count and a morale rather than stacks.
  const serverRow = {
    id: "7",
    name: "Yorver's company",
    troopCount: 84,
    hostile: true,
    distanceKm: 3.5,
    position: { x: 12.5, z: -4.25 },
  };

  it("passes a row through with the id the server gave it, so it can be fought", async () => {
    // The id is the whole point: this is the value that goes into
    // POST /v1/encounters and into fleeing and defeat. A rewrite here would be
    // invisible in the panel and fatal in the request.
    const fetchImpl = vi.fn(async () => jsonResponse([serverRow]));
    await expect(providerWith(fetchImpl as unknown as typeof fetch).getNearbyHostiles(50)).resolves.toEqual([
      serverRow,
    ]);
  });

  it("asks for the range it was given", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse([]);
    });
    await providerWith(fetchImpl as unknown as typeof fetch).getNearbyHostiles(50);
    expect(urls).toEqual(["http://sim.invalid/v1/parties/nearby?rangeKm=50"]);
  });

  it("names the field a row is missing, instead of handing the panel an undefined headcount", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ ...serverRow, position: { x: 1 } }]));
    await expect(providerWith(fetchImpl as unknown as typeof fetch).getNearbyHostiles(50)).rejects.toThrow(
      /force 0 position has no z/,
    );
  });

  it("refuses a reply that is not a list, rather than iterating a payload's own fields", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ forces: [serverRow] }));
    await expect(providerWith(fetchImpl as unknown as typeof fetch).getNearbyHostiles(50)).rejects.toThrow(
      /not a list of forces/,
    );
  });

  it("lets the route's own failure through, with the sentence the sweep shows the player", async () => {
    // The sweep reports `playerMessage` when it is there and the raw message
    // otherwise, so what reaches the toast is the one the provider wrote for a
    // player rather than a URL with a status code on it.
    const fetchImpl = vi.fn(async () => jsonResponse("that path is not part of the campaign API", 404));
    const failure = await fastProviderWith(fetchImpl as unknown as typeof fetch)
      .getNearbyHostiles(50)
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(failure, "a 404 from the nearby route is not swallowed").toBeInstanceOf(SimulationUnavailableError);
    expect((failure as SimulationUnavailableError).playerMessage).toMatch(/Nearby parties could not be listed/);
  });
});
