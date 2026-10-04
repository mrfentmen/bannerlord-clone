/**
 * Arcade vehicle controller — one drivable car on the campaign map.
 *
 * Driving model ported from `bridge-mind/turbo-kart-rally` (MIT):
 * `docs/code-pulls/vehicle-physics/kart.js`. The core idea is the same:
 * separate forward speed from lateral velocity, then kill the lateral part
 * with exponential grip decay. Turn rate scales with speed (full authority
 * by 9 m/s, losing 16% at top speed). Racing-specific systems (drift
 * charging, boost pads, items, laps) are intentionally left out; what is
 * here is throttle / brake / reverse / steering / grip / slope gravity.
 * Full report: `docs/code-pulls/vehicle-physics/NOTES.md`.
 *
 * Like the PlayerController, ground comes from a `groundHeight(x, z)`
 * callback — the campaign passes `projection.heightAt(x, z) * VERTICAL_SCALE`.
 * The car is a procedural placeholder mesh (body + cabin + wheels); call
 * `setModel(root)` to swap in a real GLB (e.g. `rally_car.glb` from the
 * manifest) when the art is wired.
 *
 * Input reuses the `player.*` actions: moveForward = throttle, moveBack =
 * brake/reverse, moveLeft/moveRight = steering. The controller is inert
 * until `setActive(true)`.
 */

import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import type { InputRegistry } from "../input/registry.js";
import type { HeldState } from "./PlayerController.js";

export interface VehicleStats {
  /** m/s. Default 30 (~108 km/h). */
  maxSpeed: number;
  /** m/s^2 at standstill. Default 11. */
  accel: number;
  /** m/s^2. Default 22. */
  brakeDecel: number;
  /** m/s. Default 8. */
  reverseMaxSpeed: number;
  /** m/s^2 coasting. Default 4. */
  coastDecel: number;
  /** rad/s at full lock. Default 2.0. */
  turnRate: number;
  /** 1/s lateral decay (kart NORMAL_GRIP 13; cars feel better slightly lower). Default 10. */
  grip: number;
}

export const DEFAULT_VEHICLE_STATS: VehicleStats = {
  maxSpeed: 30,
  accel: 11,
  brakeDecel: 22,
  reverseMaxSpeed: 8,
  coastDecel: 4,
  turnRate: 2.0,
  grip: 10,
};

/** Speed (m/s) at which steering reaches full authority. From kart.js. */
const TURN_FULL_SPEED = 9;
/** Fraction of turn rate lost at top speed. From kart.js. */
const HIGH_SPEED_TURN_LOSS = 0.16;
/** Fraction of grip-scrubbed speed returned to the forward axis (arcade). From kart.js. */
const SPEED_KEEP_IN_TURN = 0.85;
/** Gravity applied along slopes. From kart.js (P.gravity * SLOPE_GRAVITY_FACTOR). */
const SLOPE_GRAVITY = 9.8 * 0.35;

export interface VehicleControllerOptions {
  scene: Scene;
  input: InputRegistry;
  start: Vector3;
  groundHeight: (x: number, z: number) => number;
  stats?: Partial<VehicleStats>;
}

/**
 * Split a velocity into forward/lateral parts relative to a heading.
 * Pure — unit-tested.
 */
export function decomposeVelocity(
  vel: Vector3,
  heading: number,
): { forward: number; lateral: number } {
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  return {
    forward: vel.x * fx + vel.z * fz,
    lateral: vel.x * rx + vel.z * rz,
  };
}

/**
 * Rebuild a velocity vector from forward/lateral parts and a heading.
 * Pure — unit-tested.
 */
export function recomposeVelocity(forward: number, lateral: number, heading: number): Vector3 {
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  return new Vector3(fx * forward + rx * lateral, 0, fz * forward + rz * lateral);
}

/**
 * Yaw rate (rad/s, + = right) for a steering input. Ported from kart.js:
 * authority ramps in by TURN_FULL_SPEED, high speed bleeds turn rate,
 * reversing flips the steering.
 * Pure — unit-tested.
 */
export function computeTurnRate(
  steer: number,
  forwardSpeed: number,
  stats: VehicleStats,
): number {
  const speedAbs = Math.abs(forwardSpeed);
  const authority = Math.min(1, speedAbs / TURN_FULL_SPEED);
  const loss = 1 - HIGH_SPEED_TURN_LOSS * Math.min(1, speedAbs / Math.max(1, stats.maxSpeed));
  const dir = forwardSpeed < -0.5 ? -1 : 1;
  return steer * stats.turnRate * authority * loss * dir;
}

/**
 * One longitudinal step: throttle/brake/coast/reverse toward the speed limit.
 * Returns the new forward speed. Pure — unit-tested.
 */
export function stepLongitudinal(
  vF: number,
  throttle: number,
  brake: number,
  dt: number,
  stats: VehicleStats,
): number {
  if (throttle > 0) {
    if (vF < 0) {
      vF = Math.min(0, vF + stats.brakeDecel * throttle * dt);
    } else if (vF < stats.maxSpeed) {
      const r = vF / Math.max(1, stats.maxSpeed);
      vF = Math.min(stats.maxSpeed, vF + stats.accel * Math.max(0.3, 1.6 - 1.2 * r) * throttle * dt);
    }
  } else if (brake > 0) {
    if (vF > 0.5) {
      vF = Math.max(0, vF - stats.brakeDecel * brake * dt);
    } else {
      vF = Math.max(-stats.reverseMaxSpeed, vF - stats.accel * 0.7 * brake * dt);
    }
  } else {
    const c = stats.coastDecel * dt;
    vF = Math.abs(vF) <= c ? 0 : vF - Math.sign(vF) * c;
  }
  return vF;
}

export class VehicleController {
  /** Chase camera. The scene sets `scene.activeCamera` to this in drive mode. */
  readonly camera: UniversalCamera;

  private readonly scene: Scene;
  private readonly input: InputRegistry;
  private readonly groundHeight: (x: number, z: number) => number;
  private readonly stats: VehicleStats;
  private readonly unsubs: Array<() => void> = [];

  private readonly root: TransformNode;
  private modelRoot: AbstractMesh | null = null;

  private active = false;
  private heading = 0;
  private readonly velocity = new Vector3();
  private readonly held: HeldState = {
    forward: false, back: false, left: false, right: false, sprint: false, crouch: false,
  };

  constructor(options: VehicleControllerOptions) {
    this.scene = options.scene;
    this.input = options.input;
    this.groundHeight = options.groundHeight;
    this.stats = { ...DEFAULT_VEHICLE_STATS, ...options.stats };

    // Placeholder car: body + cabin + 4 wheels under an invisible transform.
    // Real GLB swaps in via setModel.
    this.root = new TransformNode("vehicle-root", this.scene);
    this.root.setEnabled(false); // enabled by setActive(true)
    const mat = new StandardMaterial("vehicle-mat", this.scene);
    mat.diffuseColor = new Color3(0.75, 0.12, 0.1);
    const dark = new StandardMaterial("vehicle-dark", this.scene);
    dark.diffuseColor = new Color3(0.08, 0.08, 0.1);

    const body = MeshBuilder.CreateBox("vehicle-body", { width: 1.8, height: 0.55, depth: 4.2 }, this.scene);
    body.material = mat;
    body.parent = this.root;
    body.position.y = 0.65;
    const cabin = MeshBuilder.CreateBox("vehicle-cabin", { width: 1.5, height: 0.5, depth: 2.0 }, this.scene);
    cabin.material = dark;
    cabin.parent = this.root;
    cabin.position.set(0, 1.15, -0.2);
    const wheelGeo = { diameter: 0.7, height: 0.4 };
    for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]] as const) {
      const wheel = MeshBuilder.CreateCylinder(`vehicle-wheel-${wx}-${wz}`, wheelGeo, this.scene);
      wheel.material = dark;
      wheel.parent = this.root;
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.35, wz);
    }

    const gy = this.groundHeight(options.start.x, options.start.z);
    this.root.position.set(options.start.x, gy, options.start.z);

    this.camera = new UniversalCamera("vehicle-camera", this.root.position.clone(), this.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 5000;
    this.camera.inputs.clear();

    const gate = () => this.active;
    const hold = (action: string, key: keyof HeldState) => {
      this.unsubs.push(this.input.on(action, () => { this.held[key] = true; }, { when: gate }));
      this.unsubs.push(this.input.onRelease(action, () => { this.held[key] = false; }, { when: gate }));
    };
    hold("player.moveForward", "forward");
    hold("player.moveBack", "back");
    hold("player.moveLeft", "left");
    hold("player.moveRight", "right");
  }

  get isActive(): boolean {
    return this.active;
  }

  get position(): Vector3 {
    return this.root.position.clone();
  }

  get speedKmh(): number {
    return this.velocity.length() * 3.6;
  }

  /**
   * Swap the placeholder for a real model. The model root is parented to the
   * vehicle transform and the placeholder parts are hidden.
   */
  setModel(root: AbstractMesh): void {
    if (this.modelRoot !== null) this.modelRoot.setEnabled(false);
    this.modelRoot = root;
    root.parent = this.root;
    root.position.set(0, 0, 0);
  }

  setActive(on: boolean): void {
    this.active = on;
    this.root.setEnabled(on);
    if (!on) {
      this.velocity.set(0, 0, 0);
      this.held.forward = this.held.back = this.held.left = this.held.right = false;
    }
  }

  /** Place the car (used when the player gets in). */
  reposition(x: number, z: number, heading: number): void {
    this.root.position.set(x, this.groundHeight(x, z), z);
    this.heading = heading;
    this.velocity.set(0, 0, 0);
  }

  update(dt: number): void {
    if (!this.active) return;
    dt = Math.min(dt, 1 / 20);
    const stats = this.stats;

    const throttle = this.held.forward ? 1 : 0;
    const brake = this.held.back ? 1 : 0;
    const steer = (this.held.left ? -1 : 0) + (this.held.right ? 1 : 0);

    // Split velocity into the current heading's frame.
    let { forward: vF, lateral: vR } = decomposeVelocity(this.velocity, this.heading);

    // Longitudinal.
    vF = stepLongitudinal(vF, throttle, brake, dt, stats);

    // Slope gravity along the forward axis (from kart.js).
    const e = 1.0;
    const n = slopeNormal(this.groundHeight, this.root.position.x, this.root.position.z, e);
    if (n.y > 0.3) {
      const fx = -Math.sin(this.heading);
      const fz = -Math.cos(this.heading);
      const dhds = -(n.x * fx + n.z * fz) / n.y;
      vF -= SLOPE_GRAVITY * dhds * dt;
      vF = Math.max(-stats.reverseMaxSpeed, Math.min(stats.maxSpeed * 1.2, vF));
    }

    // Steering: recompute in the new heading's frame, then apply grip.
    const yawRate = computeTurnRate(steer, vF, stats);
    const newHeading = this.heading - yawRate * dt;
    let vel = recomposeVelocity(vF, vR, this.heading);
    const split = decomposeVelocity(vel, newHeading);
    vF = split.forward;
    vR = split.lateral * Math.exp(-stats.grip * dt);
    // Arcade: give most of the grip-scrubbed speed back to forward.
    const mag0 = Math.hypot(vF, split.lateral);
    const mag1 = Math.hypot(vF, vR);
    if (mag1 > 1e-4 && vF > 1) {
      const target = mag1 + (mag0 - mag1) * SPEED_KEEP_IN_TURN;
      const f2 = target * target - vR * vR;
      if (f2 > 0) vF = Math.max(vF, Math.min(Math.sqrt(f2), Math.max(stats.maxSpeed, vF)));
    }
    this.heading = newHeading;
    vel = recomposeVelocity(vF, vR, this.heading);
    this.velocity.set(vel.x, 0, vel.z);

    // Integrate and snap to the ground.
    this.root.position.x += this.velocity.x * dt;
    this.root.position.z += this.velocity.z * dt;
    this.root.position.y = this.groundHeight(this.root.position.x, this.root.position.z);
    this.root.rotation.y = this.heading;

    // Chase camera: behind and above, looking at the car.
    const back = 8.5;
    const up = 3.4;
    const cx = this.root.position.x + Math.sin(this.heading) * back;
    const cz = this.root.position.z + Math.cos(this.heading) * back;
    const groundAtCam = this.groundHeight(cx, cz) + 0.5;
    const cy = Math.max(this.root.position.y + up, groundAtCam);
    const k = 1 - Math.exp(-10 * dt);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (cy - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    this.camera.setTarget(new Vector3(
      this.root.position.x,
      this.root.position.y + 1.2,
      this.root.position.z,
    ));
  }

  dispose(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    this.camera.dispose();
    this.root.dispose();
  }
}

/** Ground normal from central differences. Shared with the slope check. */
function slopeNormal(
  groundHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  e: number,
): Vector3 {
  const dx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const dz = groundHeight(x, z + e) - groundHeight(x, z - e);
  const n = new Vector3(-dx / (2 * e), 1, -dz / (2 * e));
  n.normalize();
  return n;
}
