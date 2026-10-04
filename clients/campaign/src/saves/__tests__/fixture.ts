/**
 * A real-shaped save file, for tests only.
 *
 * Shaped after `services/simulation/cmd/apiserver/campaign/save.go`'s
 * `saveFile`: the fields this client actually reads are present and correct, and
 * the rest are empty because nothing under test interprets the payload. Keeping
 * it in one place means a test asserting on the format marker is asserting on
 * the same marker every other test is.
 *
 * Not a mock of the server — a payload. The `SaveServer` tests below drive a
 * recording `fetch` and assert on what it was handed, which is the only thing
 * this client controls.
 */

export const SAVE_PAYLOAD = JSON.stringify({
  format: "mbclone-save",
  version: 1,
  seed: 8675309,
  rngState: 424242,
  world: { entities: [] },
  cause: { rows: [] },
  bandits: { camps: [] },
  prisoners: { byID: {}, order: [], nextID: 1, lastMercy: false, fear: 0 },
  companions: { byID: {}, hired: [], battlesWon: 0, tavernCache: {} },
  campaign: {
    scale: 1,
    acc: 0,
    ticksRun: 42,
    snapshotAt: 42,
    playerRuler: 3,
    homeTown: 11,
    party: 7,
    character: { set: true, firstName: "Dana", lastName: "Ruiz" },
    roster: { stacks: [], goods: {}, marchStart: -1 },
    history: {},
    notifs: [],
    notifSeq: 0,
    seenRow: {},
    skippedDays: 0,
  },
  encounters: { encounters: {}, battles: {}, nextID: 1 },
});

/** The server's reply to a successful load. */
export const LOAD_REPLY = JSON.stringify({ ok: true, day: 42 });

/** The apiserver's error body. `reason` is the player-facing half. */
export function faultBody(message: string, reason = "", code = "internal"): string {
  return JSON.stringify({ error: { code, message }, reason });
}

/** One recorded `fetch` call. */
export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/**
 * A `fetch` that answers from a queue of canned replies and records what it was
 * asked for. Throws when the queue runs dry, so a test that expected one call
 * and made two fails loudly instead of silently passing.
 */
export function recordingFetch(
  replies: Array<{ status?: number; statusText?: string; body: string; throw?: unknown }>,
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = queue.shift();
    if (!reply) throw new Error(`recordingFetch ran out of replies for ${String(input)}`);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    if (reply.throw !== undefined) throw reply.throw;
    return {
      ok: (reply.status ?? 200) >= 200 && (reply.status ?? 200) < 300,
      status: reply.status ?? 200,
      statusText: reply.statusText ?? "",
      text: async () => reply.body,
      json: async () => JSON.parse(reply.body) as unknown,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}