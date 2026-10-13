/**
 * Cruiser AI — pursuit driver for police cars.
 *
 * Ported from leonida's `police/PoliceDriver.ts` (MIT; license caveat in
 * `types.ts`). Behaviour: A* over the road graph to the player's nearest
 * node (re-pathed every 2 s), lane-offset node following, direct pursuit
 * with ramming once the player's car is close and visible, and a
 * stop-and-bail when the player is on foot nearby. A stuck detector backs
 * the car up instead of grinding against a wall.
 *
 * Engine-decoupled: the road graph and the cruiser are the minimal
 * interfaces below; Babylon adapters live in `director.ts`.
 */
import { CRIME_CONFIG } from "./config.js";
import type { CopSight, CopContext } from "./copBrain.js";
import type { V3 } from "./types.js";

const D = CRIME_CONFIG.driver;

export type DriverMode = "route" | "pursuit" | "hold" | "leave";

export interface CruiserControls {
  throttle: number; // 0..1
  steer: number; // -1..1
  brake: number; // 0..1
  handbrake: boolean;
}

export interface CruiserVehicle {
  position: V3;
  /** Radians, atan2(x, z) convention (0 = +Z). */
  heading: number;
  speedMs: number;
  /** Player velocity when ramming (null when the player is on foot). */
  playerVelocity: V3 | null;
  controls: CruiserControls;
}

export interface RoadNode {
  id: number;
  position: V3;
}

export interface RoadGraph {
  nodes: RoadNode[];
  nearestNode(p: V3): RoadNode;
  astar(fromId: number, toId: number): number[] | null;
}

export class PoliceDriver {
  mode: DriverMode = "route";
  /** Set when the crew should get out; the director performs the exit. */
  wantsBail = false;
  private path: number[] = [];
  private pathIndex = 0;
  private repathTimer = 0;
  private losTimer = 0;
  private hasLos = false;
  private stuckTime = 0;
  private reverseTime = 0;
  private leaveTime = 0;

  constructor(
    private readonly ctx: Pick<
      CopContext,
      "level" | "tier" | "holdFire" | "playerAlive" | "playerSpeed" | "playerInVehicle" | "playerPosition" | "sight" | "reportSighting"
    > & { sight: CopSight },
    private readonly graph: RoadGraph,
  ) {}

  get leaveSeconds(): number {
    return this.leaveTime;
  }

  standDown(): void {
    if (this.mode !== "leave") {
      this.mode = "leave";
      this.leaveTime = 0;
      this.repathTimer = 0;
    }
  }

  update(v: CruiserVehicle, dt: number): void {
    const c = v.controls;
    c.handbrake = false;
    if (this.mode === "leave") {
      this.leaveTime += dt;
      this.followRoute(v, dt, D.cruiseSpeed * 0.6);
      return;
    }
    if (!this.ctx.playerAlive() || this.ctx.holdFire) {
      this.hold(v);
      return;
    }

    const playerPos = this.ctx.playerPosition();
    const dx = playerPos.x - v.position.x;
    const dz = playerPos.z - v.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const playerCar = this.ctx.playerInVehicle();

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = D.losInterval;
      const eye = { x: v.position.x, y: v.position.y + 1.75, z: v.position.z };
      this.hasLos = dist <= D.losRange && this.ctx.sight.toPlayer(eye, D.losRange);
      if (this.hasLos) this.ctx.reportSighting("cruiser");
    }

    // Player on foot and close: pull over and let the crew handle it.
    if (!playerCar && dist < D.exitRange && this.hasLos) {
      this.mode = "hold";
      this.hold(v);
      if (v.speedMs < D.exitSpeed) this.wantsBail = true;
      return;
    }
    if (this.mode === "hold") {
      // The player drove off or ran: resume the chase (the crew already bailed if it was stopped).
      this.mode = "route";
    }

    if (dist < D.pursuitRange && this.hasLos) {
      this.mode = "pursuit";
      this.pursue(v, dt, playerPos, playerCar, dist);
      return;
    }
    this.mode = "route";
    this.followRoute(v, dt, D.cruiseSpeed);
  }

  // --- Behaviours ------------------------------------------------------------

  private hold(v: CruiserVehicle): void {
    const c = v.controls;
    c.throttle = 0;
    c.steer = 0;
    c.brake = v.speedMs > 0.5 ? 1 : 0;
    c.handbrake = true;
  }

  private pursue(v: CruiserVehicle, dt: number, playerPos: V3, playerCar: boolean, dist: number): void {
    const lead = playerCar ? D.ramLead : 0;
    const vel = v.playerVelocity;
    const aim = {
      x: playerPos.x + (vel ? vel.x * lead : 0),
      y: playerPos.y,
      z: playerPos.z + (vel ? vel.z * lead : 0),
    };
    const ramming = this.ctx.tier.ramming && playerCar;
    let target = D.cruiseSpeed * 1.4;
    if (!ramming) {
      // Keep a gap rather than shove the car; brake down as the gap closes.
      const gap = dist - D.followGap;
      const playerSpeed = this.ctx.playerSpeed();
      target = gap < 0 ? 0 : Math.min(target, playerSpeed + Math.sqrt(2 * 6 * gap));
    }
    this.steerAndDrive(v, dt, aim, target, ramming);
  }

  private followRoute(v: CruiserVehicle, dt: number, cruise: number): void {
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = D.repathInterval;
      this.replan(v);
    }
    let aim: V3;
    if (this.pathIndex >= this.path.length) {
      // Route exhausted: head straight at the player until the next plan;
      // a departing unit just keeps rolling forward.
      if (this.mode === "leave") {
        aim = {
          x: v.position.x + Math.sin(v.heading) * 30,
          y: v.position.y,
          z: v.position.z + Math.cos(v.heading) * 30,
        };
      } else {
        aim = this.ctx.playerPosition();
      }
      this.steerAndDrive(v, dt, aim, cruise * 0.5, false);
      return;
    }
    const waypoint = this.laneTarget(v);
    const wx = waypoint.x - v.position.x;
    const wz = waypoint.z - v.position.z;
    if (wx * wx + wz * wz < D.nodeReach * D.nodeReach) {
      this.pathIndex++;
    }
    this.steerAndDrive(v, dt, this.pathIndex < this.path.length ? this.laneTarget(v) : waypoint, cruise, false);
  }

  private replan(v: CruiserVehicle): void {
    const from = this.graph.nearestNode(v.position);
    const goal =
      this.mode === "leave" ? this.awayNode(v.position) : this.graph.nearestNode(this.ctx.playerPosition());
    const path = this.graph.astar(from.id, goal.id);
    this.path = path ?? [];
    // Skip the start node when the car is already past it, so it does not turn back.
    this.pathIndex = this.path.length > 1 ? 1 : 0;
  }

  /** Farthest node from the player: a plausible "drive off" destination. */
  private awayNode(from: V3): RoadNode {
    const p = this.ctx.playerPosition();
    let best: RoadNode = this.graph.nodes[0]!;
    let bestD = -1;
    for (const n of this.graph.nodes) {
      const d = (n.position.x - p.x) ** 2 + (n.position.z - p.z) ** 2;
      if (d > bestD) {
        bestD = d;
        best = n;
      }
    }
    void from;
    return best;
  }

  /** Node position shifted to the right-hand lane relative to the travel direction. */
  private laneTarget(v: CruiserVehicle): V3 {
    const nodeId = this.path[this.pathIndex];
    const prevId = this.pathIndex > 0 ? this.path[this.pathIndex - 1] : undefined;
    const node = (nodeId !== undefined ? this.graph.nodes[nodeId] : undefined)?.position ?? v.position;
    const prev = (prevId !== undefined ? this.graph.nodes[prevId] : undefined)?.position ?? v.position;
    let dx = node.x - prev.x;
    let dz = node.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return { x: node.x, y: node.y, z: node.z };
    dx /= len;
    dz /= len;
    // Right of travel: (dz, -dx) under the +X east / +Z south convention.
    return { x: node.x + dz * D.laneOffset, y: node.y, z: node.z - dx * D.laneOffset };
  }

  private steerAndDrive(v: CruiserVehicle, dt: number, target: V3, desiredSpeed: number, flatOut: boolean): void {
    const c = v.controls;
    const speed = v.speedMs;
    const desired = Math.atan2(target.x - v.position.x, target.z - v.position.z);
    const err = wrapAngle(desired - v.heading);

    // Stuck against something: back up while counter-steering, then try again.
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      c.throttle = 0;
      c.brake = 1;
      c.steer = err > 0 ? 1 : -1;
      return;
    }
    if (speed < D.stuckSpeed && desiredSpeed > 2) {
      this.stuckTime += dt;
      if (this.stuckTime > D.stuckAfter) {
        this.stuckTime = 0;
        this.reverseTime = D.reverseSeconds;
        this.repathTimer = 0;
      }
    } else {
      this.stuckTime = 0;
    }

    c.steer = clamp(-err * D.steerGain, -1, 1);
    let allowed = desiredSpeed;
    if (!flatOut && Math.abs(err) > D.turnSlowAngle) allowed = Math.min(allowed, D.turnSpeed);
    const dv = allowed - speed;
    if (flatOut || dv > 0) {
      c.throttle = flatOut ? 1 : Math.min(1, dv * D.throttleGain);
      c.brake = 0;
    } else {
      c.throttle = 0;
      c.brake = Math.min(1, -dv * D.brakeGain);
    }
  }
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
