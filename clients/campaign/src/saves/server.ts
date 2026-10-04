/**
 * Authoritative save and load against the campaign server.
 *
 * This is the half of the save feature that could not exist before Agent 1
 * landed `POST /v1/save` and `POST /v1/load`. Before those routes existed the
 * client's save screen stored the `SimSnapshot` — the periodic inspection
 * record the server publishes for the client to *draw* — and called it a save.
 * That was a lie with a Save button on it: a snapshot has no RNG state, no
 * cause log, no bandit runtime and no roster, so loading one back could not
 * have restored the world, it could only have made the client draw a picture
 * of a campaign that had never existed. The old screen even said so in a
 * comment while offering a Load button.
 *
 * The real contract, from `campaign/save.go`:
 *
 *   POST /v1/save  -> 200, the whole campaign as one JSON save file:
 *                     `{format:"mbclone-save", version:1, seed, rngState, world,
 *                       cause, bandits, prisoners, companions, campaign, encounters}`.
 *                     The server is the authority; the client stores the bytes.
 *   POST /v1/load  <- that same save file as the request body.
 *                  -> 200 `{ok:true, day:<tick number>}`.
 *
 * Two refusals matter to a player and both are real answers, not transport
 * failures, so they get their own sentences rather than "something went wrong":
 *
 *   - Orders queued. `Save` and `Load` refuse while the order queue is
 *     non-empty, because an order references the live tick and restoring
 *     underneath it would either drop the order or apply it to a world it was
 *     never meant for. The server reports this as a plain error, so it arrives
 *     as a 500 whose message says `orders are still queued`; that phrase is
 *     matched and turned into a retryable "wait a beat" rather than a dead end.
 *   - An unreadable or foreign file. Refused on load before anything is
 *     swapped, so a bad file cannot half-restore a campaign.
 *
 * Every other failure is a `SaveServerError` carrying a sentence the player can
 * read (`playerMessage`) and a developer fragment that is only ever logged
 * (CONSTITUTION.md section 1.3). Nothing here throws a bare `Error` at a panel.
 */

import { readConfig } from "../data/provider.js";

/** The `format` marker the server writes and insists on at load time. */
export const SAVE_FORMAT = "mbclone-save";

/**
 * Save-file versions this client can read. A range, not a single number, so a
 * client can be widened for the next version without a flag day and narrowed
 * when a version arrives it has never seen. Both ends inclusive.
 */
export const SAVE_VERSION_MIN = 1;
export const SAVE_VERSION_MAX = 1;

/**
 * How long one save or load may take before this client gives up.
 *
 * Longer than the provider's eight seconds, on purpose. A save marshals the
 * whole world and a load swaps it under the tick loop's write lock; both are
 * allowed to be slow for a few seconds on a laptop, and cutting them off early
 * would leave the player watching a panel that gave up on a save that was
 * about to land.
 */
export const SAVE_REQUEST_TIMEOUT_MS = 30_000;

/** The largest save file this client will hand back to the server. */
export const SAVE_MAX_BYTES = 256 * 1024 * 1024;

/**
 * How a save or load failed, in the terms the UI reacts to.
 *
 * - `busy`       the server refused because orders were queued. Retry in a moment.
 * - `offline`    the server could not be reached. Retry.
 * - `rejected`   the server answered and said no, with a reason. Retry is up to the player.
 * - `unreadable` the server answered with something this client cannot parse.
 */
export type SaveFailureKind = "busy" | "offline" | "rejected" | "unreadable";

/** A failure a panel can show a player, with the way out of it. */
export class SaveServerError extends Error {
  readonly playerMessage: string;
  readonly developerDetail: string;
  readonly kind: SaveFailureKind;
  readonly retryable: boolean;

  constructor(kind: SaveFailureKind, playerMessage: string, developerDetail: string, retryable: boolean) {
    super(developerDetail);
    this.name = "SaveServerError";
    this.kind = kind;
    this.playerMessage = playerMessage;
    this.developerDetail = developerDetail;
    this.retryable = retryable;
  }
}

export interface SaveServerOptions {
  /** Where the campaign API lives. Defaults to the same origin the game reads its world from. */
  httpUrl?: string;
  /** Injectable so tests can drive this without a network. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** What a save file looks like to this client. The bytes stay opaque. */
export interface SaveFile {
  /** The save file exactly as the server wrote it. This is what a load posts back. */
  payload: string;
  /** Bytes, for the slot list. */
  bytes: number;
  format: string;
  version: number;
}

/** The reply to a successful load. `day` is the server's tick number, not the client's. */
export interface LoadOutcome {
  day: number;
}

const BUSY_PHRASE = "orders are still queued";

/**
 * Whether a server message is the queued-orders refusal.
 *
 * Matched on the phrase the campaign package puts in `errSaveBusy`, because the
 * apiserver only produces a structured fault for errors that are already one;
 * `fmt.Errorf("%w (%d queued)", ...)` reaches `writeFault` as a plain error and
 * comes back as a 500 carrying that text in `error.message`. Matching the phrase
 * is reading a documented string, not guessing at a shape: if the server ever
 * stops saying it, this stops matching and the failure falls back to the generic
 * 500 sentence, which is still true, just less helpful.
 */
function isBusyRefusal(message: string): boolean {
  return message.toLowerCase().includes(BUSY_PHRASE);
}

/** The reason a fault body carries, if it sent one. Never throws. */
function reasonFrom(text: string): { code: string; message: string; reason: string } | null {
  try {
    const raw = JSON.parse(text) as {
      error?: { code?: unknown; message?: unknown };
      reason?: unknown;
    };
    const code = typeof raw.error?.code === "string" ? raw.error.code : "";
    const message = typeof raw.error?.message === "string" ? raw.error.message : "";
    const reason = typeof raw.reason === "string" ? raw.reason : "";
    if (!code && !message && !reason) return null;
    return { code, message, reason };
  } catch {
    return null;
  }
}

/**
 * Turn one non-200 reply into a `SaveServerError` with the right sentence.
 *
 * `what` is "save" or "load", because the two failures are not the same fact:
 * a refused save leaves the campaign exactly as it was, while a refused load
 * leaves the player looking at a campaign they thought they had rolled back to.
 */
function errorFromResponse(what: "save" | "load", status: number, statusText: string, body: string, url: string): SaveServerError {
  const fault = reasonFrom(body);
  const detail = `POST ${url} -> HTTP ${status} ${statusText}${fault?.message ? ` :: ${fault.message}` : ""}`;
  if (fault && isBusyRefusal(fault.message)) {
    return new SaveServerError(
      "busy",
      "The world is in the middle of something. Give it a moment, then try again.",
      detail,
      true,
    );
  }
  if (fault?.reason) {
    return new SaveServerError("rejected", fault.reason, detail, status >= 500);
  }
  if (status >= 500) {
    return new SaveServerError(
      "offline",
      `The world simulation could not ${what} the campaign right now. Try again in a moment.`,
      detail,
      true,
    );
  }
  return new SaveServerError(
    "rejected",
    status === 404
      ? "This build of the world simulation does not keep campaigns. Saving is unavailable."
      : `The world simulation refused to ${what} the campaign.`,
    detail,
    false,
  );
}

/**
 * The first thing wrong with a save file, as a developer-readable fragment.
 *
 * Order matters: the format marker is checked before the version, because a
 * file that is not a save file at all has no meaningful version, and reporting
 * "version missing" for a random JSON document sent to the wrong endpoint sends
 * the reader looking in the wrong file.
 */
export function saveFileProblem(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return `the payload is ${raw === null ? "null" : Array.isArray(raw) ? "an array" : typeof raw}, not a save file object`;
  }
  const file = raw as { format?: unknown; version?: unknown; world?: unknown };
  if (file.format !== SAVE_FORMAT) {
    return `format is ${JSON.stringify(file.format)}, expected ${JSON.stringify(SAVE_FORMAT)}`;
  }
  if (typeof file.version !== "number" || !Number.isInteger(file.version)) {
    return `version is ${JSON.stringify(file.version)}, expected an integer`;
  }
  if (file.version > SAVE_VERSION_MAX) return `version ${file.version} is newer than this client reads (max ${SAVE_VERSION_MAX})`;
  if (file.version < SAVE_VERSION_MIN) return `version ${file.version} is older than this client reads (min ${SAVE_VERSION_MIN})`;
  if (file.world === undefined || file.world === null) {
    return "world is missing, so there is no world to restore";
  }
  return null;
}

/**
 * The server side of saving.
 *
 * Holds no state beyond the two injected dependencies and the resolved URL.
 * `save` and `load` are one call each because the routes are one call each;
 * everything above them (slot names, validation, the slot list) is the screens
 * layer's job.
 */
export class SaveServer {
  readonly #httpUrl: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: SaveServerOptions = {}) {
    // readConfig() is the same resolution the world itself reads, so saving
    // cannot end up pointed at a different host than the campaign being saved.
    // Resolved here rather than passed in so the save panel needs no wiring in
    // the app shell to reach the server it is already talking to.
    this.#httpUrl = (options.httpUrl ?? readConfig().simulationHttpUrl).replace(/\/$/, "");
    this.#fetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? SAVE_REQUEST_TIMEOUT_MS;
  }

  /** The URL this client saves to. Exposed so a panel can name it in an error. */
  get endpoint(): string {
    return this.#httpUrl;
  }

  /**
   * Write the running campaign out.
   *
   * The reply body *is* the save file, so this reads text and not JSON: the
   * bytes are handed back verbatim in `payload`, and re-serialising the parsed
   * object would risk changing a number the server wrote on the way through.
   * It is parsed anyway, once, to refuse a file this client cannot load later.
   */
  async save(): Promise<SaveFile> {
    const url = `${this.#httpUrl}/v1/save`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: { accept: "application/json" },
        signal: this.#timeoutSignal(url) ?? null,
      });
    } catch (err) {
      throw new SaveServerError(
        "offline",
        "The world simulation could not be reached, so nothing was saved. Your campaign is untouched.",
        `POST ${url} threw: ${String(err)}`,
        true,
      );
    }

    const body = await this.#text(response, url, "save");
    if (!response.ok) {
      throw errorFromResponse("save", response.status, response.statusText, body, url);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      throw new SaveServerError(
        "unreadable",
        "The world simulation saved the campaign but sent back something this client cannot read. The slot was not written.",
        `POST ${url} returned a body that is not JSON: ${String(err)}`,
        false,
      );
    }
    const problem = saveFileProblem(parsed);
    if (problem) {
      throw new SaveServerError(
        "unreadable",
        "The world simulation saved the campaign but sent back a file this client cannot load later. The slot was not written.",
        `POST ${url} returned a save file that failed validation: ${problem}`,
        false,
      );
    }

    const file = parsed as { format: string; version: number };
    return {
      payload: body,
      bytes: byteLength(body),
      format: file.format,
      version: file.version,
    };
  }

  /**
   * Restore the campaign from a save file.
   *
   * The file goes out as the raw request body, because that is what the server
   * unmarshals — it is a save file, not an envelope around one. The client's own
   * check runs first: refusing a file the server would also refuse costs one
   * round trip and spares the campaign from a load that was never going to
   * succeed.
   */
  async load(payload: string): Promise<LoadOutcome> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      throw new SaveServerError(
        "unreadable",
        "That save file is not readable JSON, so it was not loaded. Your campaign is untouched.",
        `load() was handed a body that is not JSON: ${String(err)}`,
        false,
      );
    }
    const problem = saveFileProblem(parsed);
    if (problem) {
      throw new SaveServerError(
        "unreadable",
        "That is not a save file this client can load. Your campaign is untouched.",
        `load() was handed a save file that failed validation: ${problem}`,
        false,
      );
    }

    const url = `${this.#httpUrl}/v1/load`;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: payload,
        signal: this.#timeoutSignal(url) ?? null,
      });
    } catch (err) {
      throw new SaveServerError(
        "offline",
        "The world simulation could not be reached, so nothing was loaded. Your campaign is untouched.",
        `POST ${url} threw: ${String(err)}`,
        true,
      );
    }

    const body = await this.#text(response, url, "load");
    if (!response.ok) {
      throw errorFromResponse("load", response.status, response.statusText, body, url);
    }

    let reply: unknown;
    try {
      reply = JSON.parse(body);
    } catch (err) {
      throw new SaveServerError(
        "unreadable",
        "The world simulation loaded the campaign but answered with something this client cannot read.",
        `POST ${url} returned a reply that is not JSON: ${String(err)}`,
        false,
      );
    }
    const day = (reply as { day?: unknown }).day;
    if (typeof day !== "number" || !Number.isFinite(day)) {
      throw new SaveServerError(
        "unreadable",
        "The world simulation loaded the campaign but did not say which day it landed on.",
        `POST ${url} returned a reply with no usable day: ${JSON.stringify(reply)}`,
        false,
      );
    }
    return { day };
  }

  /** Read a reply as text, refusing a body that cannot be read at all. */
  async #text(response: Response, url: string, what: "save" | "load"): Promise<string> {
    try {
      return await response.text();
    } catch (err) {
      throw new SaveServerError(
        "unreadable",
        `The world simulation answered the ${what} but the reply could not be read.`,
        `Reading the body of POST ${url} threw: ${String(err)}`,
        true,
      );
    }
  }

  #timeoutSignal(url: string): AbortSignal | undefined {
    // jsdom and older browsers have no AbortSignal.timeout. Omitting the signal
    // there is honest: the request still runs, it simply is not cut off, which
    // is strictly better than a client that refuses to save at all.
    const timeout = (globalThis as { AbortSignal?: { timeout?: (ms: number) => AbortSignal } }).AbortSignal;
    if (typeof timeout?.timeout !== "function") return undefined;
    try {
      return timeout.timeout(this.#timeoutMs);
    } catch (err) {
      console.warn(`[campaign-client] could not arm the ${this.#timeoutMs}ms timeout for ${url}: ${String(err)}`);
      return undefined;
    }
  }
}

/** UTF-8 byte count, for the slot list. Falls back to length for exotic hosts. */
function byteLength(text: string): number {
  const encoder = (globalThis as { TextEncoder?: new () => TextEncoder }).TextEncoder;
  return encoder ? new encoder().encode(text).length : text.length;
}