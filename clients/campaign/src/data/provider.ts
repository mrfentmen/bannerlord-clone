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
 *  3. When the fixture provider is live, `main.ts` renders a persistent banner, so a
 *     screenshot cannot be mistaken for the real game.
 */

import type {
  ConnectionStatus,
  MarchPlan,
  MarchRequest,
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
 * `VITE_SIMULATION_SOURCE` defaults to `http`. It only ever resolves to `fixture`
 * in a dev build, because `vite.config.ts` refuses to set it otherwise.
 */
export function readConfig(env: Record<string, string | boolean | undefined> = import.meta.env): ClientConfig {
  const raw = typeof env.VITE_SIMULATION_SOURCE === "string" ? env.VITE_SIMULATION_SOURCE : "";
  const quality = env.VITE_QUALITY === "low" ? "low" : "high";
  return {
    simulationSource: raw === "fixture" ? "fixture" : "http",
    worldDataUrl: typeof env.VITE_WORLD_DATA_URL === "string" ? env.VITE_WORLD_DATA_URL : "/world",
    simulationHttpUrl:
      typeof env.VITE_SIMULATION_HTTP_URL === "string" ? env.VITE_SIMULATION_HTTP_URL : "http://127.0.0.1:8080",
    simulationWsUrl:
      typeof env.VITE_SIMULATION_WS_URL === "string" ? env.VITE_SIMULATION_WS_URL : "ws://127.0.0.1:8080/ws",
    quality,
  };
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
    let response: Response;
    try {
      response = await this.#fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new SimulationUnavailableError(
        "The world simulation is not answering. It may not be running.",
        `GET ${url} threw: ${String(err)}`,
      );
    }
    if (response.status === 404) {
      throw new SimulationUnavailableError(
        "The world simulation has not published a world yet.",
        `GET ${url} -> HTTP 404. Agent 2's Contract B route is not implemented there yet.`,
        false,
      );
    }
    if (!response.ok) {
      throw new SimulationUnavailableError(
        "The world simulation returned an error.",
        `GET ${url} -> HTTP ${response.status} ${response.statusText}`,
      );
    }
    try {
      return (await response.json()) as SimSnapshot;
    } catch (err) {
      throw new SimulationUnavailableError(
        "The world simulation sent something this client cannot read.",
        `JSON.parse of ${url} threw: ${String(err)}`,
      );
    }
  }

  async trade(request: TradeRequest): Promise<TradeResult> {
    return this.#post<TradeResult>("/v1/trade", request, "The trade did not go through.");
  }

  async planMarch(request: MarchRequest): Promise<MarchPlan> {
    return this.#post<MarchPlan>("/v1/march/plan", request, "The march could not be planned.");
  }

  async commitMarch(request: MarchRequest): Promise<void> {
    await this.#post<{ accepted: true }>("/v1/march/commit", request, "The order to march was not accepted.");
  }

  async why(entityId: string, field: string): Promise<WhyChain> {
    const url = `${this.#httpUrl}/v1/why?entity=${encodeURIComponent(entityId)}&field=${encodeURIComponent(field)}`;
    let response: Response;
    try {
      response = await this.#fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new SimulationUnavailableError(
        "The reason behind that change could not be read.",
        `GET ${url} threw: ${String(err)}`,
      );
    }
    if (!response.ok) {
      throw new SimulationUnavailableError(
        "The reason behind that change could not be read.",
        `GET ${url} -> HTTP ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as WhyChain;
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
      try {
        reason = ((await response.json()) as { reason?: string }).reason;
      } catch {
        // A 409 with an unreadable body. The message below covers the player either
        // way; the developer detail still records the status.
      }
      throw new SimulationUnavailableError(
        reason ?? "The world moved on before that order arrived.",
        `POST ${url} -> HTTP 409`,
        false,
      );
    }
    if (!response.ok) {
      throw new SimulationUnavailableError(playerMessage, `POST ${url} -> HTTP ${response.status}`);
    }
    return (await response.json()) as T;
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
        try {
          onTick(JSON.parse(String(ev.data)) as TickUpdate);
        } catch (err) {
          // A malformed frame is reported and skipped. Dropping the connection would
          // punish the player for a server-side formatting slip.
          onStatus({
            state: "degraded",
            detail: `discarded an unreadable tick frame: ${String(err)}`,
            attempt: this.#attempt,
          });
        }
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
}
