/**
 * The Contract B boundary: how the campaign client reads simulation state.
 *
 * This client does **not** build the simulation. Agent 2 owns the tick loop and the
 * cause log (`agents/README.md` Contract B). Until Agent 2 lands, the client reads
 * clearly-labelled test fixtures.
 *
 * `agents/README.md` section 4 says a fixture is never wired into a production path.
 * That is enforced in three independent places, because one would be a promise:
 *
 *  1. `vite.config.ts` replaces the fixture module with a module that throws, in any
 *     build that is not a dev build. The fixture code is not in the production
 *     bundle at all, rather than present and unreachable.
 *  2. `tools/check-no-fixtures.mjs` scans the built output for the fixture's marker
 *     strings and fails `npm run build` if any are found.
 *  3. `readConfig` refuses to resolve a non-fixtures build mode to the fixture, so a
 *     stray `VITE_SIMULATION_SOURCE=fixture` in a production environment cannot reach
 *     this file either.
 *  4. When the fixture provider is live, `main.ts` renders a persistent banner, so a
 *     screenshot cannot be mistaken for the real game.
 */

import type {
  BattleXpAward,
  BattleXpInput,
  ConnectionStatus,
  ConstructionResult,
  ImproveRelationRequest,
  ImproveRelationResult,
  MarchCommitResult,
  MarchPlan,
  MarchRequest,
  PlayerCharacter,
  RecruitRequest,
  RecruitResult,
  SimSnapshot,
  SimulationProvider,
  TalkToNotableResult,
  TaxOrderResult,
  TickUpdate,
  TimeScaleResult,
  TradeRequest,
  TradeResult,
  UpgradeTroopsRequest,
  UpgradeTroopsResult,
  WhyChain,
} from "./types.js";
import { createFixtureSimulationProvider } from "./fixture/index.js";
import {
  battleXpProblem,
  constructionResultProblem,
  improveRelationRequestProblem,
  improveRelationResultProblem,
  marchCommitProblem,
  marchPlanProblem,
  recruitRequestProblem,
  recruitResultProblem,
  schemaVersionProblem,
  skipToArrivalProblem,
  SNAPSHOT_SCHEMA_MAX,
  SNAPSHOT_SCHEMA_MIN,
  snapshotProblem,
  talkResultProblem,
  taxResultProblem,
  tickFrameProblem,
  timeScaleProblem,
  tradeRequestProblem,
  tradeResultProblem,
  upgradeRequestProblem,
  upgradeResultProblem,
  whyChainProblem,
  WHY_MAX_EDGES,
} from "./wire.js";

/**
 * What a tax conflict reads as when the server sent no reason of its own.
 *
 * A 409 on a tax order is not a transport failure: the simulation is the authority on
 * its own state, and what it means here is that the ruler moved the rate between the
 * player reading it and the player setting it. "The world moved on" is true but useless;
 * the player needs to know who moved it and that they can set it again.
 */
const TAX_CONFLICT = "The taxes were changed by the ruler before that order arrived. The panel now shows the rate in force; set it again if you still want yours.";

/** A failure the UI can show a player, with a way to recover (CONSTITUTION.md §1.3). */
export class SimulationUnavailableError extends Error {
  readonly playerMessage: string;
  readonly developerDetail: string;
  readonly retryable: boolean;

  constructor(playerMessage: string, developerDetail: string, retryable = true) {
    super(developerDetail);
    this.name = "SimulationUnavailableError";
    this.playerMessage = playerMessage;
    this.developerDetail = developerDetail;
    this.retryable = retryable;
  }
}

export type ProviderKind = "http" | "fixture";

/** The slice of WebSocket this client uses, so tests can supply a fake. */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

/** How long one HTTP call may take before the client gives up on it, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 8_000;

/**
 * How long to wait before each reconnect attempt, in order.
 *
 * Exported rather than computed inline so the HUD's "retrying, attempt N" line can show
 * when the next attempt is due from the same numbers the provider uses. A second copy of
 * this sequence would drift, and a drifting countdown is worse than none.
 *
 * The last value is the cap. A dead server neither logs without limit nor takes long to
 * pick back up on the first retry.
 */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

/** The wait before reconnect attempt `attempt` (1 for the first retry). */
export function reconnectDelayMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 1) return RECONNECT_DELAYS_MS[0];
  const at = Math.min(Math.round(attempt), RECONNECT_DELAYS_MS.length) - 1;
  return RECONNECT_DELAYS_MS[at]!;
}

export interface CreateProviderOptions {
  kind: ProviderKind;
  httpUrl?: string;
  wsUrl?: string;
  /** Supplied by tests. Application code never sets it. */
  fetchImpl?: typeof fetch;
  socketFactory?: (url: string) => WebSocketLike;
  /**
   * Supplied by tests to make the per-call timeout instant rather than eight seconds.
   * Application code never sets it; a bundle that had this set would be lying about how
   * long it is willing to wait.
   */
  timeoutMs?: number;
}

export function createSimulationProvider(options: CreateProviderOptions): SimulationProvider {
  switch (options.kind) {
    case "http":
      return new HttpSimulationProvider(options);
    case "fixture":
      // Task 26: the fixture is behind an explicit dev-only flag. `isFixtureBuild()` is
      // `vite.config.ts`'s own `isDev`, and it is the check that decides whether the real
      // fixture code is in the bundle at all. Asking for it outside those two modes gets
      // a refusal rather than a module that was replaced at build time, which is the same
      // refusal with a better sentence.
      if (!isFixtureBuild()) {
        throw new SimulationUnavailableError(
          "Test data cannot be used outside a development build.",
          `createSimulationProvider asked for the fixture in build mode "${currentMode()}", which is not a fixture build.`,
          false,
        );
      }
      return createFixtureSimulationProvider();
    default: {
      // Exhaustive: adding a kind forces a decision here rather than a fallthrough.
      const never: never = options.kind;
      throw new SimulationUnavailableError(
        "The world simulation is not configured.",
        `Unknown simulation source: ${String(never)}`,
        false,
      );
    }
  }
}

export interface ClientConfig {
  simulationSource: ProviderKind;
  worldDataUrl: string;
  simulationHttpUrl: string;
  simulationWsUrl: string;
  quality: "high" | "low";
}

/**
 * Read configuration from the build-time environment.
 *
 * `VITE_SIMULATION_SOURCE` defaults to `http`, and it can only resolve to `fixture` in
 * a build mode that `vite.config.ts` also treats as a fixture build. The two lists are
 * the same two modes on purpose: the dev server, and the fixtures build the end-to-end
 * tests run against. Anywhere else the fixture is not in the bundle either, so asking
 * for it would only turn a clear refusal into a confusing one, and a production bundle
 * that somehow shipped `VITE_SIMULATION_SOURCE=fixture` would still read as live.
 */
export function readConfig(env: Record<string, string | boolean | undefined> = import.meta.env): ClientConfig {
  const raw = typeof env.VITE_SIMULATION_SOURCE === "string" ? env.VITE_SIMULATION_SOURCE : "";
  const quality = env.VITE_QUALITY === "low" ? "low" : "high";
  const wantsFixture = raw === "fixture" && isFixtureBuild();
  return {
    simulationSource: wantsFixture ? "fixture" : "http",
    worldDataUrl: typeof env.VITE_WORLD_DATA_URL === "string" ? env.VITE_WORLD_DATA_URL : "/world",
    simulationHttpUrl: readHttpUrl(env),
    simulationWsUrl: readWsUrl(env),
    quality,
  };
}

/** The same-origin path the simulation is reached on when nothing says otherwise. */
export const SAME_ORIGIN_API_PATH = "/api";

/**
 * Where the simulation's HTTP API lives.
 *
 * Three rules, in order:
 *
 *  1. A production build gets the same-origin `/api`. The bundle is served by whatever
 *     hosts the game, and the simulation sits behind that host's own routing, so there is
 *     no port to hard-code and no localhost string to ship. This is also why the default
 *     is not `http://127.0.0.1:8080` everywhere: a production bundle containing that
 *     would talk to the player's own machine.
 *  2. A development build defaults to the local simulation on port 8080, which is where
 *     Agent 2's server runs and is what `npm run dev` should just work against.
 *  3. Whatever the environment says is checked before it is used. A malformed URL is
 *     worse than no URL: it produces a request to nowhere with a plausible-looking path,
 *     and the failure reads as "the simulation is down" rather than "this build is
 *     misconfigured".
 */
function readHttpUrl(env: Record<string, string | boolean | undefined>): string {
  const raw = typeof env.VITE_SIMULATION_HTTP_URL === "string" ? env.VITE_SIMULATION_HTTP_URL.trim() : "";
  const fallback = isFixtureBuild() ? "http://127.0.0.1:8080" : SAME_ORIGIN_API_PATH;
  if (raw === "") return fallback;
  if (!isUsableHttpUrl(raw)) {
    console.warn(
      `[campaign-client] VITE_SIMULATION_HTTP_URL is not a usable http(s) URL (${JSON.stringify(raw)}). ` +
        `Falling back to ${fallback}. Set it to an absolute URL such as http://127.0.0.1:8080, ` +
        "or leave it unset to use the same-origin /api path.",
    );
    return fallback;
  }
  return raw.replace(/\/$/, "");
}

/**
 * The tick socket, derived from the HTTP URL when it is not set separately.
 *
 * A socket is not a fetch and cannot be same-origin-relative, so the ws:// form of the
 * HTTP URL is the right default: one variable configures both, and a player who pointed
 * the client at their own host does not also have to remember to move the socket.
 */
function readWsUrl(env: Record<string, string | boolean | undefined>): string {
  const raw = typeof env.VITE_SIMULATION_WS_URL === "string" ? env.VITE_SIMULATION_WS_URL.trim() : "";
  if (raw !== "") {
    if (isUsableWsUrl(raw)) return raw;
    console.warn(
      `[campaign-client] VITE_SIMULATION_WS_URL is not a usable ws(s):// URL (${JSON.stringify(raw)}). ` +
        "Falling back to the same host as VITE_SIMULATION_HTTP_URL.",
    );
  }
  return wsUrlFor(readHttpUrl(env));
}

/**
 * `http://host:port` -> `ws://host:port/ws`.
 *
 * `origin` is a parameter rather than a read of the global because this has to be
 * checkable: a WebSocket cannot be left relative, so the same-origin default has to be
 * resolved against something, and a test needs to say what that something is rather than
 * depending on where it runs. It defaults to the page's own origin.
 */
export function wsUrlFor(httpUrl: string, origin?: string): string {
  const base = httpUrl.replace(/\/$/, "");
  if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}/ws`;
  if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}/ws`;
  // A relative path such as `/api`, which is the production default. There is no scheme
  // to preserve, so the socket has to be built from the page's own origin.
  const from = origin ?? (typeof location === "undefined" ? "" : location.origin);
  return `${from.replace(/^http/, "ws")}${base}/ws`;
}

/**
 * Whether a string is a URL this client can actually fetch.
 *
 * `new URL` is the check rather than a regular expression, because it is the same parser
 * `fetch` will use. A regex that agreed with `new URL` on everything except the cases it
 * had not been told about would be worse than no check.
 */
function isUsableHttpUrl(raw: string): boolean {
  if (raw.startsWith("/")) return true; // Same-origin path, which the production default uses.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

function isUsableWsUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return parsed.protocol === "ws:" || parsed.protocol === "wss:";
}

function currentMode(): string {
  return typeof import.meta.env.MODE === "string" ? import.meta.env.MODE : "production";
}

/**
 * Whether this build keeps the real fixture, which is `vite.config.ts`'s own `isDev`.
 * Kept as the same two modes rather than a `PROD` check, because `vite build --mode
 * fixtures` is a real build the end-to-end suite needs, and `PROD` is true for it.
 */
function isFixtureBuild(): boolean {
  const mode = currentMode();
  return mode === "development" || mode === "fixtures";
}

export function providerFromConfig(config: ClientConfig): SimulationProvider {
  return createSimulationProvider({
    kind: config.simulationSource,
    httpUrl: config.simulationHttpUrl,
    wsUrl: config.simulationWsUrl,
  });
}

/**
 * Agent 2's API. Reads snapshots over HTTP, subscribes to tick updates over a
 * WebSocket, and writes player actions back over HTTP.
 *
 * Agent 2 has not landed, so these routes are a **proposal**, not an observation of
 * a running server. They are declared in this one class so that adopting the real
 * server is a change here and nowhere else. See `src/data/contractB.md`.
 */
export class HttpSimulationProvider implements SimulationProvider {
  readonly kind = "http" as const;
  readonly label = "Live simulation";

  readonly #httpUrl: string;
  readonly #wsUrl: string;
  readonly #fetch: typeof fetch;
  readonly #openSocket: (url: string) => WebSocketLike;
  readonly #timeoutMs: number;
  #socket: WebSocketLike | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #closed = false;
  #attempt = 0;

  constructor(options: CreateProviderOptions) {
    this.#httpUrl = (options.httpUrl ?? SAME_ORIGIN_API_PATH).replace(/\/$/, "");
    this.#wsUrl = options.wsUrl ?? wsUrlFor(this.#httpUrl);
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#openSocket = options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async getSnapshot(): Promise<SimSnapshot> {
    const url = `${this.#httpUrl}/v1/snapshot`;
    const body = await this.#getJson(url, "The world simulation is not answering. It may not be running.");
    return decodeSnapshot(body, url);
  }

  async trade(request: TradeRequest): Promise<TradeResult> {
    requireRequest(tradeRequestProblem(request), "trade order", "The trade could not be written down.");
    return this.#post<TradeResult>("/v1/trade", request, "The trade did not go through.", tradeResultProblem);
  }

  async recruit(request: RecruitRequest): Promise<RecruitResult> {
    requireRequest(recruitRequestProblem(request), "hire order", "The hire could not be written down.");
    return this.#post<RecruitResult>("/v1/recruit", request, "The hire did not go through.", recruitResultProblem);
  }

  async talkToNotable(settlementId: string, notableId: string): Promise<TalkToNotableResult> {
    return this.#post<TalkToNotableResult>(
      "/v1/notables/talk",
      { settlementId, notableId },
      "They would not see you.",
      talkResultProblem,
    );
  }

  async improveRelation(request: ImproveRelationRequest): Promise<ImproveRelationResult> {
    requireRequest(improveRelationRequestProblem(request), "gesture", "That gesture could not be written down.");
    return this.#post<ImproveRelationResult>(
      "/v1/notables/relation",
      request,
      "The gesture fell flat.",
      improveRelationResultProblem,
    );
  }

  /**
   * Ask the simulation to run at a given speed, and wait for the answer.
   *
   * This used to be fire-and-forget, which meant a refused speed change left the dial
   * showing a clock the simulation was not running. Now the call resolves with the
   * server's verdict, and `accepted: false` becomes an error the caller has to handle —
   * `main.ts` puts the dial back where it was and says why.
   */
  async setTimeScale(daysPerRealSecond: number): Promise<TimeScaleResult> {
    if (!Number.isFinite(daysPerRealSecond) || daysPerRealSecond < 0) {
      throw new SimulationUnavailableError(
        "The clock can only run forwards or stop.",
        `setTimeScale(${daysPerRealSecond}) is not a speed.`,
        false,
      );
    }
    const result = await this.#post<TimeScaleResult>(
      "/v1/time-scale",
      { daysPerRealSecond },
      "The clock did not change speed.",
      timeScaleProblem,
    );
    if (!result.accepted) {
      throw new SimulationUnavailableError(
        result.reason ?? "The simulation would not change speed.",
        `POST /v1/time-scale -> refused ${daysPerRealSecond}: ${result.reason ?? "no reason given"}`,
        false,
      );
    }
    return result;
  }

  async skipToArrival(): Promise<{ daysAdvanced: number }> {
    return this.#post<{ daysAdvanced: number }>(
      "/v1/skip-to-arrival",
      {},
      "The clock did not skip.",
      skipToArrivalProblem,
    );
  }

  setEthnicity(ethnicityId: string): void {
    void this.#post<{ accepted: true }>("/v1/ethnicity", { ethnicityId }, "The heritage did not take.");
  }

  setCharacter(character: PlayerCharacter): void {
    void this.#post<{ accepted: true }>("/v1/character", character, "The character did not take.");
  }

  async awardBattleXp(input: BattleXpInput): Promise<BattleXpAward[]> {
    return this.#post<BattleXpAward[]>("/v1/troops/battle-xp", input, "The XP did not land.", battleXpProblem);
  }

  async upgradeTroops(request: UpgradeTroopsRequest): Promise<UpgradeTroopsResult> {
    requireRequest(upgradeRequestProblem(request), "promotion order", "The promotion could not be written down.");
    return this.#post<UpgradeTroopsResult>(
      "/v1/troops/upgrade",
      request,
      "The promotion did not go through.",
      upgradeResultProblem,
    );
  }

  async setTaxRate(townId: string, rate: number): Promise<TaxOrderResult> {
    return this.#post<TaxOrderResult>("/v1/town/tax", { townId, rate }, TAX_CONFLICT, taxResultProblem, TAX_CONFLICT);
  }

  async setStateTaxRate(state: string, rate: number): Promise<TaxOrderResult> {
    return this.#post<TaxOrderResult>("/v1/state/tax", { state, rate }, TAX_CONFLICT, taxResultProblem, TAX_CONFLICT);
  }

  async startConstruction(townId: string, buildingId: string): Promise<ConstructionResult> {
    return this.#post<ConstructionResult>(
      "/v1/town/construct",
      { townId, buildingId },
      "The construction order did not go through.",
      constructionResultProblem,
    );
  }

  /**
   * Price a march: the polyline the planner draws on the map, when it arrives, and what
   * it will cost. Nothing is drawn from this reply without a validated route, because the
   * map reads `route[i].x` directly.
   */
  async planMarch(request: MarchRequest): Promise<MarchPlan> {
    return this.#post<MarchPlan>("/v1/march/plan", request, "The march could not be planned.", marchPlanProblem);
  }

  /**
   * Give the march order, and wait for the simulation to say it took.
   *
   * Resolving with `void` was the bug this fixes: the panel could not tell an accepted
   * march from one that never arrived, so a refused order left the party drawn as though
   * it were on the road. The march id is returned because it is the record the cause
   * chain can be walked from later.
   */
  async commitMarch(request: MarchRequest): Promise<MarchCommitResult> {
    return this.#post<MarchCommitResult>(
      "/v1/march/commit",
      request,
      "The order to march was not accepted.",
      marchCommitProblem,
    );
  }

  async why(entityId: string, field: string): Promise<WhyChain> {
    const url = `${this.#httpUrl}/v1/why?entity=${encodeURIComponent(entityId)}&field=${encodeURIComponent(field)}`;
    const body = await this.#getJson(url, "The reason behind that change could not be read.");
    return decodeWhyChain(body, url);
  }

  /**
   * One GET, bounded in time, with every failure turned into a `SimulationUnavailableError`.
   *
   * The abort is the point of this method. `fetch` against a server that has accepted the
   * connection and then stopped writing will hang for as long as the socket lives, which
   * on a laptop is long enough for the player to conclude the game has frozen and reload.
   * Eight seconds is longer than any of these endpoints has ever legitimately taken, so
   * hitting it means something is wrong, and the retry affordance is the honest response.
   */
  async #getJson(url: string, playerMessage: string): Promise<unknown> {
    let response: Response;
    const call = this.#fetch(url, {
      headers: { accept: "application/json" },
      signal: this.#newTimeoutSignal(url),
    });
    try {
      response = await call;
    } catch (err) {
      throw this.#transportError(playerMessage, `GET ${url} threw`, err);
    }
    if (!response.ok) {
      throw new SimulationUnavailableError(playerMessage, `GET ${url} -> HTTP ${response.status} ${response.statusText}`);
    }
    try {
      return await response.json();
    } catch (err) {
      throw new SimulationUnavailableError(
        "The world simulation sent something this client cannot read.",
        `JSON.parse of ${url} threw: ${String(err)}`,
      );
    }
  }

  /**
   * One POST, bounded in time.
   *
   * `check` is the endpoint's own validator rather than one shared cast, because each of
   * these replies is read field by field by a different panel and the panels are what
   * break when a field is missing. `conflictMessage` is what the player is told when the
   * simulation answers 409, which is per-endpoint too: a tax conflict means the ruler
   * moved first, which is a different fact from a stale-day conflict on a march.
   */
  async #post<T>(
    path: string,
    body: unknown,
    playerMessage: string,
    check?: (raw: unknown) => string | null,
    conflictMessage?: string,
  ): Promise<T> {
    const url = `${this.#httpUrl}${path}`;
    let response: Response;
    const call = this.#fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: this.#newTimeoutSignal(url),
    });
    try {
      response = await call;
    } catch (err) {
      throw this.#transportError(playerMessage, `POST ${url} threw`, err);
    }
    if (response.status === 409) {
      // The simulation is the authority on its own state. A conflict is a real
      // answer with a reason the player should see, not a transport failure.
      let reason: string | undefined;
      let whyUnreadable = "";
      try {
        reason = ((await response.json()) as { reason?: string }).reason;
      } catch (err) {
        // A 409 with an unreadable body. The message below covers the player either
        // way, and the reason the body could not be read is recorded rather than
        // dropped, because CONSTITUTION.md section 1.3 forbids an empty catch.
        whyUnreadable = ` and the reason in the reply could not be read (${String(err)})`;
      }
      throw new SimulationUnavailableError(
        reason ?? conflictMessage ?? "The world moved on before that order arrived.",
        `POST ${url} -> HTTP 409${whyUnreadable}`,
        false,
      );
    }
    if (!response.ok) {
      throw new SimulationUnavailableError(playerMessage, `POST ${url} -> HTTP ${response.status}`);
    }
    let reply: unknown;
    try {
      reply = await response.json();
    } catch (err) {
      throw new SimulationUnavailableError(
        "The world simulation accepted that order but sent nothing this client can read.",
        `JSON.parse of the reply to POST ${url} threw: ${String(err)}`,
      );
    }
    if (check) {
      const problem = check(reply);
      if (problem) {
        throw new SimulationUnavailableError(
          "The world simulation accepted that order but sent an answer this client cannot read.",
          `POST ${url} returned a reply that failed validation: ${problem}`,
          false,
        );
      }
    }
    return reply as T;
  }

  /**
   * An abort signal that fires after the per-call timeout.
   *
   * The timer is attached to the signal itself and cleared by its own abort handler, so a
   * fast reply does not leave a timer running for the eight seconds it would otherwise
   * have kept the event loop alive. Nothing is cleared here on purpose: `AbortSignal`
   * has no `dispose`, and the timer is the cheapest possible thing to let expire.
   */
  #newTimeoutSignal(url: string): AbortSignal {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`no answer from ${url} within ${this.#timeoutMs}ms`));
    }, this.#timeoutMs);
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    return controller.signal;
  }

  /**
   * Turn a transport failure into something the player can read.
   *
   * An abort is separated from every other transport failure because it means something
   * different to the player: not "the simulation is not answering" but "it stopped
   * answering". Both are retryable, so both offer the retry affordance, but the sentence
   * says which one happened so nobody sits waiting on a server that has already gone.
   */
  #transportError(playerMessage: string, what: string, err: unknown): SimulationUnavailableError {
    const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    if (aborted) {
      return new SimulationUnavailableError(
        "The world simulation stopped answering part-way through. That usually clears on its own.",
        `${what}: the call was aborted after ${this.#timeoutMs}ms with no reply (${String(err)})`,
      );
    }
    return new SimulationUnavailableError(playerMessage, `${what}: ${String(err)}`);
  }

  /**
   * Tick updates, with a bounded reconnect. CONSTITUTION.md section 1.3 forbids a
   * silent fallback, so every failure reports its reason through `onStatus` rather
   * than being swallowed.
   */
  subscribeTicks(onTick: (tick: TickUpdate) => void, onStatus: (status: ConnectionStatus) => void): () => void {
    this.#closed = false;
    const connect = (): void => {
      if (this.#closed) return;
      let socket: WebSocketLike;
      try {
        socket = this.#openSocket(this.#wsUrl);
      } catch (err) {
        onStatus({ state: "reconnecting", detail: String(err), attempt: ++this.#attempt });
        this.#scheduleReconnect(connect);
        return;
      }
      this.#socket = socket;

      socket.onopen = () => {
        this.#attempt = 0;
        onStatus({ state: "connected", detail: "", attempt: 0 });
        socket.send(JSON.stringify({ type: "subscribe", channel: "ticks" }));
      };
      socket.onmessage = (ev) => {
        let frame: unknown;
        try {
          frame = JSON.parse(String(ev.data));
        } catch (err) {
          // A malformed frame is reported and skipped. Dropping the connection would
          // punish the player for a server-side formatting slip.
          onStatus({
            state: "degraded",
            detail: `discarded an unreadable tick frame: ${String(err)}`,
            attempt: this.#attempt,
          });
          return;
        }
        this.#onFrame(onTick, onStatus, frame);
      };
      socket.onerror = (ev) => onStatus({ state: "reconnecting", detail: String(ev), attempt: this.#attempt + 1 });
      socket.onclose = (ev) => {
        if (this.#closed) return;
        onStatus({ state: "reconnecting", detail: String(ev), attempt: ++this.#attempt });
        this.#scheduleReconnect(connect);
      };
    };

    connect();
    return () => {
      this.#closed = true;
      if (this.#retry !== null) clearTimeout(this.#retry);
      this.#retry = null;
      this.#socket?.close();
      this.#socket = null;
    };
  }

  #scheduleReconnect(connect: () => void): void {
    if (this.#closed) return;
    this.#retry = setTimeout(connect, reconnectDelayMs(this.#attempt));
  }

  /**
   * Tick frames get the same treatment as the snapshot, minus the hard stop: a frame
   * that does not match is reported as degraded and skipped rather than thrown,
   * because one bad frame should not cost the player the rest of the campaign. The
   * channel is the one place where a silent skip is defensible, and it is not silent.
   */
  #onFrame(onTick: (tick: TickUpdate) => void, onStatus: (status: ConnectionStatus) => void, raw: unknown): void {
    const problem = tickFrameProblem(raw);
    if (problem) {
      onStatus({ state: "degraded", detail: `discarded an unreadable tick frame: ${problem}`, attempt: this.#attempt });
      return;
    }
    onTick(raw as TickUpdate);
  }
}

// -- payload validation ------------------------------------------------------
//
// CONSTITUTION.md section 1.3: every external call is untrusted. A bare
// `await response.json() as SimSnapshot` is an unchecked promise to the rest of the
// client that the server sent exactly the shape it was asked for, and the failure mode
// when that is not true is a blank panel or a `NaN` in the top bar. So each payload is
// checked at the boundary and refused with a sentence the player can read.
//
// This mirrors `validateRegion` / `validateSettlements` / `validateNetwork` in
// `src/world/load.ts`, deliberately: one house pattern for untrusted payloads, not two.

/**
 * A request the client built and found malformed.
 *
 * Non-retryable by construction: the same object will fail the same way every time, so
 * offering a retry would be offering a button that cannot work.
 */
function requireRequest(problem: string | null, what: string, playerMessage: string): void {
  if (!problem) return;
  throw new SimulationUnavailableError(playerMessage, `The ${what} is not a shape this client can send: ${problem}`, false);
}

function decodeSnapshot(raw: unknown, url: string): SimSnapshot {
  // The version is checked first and on its own. A payload from a newer simulation is
  // missing fields this client has never heard of, so field-checking it produces a list
  // of complaints about a perfectly good snapshot; the honest answer to a world built for
  // a later client is that this client is too old for it.
  const versionProblem = schemaVersionProblem(raw);
  if (versionProblem) {
    const tooNew = versionProblem === "too new";
    const sent = (raw as { schemaVersion?: unknown }).schemaVersion;
    throw new SimulationUnavailableError(
      tooNew
        ? "This world is newer than this version of the game. Update the game to keep playing this campaign."
        : "This world was saved by an older version of the simulation. The data predates what this build can read.",
      `GET ${url} returned a snapshot at schema version ${String(sent)}, which is ${versionProblem}. ` +
        `This client reads ${SNAPSHOT_SCHEMA_MIN} to ${SNAPSHOT_SCHEMA_MAX}.`,
      false,
    );
  }
  const problem = snapshotProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "The world simulation sent a report this client cannot read, so nothing has been drawn from it.",
      `GET ${url} returned a snapshot that failed validation: ${problem}`,
      false,
    );
  }
  return raw as SimSnapshot;
}

/**
 * A cause chain, trimmed to what a reader can follow.
 *
 * The cap lives here rather than in the panel so that it is one number the whole client
 * shares and no panel can forget to apply. The newest rows are kept and the oldest
 * dropped: a cause chain reads backwards from the effect, so the row nearest the player
 * is the first one and the far end is the oldest history — which is the part that can be
 * summarized without losing the answer.
 *
 * The cut leaves the deepest kept row pointing at causes the client no longer holds. That
 * is deliberate rather than tidied away: pruning the dangling row instead would cascade
 * up the whole chain and empty it, and quietly dropping its causes would be precisely the
 * silent edit this project exists to refuse. So the chain is cut, `droppedEdges` counts
 * what went, and the panel prints an "older history dropped" note at the cut.
 */
function decodeWhyChain(raw: unknown, url: string): WhyChain {
  const problem = whyChainProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "The reason behind that change could not be read.",
      `GET ${url} returned a cause chain that failed validation: ${problem}`,
      false,
    );
  }
  const chain = raw as WhyChain;
  const held = chain.rows.length;
  if (held <= WHY_MAX_EDGES) {
    return { ...chain, droppedEdges: 0 };
  }
  return {
    ...chain,
    rows: chain.rows.slice(0, WHY_MAX_EDGES),
    truncated: true,
    droppedEdges: held - WHY_MAX_EDGES,
  };
}
