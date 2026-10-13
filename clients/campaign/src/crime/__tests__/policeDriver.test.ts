/**
 * PoliceDriver tests — the cruiser pursuit AI against a fake road graph.
 */
import { describe, expect, it } from "vitest";
import type { CopContext } from "../copBrain.js";
import { dispatchTier } from "../policeData.js";
import {
  PoliceDriver,
  type CruiserVehicle,
  type RoadGraph,
  type RoadNode,
} from "../policeDriver.js";
import type { V3 } from "../types.js";

/** Straight road: nodes every 20 m along +X. */
function makeGraph(): RoadGraph {
  const nodes: RoadNode[] = [];
  for (let i = 0; i < 10; i++) nodes.push({ id: i, position: { x: i * 20, y: 0, z: 0 } });
  return {
    nodes,
    nearestNode(p: V3): RoadNode {
      let best: RoadNode = nodes[0]!;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = (n.position.x - p.x) ** 2 + (n.position.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    },
    astar(fromId: number, toId: number): number[] | null {
      if (fromId === toId) return [fromId];
      const path: number[] = [];
      const step = toId > fromId ? 1 : -1;
      for (let i = fromId; step > 0 ? i <= toId : i >= toId; i += step) path.push(i);
      return path;
    },
  };
}

interface CtxOpts {
  level?: number;
  playerPos?: V3;
  playerInVehicle?: boolean;
  playerSpeed?: number;
  sight?: boolean;
  alive?: boolean;
}

function makeCtx(opts: CtxOpts = {}): CopContext {
  const playerPos = opts.playerPos ?? { x: 100, y: 0, z: 0 };
  return {
    level: opts.level ?? 2,
    heat: 0,
    tier: dispatchTier(opts.level ?? 2),
    holdFire: false,
    playerAlive: () => opts.alive ?? true,
    playerArmed: () => false,
    playerSpeed: () => opts.playerSpeed ?? 0,
    playerInVehicle: () => opts.playerInVehicle ?? true,
    playerPosition: () => playerPos,
    rng: { range: (a: number, b: number) => (a + b) / 2 },
    sight: { toPlayer: () => opts.sight ?? true },
    fire: () => {},
    reportSighting: () => {},
  };
}

function makeCruiser(x: number, z: number): CruiserVehicle {
  return {
    position: { x, y: 0, z },
    heading: Math.PI / 2, // facing +X
    speedMs: 10,
    playerVelocity: null,
    controls: { throttle: 0, steer: 0, brake: 0, handbrake: false },
  };
}

describe("PoliceDriver", () => {
  it("routes along the road graph toward the player", () => {
    const driver = new PoliceDriver(makeCtx({ playerPos: { x: 180, y: 0, z: 0 }, sight: false }), makeGraph());
    const v = makeCruiser(0, 0);
    for (let i = 0; i < 20; i++) {
      driver.update(v, 0.5);
      // Fake integration: move along heading with throttle.
      v.position.x += Math.sin(v.heading) * v.controls.throttle * 10 * 0.5;
      v.heading += v.controls.steer * 0.5 * 0.5;
    }
    expect(driver.mode).toBe("route");
    expect(v.position.x).toBeGreaterThan(0);
  });

  it("switches to pursuit when close with line of sight", () => {
    const driver = new PoliceDriver(
      makeCtx({ level: 2, playerPos: { x: 30, y: 0, z: 0 }, sight: true }),
      makeGraph(),
    );
    const v = makeCruiser(0, 0);
    driver.update(v, 0.5);
    expect(driver.mode).toBe("pursuit");
    expect(v.controls.throttle).toBeGreaterThan(0);
  });

  it("pulls over and bails when the player is on foot nearby", () => {
    const driver = new PoliceDriver(
      makeCtx({
        level: 1,
        playerPos: { x: 8, y: 0, z: 0 },
        playerInVehicle: false,
        sight: true,
      }),
      makeGraph(),
    );
    const v = makeCruiser(0, 0);
    v.speedMs = 1;
    driver.update(v, 0.5);
    expect(driver.mode).toBe("hold");
    expect(driver.wantsBail).toBe(true);
  });

  it("stands down into leave mode", () => {
    const driver = new PoliceDriver(makeCtx(), makeGraph());
    const v = makeCruiser(0, 0);
    driver.standDown();
    driver.update(v, 0.5);
    expect(driver.mode).toBe("leave");
    expect(driver.leaveSeconds).toBeGreaterThan(0);
  });

  it("holds position when the player is dead", () => {
    const driver = new PoliceDriver(makeCtx({ alive: false }), makeGraph());
    const v = makeCruiser(0, 0);
    driver.update(v, 0.5);
    expect(v.controls.handbrake).toBe(true);
  });

  it("backs up when stuck against an obstacle", () => {
    const driver = new PoliceDriver(
      makeCtx({ playerPos: { x: 180, y: 0, z: 0 }, sight: false }),
      makeGraph(),
    );
    const v = makeCruiser(0, 0);
    v.speedMs = 0; // pinned against a wall, still wants to move
    for (let i = 0; i < 8; i++) driver.update(v, 0.5);
    // After 2.5 s stuck the driver reverses: brake + counter-steer.
    expect(v.controls.brake).toBe(1);
  });
});
