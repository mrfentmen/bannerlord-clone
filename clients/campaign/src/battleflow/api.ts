/**
 * Narrow HTTP client for the battle-session lifecycle endpoints.
 *
 * This is deliberately NOT PAX's `HttpSimulationProvider` (his lane):
 * it is a small, purpose-built client for the seven encounter/battle
 * routes, so the battle flow can be wired without touching the shared
 * provider. The one thing it does share is the per-call timeout, so a
 * battle request and a snapshot request are held to the same patience.
 *
 * Routes:
 * - POST /v1/encounters
 * - GET  /v1/encounters?partyId={id}  (poll auto-triggered encounters)
 * - GET  /v1/encounters/{id}
 * - POST /v1/encounters/{id}/resolve
 * - POST /v1/battles
 * - GET  /v1/battles/{id}
 * - POST /v1/battles/{id}/orders
 * - POST /v1/battles/{id}/end
 *
 * Every failure becomes a `BattleApiError`. The flow layer treats
 * "unimplemented" (server says the route is not built yet) and
 * "unreachable" (no server at all) as a signal to fall back to the
 * local battle flow instead of crashing or pretending a server
 * simulation happened. A call that ran out of time is neither of those:
 * the server may well have taken the order, so it is a fault to show and
 * retry, never a cue to substitute a local fight for a real one.
 *
 * Every reply is checked against the shapes in `./validate.ts` before it
 * is handed on, for the same reason the shared provider checks its own
 * (CONSTITUTION.md section 1.3).
 */

import { REQUEST_TIMEOUT_MS } from "../data/provider.js";
import {
  battleProblem,
  encounterListProblem,
  encounterProblem,
} from "./validate";
import type {
  Battle,
  BattleEndReason,
  BattleOrders,
  Encounter,
  ErrorEnvelope,
} from "./types";
import { CODE_UNIMPLEMENTED } from "./types";

export class BattleApiError extends Error {
  /** Machine code from the envelope, or "unreachable"/"unreadable". */
  readonly code: string;
  /** HTTP status, or 0 when no response arrived. */
  readonly status: number;
  /** Player-facing sentence from the envelope's reason, if any. */
  readonly reason: string;

  constructor(code: string, message: string, reason: string, status: number) {
    super(message);
    this.name = "BattleApiError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }

  /**
   * True when the server answered but the battle flow is not built on
   * its side yet: HTTP 501, or an envelope with code "unimplemented".
   */
  get unimplemented(): boolean {
    return this.code === CODE_UNIMPLEMENTED || this.status === 501;
  }

  /** True when no response arrived at all (server down, wrong URL). */
  get unreachable(): boolean {
    return this.code === "unreachable";
  }

  /**
   * True when the call was still open when the client gave up waiting.
   *
   * Distinct from `unreachable` on purpose. A server that never answered
   * can be stood in for locally; a server that answered too slowly to
   * decide an order cannot, because the order may already have landed.
   */
  get timedOut(): boolean {
    return this.code === "timeout";
  }

  /** True for either "not built yet" or "not there at all". */
  get serverBattleUnavailable(): boolean {
    return this.unimplemented || this.unreachable;
  }
}

export interface BattleApi {
  createEncounter(
    attackerPartyId: number,
    defenderPartyId: number
  ): Promise<Encounter>;
  /**
   * Poll encounters involving a party: the server auto-triggers these when
   * hostile parties meet, so the battle UI discovers fights this way
   * instead of creating encounters by hand. Returns every encounter for
   * the party — pending, resolved, and escalated — filter by status on
   * the caller side.
   */
  listEncounters(partyId: number): Promise<Encounter[]>;
  getEncounter(id: string): Promise<Encounter>;
  resolveEncounter(id: string): Promise<Encounter>;
  startBattle(encounterId: string): Promise<Battle>;
  getBattle(id: string): Promise<Battle>;
  submitOrders(id: string, orders: BattleOrders): Promise<Battle>;
  endBattle(id: string, reason: BattleEndReason): Promise<Battle>;
}

function readFault(status: number, body: unknown, url: string): BattleApiError {
  const envelope = (body ?? {}) as ErrorEnvelope;
  const code = envelope.error?.code ?? `http_${status}`;
  const message =
    envelope.error?.message ?? `The battle request failed (HTTP ${status}).`;
  const reason =
    envelope.reason ?? "The battle could not be arranged. The field stays quiet.";
  void url;
  return new BattleApiError(code, message, reason, status);
}

export function createHttpBattleApi(
  baseUrl = "http://127.0.0.1:8080",
  fetchImpl: typeof fetch = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
): BattleApi {
  const base = baseUrl.replace(/\/$/, "");

  /**
   * An abort signal that fires after the timeout.
   *
   * The timer is cleared by the signal's own abort handler, so a quick
   * reply leaves nothing running behind it, and nothing is cancelled
   * beyond this call.
   */
  function timeoutSignal(url: string): AbortSignal {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`no answer from ${url} within ${timeoutMs}ms`));
    }, timeoutMs);
    controller.signal.addEventListener("abort", () => clearTimeout(timer), {
      once: true,
    });
    return controller.signal;
  }

  /** Whether a thrown value is this call's own timeout rather than a dead server. */
  function isAbort(err: unknown): boolean {
    return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
  }

  async function get<T>(
    path: string,
    playerMessage: string,
    check: (raw: unknown) => string | null
  ): Promise<T> {
    const url = `${base}${path}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: timeoutSignal(url),
      });
    } catch (err) {
      throw transportError(`GET ${url}`, playerMessage, err);
    }
    return read<T>(response, url, playerMessage, check);
  }

  async function post<T>(
    path: string,
    body: unknown,
    playerMessage: string,
    check: (raw: unknown) => string | null
  ): Promise<T> {
    const url = `${base}${path}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: timeoutSignal(url),
      });
    } catch (err) {
      throw transportError(`POST ${url}`, playerMessage, err);
    }
    return read<T>(response, url, playerMessage, check);
  }

  function transportError(
    what: string,
    playerMessage: string,
    err: unknown
  ): BattleApiError {
    if (isAbort(err)) {
      return new BattleApiError(
        "timeout",
        `${what}: no answer within ${timeoutMs}ms (${String(err)})`,
        "The battle server stopped answering part-way through. Nothing was decided.",
        0
      );
    }
    return new BattleApiError("unreachable", `${what} threw: ${String(err)}`, playerMessage, 0);
  }

  async function read<T>(
    response: Response,
    url: string,
    playerMessage: string,
    check: (raw: unknown) => string | null
  ): Promise<T> {
    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      throw readFault(response.status, body, url);
    }
    let reply: unknown;
    try {
      reply = await response.json();
    } catch (err) {
      throw new BattleApiError(
        "unreadable",
        `JSON.parse of ${url} threw: ${String(err)}`,
        playerMessage,
        response.status
      );
    }
    const problem = check(reply);
    if (problem) {
      throw new BattleApiError(
        "unreadable",
        `${url} answered with something this client cannot read: ${problem}`,
        "The battle server sent an answer this client cannot read.",
        response.status
      );
    }
    return reply as T;
  }

  return {
    createEncounter: (attackerPartyId, defenderPartyId) =>
      post<Encounter>(
        "/v1/encounters",
        { attackerPartyId, defenderPartyId },
        "The encounter could not be arranged.",
        encounterProblem
      ),
    getEncounter: (id) =>
      get<Encounter>(
        `/v1/encounters/${encodeURIComponent(id)}`,
        "The encounter could not be found.",
        encounterProblem
      ),
    // The route answers `null` for a party that has met nobody; the empty list is the
    // reading its own contract supports, and it is what the poller and the flow both
    // expect. Anything that is neither null nor a list of encounters is refused above.
    listEncounters: async (partyId) => {
      const list = await get<unknown>(
        `/v1/encounters?partyId=${encodeURIComponent(String(partyId))}`,
        "The encounters could not be listed.",
        encounterListProblem
      );
      return (list ?? []) as Encounter[];
    },
    resolveEncounter: (id) =>
      post<Encounter>(
        `/v1/encounters/${encodeURIComponent(id)}/resolve`,
        {},
        "The encounter could not be resolved.",
        encounterProblem
      ),
    startBattle: (encounterId) =>
      post<Battle>(
        "/v1/battles",
        { encounterId },
        "The battle could not be joined.",
        battleProblem
      ),
    getBattle: (id) =>
      get<Battle>(
        `/v1/battles/${encodeURIComponent(id)}`,
        "The battle could not be read.",
        battleProblem
      ),
    submitOrders: (id, orders) =>
      post<Battle>(
        `/v1/battles/${encodeURIComponent(id)}/orders`,
        orders,
        "The orders did not go through.",
        battleProblem
      ),
    endBattle: (id, reason) =>
      post<Battle>(
        `/v1/battles/${encodeURIComponent(id)}/end`,
        { reason },
        "The battle could not be ended.",
        battleProblem
      ),
  };
}
