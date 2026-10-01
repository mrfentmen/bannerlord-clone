/**
 * @vitest-environment jsdom
 *
 * The battle client's boundary: what it does with a reply it cannot use.
 *
 * CONSTITUTION.md section 1.3. The shared provider checks every reply it decodes; these
 * are the same three questions for the encounter and battle routes — is this the shape I
 * asked for, is a failure the player can read, and does a failure mean the battle server
 * is not there (fall back to a local drill) or that it is there and slow (say so and
 * stop)?
 */

import { describe, expect, it } from "vitest";
import { BattleApiError, createHttpBattleApi, type BattleApi } from "../api";
import { BattleFlow, moraleFraction } from "../flow";
import { EncounterPoller, MAX_TRACKED_ENCOUNTERS } from "../poll";
import {
  battleProblem,
  encounterListProblem,
  encounterProblem,
} from "../validate";
import type { Encounter } from "../types";

const sides = {
  attacker: { partyId: 1, name: "Player Warband", troops: 100, power: 120 },
  defender: { partyId: 2, name: "Rival Gang", troops: 80, power: 90 },
};

const encounter: Encounter = { id: "enc-1", ...sides, status: "pending" };

function json(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

/** A server that accepts the connection and then says nothing at all. */
function hangingFetch(): typeof fetch {
  return ((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("the operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as unknown as typeof fetch;
}

async function faultFrom(call: () => Promise<unknown>): Promise<BattleApiError> {
  try {
    await call();
  } catch (err) {
    return err as BattleApiError;
  }
  throw new Error("the call was expected to fail");
}

describe("the encounter and battle reply checks", () => {
  it("accepts a well-formed encounter and battle", () => {
    expect(encounterProblem(encounter)).toBeNull();
    expect(
      encounterProblem({
        ...encounter,
        status: "resolved",
        resolution: {
          winnerPartyId: 1,
          attackerLosses: 4,
          defenderLosses: 30,
          loot: 120,
        },
      }),
    ).toBeNull();
    expect(
      battleProblem({
        id: "battle-1",
        encounterId: "enc-1",
        status: "active",
        tick: 3,
        attacker: { partyId: 1, name: "Player Warband", troops: 90, morale: 60 },
        defender: { partyId: 2, name: "Rival Gang", troops: 70, morale: 55 },
      }),
    ).toBeNull();
  });

  it("names the field that is wrong, rather than failing the whole reply silently", () => {
    expect(encounterProblem(null)).toMatch(/not a JSON object/);
    expect(encounterProblem({ ...encounter, id: "" })).toBe("has no id");
    expect(encounterProblem({ ...encounter, status: "won" })).toMatch(/status is not/);
    expect(encounterProblem({ ...encounter, attacker: { partyId: 1 } })).toMatch(
      /^attacker has no name$/,
    );
    expect(encounterProblem({ ...encounter, resolution: { winnerPartyId: 1 } })).toMatch(
      /resolution attackerLosses is not a number/,
    );
    expect(battleProblem({ id: "battle-1" })).toBe("has no encounterId");
  });

  it("reads the route's null answer as an empty list, and refuses anything else", () => {
    expect(encounterListProblem(null)).toBeNull();
    expect(encounterListProblem([encounter])).toBeNull();
    expect(encounterListProblem({})).toMatch(/not a list/);
    expect(encounterListProblem([{ id: "enc-1" }])).toMatch(/encounter 0 attacker is not/);
  });
});

describe("createHttpBattleApi at the boundary", () => {
  it("gives up on a server that stops answering, and does not fall back to a local drill", async () => {
    const api = createHttpBattleApi("http://localhost:9", hangingFetch(), 5);
    const err = await faultFrom(() => api.listEncounters(3));
    expect(err).toBeInstanceOf(BattleApiError);
    expect(err.timedOut).toBe(true);
    expect(err.serverBattleUnavailable).toBe(false);
    expect(err.reason).toContain("Nothing was decided");
  });

  it("reads a party's empty encounter list as no encounters", async () => {
    const api = createHttpBattleApi("http://localhost:9", json(null));
    await expect(api.listEncounters(7)).resolves.toEqual([]);
  });

  it("refuses a reply that is not the shape the route documents", async () => {
    const api = createHttpBattleApi("http://localhost:9", json({ id: "enc-1" }));
    const err = await faultFrom(() => api.createEncounter(1, 2));
    expect(err.code).toBe("unreadable");
    // Unreadable is neither "not built yet" nor "not there": substituting a local fight
    // for a real one would be a lie about what happened.
    expect(err.serverBattleUnavailable).toBe(false);
  });

  it("refuses an encounter list that is not a list", async () => {
    const api = createHttpBattleApi("http://localhost:9", json({ encounters: [] }));
    const err = await faultFrom(() => api.listEncounters(7));
    expect(err.code).toBe("unreadable");
  });

  it("refuses a battle missing its clock", async () => {
    const api = createHttpBattleApi(
      "http://localhost:9",
      json({
        id: "battle-1",
        encounterId: "enc-1",
        status: "active",
        attacker: { partyId: 1, name: "A", troops: 10, morale: 60 },
        defender: { partyId: 2, name: "B", troops: 10, morale: 60 },
      }),
    );
    const err = await faultFrom(() => api.getBattle("battle-1"));
    expect(err.code).toBe("unreadable");
    expect(err.message).toContain("tick is not a number");
  });
});

describe("a poller that cannot read the answer", () => {
  /** Only the route under test is real; the rest of the API is never called. */
  function listingApi(list: unknown): BattleApi {
    return {
      listEncounters: async () => list as Encounter[],
    } as unknown as BattleApi;
  }

  it("reports a non-list answer once, and stays quiet on the next tick", async () => {
    const errors: unknown[] = [];
    const poller = new EncounterPoller(listingApi({ nope: true }), 1, {
      onNew: () => {},
      onError: (e) => errors.push(e),
    });
    await expect(poller.pollOnce()).resolves.toEqual([]);
    await poller.pollOnce();
    expect(errors).toHaveLength(1);
  });

  it("reports a failure once until a poll succeeds again", async () => {
    const errors: unknown[] = [];
    let failing = true;
    const api = {
      listEncounters: async () => {
        if (failing) throw new Error("weird");
        return [];
      },
    } as unknown as BattleApi;
    const poller = new EncounterPoller(api, 1, {
      onNew: () => {},
      onError: (e) => errors.push(e),
    });
    await poller.pollOnce();
    await poller.pollOnce();
    expect(errors).toHaveLength(1);

    failing = false;
    await poller.pollOnce();
    failing = true;
    await poller.pollOnce();
    expect(errors).toHaveLength(2);
  });

  it("forgets an encounter the server has finished with, so a live one is never a stale no", async () => {
    let list: Encounter[] = [
      { ...encounter, id: "enc-1" },
      { ...encounter, id: "enc-2", status: "resolved" },
    ];
    const api = {
      listEncounters: async () => list,
    } as unknown as BattleApi;
    let offered: string[] = [];
    const poller = new EncounterPoller(api, 1, {
      onNew: (e) => offered.push(e.id),
    });
    await poller.pollOnce();
    expect(offered).toEqual(["enc-1"]);

    // enc-2 leaves the pending set and its id is forgotten, so if the server ever
    // reports it pending again that is a new offer rather than one the player missed.
    list = [
      { ...encounter, id: "enc-1" },
      { ...encounter, id: "enc-2" },
    ];
    offered = [];
    await poller.pollOnce();
    expect(offered).toEqual(["enc-2"]);
  });

  it("keeps its memory of offered encounters bounded", async () => {
    const many: Encounter[] = Array.from(
      { length: MAX_TRACKED_ENCOUNTERS + 25 },
      (_, i) => ({ ...encounter, id: `enc-${i}` }),
    );
    let offered: string[] = [];
    const poller = new EncounterPoller(listingApi(many), 1, {
      onNew: (e) => offered.push(e.id),
    });
    await poller.pollOnce();
    expect(offered).toHaveLength(many.length);

    // The window holds the most recent MAX ids, so the next tick offers the 25 oldest
    // again: a bounded memory, and the cost of it stated rather than hidden.
    offered = [];
    await poller.pollOnce();
    expect(offered).toEqual(many.slice(0, 25).map((e) => e.id));
  });
});

describe("morale on the live view", () => {
  it("reads the server's 0..100 scale and the local 0..1 scale alike", () => {
    expect(moraleFraction(60)).toBeCloseTo(0.6);
    expect(moraleFraction(100)).toBe(1);
    expect(moraleFraction(0)).toBe(0);
    expect(moraleFraction(0.35)).toBeCloseTo(0.35);
    // Out of range on either scale is clamped rather than rendered as a wild number.
    expect(moraleFraction(140)).toBe(1);
    expect(moraleFraction(-20)).toBe(0);
    expect(moraleFraction(Number.NaN)).toBe(0);
  });

  it("shows a server battle's morale as a percentage of a full force, not as 6000%", async () => {
    const api = {
      createEncounter: async () => encounter,
      startBattle: async () => ({
        id: "battle-1",
        encounterId: "enc-1",
        status: "active" as const,
        tick: 0,
        attacker: { partyId: 1, name: "Player Warband", troops: 100, morale: 60 },
        defender: { partyId: 2, name: "Rival Gang", troops: 80, morale: 55 },
      }),
    } as unknown as BattleApi;
    const flow = new BattleFlow(api, { describeEncounter: () => sides }, 1);
    await flow.begin(1, 2);
    await flow.escalate();

    const view = flow.liveView()!;
    expect(view.playerSide.morale).toBeCloseTo(0.6);
    expect(view.enemySide.morale).toBeCloseTo(0.55);
  });
});