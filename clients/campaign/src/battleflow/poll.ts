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
 * pick up); any other failure is reported through `onError` once, not on
 * every tick, and the report is withdrawn as soon as a poll succeeds
 * again.
 */

import { BattleApiError, type BattleApi } from "./api";
import type { Encounter } from "./types";

export interface EncounterPollerCallbacks {
  /** Fired exactly once for each newly-seen pending encounter. */
  onNew: (encounter: Encounter) => void;
  /** Fired for unexpected poll failures (server-down is not one). */
  onError?: (err: unknown) => void;
}

/**
 * The most encounter ids remembered at once.
 *
 * The memory is pruned every poll — an id whose encounter has left `pending` is
 * forgotten, so the poller holds the fights that are live rather than a record of every
 * fight ever fought — and this is the hard bound under that, for a server that reports
 * more simultaneous encounters than any party can have. Past it the oldest are dropped,
 * and a dropped id is offered once more; that is the deliberate trade, because re-offering
 * an old fight is a nuisance and running out of memory is a crash.
 */
export const MAX_TRACKED_ENCOUNTERS = 200;

export class EncounterPoller {
  #seen = new Set<string>();
  #timer: ReturnType<typeof setInterval> | null = null;
  /** True once a failure has been reported and no poll has succeeded since. */
  #reported = false;

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
   *
   * Never rejects. A poller that rejects every five seconds would leave the caller with
   * an unhandled rejection per tick, so every failure is either a quiet no (no server)
   * or one report through `onError`.
   */
  async pollOnce(): Promise<Encounter[]> {
    let encounters: unknown;
    try {
      encounters = await this.api.listEncounters(this.playerPartyId);
    } catch (err) {
      if (!(err instanceof BattleApiError && err.serverBattleUnavailable)) {
        this.#report(err);
      }
      return [];
    }
    // The route answers `null` for a party that has met nobody, and the HTTP client
    // reads that as the empty list. Anything else that is not a list is refused here
    // rather than turned into a `TypeError` from a `.filter` five frames away. An
    // answer that cannot be read is not a healthy answer, so it does not withdraw a
    // standing failure report.
    if (!Array.isArray(encounters)) {
      this.#report(
        new BattleApiError(
          "unreadable",
          `listEncounters answered with ${Object.prototype.toString.call(encounters)}`,
          "The battle server sent an answer this client cannot read.",
          0,
        ),
      );
      return [];
    }
    this.#withdrawn();
    const pending = encounters.filter((e) => e.status === "pending");
    // Forget what the server has finished with, before deciding what is new. Holding
    // every id the campaign has ever produced would grow without limit over a long game;
    // holding only what is still pending is bounded by the fights that are actually live.
    const live = new Set(pending.map((e) => e.id));
    for (const id of [...this.#seen]) {
      if (!live.has(id)) this.#seen.delete(id);
    }
    const fresh = pending.filter((e) => !this.#seen.has(e.id));
    for (const e of fresh) this.#remember(e.id);
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

  #remember(id: string): void {
    this.#seen.add(id);
    while (this.#seen.size > MAX_TRACKED_ENCOUNTERS) {
      const oldest = this.#seen.values().next().value;
      if (oldest === undefined) return;
      this.#seen.delete(oldest);
    }
  }

  #report(err: unknown): void {
    if (this.#reported) return;
    this.#reported = true;
    this.callbacks.onError?.(err);
  }

  #withdrawn(): void {
    this.#reported = false;
  }
}