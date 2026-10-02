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
  BarterProposal,
  BarterProposalRequest,
  BarterResult,
  BarterTerms,
  ConnectionStatus,
  IssueAction,
  IssueActionRequest,
  IssueActionResult,
  IssueBoard,
  IssueKind,
  IssueState,
  MarchPlan,
  MarchRequest,
  RecruitRequest,
  RecruitResult,
  Rumour,
  RumourGood,
  SimSnapshot,
  SimulationProvider,
  TickUpdate,
  TradeRequest,
  TradeResult,
  WhyChain,
} from "./types.js";
import { createFixtureSimulationProvider } from "./fixture/index.js";

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

export interface CreateProviderOptions {
  kind: ProviderKind;
  httpUrl?: string;
  wsUrl?: string;
  /** Supplied by tests. Application code never sets it. */
  fetchImpl?: typeof fetch;
  socketFactory?: (url: string) => WebSocketLike;
}

export function createSimulationProvider(options: CreateProviderOptions): SimulationProvider {
  switch (options.kind) {
    case "http":
      return new HttpSimulationProvider(options);
    case "fixture":
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
    simulationHttpUrl:
      typeof env.VITE_SIMULATION_HTTP_URL === "string" ? env.VITE_SIMULATION_HTTP_URL : "http://127.0.0.1:8080",
    simulationWsUrl:
      typeof env.VITE_SIMULATION_WS_URL === "string" ? env.VITE_SIMULATION_WS_URL : "ws://127.0.0.1:8080/ws",
    quality,
  };
}

/**
 * Whether this build keeps the real fixture, which is `vite.config.ts`'s own `isDev`.
 * Kept as the same two modes rather than a `PROD` check, because `vite build --mode
 * fixtures` is a real build the end-to-end suite needs, and `PROD` is true for it.
 */
function isFixtureBuild(): boolean {
  const mode = typeof import.meta.env.MODE === "string" ? import.meta.env.MODE : "production";
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
  #socket: WebSocketLike | null = null;
  #retry: ReturnType<typeof setTimeout> | null = null;
  #closed = false;
  #attempt = 0;

  constructor(options: CreateProviderOptions) {
    this.#httpUrl = (options.httpUrl ?? "http://127.0.0.1:8080").replace(/\/$/, "");
    this.#wsUrl = options.wsUrl ?? "ws://127.0.0.1:8080/ws";
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#openSocket = options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
  }

  async getSnapshot(): Promise<SimSnapshot> {
    const url = `${this.#httpUrl}/v1/snapshot`;
    const body = await this.#getJson(url, "The world simulation is not answering. It may not be running.");
    return decodeSnapshot(body, url);
  }

  async trade(request: TradeRequest): Promise<TradeResult> {
    return this.#post<TradeResult>("/v1/trade", request, "The trade did not go through.");
  }

  async recruit(request: RecruitRequest): Promise<RecruitResult> {
    return this.#post<RecruitResult>("/v1/recruit", request, "The hire did not go through.");
  }

  async barterTerms(traderId: string, townId: string): Promise<BarterTerms> {
    const query = `?trader=${encodeURIComponent(traderId)}&town=${encodeURIComponent(townId)}`;
    const url = `${this.#httpUrl}/v1/barter/terms${query}`;
    const body = await this.#getJson(url, "Neither table for this trader could be read.");
    return decodeBarterTerms(body, url);
  }

  async proposeBarter(request: BarterProposalRequest): Promise<BarterProposal> {
    const url = `${this.#httpUrl}/v1/barter/propose`;
    return decodeBarterProposal(await this.#post<unknown>(url, request, "The trader did not answer."), url);
  }

  async commitBarter(request: BarterProposalRequest): Promise<BarterResult> {
    const url = `${this.#httpUrl}/v1/barter/commit`;
    return decodeBarterResult(await this.#post<unknown>(url, request, "The deal did not go through."), url);
  }

  async issueBoard(partyId: string): Promise<IssueBoard> {
    const url = `${this.#httpUrl}/v1/issues?party=${encodeURIComponent(partyId)}`;
    const body = await this.#getJson(url, "This party's quest log could not be read.");
    return decodeIssueBoard(body, url);
  }

  async acceptIssue(request: IssueActionRequest): Promise<IssueActionResult> {
    const url = `${this.#httpUrl}/v1/issues/accept`;
    return decodeIssueAction(await this.#post<unknown>(url, request, "The request was not taken up."), url);
  }

  async completeIssue(request: IssueActionRequest): Promise<IssueActionResult> {
    const url = `${this.#httpUrl}/v1/issues/complete`;
    return decodeIssueAction(await this.#post<unknown>(url, request, "The request was not closed."), url);
  }

  async abandonIssue(request: IssueActionRequest): Promise<IssueActionResult> {
    const url = `${this.#httpUrl}/v1/issues/abandon`;
    return decodeIssueAction(await this.#post<unknown>(url, request, "The request was not given up."), url);
  }

  async rumours(): Promise<Rumour[]> {
    const url = `${this.#httpUrl}/v1/rumours`;
    return decodeRumours(await this.#getJson(url, "The trade rumours could not be read."), url);
  }

  setTimeScale(daysPerRealSecond: number): void {
    void this.#post<{ accepted: true }>("/v1/time-scale", { daysPerRealSecond }, "The clock did not change speed.");
  }

  async skipToArrival(): Promise<{ daysAdvanced: number }> {
    return this.#post<{ daysAdvanced: number }>("/v1/skip-to-arrival", {}, "The clock did not skip.");
  }

  async planMarch(request: MarchRequest): Promise<MarchPlan> {
    return this.#post<MarchPlan>("/v1/march/plan", request, "The march could not be planned.");
  }

  async commitMarch(request: MarchRequest): Promise<void> {
    await this.#post<{ accepted: true }>("/v1/march/commit", request, "The order to march was not accepted.");
  }

  async why(entityId: string, field: string): Promise<WhyChain> {
    const url = `${this.#httpUrl}/v1/why?entity=${encodeURIComponent(entityId)}&field=${encodeURIComponent(field)}`;
    const body = await this.#getJson(url, "The reason behind that change could not be read.");
    return decodeWhyChain(body, url);
  }

  /** One GET, with every failure turned into a `SimulationUnavailableError`. */
  async #getJson(url: string, playerMessage: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new SimulationUnavailableError(playerMessage, `GET ${url} threw: ${String(err)}`);
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

  async #post<T>(path: string, body: unknown, playerMessage: string): Promise<T> {
    const url = `${this.#httpUrl}${path}`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new SimulationUnavailableError(playerMessage, `POST ${url} threw: ${String(err)}`);
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
        reason ?? "The world moved on before that order arrived.",
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
    return reply as T;
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
    // 1s, 2s, 4s, 8s, 16s, then hold at 30s. Bounded, so a dead server neither logs
    // without limit nor takes long to pick back up.
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.#attempt, 5));
    this.#retry = setTimeout(connect, delay);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * The fog block, when there is one.
 *
 * Optional, and validated only when present, because a simulation that publishes no fog
 * is a simulation this client can still play: the block is refused for being unreadable
 * rather than for being absent. Every list is checked for being a list of ids, because
 * the map indexes them as sets and a single non-string in one of them would otherwise
 * become a `Set` entry no town id could ever match — which reads as "every town is
 * unseen" and blanks the map.
 *
 * `sideId` is deliberately allowed to be null, and the three counts with it: the server
 * sends nulls for all four when it has no player to state visibility from, and that is a
 * real state with a real meaning rather than a broken payload.
 */
function fogProblem(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (!isRecord(raw)) return "fog is not a JSON object";
  if (raw.sideId !== null && !isString(raw.sideId)) return "fog.sideId is neither a side id nor null";
  for (const key of ["sightRadiusKm", "sightRadiusLeagues", "sightingMemoryDays"] as const) {
    if (!isFiniteNumber(raw[key])) return `fog.${key} is not a number`;
  }
  for (const key of ["visibleTowns", "knownTowns", "unseenTowns"] as const) {
    if (!Array.isArray(raw[key])) return `fog.${key} is not a list`;
    for (const [index, id] of raw[key].entries()) {
      if (!isString(id)) return `fog.${key} entry ${index} is not a town id`;
    }
  }
  if (!isRecord(raw.counts)) return "fog.counts is not a JSON object";
  for (const key of ["visible", "known", "unseen"]) {
    // Nullable by design: with no vantage point the count is unknown, not zero.
    if (raw.counts[key] !== null && !isFiniteNumber(raw.counts[key])) {
      return `fog.counts.${key} is neither a number nor null`;
    }
  }
  if (!isFiniteNumber(raw.counts.total)) return "fog.counts.total is not a number";
  // `tick` and `lastSeen` are what turn a remembered town into an age. Checked when
  // present and refused when unreadable, because a half-read age is worse than none: a
  // `lastSeen` entry that is not a number compares as NaN, which is neither "now" nor
  // "never", and would land a town in whichever band the code happened to write first.
  if (raw.tick !== undefined && raw.tick !== null && !isFiniteNumber(raw.tick)) {
    return "fog.tick is neither a number nor null";
  }
  if (raw.lastSeen !== undefined) {
    if (!isRecord(raw.lastSeen)) return "fog.lastSeen is not an object";
    for (const [id, tick] of Object.entries(raw.lastSeen)) {
      if (!isFiniteNumber(tick)) return `fog.lastSeen.${id} is not a tick`;
    }
  }
  return null;
}

/** The first thing wrong with a payload, as a developer-readable sentence. */
function snapshotProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  if (!isFiniteNumber(raw.year)) return "year is not a number";
  if (raw.eraTier !== 1 && raw.eraTier !== 2 && raw.eraTier !== 3 && raw.eraTier !== 4) {
    return "eraTier is not one of 1, 2, 3 or 4";
  }
  if (!isRecord(raw.player)) return "player is missing";
  if (!isString(raw.player.characterName)) return "player.characterName is missing";
  if (!isRecord(raw.player.resources)) return "player.resources is missing";
  for (const id of ["money", "gold", "food", "metal", "medicine"]) {
    if (!isFiniteNumber(raw.player.resources[id])) return `player.resources.${id} is not a number`;
  }
  if (!isRecord(raw.party)) return "party is missing";
  if (!Array.isArray(raw.party.troops)) return "party.troops is not a list";
  if (!isFiniteNumber(raw.party.morale)) return "party.morale is not a number";
  if (!isRecord(raw.ledger)) return "ledger is missing";
  if (!isRecord(raw.ledger.netPerDay)) return "ledger.netPerDay is missing";
  for (const key of ["towns", "villages", "sides", "rulers", "warnings", "notifications"]) {
    if (!Array.isArray(raw[key])) return `${key} is not a list`;
  }
  for (const key of ["markets", "causeLog"]) {
    if (!isRecord(raw[key])) return `${key} is not a table`;
  }
  const fog = fogProblem(raw.fog);
  if (fog) return fog;
  return null;
}

function whyChainProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.entityId)) return "entityId is missing";
  if (!Array.isArray(raw.rows)) return "rows is not a list";
  if (!Array.isArray(raw.related)) return "related is not a list";
  for (const [index, row] of raw.rows.entries()) {
    if (!isRecord(row)) return `row ${index} is not a JSON object`;
    if (!isString(row.id)) return `row ${index} has no id`;
    if (!isFiniteNumber(row.tick)) return `row ${index} has no tick`;
    if (!isFiniteNumber(row.old) || !isFiniteNumber(row.new)) return `row ${index} has no before or after figure`;
    if (!Array.isArray(row.causedBy)) return `row ${index} has no cause list`;
  }
  return null;
}

/**
 * A barter table is only usable if every line carries a kind, an id, a count and a
 * value, because the panel draws all four and does arithmetic on the last two. A table
 * with a missing `unitValue` would show an empty column and a total of zero, which
 * reads as "nothing is worth anything here" rather than as "the server sent a table this
 * client cannot read".
 */
function barterItemsProblem(raw: unknown, where: string): string | null {
  if (!Array.isArray(raw)) return `${where} is not a list`;
  for (const [index, item] of raw.entries()) {
    if (!isRecord(item)) return `${where} line ${index} is not a JSON object`;
    if (item.kind !== "good" && item.kind !== "gold" && item.kind !== "prisoner") {
      return `${where} line ${index} has an unknown kind`;
    }
    if (!isString(item.itemId)) return `${where} line ${index} has no itemId`;
    if (!isString(item.name)) return `${where} line ${index} has no name`;
    if (!isFiniteNumber(item.available)) return `${where} line ${index} has no count`;
    if (!isFiniteNumber(item.unitValue)) return `${where} line ${index} has no value`;
  }
  return null;
}

function barterTermsProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.townId)) return "townId is missing";
  if (!isString(raw.traderId)) return "traderId is missing";
  if (!isString(raw.traderName)) return "traderName is missing";
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  if (!isFiniteNumber(raw.relationToPlayer)) return "relationToPlayer is not a number";
  return barterItemsProblem(raw.traderItems, "traderItems") ?? barterItemsProblem(raw.playerItems, "playerItems");
}

function barterProposalProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (typeof raw.accepted !== "boolean") return "accepted is not a boolean";
  if (!isFiniteNumber(raw.playerValue)) return "playerValue is not a number";
  if (!isFiniteNumber(raw.traderValue)) return "traderValue is not a number";
  if (!isString(raw.verdict)) return "verdict is missing";
  return null;
}

function barterResultProblem(raw: unknown): string | null {
  const problem = barterProposalProblem(raw);
  if (problem) return problem;
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  if (!isFiniteNumber(raw.playerMoney)) return "playerMoney is not a number";
  if (!isFiniteNumber(raw.traderMoney)) return "traderMoney is not a number";
  return (
    barterItemsProblem(raw.playerItems, "playerItems") ?? barterItemsProblem(raw.traderItems, "traderItems")
  );
}

/**
 * The three issue kinds and the four states, as the simulation names them.
 *
 * Checked as closed sets rather than free strings because the quest panel branches on both:
 * an unknown kind would have no requirement sentence to draw and an unknown state would have
 * no buttons, and in both cases the panel would draw a live-looking row with nothing behind
 * it. A row the client cannot classify is refused at the boundary instead.
 */
const ISSUE_KINDS: readonly IssueKind[] = ["deliver-goods", "clear-hideout", "escort"];
const ISSUE_STATES: readonly IssueState[] = ["offered", "accepted", "succeeded", "failed"];

function issueRewardProblem(raw: unknown, where: string): string | null {
  if (!isRecord(raw)) return `${where} is missing`;
  for (const key of ["money", "gold", "renown", "relation"]) {
    if (!isFiniteNumber(raw[key])) return `${where}.${key} is not a number`;
  }
  return null;
}

/**
 * A notable is only usable if it names a person and a settlement, because the panel prints
 * both and the reward scale reads the power. `relationToPlayer` and `grievance` are read as
 * numbers rather than ranges here on purpose: they are the simulation's own figures and
 * clamping them would mean the client had an opinion about what they ought to be.
 */
function notableProblem(raw: unknown, where: string): string | null {
  if (!isRecord(raw)) return `${where} is not a JSON object`;
  if (!isString(raw.id)) return `${where} has no id`;
  if (!isString(raw.name)) return `${where} has no name`;
  if (!isString(raw.role)) return `${where} has no role`;
  if (!isString(raw.settlementId)) return `${where} has no settlement`;
  if (!isString(raw.settlementName)) return `${where} has no settlement name`;
  if (!isFiniteNumber(raw.power)) return `${where}.power is not a number`;
  if (!isFiniteNumber(raw.relationToPlayer)) return `${where}.relationToPlayer is not a number`;
  if (!isFiniteNumber(raw.openIssues)) return `${where}.openIssues is not a number`;
  if (!isFiniteNumber(raw.grievance)) return `${where}.grievance is not a number`;
  return null;
}

/**
 * The requirement is checked for its sentence and its amount rather than for a shape the
 * client would then have to interpret. `targetName` and `baseline` are nullable in the
 * interface because the simulation genuinely has no second settlement or no baseline for
 * some objectives, and inventing one would be the client guessing at the sim's objective.
 */
function issueRequirementProblem(raw: unknown, where: string): string | null {
  if (!isRecord(raw)) return `${where} is not a JSON object`;
  if (!isString(raw.text)) return `${where}.text is missing`;
  if (raw.targetName !== null && typeof raw.targetName !== "string") return `${where}.targetName is neither a string nor null`;
  if (!isFiniteNumber(raw.amount)) return `${where}.amount is not a number`;
  if (raw.baseline !== null && !isFiniteNumber(raw.baseline)) return `${where}.baseline is neither a number nor null`;
  if (!isString(raw.unit)) return `${where}.unit is missing`;
  if (typeof raw.met !== "boolean") return `${where}.met is not a boolean`;
  return null;
}

/**
 * One issue is only drawable if its state, kind, author, requirement and reward are all
 * present, because those five are the whole row: the buttons come off `state`, the
 * sentence off `requirement`, the promise off `reward`, and the "who asked" line off
 * `notable`.
 *
 * `progress` is checked for finiteness but not for range. The simulation clamps it and a
 * reading of 1.0004 from a future version should be shown, not refused.
 */
function issueProblem(raw: unknown, where: string): string | null {
  if (!isRecord(raw)) return `${where} is not a JSON object`;
  if (!isString(raw.id)) return `${where} has no id`;
  if (!ISSUE_KINDS.includes(raw.kind as IssueKind)) return `${where}.kind is not one the simulation generates`;
  if (!ISSUE_STATES.includes(raw.state as IssueState)) return `${where}.state is not one of the four states`;
  const notable = notableProblem(raw.notable, `${where}.notable`);
  if (notable) return notable;
  if (!isString(raw.settlementId)) return `${where} has no settlement id`;
  if (!isString(raw.settlementName)) return `${where} has no settlement name`;
  const requirement = issueRequirementProblem(raw.requirement, `${where}.requirement`);
  if (requirement) return requirement;
  if (!isFiniteNumber(raw.progress)) return `${where}.progress is not a number`;
  if (!isFiniteNumber(raw.deadlineDay)) return `${where}.deadlineDay is not a number`;
  if (!isFiniteNumber(raw.deadlineDays)) return `${where}.deadlineDays is not a number`;
  if (raw.startedDay !== null && !isFiniteNumber(raw.startedDay)) return `${where}.startedDay is neither a number nor null`;
  const reward = issueRewardProblem(raw.reward, `${where}.reward`);
  if (reward) return reward;
  if (!isFiniteNumber(raw.abandonPenalty)) return `${where}.abandonPenalty is not a number`;
  if (!Array.isArray(raw.steps)) return `${where}.steps is not a list`;
  for (const [index, step] of raw.steps.entries()) {
    if (!isRecord(step)) return `${where}.step ${index} is not a JSON object`;
    if (!isFiniteNumber(step.day)) return `${where}.step ${index} has no day`;
    if (!isString(step.text)) return `${where}.step ${index} has no text`;
    if (!ISSUE_STATES.includes(step.state as IssueState)) return `${where}.step ${index} has an unknown state`;
  }
  return null;
}

function issueBoardProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.partyId)) return "partyId is missing";
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  if (!Array.isArray(raw.issues)) return "issues is not a list";
  for (const [index, issue] of raw.issues.entries()) {
    const problem = issueProblem(issue, `issue ${index}`);
    if (problem) return problem;
  }
  return null;
}

/**
 * One decoder for all three actions, because an accept, a completion and a walk-away all
 * answer in the same shape: a verdict, maybe a reason, and the issue as the simulation now
 * holds it. `paid` is checked only when it is present, since only a settled issue pays.
 */
function issueActionProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.issueId)) return "issueId is missing";
  if (raw.action !== "accept" && raw.action !== "complete" && raw.action !== "abandon") {
    return "action is not one of accept, complete or abandon";
  }
  if (typeof raw.accepted !== "boolean") return "accepted is not a boolean";
  if (!isString(raw.verdict)) return "verdict is missing";
  if (raw.reason !== undefined && typeof raw.reason !== "string") return "reason is neither a string nor absent";
  if (raw.paid !== undefined) {
    const problem = issueRewardProblem(raw.paid, "paid");
    if (problem) return problem;
  }
  return issueProblem(raw.issue, "issue");
}

/** The three goods the rumour generator scans, in the simulation's own keys. */
const RUMOUR_GOODS: readonly RumourGood[] = ["food", "medicine", "metal"];

/**
 * This client's spelling of each field the feed carries.
 *
 * Written out rather than derived by lowercasing the first letter, because `BuyTownID`
 * does not become `buyTownID` that way: Go's `ID` is an initialism and a JSON tag written
 * by hand would be `buyTownId`, which is what `Rumour` in `types.ts` is called.
 */
const RUMOUR_CAMEL: Record<string, string> = {
  Good: "good",
  BuyTown: "buyTown",
  BuyTownID: "buyTownId",
  BuyPrice: "buyPrice",
  SellTown: "sellTown",
  SellTownID: "sellTownId",
  SellPrice: "sellPrice",
  Margin: "margin",
  Text: "text",
};

/**
 * One field of a rumour, read under either spelling of its name.
 *
 * The server marshals a Go struct that carries no JSON tags, so the keys on the wire are
 * the Go field names. A tag added to that struct would change the case and nothing else,
 * so both spellings are read and a rename is a one-line change here rather than a panel
 * printing `undefined` for a day.
 */
function rumourField(raw: Record<string, unknown>, name: string): unknown {
  const camel = RUMOUR_CAMEL[name];
  if (camel !== undefined && raw[camel] !== undefined) return raw[camel];
  return raw[name];
}

/**
 * One rumour is drawable if it names a good the panel has a word for, names both towns,
 * and carries all three prices.
 *
 * The town ids are checked for being numbers and for nothing else. They are the
 * simulation's own integers and this client keys its towns by string, so the panel draws
 * the two names; refusing an id the panel never reads would be refusing a payload for a
 * reason it does not have.
 *
 * The one check here that is not about shape is the margin. It is the simulation's
 * subtraction of its own two prices, the panel prints it beside both of them, and a tip
 * that says "buy at 10, sell at 20, margin 3" is a panel a player cannot read. The
 * tolerance is a hundredth of a unit, because the sim's prices are floats and the two
 * figures are computed in the same place. If a later version prices a margin some other
 * way — after freight, or as a share — this is the line to move, and the panel will go on
 * printing whatever the simulation sends.
 */
function rumourProblem(raw: unknown, where: string): string | null {
  if (!isRecord(raw)) return `${where} is not a JSON object`;
  const good = rumourField(raw, "Good");
  if (!RUMOUR_GOODS.includes(good as RumourGood)) return `${where}.good is not one the simulation generates`;
  for (const [key, field] of [
    ["BuyTown", "buyTown"],
    ["SellTown", "sellTown"],
    ["Text", "text"],
  ] as const) {
    if (!isString(rumourField(raw, key))) return `${where}.${field} is missing`;
  }
  for (const [key, field] of [
    ["BuyTownID", "buyTownId"],
    ["SellTownID", "sellTownId"],
    ["BuyPrice", "buyPrice"],
    ["SellPrice", "sellPrice"],
    ["Margin", "margin"],
  ] as const) {
    if (!isFiniteNumber(rumourField(raw, key))) return `${where}.${field} is not a number`;
  }
  const margin = rumourField(raw, "Margin") as number;
  const spread = (rumourField(raw, "SellPrice") as number) - (rumourField(raw, "BuyPrice") as number);
  if (Math.abs(spread - margin) > 0.01) return `${where}.margin is not the difference between its own two prices`;
  return null;
}

/**
 * The feed, as the simulation sends it.
 *
 * `rumours` may be `null`, which is what Go writes for a nil slice, and that is an empty
 * feed and not a broken payload: the simulation looked at every town and found no route
 * worth publishing. A feed that is not a list at all is refused.
 */
function rumourFeedProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (raw.rumours === null || raw.rumours === undefined) return null;
  if (!Array.isArray(raw.rumours)) return "rumours is neither a list nor null";
  for (const [index, rumour] of raw.rumours.entries()) {
    const problem = rumourProblem(rumour, `rumour ${index}`);
    if (problem) return problem;
  }
  return null;
}

/**
 * One tick frame.
 *
 * `fog` goes through `fogProblem` rather than being taken on trust, and the reason is
 * specific to this frame: it is the one payload that arrives repeatedly and unattended,
 * every in-game day, with nobody watching it arrive. A malformed fog block on the
 * snapshot throws a sentence a player reads; the same block arriving in a frame has to be
 * refused the same way, or the merge would write a fog state with `visibleTowns` undefined
 * into the snapshot and the map would draw from a `Set` that does not exist.
 */
function tickFrameProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the frame is not a JSON object";
  if (!isFiniteNumber(raw.tick)) return "tick is not a number";
  if (!isFiniteNumber(raw.day)) return "day is not a number";
  const problem = fogProblem(raw.fog);
  if (problem) return `the frame's ${problem}`;
  return null;
}

function decodeSnapshot(raw: unknown, url: string): SimSnapshot {
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

function decodeWhyChain(raw: unknown, url: string): WhyChain {
  const problem = whyChainProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "The reason behind that change could not be read.",
      `GET ${url} returned a cause chain that failed validation: ${problem}`,
      false,
    );
  }
  return raw as WhyChain;
}

function decodeBarterTerms(raw: unknown, url: string): BarterTerms {
  const problem = barterTermsProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "This trader's two tables could not be read, so there is nothing to bargain over.",
      `GET ${url} returned barter terms that failed validation: ${problem}`,
      false,
    );
  }
  return raw as BarterTerms;
}

/** One decoder for both the proposal and the struck deal, with the extra fields named. */
function decodeBarterProposal(raw: unknown, url: string): BarterProposal {
  const problem = barterProposalProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "The trader did not answer, in a form this client can read.",
      `POST ${url} returned a barter proposal that failed validation: ${problem}`,
      false,
    );
  }
  return raw as BarterProposal;
}

function decodeBarterResult(raw: unknown, url: string): BarterResult {
  const problem = barterResultProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "The deal was taken but the new tables did not come back, so this client will not guess them.",
      `POST ${url} returned a barter result that failed validation: ${problem}`,
      false,
    );
  }
  return raw as BarterResult;
}

function decodeIssueBoard(raw: unknown, url: string): IssueBoard {
  const problem = issueBoardProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "This quest log arrived in a form this client cannot read, so nothing has been drawn from it.",
      `GET ${url} returned an issue board that failed validation: ${problem}`,
      false,
    );
  }
  return raw as IssueBoard;
}

/** One decoder for all three actions, with the message naming the action that failed. */
function decodeIssueAction(raw: unknown, url: string): IssueActionResult {
  const problem = issueActionProblem(raw);
  if (problem) {
    const action = isRecord(raw) && isString(raw.action) ? (raw.action as IssueAction) : "answer";
    throw new SimulationUnavailableError(
      `The simulation's ${action} answer arrived in a form this client cannot read, so no change has been drawn.`,
      `POST ${url} returned an issue action that failed validation: ${problem}`,
      false,
    );
  }
  return raw as IssueActionResult;
}

/**
 * The rumour feed, renamed into this client's own spelling on the way in.
 *
 * The rewrite is the whole reason this is a decoder and not a cast: the panel works in
 * `buyTown` and the wire says `BuyTown`, and a cast would leave the panel reading a field
 * that is not there. `null` becomes an empty list, which is a real answer rather than a
 * missing one.
 */
function decodeRumours(raw: unknown, url: string): Rumour[] {
  const problem = rumourFeedProblem(raw);
  if (problem) {
    throw new SimulationUnavailableError(
      "The trade rumours arrived in a form this client cannot read, so none have been drawn.",
      `GET ${url} returned a rumour feed that failed validation: ${problem}`,
      false,
    );
  }
  const rows = isRecord(raw) ? raw.rumours : null;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const entry = row as Record<string, unknown>;
    return {
      good: rumourField(entry, "Good") as RumourGood,
      buyTown: rumourField(entry, "BuyTown") as string,
      buyTownId: rumourField(entry, "BuyTownID") as number,
      buyPrice: rumourField(entry, "BuyPrice") as number,
      sellTown: rumourField(entry, "SellTown") as string,
      sellTownId: rumourField(entry, "SellTownID") as number,
      sellPrice: rumourField(entry, "SellPrice") as number,
      margin: rumourField(entry, "Margin") as number,
      text: rumourField(entry, "Text") as string,
    };
  });
}
