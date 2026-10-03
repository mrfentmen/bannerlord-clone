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
import { UNSERVED } from "../unserved.js";

/** The route table. Every handler the server mounts is registered here. */
const SERVER_ROUTES = new URL(
  "../../../../../services/simulation/cmd/apiserver/api/api.go",
  import.meta.url,
);

/** The module that constructs every panel, and so hands out every order callback. */
const APP_SHELL = new URL("../../main.ts", import.meta.url);

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
 * Read from `unserved.ts` rather than restated here. It used to be a second copy of
 * the table in this file, on the understanding that the two were kept in step by hand.
 * They were, and would have stayed that way right up to the moment somebody added a
 * row to `unserved.ts` — where it gates the control at runtime — and forgot this copy,
 * where it only gates a test. That drift is invisible from inside this repository: the
 * test passes, the gate in the deployed build starts withholding a working control, and
 * nothing reports it. One table, imported, is the only version of this fact that cannot
 * disagree with itself.
 *
 * None of these are called by the running game without a gate — they are provider
 * methods added ahead of their server side, which is the order this repository works
 * in. The test that says so is below, and it derives the set rather than listing it.
 */
const DECLARED_BUT_UNSERVED: Record<string, string> = Object.fromEntries(
  Object.entries(UNSERVED).map(([path, entry]) => [path, entry.reason]),
);

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
    // The allow-list above is only honest while everything in it is unreachable, either
    // because nothing calls it or because the call is behind a gate that consults
    // `servesOrder`. `gatedCalls` is derived from the app shell, so a panel that starts
    // calling one of these methods without that gate fails here, and a fifth such call
    // does not need anybody to remember to add it to a list.
    //
    // Fleeing and losing are not in `UNSERVED` at all — both routes are mounted now —
    // so they are asserted outright by the test above. This one is about the orders the
    // table excuses.
    const ungated = reachableUnservedCalls()
      .filter((call) => call.gate === null)
      .map((call) => `${call.method} at ${call.where} (${call.path})`);
    expect(
      ungated,
      [
        "The running game calls these without asking servesOrder whether the connected backend can",
        "carry them out, so against the campaign server each one is a 404 reaching the player as a",
        "failure with no stated cause. Wrap the call in order(provider, \"<order>\", ...) — unserved.ts",
        "records which provider method each order name refers to — or mount the route.",
      ].join("\n"),
    ).toEqual([]);
  });

  it("finds the unserved orders the running game reaches for, so the check above is not vacuous", () => {
    // The test above passes trivially if the scan finds nothing: a pattern that matches
    // no source file, or a renamed helper, would silence the one check meant to catch a
    // button that can only fail. So the derived set is asserted to be the one it is
    // today, which makes a silent no-op a failure rather than a green tick.
    const found = reachableUnservedCalls().map((call) => `${call.method} -> ${call.order}`).sort();
    expect(found).toEqual([
      "buyWorkshop -> buyWorkshop",
      "recruitMilitia -> recruitMilitia",
      "sellWorkshop -> sellWorkshop",
      "splitParty -> splitParty",
    ]);
  });

  it("has a gate that names the order whose method it guards", () => {
    // `order()` takes an order *name* and its body calls a provider *method*, and for
    // five entries in the table those are not the same string: `listArmies` is sent by
    // `createArmy`, `listWars` by `declareWar`, `listQuests` by `acceptQuest`,
    // `besiegeTown` by `startSiege`, `setClanHeir` by `getHeir`. TypeScript cannot
    // connect the two, so `order(provider, "listArmies", () => provider.createArmy(…))`
    // compiles and withholds nothing — the gate consulted the table, found an entry it
    // liked, and returned the callback, and the call 404s against a real server anyway.
    //
    // So every gate in the app shell is checked against the method its body actually
    // calls, using the `method` field the table records for that purpose.
    const mismatched = reachableUnservedCalls()
      .filter((call) => call.gate !== null && call.gate !== call.order)
      .map((call) => {
        const guards = methodForOrder(call.gate ?? "");
        const actual = guards ? `which guards provider.${guards}(…)` : "which is not an order in the table";
        return `${call.method} at ${call.where} is gated by order("${call.gate}"), ${actual}`;
      });
    expect(
      mismatched,
      "A gate withholds the control by consulting the table for its order name. Naming the wrong order withholds nothing.",
    ).toEqual([]);
  });
});

/**
 * The provider method an order name refers to, or undefined if the name is not one.
 *
 * The lookup is by `order` and not by `method`, which is the direction that catches a
 * gate naming the wrong order: the gate says which order it thinks it is withholding,
 * and this answers which call that order actually governs.
 */
function methodForOrder(order: string): string | undefined {
  for (const entry of Object.values(UNSERVED)) {
    if (entry.order === order) return entry.method;
  }
  return undefined;
}

/** One `order(provider, "<name>", …)` gate in the app shell, and the body it guards. */
interface Gate {
  /** The order name the gate consults the table with. */
  order: string;
  /** Character offset of the gate's opening. */
  start: number;
  /** Character offset of the `{` that opens the callback body. */
  bodyStart: number;
  /** Character offset just past the callback body's closing brace. */
  end: number;
}

/**
 * The offset of the `}` that closes the brace opened at `from`.
 *
 * Comments are expected to be gone already. Quoted strings are skipped so a brace inside
 * one does not move the count, and a template literal is skipped whole, which is sound
 * because an interpolation's own braces are balanced within it: `${…}` contributes one
 * `{` and one `}` and the contents between them are counted on their own terms.
 */
function closingBrace(source: string, from: number): number {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const c = source[i]!;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < source.length && source[i] !== c; i++) {
        if (source[i] === "\\") i++;
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  throw new Error(`no closing brace for the one at ${from}`);
}

/**
 * Every gate in the app shell, with the span of the body it guards.
 *
 * The span is found by walking to the callback's arrow and brace-matching from there,
 * rather than by taking the text up to the next gate. That distinction is the whole
 * point: deleting a gate must not hand its body to its neighbour. With the up-to-next-gate
 * rule, removing the `recruitMilitia` gate left `provider.recruitMilitia(…)` inside the
 * span of the `sellWorkshop` gate before it, so the ungated call was attributed to a gate
 * that guards a different order and the check passed — reporting a control as withheld
 * that the game would have sent, which is precisely the bug it exists to catch.
 */
function gatesIn(source: string): Gate[] {
  return [...source.matchAll(/order\(\s*provider\s*,\s*"([A-Za-z]+)"/g)].flatMap((match) => {
    const start = match.index ?? 0;
    const arrow = source.indexOf("=>", start);
    if (arrow === -1) throw new Error(`the gate at ${start} has no callback body`);
    const bodyStart = source.indexOf("{", arrow);
    if (bodyStart === -1) throw new Error(`the gate at ${start} has no callback body`);
    return [{ order: match[1]!, start, bodyStart, end: closingBrace(source, bodyStart) }];
  });
}

/** One call the running game makes to a provider method the server mounts no route for. */
interface UnservedCall {
  /** The `SimulationProvider` method, as the table records it. */
  method: string;
  /** The table's order name for that method. */
  order: string;
  /** The path the server mounts no route for. */
  path: string;
  /** Where the call is, in a form a reader can act on. */
  where: string;
  /** The order the enclosing gate names, or null when the call is not inside one. */
  gate: string | null;
}

/**
 * Every call the app shell makes to a provider method in the unserved table.
 *
 * Only the app shell is scanned, and that is a fact about the build rather than an
 * assumption: `main.ts` is the module that constructs the panels, so it is the only
 * place an order callback can be handed to one. Comments are stripped first, because a
 * doc comment that names `provider.buyWorkshop(…)` while explaining why the gate exists
 * is not a call, and counting one would put a phantom entry in every list below.
 */
function reachableUnservedCalls(): UnservedCall[] {
  const source = withoutComments(read(APP_SHELL));
  const gates = gatesIn(source);

  // Offset of the start of each line, so a match can be turned into a line number
  // without re-summing the file for every hit.
  const lineStarts: number[] = [0];
  for (const match of source.matchAll(/\n/g)) lineStarts.push(match.index + 1);

  const out: UnservedCall[] = [];
  for (const [path, entry] of Object.entries(UNSERVED)) {
    for (const match of source.matchAll(new RegExp(`provider\\.${entry.method}\\s*\\(`, "g"))) {
      const offset = match.index ?? 0;
      const enclosing = gates.find((gate) => offset > gate.bodyStart && offset < gate.end);
      out.push({
        method: entry.method,
        order: entry.order,
        path,
        where: `main.ts:${lineStarts.filter((start) => start <= offset).length}`,
        gate: enclosing?.order ?? null,
      });
    }
  }
  return out;
}
