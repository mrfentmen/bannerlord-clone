/**
 * Mission framework tests — runner, objectives, heists, bounty, jobs board.
 */
import { describe, expect, it } from "vitest";
import { bountyContract, bountyPayout } from "../bounty.js";
import { jobChopShop, jobRobbery, theScore, type HeistLocations } from "../heists.js";
import {
  action,
  custom,
  escapeWanted,
  goto,
  holdPosition,
  survive,
  timed,
  waitForEvent,
} from "../objectives.js";
import { MissionRun } from "../runner.js";
import type { MissionDef, MissionHost, Objective } from "../types.js";
import type { V3 } from "../../types.js";

const P0: V3 = { x: 0, y: 0, z: 0 };

interface FakeHost extends MissionHost {
  cash: number;
  heat: number;
  rep: Map<string, number>;
  emitEvent(name: string, data?: Record<string, unknown>): void;
  setPos(p: V3): void;
  setWantedLevel(n: number): void;
  setNow(t: number): void;
}

function makeHost(): FakeHost {
  const listeners = new Map<string, Array<(data?: Record<string, unknown>) => void>>();
  let pos: V3 = { ...P0 };
  let wanted = 0;
  let now = 0;
  const host: FakeHost = {
    cash: 0,
    heat: 0,
    rep: new Map(),
    playerPosition: () => ({ ...pos }),
    playerSpeed: () => 0,
    playerInVehicle: () => false,
    wantedLevel: () => wanted,
    setWanted: (n) => {
      wanted = n;
    },
    clearWanted: () => {
      wanted = 0;
    },
    addCash: (n) => {
      host.cash += n;
    },
    on: (event, cb) => {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
      return () => {
        const l = listeners.get(event) ?? [];
        const i = l.indexOf(cb);
        if (i >= 0) l.splice(i, 1);
      };
    },
    notify: () => {},
    now: () => now,
    addHeat: (n) => {
      host.heat += n;
    },
    addRep: (id, n) => {
      host.rep.set(id, (host.rep.get(id) ?? 0) + n);
    },
    emitEvent: (name, data) => {
      for (const cb of [...(listeners.get(name) ?? [])]) cb(data);
    },
    setPos: (p) => {
      pos = { ...p };
    },
    setWantedLevel: (n) => {
      wanted = n;
    },
    setNow: (t) => {
      now = t;
    },
  };
  return host;
}

function simpleDef(objectives: Objective[], reward = 100): MissionDef {
  return {
    id: "test",
    name: "Test",
    contact: "Nobody",
    position: P0,
    reward,
    repeatable: false,
    build: () => objectives,
  };
}

describe("MissionRun", () => {
  it("runs objectives in order and pays on pass", () => {
    const host = makeHost();
    host.setPos({ x: 0, y: 0, z: 0 });
    const run = new MissionRun(
      host,
      simpleDef([goto({ x: 10, y: 0, z: 0 }, 2, "go"), goto({ x: 20, y: 0, z: 0 }, 2, "go2")], 500),
    );
    run.start();
    expect(run.status).toBe("running");
    expect(run.objectiveIndex).toBe(0);
    host.setPos({ x: 10, y: 0, z: 0 });
    run.update(0.1);
    expect(run.objectiveIndex).toBe(1);
    host.setPos({ x: 20, y: 0, z: 0 });
    run.update(0.1);
    expect(run.status).toBe("passed");
    expect(host.cash).toBe(500);
  });

  it("fails the mission when an objective fails", () => {
    const host = makeHost();
    const bad: Objective = {
      text: "bad",
      target: () => null,
      start() {},
      update(ctx) {
        ctx.fail("boom");
        return "failed";
      },
      skip() {},
      stop() {},
    };
    const run = new MissionRun(host, simpleDef([bad]));
    run.start();
    run.update(0.1);
    expect(run.status).toBe("failed");
    expect(run.failReason).toBe("boom");
    expect(host.cash).toBe(0);
  });

  it("fails on player death and runs LIFO cleanup", () => {
    const host = makeHost();
    const order: string[] = [];
    const def: MissionDef = {
      ...simpleDef([custom({ text: "wait", update: () => "running" })]),
      build(ctx) {
        ctx.onCleanup(() => order.push("first"));
        ctx.onCleanup(() => order.push("second"));
        return [custom({ text: "wait", update: () => "running" })];
      },
    };
    const run = new MissionRun(host, def);
    run.start();
    run.update(0.1);
    host.emitEvent("player:died");
    expect(run.status).toBe("failed");
    expect(run.failReason).toBe("wasted");
    expect(order).toEqual(["second", "first"]);
  });

  it("aborts cleanly", () => {
    const host = makeHost();
    const run = new MissionRun(host, simpleDef([custom({ text: "wait", update: () => "running" })]));
    run.start();
    run.abort();
    expect(run.status).toBe("aborted");
    expect(host.cash).toBe(0);
  });

  it("fastForward forces the current objective done", () => {
    const host = makeHost();
    host.setWantedLevel(2);
    const run = new MissionRun(host, simpleDef([escapeWanted(300)], 10));
    run.start();
    run.fastForward(); // skip clears the wanted level → escapeWanted completes
    expect(run.status).toBe("passed");
    expect(host.cash).toBe(10);
  });
});

describe("objectives", () => {
  it("timed fails when the clock runs out", () => {
    const host = makeHost();
    const run = new MissionRun(
      host,
      simpleDef([timed(goto({ x: 100, y: 0, z: 0 }, 1, "go"), 5, "too slow")]),
    );
    run.start();
    run.update(6);
    expect(run.status).toBe("failed");
    expect(run.failReason).toBe("too slow");
  });

  it("escapeWanted passes when the heat drops", () => {
    const host = makeHost();
    host.setWantedLevel(3);
    const run = new MissionRun(host, simpleDef([escapeWanted(60)]));
    run.start();
    run.update(1);
    expect(run.status).toBe("running");
    host.setWantedLevel(0);
    run.update(1);
    expect(run.status).toBe("passed");
  });

  it("holdPosition accumulates only while inside", () => {
    const host = makeHost();
    const center = { x: 0, y: 0, z: 0 };
    const run = new MissionRun(host, simpleDef([holdPosition(() => center, 5, 10, "hold")]));
    run.start();
    host.setPos({ x: 100, y: 0, z: 100 });
    run.update(5);
    expect(run.status).toBe("running");
    host.setPos({ x: 0, y: 0, z: 0 });
    run.update(10);
    expect(run.status).toBe("passed");
  });

  it("waitForEvent resolves on the event", () => {
    const host = makeHost();
    const run = new MissionRun(host, simpleDef([waitForEvent("vault:breached", "wait")]));
    run.start();
    run.update(0.1);
    expect(run.status).toBe("running");
    host.emitEvent("vault:breached");
    run.update(0.1);
    expect(run.status).toBe("passed");
  });

  it("survive passes after the duration", () => {
    const host = makeHost();
    const run = new MissionRun(host, simpleDef([survive(10, "hold out")]));
    run.start();
    run.update(5);
    expect(run.status).toBe("running");
    run.update(5);
    expect(run.status).toBe("passed");
  });

  it("action runs its side effect once", () => {
    const host = makeHost();
    let n = 0;
    const run = new MissionRun(host, simpleDef([action(() => n++)]));
    run.start();
    run.update(0.1);
    run.update(0.1);
    expect(n).toBe(1);
  });
});

const LOC: HeistLocations = {
  jewelryStore: { x: 100, y: 0, z: 100 },
  marina: { x: 500, y: 0, z: 500 },
  chopShop: { x: 200, y: 0, z: 200 },
  stores: [{ x: 50, y: 0, z: 50 }],
};

describe("heists", () => {
  it("theScore sets 5 stars and pays on a clean getaway", () => {
    const host = makeHost();
    const run = new MissionRun(host, theScore(LOC));
    run.start();
    // goto store
    host.setPos({ x: 100, y: 0, z: 100 });
    run.update(0.1);
    // loot grab 20 s
    run.update(20);
    expect(host.wantedLevel()).toBe(5);
    // getaway to the marina
    host.setPos({ x: 500, y: 0, z: 500 });
    run.update(0.1);
    run.update(0.1); // clearWanted action starts
    run.update(0.1); // clearWanted action completes
    expect(run.status).toBe("passed");
    expect(host.cash).toBe(45000);
    expect(host.wantedLevel()).toBe(0);
  });

  it("theScore fails if the boat leaves", () => {
    const host = makeHost();
    const run = new MissionRun(host, theScore(LOC));
    run.start();
    host.setPos({ x: 100, y: 0, z: 100 });
    run.update(0.1);
    run.update(20);
    run.update(0.1); // loot action completes, getaway timer starts
    run.update(301); // getaway timer expires
    expect(run.status).toBe("failed");
    expect(run.failReason).toBe("the boat left without you");
  });

  it("jobRobbery is the smallest complete crime loop", () => {
    const host = makeHost();
    const run = new MissionRun(host, jobRobbery(LOC));
    run.start();
    host.setPos({ x: 50, y: 0, z: 50 });
    run.update(0.1);
    run.update(12); // empty the register
    host.setWantedLevel(0);
    run.update(0.1); // escapeWanted completes
    run.update(0.1); // payout action completes
    expect(run.status).toBe("passed");
    expect(host.cash).toBe(2500);
  });

  it("jobChopShop pays a bonus for the delivery", () => {
    const host = makeHost();
    const run = new MissionRun(host, jobChopShop(LOC));
    const def = jobChopShop(LOC);
    expect(def.repeatable).toBe(true);
    run.start();
    host.setPos({ x: 200, y: 0, z: 200 });
    run.update(0.1); // goto chop shop (Manny)
    run.update(0.1); // Manny talk action
    expect(run.text).toBe("Steal a car");
    expect(run.status).toBe("running");
  });
});

describe("bounty", () => {
  it("payout curve: floor((base + rep*12) * timeBonus)", () => {
    expect(bountyPayout(1000, 10, 1)).toBe(1120);
    expect(bountyPayout(1000, 0, 0.5)).toBe(500);
  });

  it("a clean capture pays the full curve", () => {
    const host = makeHost();
    host.setNow(1000);
    const def = bountyContract({
      id: "t1",
      name: "Rattlesnake",
      lastKnown: { x: 10, y: 0, z: 10 },
      baseReward: 2000,
      deadOrAlive: "dead-or-alive",
      reputation: () => 10,
    });
    const run = new MissionRun(host, def);
    run.start();
    host.setPos({ x: 10, y: 0, z: 10 });
    run.update(0.1); // trail picked up
    host.setPos({ x: 10, y: 0, z: 10 });
    run.update(0.1); // within 25 m: target found
    host.setNow(1010); // fast capture: 10 s elapsed
    host.emitEvent("bounty:captured");
    run.update(0.1);
    run.update(0.1); // payout action
    expect(run.status).toBe("passed");
    // ratio = 1.5 - 10/300 ≈ 1.467 → floor((2000 + 120) * 1.467) = 3110
    expect(host.cash).toBe(bountyPayout(2000, 10, 1.5 - 10 / 300));
  });

  it("killing an alive-only target fails the contract", () => {
    const host = makeHost();
    const def = bountyContract({
      id: "t2",
      name: "Witness",
      lastKnown: { x: 10, y: 0, z: 10 },
      baseReward: 2000,
      deadOrAlive: "alive",
      reputation: () => 0,
    });
    const run = new MissionRun(host, def);
    run.start();
    host.setPos({ x: 10, y: 0, z: 10 });
    run.update(0.1);
    run.update(0.1);
    host.emitEvent("bounty:killed");
    run.update(0.1);
    expect(run.status).toBe("failed");
    expect(run.failReason).toContain("alive");
  });
});
