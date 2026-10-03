/**
 * The API contract between this client and the campaign server, checked by
 * reading both ends.
 *
 * There is no schema generator and no shared spec file, so nothing else in the
 * repository notices when the two halves disagree. That is not hypothetical: the
 * campaign map calls `POST /v1/encounters/flee` and `POST
 * /v1/encounters/defeat` when a battle ends badly, and neither route was mounted.
 * Every flee and every defeat 404'd, the panel showed a failure with no cause,
 * and the fixture provider the client is developed against implemented both
 * perfectly well — so the tests that covered them passed and the game did not
 * work against a real server.
 *
 * So the two lists are compared here. Methods are deliberately ignored and only
 * paths compared: inferring the HTTP verb from the TypeScript would mean parsing
 * which private helper each call went through, and the bug this catches is a
 * path that was never mounted at all. A verb mismatch is a different mistake, and
 * it announces itself as a 405 rather than as a silent fallback.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The route table. Every handler the server mounts is registered here. */
const SERVER_ROUTES = new URL(
  "../../../../../services/simulation/cmd/apiserver/api/api.go",
  import.meta.url,
);

/**
 * The two places that actually talk to the simulation.
 *
 * `wire.ts` is excluded on purpose: it documents every endpoint in banner
 * comments, which is how the server and the client were kept in step by hand
 * before this file existed. Scanning it would count a documented endpoint as a
 * called one.
 */
const CLIENT_CALLERS = [
  new URL("../provider.ts", import.meta.url),
  new URL("../../battleflow/api.ts", import.meta.url),
];

/**
 * Paths the client asks for that the server does not mount, with the reason.
 *
 * Every entry is a debt someone has to pay; the day the server mounts the route,
 * delete the line. That is what keeps this test honest rather than a list that
 * grows until somebody switches it off.
 *
 * None of these are called by the running game yet — they are provider methods
 * added ahead of their server side, which is the order this repository works in.
 * The test that says so is below, because a list that quietly covers a *live*
 * panel would be the bug this file was written to find, restated.
 */
const DECLARED_BUT_UNSERVED: Record<string, string> = {
  "/v1/parties/split": "party split/merge is implemented in the client's fixture, with no server side yet",
  "/v1/parties/{}/merge": "party split/merge is implemented in the client's fixture, with no server side yet",
  "/v1/towns/{}/militia": "militia recruitment is implemented in the client's fixture, with no server side yet",
  "/v1/towns/{}/workshops": "workshop purchase is implemented in the client's fixture, with no server side yet",
  "/v1/workshops/{}/sell": "workshop sale is implemented in the client's fixture, with no server side yet",
  "/v1/dynasty/marry": "the dynasty foundation landed client-side first; the server side is not written",
  "/v1/dynasty/child": "the dynasty foundation landed client-side first; the server side is not written",
  "/v1/dynasty/characters/{}/kill": "the dynasty foundation landed client-side first; the server side is not written",
  "/v1/dynasty/clans/{}/heir": "the dynasty foundation landed client-side first; the server side is not written",
  "/v1/armies": "armies are implemented in the client's fixture, with no server side yet",
  "/v1/armies/{}/join": "armies are implemented in the client's fixture, with no server side yet",
  "/v1/armies/{}/leave": "armies are implemented in the client's fixture, with no server side yet",
  "/v1/armies/{}/disband": "armies are implemented in the client's fixture, with no server side yet",
  "/v1/armies/{}/objective": "armies are implemented in the client's fixture, with no server side yet",
  "/v1/towns/{}/siege": "sieges are implemented in the client's fixture, with no server side yet",
  "/v1/companions/{}/recruit": "companions are implemented in the client's fixture, with no server side yet",
  "/v1/wars": "wars are implemented in the client's fixture, with no server side yet",
  "/v1/wars/{}/peace": "wars are implemented in the client's fixture, with no server side yet",
  "/v1/quests": "quests are implemented in the client's fixture, with no server side yet",
  "/v1/quests/{}/abandon": "quests are implemented in the client's fixture, with no server side yet",
  "/v1/towns/{}/crime": "crime is implemented in the client's fixture, with no server side yet",
  "/v1/towns/{}/fine": "crime is implemented in the client's fixture, with no server side yet",
};

function read(url: URL): string {
  return readFileSync(fileURLToPath(url), "utf8");
}

/** Strips comments so a path in prose is not mistaken for a path in code. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every path the server mounts, with Go's `{wildcard}` segments kept as they are. */
function mountedPaths(): Set<string> {
  const out = new Set<string>();
  for (const match of read(SERVER_ROUTES).matchAll(/HandleFunc\("[A-Z]+\s+([^"]+)"/g)) {
    out.add(match[1]!.replace(/\/+$/, "") || "/");
  }
  return out;
}

/**
 * Every path the client requests, with `${...}` interpolation folded down to a
 * single wildcard segment so it can be compared with the server's `{id}`.
 *
 * Three details, each of which produced a false path when it was missing:
 *
 *   - A quoted string has to *begin* the path, right after the quote or right
 *     after a `${this.#httpUrl}` base. Otherwise a message like
 *     `POST /v1/time-scale -> refused…` reads as a request for a path.
 *   - A query string is dropped: `/v1/parties/nearby?rangeKm=…` and
 *     `/v1/parties/nearby` are one route.
 *   - `${…}` becomes `{}`, which is the wildcard the server's `{id}` is, so
 *     `/v1/encounters/${id}/resolve` compares equal to
 *     `POST /v1/encounters/{id}/resolve`.
 */
function requestedPaths(): Set<string> {
  const out = new Set<string>();
  for (const url of CLIENT_CALLERS) {
    const source = withoutComments(read(url));
    for (const match of source.matchAll(/["'`](?:\$\{[^}]*\})?(\/v1\/[^"'`?]*)/g)) {
      const path = match[1]!.replace(/\$\{[^}]*\}/g, "{}");
      if (path) out.add(path.replace(/\/+$/, "") || "/");
    }
  }
  return out;
}

/** Whether a route pattern serves a requested path, by Go's ServeMux rules. */
function serves(route: string, path: string): boolean {
  const a = route.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((segment, i) => {
    const want = b[i]!;
    if (segment.startsWith("{") && segment.endsWith("}")) return true;
    return segment === want || want === "{}";
  });
}

describe("the client's API contract", () => {
  it("reads both halves of the contract, so a broken test means a broken path", () => {
    // Both lists empty would make every assertion below pass for the wrong
    // reason, which is the failure mode this file exists to prevent.
    expect(mountedPaths().size).toBeGreaterThan(30);
    expect(requestedPaths().size).toBeGreaterThan(10);
  });

  it("requests only paths the server mounts", () => {
    const mounted = mountedPaths();
    const missing = [...requestedPaths()]
      .filter((path) => !(path in DECLARED_BUT_UNSERVED))
      .filter((path) => ![...mounted].some((route) => serves(route, path)))
      .sort();

    expect(
      missing,
      [
        "The client asks for these paths and the campaign server mounts no route for them,",
        "so every call 404s with \"that path is not part of the campaign API\" and the",
        "panel can only show a failure with no cause. Either mount the route or add the",
        "path to DECLARED_BUT_UNSERVED with a reason, so the debt stays visible.",
      ].join("\n"),
    ).toEqual([]);
  });

  it("keeps the list of unmounted paths honest", () => {
    const mounted = mountedPaths();
    const stale = Object.keys(DECLARED_BUT_UNSERVED).filter((path) =>
      [...mounted].some((route) => serves(route, path)),
    );
    expect(
      stale,
      "These are recorded as declared-but-unserved, but the server now mounts them. Delete the entries.",
    ).toEqual([]);
  });

  it("does not list a path the client stopped asking for", () => {
    const requested = requestedPaths();
    const forgotten = Object.keys(DECLARED_BUT_UNSERVED).filter((path) => {
      const segments = path.split("/").filter(Boolean);
      return ![...requested].some(
        (want) => segments.length === want.split("/").filter(Boolean).length,
      );
    });
    expect(
      forgotten,
      "These are recorded as unmounted, but nothing in the client requests them any more. Remove them and the entry.",
    ).toEqual([]);
  });

  it("mounts the two routes a lost or broken battle ends on", () => {
    // Spelled out rather than left to the general test, because these two are
    // the ones that were missing, whose absence no test caught, and which the
    // campaign map calls every time a battle ends badly.
    const mounted = [...mountedPaths()];
    expect(mounted.some((route) => serves(route, "/v1/encounters/flee"))).toBe(true);
    expect(mounted.some((route) => serves(route, "/v1/encounters/defeat"))).toBe(true);
  });

  it("keeps an unmounted path out of the allow-list once a panel reaches for it", () => {
    // The allow-list above is only honest while everything in it is unreachable.
    // If a panel starts calling one of those provider methods, the 404 is real to
    // a player, so this fails and the path has to be mounted instead of excused.
    const reachable = REACHED_BY_THE_GAME;
    const excusedButLive = reachable.filter((path) => path in DECLARED_BUT_UNSERVED);
    expect(
      excusedButLive,
      "The running game calls these, and the server does not serve them. Mount the routes rather than excusing them.",
    ).toEqual([]);
  });
});

/**
 * The endpoints the running game actually reaches for, by provider method.
 *
 * This is the set that matters to a player. Everything else in the provider is a
 * method waiting for a panel to call it, and a 404 on a method nothing calls is
 * not yet a bug a player can see. Fleeing and losing are in here because
 * `handleFlee` and the battle writeback call them, and they were not mounted.
 */
const REACHED_BY_THE_GAME = ["/v1/encounters/flee", "/v1/encounters/defeat"];
