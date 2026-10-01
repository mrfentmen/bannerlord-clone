/**
 * Encounter polling for the battle UI.
 *
 * The campaign server auto-triggers encounters when hostile parties meet
 * in proximity (see
 * `services/simulation/cmd/apiserver/campaign/encounter_tick.go`), so
 * the battle UI discovers fights by polling
 * `GET /v1/encounters?partyId={id}` instead of creating encounters by
 * hand.
 *
 * The endpoint returns EVERY encounter involving the party — pending,
 * resolved, and escalated — so the poller only surfaces `pending` ones,
 * and only once per encounter id. When the server is unreachable or the
 * route is not built yet, ticks are silent (there is simply nothing to
 * pick up); unexpected failures go to the optional `onError` callback.
 */

import { BattleApiError, type BattleApi } from "./api";
import type { Encounter } from "./types";

export interface EncounterPollerCallbacks {
  /** Fired exactly once for each newly-seen pending encounter. */
  onNew: (encounter: Encounter) => void;
  /** Fired for unexpected poll failures (server-down is not one). */
  onError?: (err: unknown) => void;
}

export class EncounterPoller {
  #seen = new Set<string>();
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly api: BattleApi,
    private readonly playerPartyId: number,
    private readonly callbacks: EncounterPollerCallbacks
  ) {}

  get running(): boolean {
    return this.#timer !== null;
  }

  /**
   * One poll tick. Returns the newly-seen pending encounters and fires
   * `onNew` for each of them.
   */
  async pollOnce(): Promise<Encounter[]> {
    let encounters: Encounter[];
    try {
      encounters = await this.api.listEncounters(this.playerPartyId);
    } catch (err) {
      if (err instanceof BattleApiError && err.serverBattleUnavailable) {
        // No server, no auto-triggered encounters to find. Stay quiet;
        // the next tick tries again.
        return [];
      }
      this.callbacks.onError?.(err);
      return [];
    }
    const fresh = encounters.filter(
      (e) => e.status === "pending" && !this.#seen.has(e.id)
    );
    for (const e of fresh) this.#seen.add(e.id);
    for (const e of fresh) this.callbacks.onNew(e);
    return fresh;
  }

  /** Start polling every `intervalMs` (default 5s). No-op if running. */
  start(intervalMs = 5000): void {
    if (this.#timer) return;
    void this.pollOnce();
    this.#timer = setInterval(() => {
      void this.pollOnce();
    }, intervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}
