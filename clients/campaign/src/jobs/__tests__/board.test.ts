/**
 * JobsBoard tests — gating and one end-to-end job run.
 */
import { describe, expect, it } from "vitest";
import { JobsBoard, type JobSpots } from "../board.js";
import { MissionRun } from "../../crime/missions/runner.js";
import type { MissionHost } from "../../crime/missions/types.js";
import type { V3 } from "../../crime/types.js";

const SPOTS: JobSpots = {
  gang_hq: { x: 0, y: 0, z: 0 },
  drug_pickup: { x: 10, y: 0, z: 0 },
  drug_dropoff: { x: 100, y: 0, z: 0 },
  front_1: { x: 20, y: 0, z: 0 },
  front_2: { x: 30, y: 0, z: 0 },
  front_3: { x: 40, y: 0, z: 0 },
  hit_area: { x: 50, y: 0, z: 0 },
  chop_shop: { x: 60, y: 0, z: 0 },
  lookout_corner: { x: 70, y: 0, z: 0 },
  docks: { x: 80, y: 0, z: 0 },
  warehouse: { x: 90, y: 0, z: 0 },
  haul_from: { x: 90, y: 0, z: 0 },
  haul_to: { x: 110, y: 0, z: 0 },
  club: { x: 120, y: 0, z: 0 },
  taxi_stand: { x: 130, y: 0, z: 0 },
  taxi_pickup: { x: 130, y: 0, z: 0 },
  taxi_dropoff: { x: 140, y: 0, z: 0 },
  farm: { x: 150, y: 0, z: 0 },
};

function makeHost(): MissionHost & {
  cash: number;
  heat: number;
  rep: Map<string, number>;
  pos: V3;
  inVehicle: boolean;
} {
  const listeners = new Map<string, Array<() => void>>();
  const host = {
    cash: 0,
    heat: 0,
    rep: new Map<string, number>(),
    pos: { x: 0, y: 0, z: 0 } as V3,
    inVehicle: false,
    playerPosition: () => ({ ...host.pos }),
    playerSpeed: () => 0,
    playerInVehicle: () => host.inVehicle,
    wantedLevel: () => 0,
    setWanted: () => {},
    clearWanted: () => {},
    addCash: (n: number) => {
      host.cash += n;
    },
    on: (event: string, cb: () => void) => {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
      return () => {};
    },
    notify: () => {},
    now: () => 1,
    addHeat: (n: number) => {
      host.heat += n;
    },
    addRep: (id: string, n: number) => {
      host.rep.set(id, (host.rep.get(id) ?? 0) + n);
    },
  };
  return host;
}

describe("JobsBoard", () => {
  it("lists all 11 jobs, gang and civilian", () => {
    const board = new JobsBoard("cincinnati", SPOTS, "iron-horsemen");
    expect(board.count).toBe(11);
    const jobs = board.available(() => 0);
    expect(jobs.filter((j) => j.kind === "gang")).toHaveLength(5);
    expect(jobs.filter((j) => j.kind === "civilian")).toHaveLength(6);
  });

  it("locks rep-gated jobs", () => {
    const board = new JobsBoard("cincinnati", SPOTS, "iron-horsemen");
    const jobs = board.available(() => 0);
    const hit = jobs.find((j) => j.id === "hit")!;
    expect(hit.locked).toBe(true); // minRep 20
    const drugRun = jobs.find((j) => j.id === "drug-run")!;
    expect(drugRun.locked).toBe(false);
    const unlocked = board.available(() => 25);
    expect(unlocked.find((j) => j.id === "hit")!.locked).toBe(false);
  });

  it("binds gang jobs to the gang", () => {
    const board = new JobsBoard("cincinnati", SPOTS, "iron-horsemen");
    const drugRun = board.byId("drug-run")!;
    expect(drugRun.gangId).toBe("iron-horsemen");
    expect(drugRun.employerId).toBe("iron-horsemen");
    const dock = board.byId("dockworker")!;
    expect(dock.employerId).toBe("port_authority");
  });

  it("runs a drug run end to end: cash, rep and heat", () => {
    const board = new JobsBoard("cincinnati", SPOTS, "iron-horsemen");
    const host = makeHost();
    const job = board.byId("drug-run")!;
    const run = new MissionRun(host, job);
    run.start();
    host.pos = { x: 10, y: 0, z: 0 };
    run.update(0.1); // pickup reached
    run.update(5); // loaded
    host.pos = { x: 100, y: 0, z: 0 };
    run.update(0.1); // delivered
    run.update(0.1); // completeJob action
    expect(run.status).toBe("passed");
    expect(host.cash).toBeGreaterThanOrEqual(800);
    expect(host.cash).toBeLessThanOrEqual(1500);
    expect(host.rep.get("iron-horsemen")).toBe(5);
    expect(host.heat).toBe(8);
  });

  it("a civilian job pays clean money with no heat", () => {
    const board = new JobsBoard("cincinnati", SPOTS, "iron-horsemen");
    const host = makeHost();
    const job = board.byId("dockworker")!;
    const run = new MissionRun(host, job);
    run.start();
    host.pos = { x: 80, y: 0, z: 0 };
    run.update(0.1);
    run.update(60);
    run.update(0.1);
    expect(run.status).toBe("passed");
    expect(host.cash).toBeGreaterThanOrEqual(300);
    expect(host.heat).toBe(0);
    expect(host.rep.get("port_authority")).toBe(1);
  });
});
