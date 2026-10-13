/**
 * The service worker's world-data cache, run the way the worker runs it.
 *
 * `pwa.test.ts` pins the installability contract by reading sw.js as text. That is the
 * right check for "is there a service worker and does it register", but it cannot see
 * what the worker *does*, and the behaviour worth pinning here is:
 *
 *   - world data is bucketed per build, so a deploy cannot leave an installed client
 *     serving the previous deployment's region out of cache;
 *   - the four wire files are fetched concurrently and every one of them lands in the
 *     right bucket anyway, which is why the bucket is named from the request URL rather
 *     than from whichever sibling response is parsed first;
 *   - a world-data request that fails with nothing cached fails, rather than being handed
 *     `/index.html` and reported by the loader as a damaged file;
 *   - `activate` does not throw away the offline map, because the world bucket is keyed by
 *     the build rather than by this file's version.
 *
 * So sw.js is evaluated in a `vm` context against a `caches` and a `fetch` that are real
 * enough to be wrong in the same ways a browser is. The code under test is byte-for-byte
 * the shipped file: it is run as a script that registers listeners, not imported.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SW_PATH = join(HERE, "..", "..", "..", "public", "sw.js");
const SW_SOURCE = readFileSync(SW_PATH, "utf8");

const ORIGIN = "http://localhost";
const BUILD_A = "20261002-030730-bbe597";
const BUILD_B = "20261003-114512-0a41ff";
const OHIO = {
  name: "Ohio River Valley (OH/KY metro cluster)",
  bbox: { south: 37.1, west: -85.3, north: 40.6, east: -81.6 },
  retrieved: "2026-10-01",
};
const COLORADO = {
  name: "Northern Colorado Front Range",
  bbox: { south: 40, west: -105.5, north: 40.7, east: -104.6 },
  retrieved: "2026-09-30",
};

const WIRE_FILES = [
  "/world/region.json",
  "/world/settlements.json",
  "/world/network.json",
  "/world/boundaries.json",
];

const url = (path: string) => `${ORIGIN}${path}`;
/** A world URL as `load.ts` builds it: the path, plus the build token. */
const world = (path: string, build = BUILD_A) => `${url(path)}?b=${build}`;

/** A Response stand-in with the four members sw.js touches. */
function makeResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
    clone() {
      return this;
    },
  };
}

/**
 * Just enough `Response` for the worker's own offline 503, which is constructed rather
 * than fetched. Node's is not in the vm context, and a missing one would turn a branch
 * under test into a ReferenceError that looks like a worker bug. The signature is the
 * real one - `(body, init)` - because a stand-in that took `status` positionally would
 * hand back an init object as a status code and fail on the assertion, not on the worker.
 */
class FakeResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly ok: boolean;
  constructor(
    private readonly body: string,
    init: { status?: number; statusText?: string; headers?: Record<string, string> } = {},
  ) {
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.headers = init.headers ?? {};
    this.ok = this.status >= 200 && this.status < 300;
  }
  async text() {
    return this.body;
  }
  clone() {
    return this;
  }
}

interface Answer {
  ok: boolean;
  status: number;
  body: string;
}

/** One booted worker, over a cache store and a network this test controls. */
class Worker {
  /** Cache name -> URL -> body. */
  private readonly store = new Map<string, Map<string, string>>();
  private readonly network = new Map<string, string | null>();
  private readonly listeners: Record<string, ((event: unknown) => void)[]> = {};

  /** Every URL the worker's `fetch` was asked for, in order. */
  readonly requested: string[] = [];

  constructor() {
    const self = {
      location: { origin: ORIGIN },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        (this.listeners[type] ??= []).push(fn);
      },
    };
    const caches = {
      keys: async () => [...this.store.keys()],
      open: async (name: string) => this.cacheApi(name),
      delete: async (name: string) => this.store.delete(name),
      // The real Cache API takes a Request or a URL string, and resolves a string
      // against the worker's scope rather than treating it as a cache key verbatim.
      match: async (request: string | { url: string }) =>
        this.matchAny(
          typeof request === "string" ? { url: new URL(request, `${ORIGIN}/`).href } : request,
        ),
    };
    const fetchImpl = async (input: string | { url: string }) => {
      // sw.js calls `fetch(request)` with the Request object in every branch.
      const key = typeof input === "string" ? input : input.url;
      const body = this.network.get(key);
      if (body === undefined || body === null) throw new TypeError("Failed to fetch");
      return makeResponse(body);
    };
    runInContext(
      SW_SOURCE,
      createContext({ self, caches, fetch: fetchImpl, URL, Promise, Response: FakeResponse, console }),
    );
  }

  private cacheApi(name: string) {
    // A real Cache API hands back the same Cache for a name it already holds; opening
    // twice must not empty it.
    let cache = this.store.get(name);
    if (!cache) {
      cache = new Map();
      this.store.set(name, cache);
    }
    return {
      put: async (request: { url: string }, res: { text(): Promise<string> }) => {
        cache.set(request.url, await res.text());
      },
      addAll: async (paths: string[]) => {
        for (const path of paths) cache.set(url(path), "shell");
      },
      match: async (request: { url: string }) => {
        const hit = cache.get(request.url);
        return hit === undefined ? undefined : makeResponse(hit);
      },
    };
  }

  private async matchAny(request: { url: string }) {
    for (const cache of this.store.values()) {
      const hit = cache.get(request.url);
      if (hit !== undefined) return makeResponse(hit);
    }
    return undefined;
  }

  /** What the network answers with, or `null` for "no network". */
  serve(path: string, body: string | null, build = BUILD_A): this {
    this.network.set(world(path, build), body);
    return this;
  }

  /** As `serve`, for a URL the client does not put a build token on. */
  serveRaw(path: string, body: string | null): this {
    this.network.set(url(path), body);
    return this;
  }

  /** The handlers sw.js registered, so a test can drive one directly. */
  listenerFor(event: "fetch" | "install" | "activate"): ((event: unknown) => void)[] {
    return this.listeners[event] ?? [];
  }

  cacheNames(): string[] {
    return [...this.store.keys()];
  }

  worldCaches(): string[] {
    return this.cacheNames().filter((n) => n.startsWith("campaign-world-"));
  }

  /** Put a body into a cache directly, for arranging a starting state. */
  seedCache(name: string, path: string, body: string): this {
    let cache = this.store.get(name);
    if (!cache) {
      cache = new Map();
      this.store.set(name, cache);
    }
    cache.set(url(path), body);
    return this;
  }

  /** The body held for a path, whichever cache and whichever build token holds it. */
  cached(path: string): string | undefined {
    for (const cache of this.store.values()) {
      for (const [key, body] of cache) {
        if (new URL(key).pathname === path) return body;
      }
    }
    return undefined;
  }

  /** Run one lifecycle event and wait for the work it queued. */
  async lifecycle(event: "install" | "activate"): Promise<void> {
    const queued: Promise<unknown>[] = [];
    for (const fn of this.listenerFor(event)) {
      fn({ waitUntil: (p: Promise<unknown>) => queued.push(p) });
    }
    await Promise.all(queued);
  }

  /** Drive the fetch listener for one URL and report what it answered with. */
  async respond(target: string, mode = "no-cors"): Promise<Answer> {
    this.requested.push(target);
    let responded: Promise<{ ok: boolean; status: number; text(): Promise<string> }> | undefined;
    for (const fn of this.listenerFor("fetch")) {
      fn({
        request: { method: "GET", url: target, mode },
        waitUntil: () => {},
        respondWith: (p: Promise<{ ok: boolean; status: number; text(): Promise<string> }>) => {
          responded = p;
        },
      });
    }
    if (!responded) throw new Error("the service worker did not respond to the request");
    const res = await responded;
    return { ok: res.ok, status: res.status, body: await res.text() };
  }

  /** As `respond`, for a world URL carrying the build token. */
  get(path: string, build = BUILD_A): Promise<Answer> {
    return this.respond(world(path, build));
  }

  /** Fire several world requests at once, the way `loadWorldData` does.
   *
   * `Promise.all` over the four wire files means all four responses are in flight
   * together, so nothing downstream of them can rely on having seen `region.json` yet.
   */
  getAll(paths: string[], build = BUILD_A): Promise<Answer[]> {
    return Promise.all(paths.map((path) => this.get(path, build)));
  }
}

describe("service worker: world-data cache", () => {
  let worker: Worker;

  beforeEach(() => {
    worker = new Worker();
  });

  /** Boot far enough that the region's wire files are cached. */
  async function boot(region: unknown, settlements = '{"settlements":[]}', build = BUILD_A) {
    worker
      .serve("/world/region.json", JSON.stringify(region), build)
      .serve("/world/settlements.json", settlements, build)
      .serve("/world/network.json", '{"roads":[],"rail":[]}', build)
      .serve("/world/boundaries.json", '{"boundaries":[]}', build);
    await worker.getAll(["/world/region.json", "/world/settlements.json"], build);
  }

  it("registers the three lifecycle listeners the file is checked for", () => {
    expect(SW_SOURCE).toContain('addEventListener("install"');
    expect(SW_SOURCE).toContain('addEventListener("activate"');
    expect(SW_SOURCE).toContain('addEventListener("fetch"');
  });

  it("buckets world data under the build token, not the app shell", async () => {
    await boot(OHIO);

    expect(worker.worldCaches()).toEqual([`campaign-world-${BUILD_A}`]);
    expect(worker.cacheNames()).not.toContain("campaign-shell-v1");
    expect(worker.cached("/world/settlements.json")).toBe('{"settlements":[]}');
  });

  it("puts every concurrently fetched wire file in the build's bucket", async () => {
    // The failure this design is for: a bucket named from region.json's identity fields
    // depends on which of the four concurrent responses is *parsed* first, and the three
    // that do not name it usually win. The offline map then holds the region file and
    // none of the data, so an offline player is told the survey is missing.
    await boot(OHIO, '{"settlements":["columbus"]}');
    await worker.getAll(["/world/network.json", "/world/boundaries.json"]);

    expect(worker.worldCaches()).toEqual([`campaign-world-${BUILD_A}`]);
    for (const path of WIRE_FILES) {
      expect(worker.cached(path), `${path} was not cached`).toBeDefined();
    }
  });

  it("drops the previous build's bucket when a new deployment is served", async () => {
    // The failure this is for: region.json and settlements.json sit at fixed paths, so an
    // installed client whose network blips used to keep serving the old region from cache -
    // a Colorado region file beside Ohio settlements, every town 28x off the map.
    await boot(OHIO, '{"settlements":["columbus"]}', BUILD_A);
    expect(worker.worldCaches()).toEqual([`campaign-world-${BUILD_A}`]);

    await boot(COLORADO, '{"settlements":["fort-collins"]}', BUILD_B);

    expect(worker.worldCaches()).toEqual([`campaign-world-${BUILD_B}`]);
    expect(worker.cached("/world/settlements.json")).toBe('{"settlements":["fort-collins"]}');
  });

  it("invalidates on a redeploy that leaves the region's own identity alone", async () => {
    // Same name, same bbox, same retrieval date; the settlements behind it are new. A
    // bucket keyed on the region's identity fields would hand the old ones to an offline
    // player indefinitely, because nothing about region.json says the data moved.
    await boot(OHIO, '{"settlements":["columbus"]}', BUILD_A);

    worker.serve("/world/settlements.json", '{"settlements":["dayton"]}', BUILD_B);
    await worker.get("/world/settlements.json", BUILD_B);

    expect(worker.cached("/world/settlements.json")).toBe('{"settlements":["dayton"]}');
    expect(worker.worldCaches()).toEqual([`campaign-world-${BUILD_B}`]);
  });

  it("does not let an untokenised world request evict the build's bucket", async () => {
    // `src/scene/cityDemo.ts` fetches `world/cities/<slug>.json` without going through
    // `cacheBust`, so that request lands in the unversioned bucket. If it were allowed to
    // prune, fetching a city the player has not been to would throw away the offline map
    // of the region they were playing.
    await boot(OHIO);
    worker.serveRaw("/world/cities/dayton.json", '{"name":"Dayton"}');

    await worker.respond(url("/world/cities/dayton.json"));

    expect(worker.worldCaches()).toEqual([
      `campaign-world-${BUILD_A}`,
      "campaign-world-unversioned",
    ]);
    expect(worker.cached("/world/settlements.json")).toBe('{"settlements":[]}');
  });

  it("keeps the cached region for a player who is offline", async () => {
    await boot(OHIO);
    for (const path of WIRE_FILES) worker.serve(path, null);

    const offline = await worker.get("/world/settlements.json");
    expect(offline.ok).toBe(true);
    expect(offline.body).toBe('{"settlements":[]}');
    // And the region file it is paired with is the same region, not a stranger's.
    const region = JSON.parse((await worker.get("/world/region.json")).body);
    expect(region.name).toBe(OHIO.name);
  });

  it("fails a world-data request with no network and nothing cached", async () => {
    // Serving /index.html here is what made a missing survey reach the loader as "the file
    // is damaged". The loader's own retryable error is the truth.
    await expect(worker.get("/world/network.json")).rejects.toThrow(/Failed to fetch/);
  });

  it("serves the app shell to a navigation and a 503 to a data request", async () => {
    await worker.lifecycle("install");
    worker.seedCache("campaign-shell-v1", "/index.html", "<html></html>");

    const navigation = await worker.respond(url("/campaign"), "navigate");
    expect(navigation.status).toBe(200);
    expect(navigation.body).toBe("<html></html>");

    // A 200 with an HTML body here is what every reader in the app sees as a *corrupt*
    // file rather than a missing one, so a player with no signal is told the file is
    // damaged instead of being told they are offline.
    const api = await worker.respond(url("/api/campaign/state"));
    expect(api.status).toBe(503);
    expect(api.body).not.toContain("<html>");

    // A hashed asset is the one thing that still fails outright, and has to: a cache
    // miss on an immutable `/assets/` name means the deployment is broken, and a shell
    // page in its place would be a map with no models and no explanation.
    await expect(worker.respond(url("/assets/whatever.glb"))).rejects.toThrow(/Failed to fetch/);
  });

  it("keeps the world bucket when the worker activates", async () => {
    // The world bucket is keyed by the build whose requests fill it, not by this file's
    // CACHE_VERSION, so purging it on activate would throw away the offline map of the
    // build being served.
    await boot(OHIO);
    await worker.lifecycle("install");
    await worker.lifecycle("activate");

    expect(worker.worldCaches()).toEqual([`campaign-world-${BUILD_A}`]);
    expect(worker.cacheNames()).toContain("campaign-shell-v1");
  });

  it("purges an old shell cache on activate", async () => {
    await worker.lifecycle("install");
    worker.seedCache("campaign-shell-v0", "/index.html", "old");

    await worker.lifecycle("activate");

    expect(worker.cacheNames()).not.toContain("campaign-shell-v0");
  });

  it("does not treat a path that merely starts with 'world' as world data", async () => {
    await boot(OHIO);
    worker.serveRaw("/worldwide/index.html", "<html></html>");

    const res = await worker.respond(url("/worldwide/index.html"), "navigate");
    expect(res.body).toBe("<html></html>");
    // It went to the shell bucket, not to a build's world bucket.
    expect(worker.worldCaches()).toEqual([`campaign-world-${BUILD_A}`]);
  });
});