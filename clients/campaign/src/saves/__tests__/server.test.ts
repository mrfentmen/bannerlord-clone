/**
 * The server half of saving: `POST /v1/save` and `POST /v1/load`.
 *
 * These drive a recording `fetch` rather than a stubbed `SaveServer`, because the
 * thing under test *is* the request this client makes — the path, the verb, and
 * above all the fact that the save file goes out as the raw request body rather
 * than wrapped in an envelope the server does not read.
 */

import { describe, it, expect } from "vitest";
import {
  SaveServer,
  SaveServerError,
  saveFileProblem,
  SAVE_FORMAT,
} from "../server";
import { faultBody, LOAD_REPLY, recordingFetch, SAVE_PAYLOAD } from "./fixture";

const URL_BASE = "http://127.0.0.1:8080";

function server(replies: Parameters<typeof recordingFetch>[0]) {
  const { fetch, calls } = recordingFetch(replies);
  return { server: new SaveServer({ httpUrl: URL_BASE, fetchImpl: fetch }), calls };
}

describe("saveFileProblem", () => {
  it("accepts the save file the campaign server writes", () => {
    expect(saveFileProblem(JSON.parse(SAVE_PAYLOAD))).toBeNull();
  });

  it("names the format marker before anything else", () => {
    // A random JSON document sent to the wrong endpoint has no meaningful
    // version, so reporting "version missing" would send a reader to the wrong file.
    expect(saveFileProblem({ hello: "world" })).toContain("format is undefined");
    expect(saveFileProblem({ format: "bannerlord-clone-save", version: 1, world: {} })).toContain(
      `format is "bannerlord-clone-save"`,
    );
    expect(saveFileProblem(null)).toContain("not a save file object");
    expect(saveFileProblem([])).toContain("an array");
  });

  it("refuses a version this client cannot read, and says which way", () => {
    const tooNew = { ...JSON.parse(SAVE_PAYLOAD), version: 99 };
    const tooOld = { ...JSON.parse(SAVE_PAYLOAD), version: 0 };
    expect(saveFileProblem(tooNew)).toContain("newer than this client reads");
    expect(saveFileProblem(tooOld)).toContain("older than this client reads");
  });

  it("refuses a file with no world, because there is nothing in it to restore", () => {
    const file = JSON.parse(SAVE_PAYLOAD) as Record<string, unknown>;
    delete file.world;
    expect(saveFileProblem(file)).toContain("world is missing");
  });

  it("reads the marker the server actually writes", () => {
    // Guards the constant against the server's own value drifting.
    expect(SAVE_FORMAT).toBe("mbclone-save");
    expect(JSON.parse(SAVE_PAYLOAD).format).toBe(SAVE_FORMAT);
  });
});

describe("SaveServer.save", () => {
  it("posts to /v1/save and hands back the file the server sent", async () => {
    const { server: s, calls } = server([{ body: SAVE_PAYLOAD }]);
    const file = await s.save();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${URL_BASE}/v1/save`);
    expect(calls[0]!.method).toBe("POST");
    expect(file.payload).toBe(SAVE_PAYLOAD);
    expect(file.format).toBe("mbclone-save");
    expect(file.version).toBe(1);
    expect(file.bytes).toBeGreaterThan(0);
  });

  it("keeps the bytes exactly as sent, because a re-serialised save is not that save", async () => {
    // Deliberately not the canonical form: extra whitespace, an odd key order.
    const text = '{\n  "format" : "mbclone-save",\n  "version": 1,\n  "world": { "entities": [] }\n}\n';
    const { server: s } = server([{ body: text }]);
    expect((await s.save()).payload).toBe(text);
  });

  it("refuses a save the client could never load back, and writes no slot", async () => {
    const { server: s } = server([{ body: JSON.stringify({ format: "mbclone-save", version: 1 }) }]);
    await expect(s.save()).rejects.toMatchObject({
      name: "SaveServerError",
      kind: "unreadable",
    });
  });

  it("does not call a body it cannot parse a save file out of a save", async () => {
    const { server: s } = server([{ body: "<html>gateway timeout</html>" }]);
    const err = await s.save().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveServerError);
    expect((err as SaveServerError).kind).toBe("unreadable");
  });

  it("turns the queued-orders refusal into a retryable wait, not a dead end", async () => {
    // The campaign package refuses a save while orders are queued and the
    // apiserver reports a plain error as a 500, so the phrase is the only signal.
    const { server: s } = server([
      {
        status: 500,
        statusText: "Internal Server Error",
        body: faultBody("save refused: orders are still queued; wait for the next tick and retry (2 queued)"),
      },
    ]);
    const err = (await s.save().catch((e: unknown) => e)) as SaveServerError;
    expect(err.kind).toBe("busy");
    expect(err.retryable).toBe(true);
    expect(err.playerMessage).toContain("middle of something");
  });

  it("prefers the server's own reason when it sent one", async () => {
    const { server: s } = server([
      { status: 400, statusText: "Bad Request", body: faultBody("bad request", "The request body could not be read.", "bad_request") },
    ]);
    const err = (await s.save().catch((e: unknown) => e)) as SaveServerError;
    expect(err.playerMessage).toBe("The request body could not be read.");
    expect(err.kind).toBe("rejected");
  });

  it("reports an unreachable server as retryable rather than as a refusal", async () => {
    const { server: s } = server([{ body: "", throw: new TypeError("Failed to fetch") }]);
    const err = (await s.save().catch((e: unknown) => e)) as SaveServerError;
    expect(err.kind).toBe("offline");
    expect(err.retryable).toBe(true);
    expect(err.playerMessage).toContain("untouched");
  });

  it("names a 404 as a server that does not keep campaigns, not as a broken save", async () => {
    const { server: s } = server([
      { status: 404, statusText: "Not Found", body: faultBody("not found", "", "not_found") },
    ]);
    const err = (await s.save().catch((e: unknown) => e)) as SaveServerError;
    expect(err.retryable).toBe(false);
    expect(err.playerMessage).toContain("does not keep campaigns");
  });
});

describe("SaveServer.load", () => {
  it("posts the save file as the raw body and reports the day the server is on", async () => {
    const { server: s, calls } = server([{ body: LOAD_REPLY }]);
    const outcome = await s.load(SAVE_PAYLOAD);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${URL_BASE}/v1/load`);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toBe(SAVE_PAYLOAD);
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
    expect(outcome).toEqual({ day: 42 });
  });

  it("refuses a foreign file before spending a round trip on it", async () => {
    const { server: s, calls } = server([]);
    const err = (await s.load('{"format":"some-other-game"}').catch((e: unknown) => e)) as SaveServerError;
    expect(err.kind).toBe("unreadable");
    expect(err.playerMessage).toContain("untouched");
    expect(calls).toHaveLength(0);
  });

  it("refuses a file that is not JSON at all", async () => {
    const { server: s, calls } = server([]);
    await expect(s.load("not json")).rejects.toMatchObject({ kind: "unreadable" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a load the server accepted but could not describe", async () => {
    // A load that half-happened and a panel that says "loaded" is the worst
    // outcome available, so an answer with no day is a failure, not a success.
    const { server: s } = server([{ body: JSON.stringify({ ok: true }) }]);
    const err = (await s.load(SAVE_PAYLOAD).catch((e: unknown) => e)) as SaveServerError;
    expect(err.kind).toBe("unreadable");
    expect(err.playerMessage).toContain("which day");
  });

  it("treats the queued-orders refusal on a load as retryable too", async () => {
    const { server: s } = server([
      {
        status: 500,
        statusText: "Internal Server Error",
        body: faultBody("load refused: orders are still queued; wait for the next tick and retry (1 queued)"),
      },
    ]);
    const err = (await s.load(SAVE_PAYLOAD).catch((e: unknown) => e)) as SaveServerError;
    expect(err.kind).toBe("busy");
    expect(err.retryable).toBe(true);
  });
});

describe("SaveServer defaults", () => {
  it("resolves its URL from the same config the world reads, trailing slash and all", () => {
    const withSlash = new SaveServer({ httpUrl: "http://example.test:9000/" });
    expect(withSlash.endpoint).toBe("http://example.test:9000");
  });

  it("defaults to a live server rather than a stubbed one", () => {
    // Constructing with no options must not throw and must not need a fetch.
    expect(() => new SaveServer()).not.toThrow();
    expect(new SaveServer().endpoint.length).toBeGreaterThan(0);
  });
});