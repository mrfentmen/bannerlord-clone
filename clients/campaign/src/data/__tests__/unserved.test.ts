/**
 * The table of orders the campaign server does not serve, and the answer panels get
 * from it.
 *
 * The point of these tests is not that the table has the right contents today — the
 * contract test reads the server's route table for that — but that the table is
 * well-formed, because a malformed entry is a control that is either wrongly withheld
 * or wrongly offered and neither is visible from the client's own tests.
 */

import { describe, expect, it } from "vitest";
import { UNSERVED, servesOrder, unservedPath, type UnservedOrder } from "../unserved.js";
import { HttpSimulationProvider } from "../provider.js";
import { createFixtureSimulationProvider } from "../fixture/fixtureProvider.js";

describe("unserved orders", () => {
  it("gives every entry a reason, because an unexplained gap is not a record", () => {
    const unexplained = Object.entries(UNSERVED)
      .filter(([, entry]) => entry.reason.trim().length === 0)
      .map(([path]) => path);
    expect(unexplained).toEqual([]);
  });

  it("writes paths the way the server's route table does", () => {
    // `{id}` is how Go spells a wildcard segment and how the route table spells it, so
    // an entry written any other way could never be matched against a mounted route and
    // would sit in the table looking checked.
    const malformed = Object.keys(UNSERVED).filter((path) => !path.startsWith("/v1/"));
    expect(malformed).toEqual([]);
  });

  it("records each order once, so withholding an order cannot be ambiguous", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [path, entry] of Object.entries(UNSERVED)) {
      const first = seen.get(entry.order);
      if (first === undefined) seen.set(entry.order, path);
      else duplicates.push(`${entry.order}: ${first} and ${path}`);
    }
    expect(duplicates).toEqual([]);
  });

  it("resolves an order to the one path it asks for", () => {
    expect(unservedPath("splitParty")).toBe("/v1/parties/split");
    expect(unservedPath("recruitMilitia")).toBe("/v1/towns/{}/militia");
  });

  it("has no path for an order it does not record", () => {
    expect(unservedPath("trade")).toBeUndefined();
    expect(unservedPath("notAnOrder")).toBeUndefined();
  });

  it("reports every recorded order as unserved", () => {
    // Every order is unserved today. The day one is mounted, this fails and the entry
    // is deleted rather than quietly left behind claiming a gap that has closed.
    const wronglyServed = Object.values(UNSERVED)
      .map((entry) => entry.order)
      .filter((order) => servesOrder(order))
      .sort();
    expect(wronglyServed).toEqual([]);
  });

  it("serves an order that is not in the table", () => {
    // The orders the table says nothing about are the ones the server does serve, and
    // a panel asking about one of those has to be told yes.
    expect(servesOrder("trade")).toBe(true);
    expect(servesOrder("recruit")).toBe(true);
  });
});

describe("the http provider's answer about an order", () => {
  const provider = new HttpSimulationProvider({ kind: "http" });

  it("withholds an order the campaign server mounts no route for", () => {
    expect(provider.servesOrder("splitParty")).toBe(false);
    expect(provider.servesOrder("buyWorkshop")).toBe(false);
    expect(provider.servesOrder("sellWorkshop")).toBe(false);
    expect(provider.servesOrder("recruitMilitia")).toBe(false);
  });

  it("allows an order the campaign server does serve", () => {
    expect(provider.servesOrder("trade" as UnservedOrder)).toBe(true);
  });
});

describe("the fixture provider's answer about an order", () => {
  // The fixture is the deployed build's fallback when no simulation server answers, so
  // a control withheld here is a control missing from the playable site rather than from
  // a developer's machine. The fixture implements every order the client knows, so it has
  // to say yes to all of them.
  const provider = createFixtureSimulationProvider();

  it("serves every order unserved.ts records", () => {
    const withheld = Object.values(UNSERVED)
      .map((entry) => entry.order)
      .filter((order) => !provider.servesOrder(order))
      .sort();
    expect(withheld).toEqual([]);
  });
});
