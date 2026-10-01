/**
 * Narrow HTTP client for the battle-session lifecycle endpoints.
 *
 * This is deliberately NOT PAX's `HttpSimulationProvider` (his lane):
 * it is a small, purpose-built client for the seven encounter/battle
 * routes, so the battle flow can be wired without touching the shared
 * provider.
 *
 * Routes:
 * - POST /v1/encounters
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
 * simulation happened.
 */

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
  fetchImpl: typeof fetch = globalThis.fetch
): BattleApi {
  const base = baseUrl.replace(/\/$/, "");

  async function get<T>(path: string, playerMessage: string): Promise<T> {
    const url = `${base}${path}`;
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new BattleApiError(
        "unreachable",
        `GET ${url} threw: ${String(err)}`,
        playerMessage,
        0
      );
    }
    return read<T>(response, url, playerMessage);
  }

  async function post<T>(
    path: string,
    body: unknown,
    playerMessage: string
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
      });
    } catch (err) {
      throw new BattleApiError(
        "unreachable",
        `POST ${url} threw: ${String(err)}`,
        playerMessage,
        0
      );
    }
    return read<T>(response, url, playerMessage);
  }

  async function read<T>(
    response: Response,
    url: string,
    playerMessage: string
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
    try {
      return (await response.json()) as T;
    } catch (err) {
      throw new BattleApiError(
        "unreadable",
        `JSON.parse of ${url} threw: ${String(err)}`,
        playerMessage,
        response.status
      );
    }
  }

  return {
    createEncounter: (attackerPartyId, defenderPartyId) =>
      post<Encounter>(
        "/v1/encounters",
        { attackerPartyId, defenderPartyId },
        "The encounter could not be arranged."
      ),
    getEncounter: (id) =>
      get<Encounter>(
        `/v1/encounters/${encodeURIComponent(id)}`,
        "The encounter could not be found."
      ),
    resolveEncounter: (id) =>
      post<Encounter>(
        `/v1/encounters/${encodeURIComponent(id)}/resolve`,
        {},
        "The encounter could not be resolved."
      ),
    startBattle: (encounterId) =>
      post<Battle>(
        "/v1/battles",
        { encounterId },
        "The battle could not be joined."
      ),
    getBattle: (id) =>
      get<Battle>(
        `/v1/battles/${encodeURIComponent(id)}`,
        "The battle could not be read."
      ),
    submitOrders: (id, orders) =>
      post<Battle>(
        `/v1/battles/${encodeURIComponent(id)}/orders`,
        orders,
        "The orders did not go through."
      ),
    endBattle: (id, reason) =>
      post<Battle>(
        `/v1/battles/${encodeURIComponent(id)}/end`,
        { reason },
        "The battle could not be ended."
      ),
  };
}
