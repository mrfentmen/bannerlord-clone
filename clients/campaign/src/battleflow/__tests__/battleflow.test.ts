/**
 * Tests for the battle UI flow.
 *
 * Covers: the server path through a fake BattleApi, the graceful
 * fallback when the server answers "unimplemented", the unreachable
 * fallback, the local tick model (deterministic, orders matter), and
 * the three view models (pre-battle, live, after-action).
 */

import { describe, it, expect, vi } from "vitest";
import {
  BattleApiError,
  BattleFlow,
  EncounterPoller,
  createHttpBattleApi,
  type Battle,
  type BattleApi,
  type Encounter,
  type EncounterSide,
} from "../index";

const attacker: EncounterSide = {
  partyId: 1,
  name: "Player Warband",
  troops: 100,
  power: 120,
};
const defender: EncounterSide = {
  partyId: 2,
  name: "Rival Gang",
  troops: 80,
  power: 70,
};

function serverEncounter(): Encounter {
  return {
    id: "enc-1",
    attacker,
    defender,
    status: "pending",
  };
}

function serverBattle(): Battle {
  return {
    id: "battle-1",
    encounterId: "enc-1",
    status: "active",
    tick: 0,
    attacker: { partyId: 1, name: "Player Warband", troops: 100, morale: 1 },
    defender: { partyId: 2, name: "Rival Gang", troops: 80, morale: 1 },
  };
}

/** A fake server that behaves: every call succeeds. */
function workingApi(): BattleApi {
  let battle = serverBattle();
  return {
    createEncounter: async () => serverEncounter(),
    listEncounters: async () => [serverEncounter()],
    getEncounter: async () => serverEncounter(),
    resolveEncounter: async () => ({
      ...serverEncounter(),
      status: "resolved",
      resolution: {
        winnerPartyId: 1,
        attackerLosses: 12,
        defenderLosses: 36,
        loot: 200,
      },
    }),
    startBattle: async () => {
      battle = serverBattle();
      return battle;
    },
    getBattle: async () => battle,
    submitOrders: async (_id, orders) => {
      battle = {
        ...battle,
        tick: battle.tick + 1,
        attacker: {
          ...battle.attacker,
          troops: battle.attacker.troops - (orders.hold ? 1 : 3),
        },
        defender: {
          ...battle.defender,
          troops: battle.defender.troops - (orders.focusFire ? 8 : 5),
        },
      };
      return battle;
    },
    endBattle: async () => ({ ...battle, status: "ended" }),
  };
}

/** A fake server whose battle endpoints are not built yet. */
function unimplementedApi(): BattleApi {
  const err = () =>
    new BattleApiError(
      "unimplemented",
      "not built",
      "The battle hall is still being built.",
      501
    );
  return {
    createEncounter: async () => {
      throw err();
    },
    listEncounters: async () => {
      throw err();
    },
    getEncounter: async () => {
      throw err();
    },
    resolveEncounter: async () => {
      throw err();
    },
    startBattle: async () => {
      throw err();
    },
    getBattle: async () => {
      throw err();
    },
    submitOrders: async () => {
      throw err();
    },
    endBattle: async () => {
      throw err();
    },
  };
}

const localSource = {
  describeEncounter: () => ({ attacker, defender }),
};

describe("BattleFlow server path", () => {
  it("runs pre-battle -> live -> after-action through the API", async () => {
    const flow = new BattleFlow(workingApi(), localSource, 1);
    await flow.begin(1, 2);
    expect(flow.phase).toBe("prebattle");
    expect(flow.mode).toBe("server");

    const pre = flow.prebattleView();
    expect(pre).not.toBeNull();
    expect(pre!.encounter.attacker.name).toBe("Player Warband");
    expect(pre!.playerWinChance).toBeGreaterThan(0.5);
    expect(pre!.assessment.length).toBeGreaterThan(0);

    await flow.escalate();
    expect(flow.phase).toBe("live");
    const live = flow.liveView();
    expect(live).not.toBeNull();
    expect(live!.playerSide.partyId).toBe(1);
    expect(live!.availableOrders).toContain("advance");

    await flow.orders({ advance: 0.8, focusFire: true });
    expect(flow.battle!.tick).toBe(1);

    await flow.endBattle("victory");
    expect(flow.phase).toBe("afteraction");
    const after = flow.afterActionView();
    expect(after).not.toBeNull();
    expect(after!.playerWon).toBe(true);
    expect(after!.mode).toBe("server");
  });

  it("auto-resolve goes straight to after-action", async () => {
    const flow = new BattleFlow(workingApi(), localSource, 1);
    await flow.begin(1, 2);
    await flow.autoResolve();
    expect(flow.phase).toBe("afteraction");
    const after = flow.afterActionView();
    expect(after!.attackerLosses).toBe(12);
    expect(after!.loot).toBe(200);
  });
});

describe("BattleFlow unimplemented fallback", () => {
  it("falls back to local mode instead of crashing", async () => {
    const flow = new BattleFlow(unimplementedApi(), localSource, 1);
    await flow.begin(1, 2);
    expect(flow.phase).toBe("prebattle");
    expect(flow.mode).toBe("local");
    expect(flow.prebattleView()!.encounter.attacker.troops).toBe(100);
  });

  it("completes the whole local arc: pre-battle, ticks, after-action", async () => {
    const flow = new BattleFlow(unimplementedApi(), localSource, 1);
    await flow.begin(1, 2);
    await flow.escalate();
    expect(flow.phase).toBe("live");
    expect(flow.mode).toBe("local");

    for (let i = 0; i < 5; i++) {
      await flow.orders({ advance: 1, focusFire: true });
      if (flow.phase === "afteraction") break;
    }
    const battle = flow.battle!;
    expect(battle.tick).toBeGreaterThan(0);
    expect(battle.defender.troops).toBeLessThan(80);

    await flow.endBattle("victory");
    expect(flow.phase).toBe("afteraction");
    const after = flow.afterActionView()!;
    expect(after.mode).toBe("local");
    expect(after.ticks).toBe(battle.tick);
    expect(after.summary.length).toBeGreaterThan(0);
  });

  it("local auto-resolve is deterministic for the same encounter id", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1234567890);
    try {
      const flowA = new BattleFlow(unimplementedApi(), localSource, 1);
      const flowB = new BattleFlow(unimplementedApi(), localSource, 1);
      await flowA.begin(1, 2);
      await flowB.begin(1, 2);
      await flowA.autoResolve();
      await flowB.autoResolve();
      const a = flowA.afterActionView()!;
      const b = flowB.afterActionView()!;
      expect(a.winner).toBe(b.winner);
      expect(a.attackerLosses).toBe(b.attackerLosses);
      expect(a.defenderLosses).toBe(b.defenderLosses);
      expect(a.loot).toBe(b.loot);
    } finally {
      now.mockRestore();
    }
  });

  it("orders change the outcome: focus fire kills faster than holding", async () => {
    const aggressive = new BattleFlow(unimplementedApi(), localSource, 1);
    const passive = new BattleFlow(unimplementedApi(), localSource, 1);
    await aggressive.begin(1, 2);
    await passive.begin(1, 2);
    await aggressive.escalate();
    await passive.escalate();
    for (let i = 0; i < 3; i++) {
      await aggressive.orders({ advance: 1, focusFire: true });
      await passive.orders({ hold: true });
    }
    expect(aggressive.battle!.defender.troops).toBeLessThan(
      passive.battle!.defender.troops
    );
    // Holding preserves your own troops better.
    expect(passive.battle!.attacker.troops).toBeGreaterThanOrEqual(
      aggressive.battle!.attacker.troops
    );
  });

  it("retreat ends the battle", async () => {
    const flow = new BattleFlow(unimplementedApi(), localSource, 1);
    await flow.begin(1, 2);
    await flow.escalate();
    await flow.orders({ retreat: true });
    expect(flow.battle!.status).toBe("ended");
    expect(flow.phase).toBe("afteraction");
  });
});

describe("createHttpBattleApi", () => {
  it("maps a 501 unimplemented envelope to BattleApiError.unimplemented", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: { code: "unimplemented", message: "not built yet" },
          reason: "The battle hall is still being built.",
        }),
        { status: 501, headers: { "content-type": "application/json" } }
      )) as typeof fetch;
    const api = createHttpBattleApi("http://localhost:9", fetchImpl);
    let threw: BattleApiError | null = null;
    try {
      await api.createEncounter(1, 2);
    } catch (err) {
      threw = err as BattleApiError;
    }
    expect(threw).toBeInstanceOf(BattleApiError);
    expect(threw!.unimplemented).toBe(true);
    expect(threw!.reason).toContain("battle hall");
  });

  it("maps a refused connection to BattleApiError.unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;
    const api = createHttpBattleApi("http://localhost:9", fetchImpl);
    let threw: BattleApiError | null = null;
    try {
      await api.startBattle("enc-1");
    } catch (err) {
      threw = err as BattleApiError;
    }
    expect(threw).toBeInstanceOf(BattleApiError);
    expect(threw!.unreachable).toBe(true);
    expect(threw!.serverBattleUnavailable).toBe(true);
  });

  it("a mid-battle server death finishes locally instead of stranding the player", async () => {
    const api: BattleApi = {
      ...workingApi(),
      submitOrders: async () => {
        throw new BattleApiError(
          "unreachable",
          "died",
          "The battle could not be read.",
          0
        );
      },
    };
    const flow = new BattleFlow(api, localSource, 1);
    await flow.begin(1, 2);
    await flow.escalate();
    expect(flow.mode).toBe("server");
    await flow.orders({ advance: 0.5 });
    expect(flow.mode).toBe("local");
    expect(flow.phase).toBe("live");
    expect(flow.battle!.tick).toBe(1);
  });
});

describe("createHttpBattleApi.listEncounters", () => {
  it("polls GET /v1/encounters?partyId={id} and returns the parsed list", async () => {
    let seenUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      seenUrl = String(url);
      return new Response(JSON.stringify([serverEncounter()]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const api = createHttpBattleApi("http://localhost:9", fetchImpl);
    const encounters = await api.listEncounters(7);
    expect(seenUrl).toBe("http://localhost:9/v1/encounters?partyId=7");
    expect(encounters).toHaveLength(1);
    expect(encounters[0]!.id).toBe("enc-1");
  });
});

describe("EncounterPoller", () => {
  function listingApi(list: Encounter[]): BattleApi {
    return { ...workingApi(), listEncounters: async () => list };
  }

  it("fires onNew once per new pending encounter and dedupes across ticks", async () => {
    const seen: Encounter[] = [];
    const poller = new EncounterPoller(listingApi([serverEncounter()]), 1, {
      onNew: (e) => seen.push(e),
    });
    await poller.pollOnce();
    await poller.pollOnce();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.id).toBe("enc-1");
  });

  it("ignores resolved and escalated encounters", async () => {
    const seen: Encounter[] = [];
    const resolved: Encounter = {
      ...serverEncounter(),
      id: "enc-2",
      status: "resolved",
    };
    const escalated: Encounter = {
      ...serverEncounter(),
      id: "enc-3",
      status: "escalated",
    };
    const poller = new EncounterPoller(listingApi([resolved, escalated]), 1, {
      onNew: (e) => seen.push(e),
    });
    const fresh = await poller.pollOnce();
    expect(fresh).toHaveLength(0);
    expect(seen).toHaveLength(0);
  });

  it("stays silent when the server is unreachable", async () => {
    const errors: unknown[] = [];
    const api: BattleApi = {
      ...workingApi(),
      listEncounters: async () => {
        throw new BattleApiError("unreachable", "down", "quiet", 0);
      },
    };
    const poller = new EncounterPoller(api, 1, {
      onNew: () => {
        throw new Error("should not fire");
      },
      onError: (e) => errors.push(e),
    });
    const fresh = await poller.pollOnce();
    expect(fresh).toEqual([]);
    expect(errors).toHaveLength(0);
  });

  it("routes unexpected failures to onError", async () => {
    const errors: unknown[] = [];
    const boom = new Error("weird");
    const api: BattleApi = {
      ...workingApi(),
      listEncounters: async () => {
        throw boom;
      },
    };
    const poller = new EncounterPoller(api, 1, {
      onNew: () => {},
      onError: (e) => errors.push(e),
    });
    const fresh = await poller.pollOnce();
    expect(fresh).toEqual([]);
    expect(errors).toEqual([boom]);
  });

  it("start/stop toggles the running flag", () => {
    const poller = new EncounterPoller(workingApi(), 1, { onNew: () => {} });
    expect(poller.running).toBe(false);
    poller.start(1000);
    expect(poller.running).toBe(true);
    poller.stop();
    expect(poller.running).toBe(false);
  });
});

describe("BattleFlow encounter polling", () => {
  it("pollEncounters returns only pending encounters", async () => {
    const pending = serverEncounter();
    const resolved: Encounter = {
      ...serverEncounter(),
      id: "enc-9",
      status: "resolved",
    };
    const api: BattleApi = {
      ...workingApi(),
      listEncounters: async () => [pending, resolved],
    };
    const flow = new BattleFlow(api, localSource, 1);
    const found = await flow.pollEncounters();
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe("enc-1");
  });

  it("pollEncounters returns [] when the server is unreachable", async () => {
    const api: BattleApi = {
      ...workingApi(),
      listEncounters: async () => {
        throw new BattleApiError("unreachable", "down", "quiet", 0);
      },
    };
    const flow = new BattleFlow(api, localSource, 1);
    await expect(flow.pollEncounters()).resolves.toEqual([]);
  });

  it("adoptEncounter starts the pre-battle arc in server mode", () => {
    const flow = new BattleFlow(workingApi(), localSource, 1);
    flow.adoptEncounter(serverEncounter());
    expect(flow.phase).toBe("prebattle");
    expect(flow.mode).toBe("server");
    const pre = flow.prebattleView();
    expect(pre).not.toBeNull();
    expect(pre!.encounter.id).toBe("enc-1");
    expect(pre!.playerIsAttacker).toBe(true);
  });

  it("adoptEncounter marks the player as defender when they are attacked", () => {
    const flow = new BattleFlow(workingApi(), localSource, 2);
    flow.adoptEncounter(serverEncounter()); // party 2 is the defender
    const pre = flow.prebattleView();
    expect(pre).not.toBeNull();
    expect(pre!.playerIsAttacker).toBe(false);
    expect(pre!.playerWinChance).toBeLessThan(0.5);
  });
});
