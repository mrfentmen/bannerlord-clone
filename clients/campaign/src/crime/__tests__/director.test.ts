/**
 * CrimeDirector tests — wanted machine + witness + vision + dispatch + arrest
 * against a fake CrimeHost.
 */
import { describe, expect, it } from "vitest";
import { CopBrain, type CopPed } from "../copBrain.js";
import {
  CrimeDirector,
  type CrimeHost,
  type UnitKind,
  type WitnessPed,
} from "../director.js";
import type { RoadGraph } from "../policeDriver.js";
import type { V3, WantedState } from "../types.js";

const P0: V3 = { x: 0, y: 0, z: 0 };

function makeGraph(): RoadGraph {
  return {
    nodes: [{ id: 0, position: { x: 0, y: 0, z: 0 } }],
    nearestNode: () => ({ id: 0, position: { x: 0, y: 0, z: 0 } }),
    astar: () => [0],
  };
}

interface HostOpts {
  peds?: WitnessPed[];
  los?: boolean;
  playerSpeed?: number;
  playerInVehicle?: boolean;
  alive?: boolean;
}

function makeHost(opts: HostOpts = {}) {
  const spawned: UnitKind[] = [];
  const released: string[] = [];
  const notified: string[] = [];
  const sounds: string[] = [];
  const changed: Array<[number, WantedState, number]> = [];
  let busted = 0;
  const host: CrimeHost = {
    queryPeds: () => opts.peds ?? [],
    lineOfSight: () => opts.los ?? true,
    playerPosition: () => ({ ...P0 }),
    playerAlive: () => opts.alive ?? true,
    playerArmed: () => false,
    playerSpeed: () => opts.playerSpeed ?? 0,
    playerInVehicle: () => opts.playerInVehicle ?? false,
    playerVelocity: () => null,
    rng: { range: (a: number, b: number) => (a + b) / 2 },
    roadGraph: makeGraph(),
    notify: (text) => notified.push(text),
    playSound: (id) => sounds.push(id),
    onWantedChanged: (level, state, prev) => changed.push([level, state, prev]),
    onWantedCleared: () => {},
    onBusted: () => {
      busted++;
    },
    requestSpawn: (kind) => spawned.push(kind),
    requestRelease: (id) => released.push(id),
  };
  return { host, spawned, released, notified, sounds, changed, busted: () => busted };
}

function makeCopPed(x: number, z: number): CopPed {
  return {
    position: { x, y: 0, z },
    state: "idle",
    vehicle: null,
    handsUp: false,
    knockedDown: false,
    stop() {},
    moveToward() {},
    face() {},
  };
}

describe("CrimeDirector", () => {
  it("counts a crime witnessed by a nearby civilian", () => {
    const { host, changed } = makeHost({
      peds: [{ position: { x: 5, y: 0, z: 0 }, isCop: false, alive: true }],
    });
    const director = new CrimeDirector({ host });
    director.reportCrime("murder", P0);
    expect(director.machine.level).toBe(1);
    expect(changed[0]).toBeDefined();
    expect(changed[0]![0]).toBe(1);
  });

  it("ignores an unwitnessed quiet crime", () => {
    const { host } = makeHost();
    const director = new CrimeDirector({ host });
    director.reportCrime("assault", P0);
    expect(director.machine.level).toBe(0);
  });

  it("marks the player seen when a cop has line of sight", () => {
    const { host } = makeHost({ los: true });
    const director = new CrimeDirector({ host });
    const ped = makeCopPed(10, 0);
    director.registerCop(ped, director.makeCopBrain("pistol"));
    director.setLevel(1, "active");
    director.tick(0.5);
    expect(director.snapshot().playerSeen).toBe(true);
    expect(director.machine.state).toBe("active");
  });

  it("plans dispatch from the wanted level", () => {
    const { host, spawned } = makeHost();
    const director = new CrimeDirector({ host });
    director.setLevel(3, "active");
    director.tick(4); // passes the 3 s rebalance interval
    // Level 3: 3 cruisers + 1 roadblock.
    expect(spawned.filter((k) => k === "cruiser")).toHaveLength(3);
    expect(spawned).toContain("roadblock");
  });

  it("releases units when the level drops", () => {
    const { host, released } = makeHost();
    const director = new CrimeDirector({ host });
    director.setLevel(3, "active");
    const id1 = director.registerUnit("cruiser");
    const id2 = director.registerUnit("cruiser");
    const id3 = director.registerUnit("cruiser");
    director.registerUnit("roadblock");
    director.clear("debug");
    const plan = director.planDispatch();
    expect(plan.spawn).toHaveLength(0);
    expect(plan.release).toContain(id1);
    expect(plan.release).toContain(id2);
    expect(plan.release).toContain(id3);
    expect(released).toHaveLength(0); // plan is pure; the adapter releases
  });

  it("busts a still player in arrest contact at low level", () => {
    const { host, busted } = makeHost({ playerSpeed: 0 });
    const director = new CrimeDirector({ host });
    director.setLevel(1, "active");
    const ped = makeCopPed(1, 0);
    const brain = new CopBrain(
      {
        level: 1,
        heat: 0,
        tier: director.tier,
        holdFire: false,
        playerAlive: () => true,
        playerArmed: () => false,
        playerSpeed: () => 0,
        playerInVehicle: () => false,
        playerPosition: () => ({ ...P0 }),
        rng: { range: (a: number, b: number) => (a + b) / 2 },
        sight: { toPlayer: () => true },
        fire: () => {},
        reportSighting: () => {},
      },
      "pistol",
    );
    // Force arrest contact: ped next to the player with LOS.
    brain.update(ped, 0.5);
    expect(brain.arrestContact).toBe(true);
    director.registerCop(ped, brain);
    for (let i = 0; i < 10; i++) director.tick(0.2);
    expect(busted()).toBe(1);
    expect(director.machine.level).toBe(0);
  });

  it("serializes heat and clears the level on load", () => {
    const { host } = makeHost();
    const director = new CrimeDirector({ host });
    director.setLevel(2, "active");
    const saved = director.serialize();
    expect(saved.heat).toBeGreaterThan(0);
    const director2 = new CrimeDirector({ host });
    director2.deserialize(saved);
    expect(director2.machine.heat).toBe(saved.heat);
    expect(director2.machine.level).toBe(0);
  });

  it("snapshot exposes the search circle for the HUD", () => {
    const { host } = makeHost();
    const director = new CrimeDirector({ host });
    director.setLevel(2, "searching");
    const snap = director.snapshot();
    expect(snap.level).toBe(2);
    expect(snap.searchCenter).not.toBeNull();
    expect(snap.searchRadius).toBeGreaterThan(0);
  });
});
