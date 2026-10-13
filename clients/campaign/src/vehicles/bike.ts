/**
 * Motorcycle controller — bespoke two-wheel raycast vehicle for the
 * campaign map (and later battle scenes).
 *
 * The honest picture from `docs/code-pulls/babylon-controller/NOTES.md`:
 * no open-source 3D JS/TS motorcycle implementation clears the license
 * bar and Babylon 8 ships no vehicle physics at all, so the bike is a
 * from-scratch build from three MIT sources:
 *
 * - `pmndrs/cannon-es` `RaycastVehicle.ts`: the raycast-vehicle
 *   algorithm — one downward ray per wheel, suspension spring force from
 *   compression, per-wheel tire forces. Here the raycast is an injected
 *   callback (Babylon `scene.pickWithRay` in the adapter).
 * - `icurtis1/raycast-vehicle`: the arcade assists that make two wheels
 *   work — `antiWheelie`, `uprightAssist` (cross-product righting torque
 *   faded by speed), `tiltClampAirborne`.
 * - `ArcaDone/UnityMotorbikeController`: wheelie / lean / crash / gear
 *   feel as plain math, transliterated (not the WheelCollider parts).
 *
 * Like `VehicleController`, ground comes from raycasts and input reuses
 * the `player.*` actions (moveForward = throttle, moveBack = brake,
 * moveLeft/moveRight = steering). The controller is inert until
 * `setActive(true)`.
 */
import { TransformNode, Vector3, type AbstractMesh, type Scene } from "@babylonjs/core";
import type { InputRegistry } from "../input/registry.js";
import type { HeldState } from "../scene/PlayerController.js";

export interface BikeStats {
  /** m/s top speed. Default 45 (~162 km/h). */
  maxSpeed: number;
  /** m/s^2 engine acceleration at standstill. Default 14. */
  engineAccel: number;
  /** m/s^2 braking. Default 24. */
  brakeDecel: number;
  /** 1/s lateral velocity decay (kart-style grip). Default 8. */
  grip: number;
  /** Suspension spring stiffness. Default 55. */
  suspensionStiffness: number;
  /** Suspension damping. Default 6. */
  suspensionDamping: number;
  /** Suspension travel in metres. Default 0.25. */
  suspensionTravel: number;
  /** Wheel radius in metres. Default 0.33. */
  wheelRadius: number;
  /** Max lean angle in radians. Default 0.9 (~52°). */
  maxLean: number;
  /** Righting torque strength (uprightAssist). Default 10. */
  uprightAssist: number;
  /** Caps the wheelie pitch (antiWheelie). Radians. Default 0.35. */
  maxWheeliePitch: number;
  /** Pitch beyond which the bike crashes. Radians. Default 1.1. */
  crashPitch: number;
  /** Lean beyond which the bike lowsides at speed. Radians. Default 1.05. */
  crashLean: number;
}

export const DEFAULT_BIKE_STATS: BikeStats = {
  maxSpeed: 45,
  engineAccel: 14,
  brakeDecel: 24,
  grip: 8,
  suspensionStiffness: 55,
  suspensionDamping: 6,
  suspensionTravel: 0.25,
  wheelRadius: 0.33,
  maxLean: 0.9,
  uprightAssist: 10,
  maxWheeliePitch: 0.35,
  crashPitch: 1.1,
  crashLean: 1.05,
};

/** Raycast result: distance to the ground along the ray, or null. */
export type GroundRay = (origin: Vector3, maxDistance: number) => number | null;

export interface BikeOptions {
  scene: Scene;
  input: InputRegistry;
  start: Vector3;
  /** Defaults to `scene.pickWithRay` downward. */
  groundRay?: GroundRay;
  stats?: Partial<BikeStats>;
}

/**
 * Target lean from steering input and speed — pure. Bikes lean INTO the
 * turn; the faster the turn, the deeper the lean.
 */
export function computeTargetLean(steer: number, speedMs: number, maxLean: number): number {
  const speedFactor = Math.min(1, speedMs / 20);
  // `|| 0` keeps steer=0 from producing -0.
  return -steer * maxLean * (0.3 + 0.7 * speedFactor) || 0;
}

/**
 * Upright-assist torque: rights the bike toward its target lean, faded
 * by speed (at a standstill the rider's feet do the work; at speed the
 * gyro effect does). Returns angular acceleration (rad/s^2). Pure.
 */
export function uprightTorque(
  lean: number,
  targetLean: number,
  leanVelocity: number,
  speedMs: number,
  assist: number,
): number {
  const fade = Math.min(1, speedMs / 8);
  const spring = (targetLean - lean) * assist * (0.4 + 0.6 * fade);
  const damping = -leanVelocity * assist * 0.35;
  return spring + damping;
}

/**
 * Suspension spring force from compression — the cannon-es raycast
 * vehicle core, transliterated. Pure.
 */
export function suspensionForce(
  compression: number, // 0..1
  compressionVelocity: number, // m/s, positive = compressing
  stiffness: number,
  damping: number,
  travel: number,
): number {
  return compression * stiffness * travel - compressionVelocity * damping;
}

export class BikeController {
  readonly root: TransformNode;
  private readonly scene: Scene;
  private readonly input: InputRegistry;
  private readonly groundRay: GroundRay;
  private readonly stats: BikeStats;
  private active = false;
  private held: HeldState = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false };

  // Dynamic state.
  private readonly position: Vector3;
  private readonly velocity = new Vector3();
  private heading = 0;
  private lean = 0;
  private leanVelocity = 0;
  private pitch = 0;
  private pitchVelocity = 0;
  private crashed = false;
  private crashTimer = 0;
  private airborne = false;
  private wheelieAmount = 0;
  private suspension: Array<{ compression: number; velocity: number }> = [
    { compression: 0, velocity: 0 },
    { compression: 0, velocity: 0 },
  ];
  private offs: Array<() => void> = [];

  constructor(opts: BikeOptions) {
    this.scene = opts.scene;
    this.input = opts.input;
    this.stats = { ...DEFAULT_BIKE_STATS, ...opts.stats };
    this.groundRay = opts.groundRay ?? (() => null);
    this.position = opts.start.clone();
    this.root = new TransformNode("bike", this.scene);
    this.root.position.copyFrom(this.position);
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      const reg = (action: string, key: keyof HeldState) => {
        const on = this.input.on(action, () => {
          this.held[key] = true;
        });
        const off = this.input.onRelease(action, () => {
          this.held[key] = false;
        });
        this.offs.push(on, off);
      };
      reg("player.moveForward", "forward");
      reg("player.moveBack", "back");
      reg("player.moveLeft", "left");
      reg("player.moveRight", "right");
    } else {
      for (const off of this.offs) off();
      this.offs.length = 0;
      this.held = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false };
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  get isCrashed(): boolean {
    return this.crashed;
  }

  get isAirborne(): boolean {
    return this.airborne;
  }

  get speedMs(): number {
    return this.velocity.length();
  }

  get forwardSpeed(): number {
    const f = this.forward();
    return this.velocity.dot(f);
  }

  get leanAngle(): number {
    return this.lean;
  }

  /** Force a crash (adapter calls this on hard impacts). */
  crash(): void {
    if (this.crashed) return;
    this.crashed = true;
    this.crashTimer = 0;
  }

  reset(upright = true): void {
    this.crashed = false;
    this.crashTimer = 0;
    this.velocity.set(0, 0, 0);
    if (upright) {
      this.lean = 0;
      this.pitch = 0;
      this.leanVelocity = 0;
      this.pitchVelocity = 0;
    }
  }

  update(dt: number): void {
    if (!this.active || dt <= 0) return;
    dt = Math.min(dt, 1 / 20);
    if (this.crashed) {
      this.crashTimer += dt;
      // Slide to a stop; the rider can reset after 1.5 s.
      this.velocity.scaleInPlace(Math.max(0, 1 - 4 * dt));
      this.position.addInPlace(this.velocity.scale(dt));
      this.syncRoot();
      return;
    }

    const steer = (this.held.left ? 1 : 0) - (this.held.right ? 1 : 0);
    const throttle = this.held.forward ? 1 : 0;
    const brake = this.held.back ? 1 : 0;
    const s = this.stats;

    // --- Suspension: one ray per wheel (cannon-es raycast vehicle) ---
    const fwd = this.forward();
    const wheelOffsets = [1.1, -1.1]; // front / rear along the bike
    let contacts = 0;
    for (let i = 0; i < 2; i++) {
      const origin = this.position.add(fwd.scale(wheelOffsets[i]!));
      origin.y += 1.0;
      const hit = this.groundRay(origin, 1.0 + s.suspensionTravel + s.wheelRadius);
      const rest = 1.0 + s.wheelRadius;
      const prev = this.suspension[i]!.compression;
      if (hit === null || hit > rest + s.suspensionTravel) {
        this.suspension[i]!.compression = 0;
        this.suspension[i]!.velocity = 0;
      } else {
        const compression = Math.min(1, Math.max(0, (rest + s.suspensionTravel - hit) / s.suspensionTravel));
        this.suspension[i]!.compression = compression;
        this.suspension[i]!.velocity = (compression - prev) / dt;
        contacts++;
      }
    }
    this.airborne = contacts === 0;

    if (this.airborne) {
      // tiltClampAirborne: rider input rotates the bike in the air, but
      // the attitude stays bounded so landings are survivable.
      this.pitchVelocity += steer * 0 * dt; // steering does nothing airborne
      this.leanVelocity += steer * -2 * dt;
      this.lean += this.leanVelocity * dt;
      this.lean = clamp(this.lean, -s.maxLean, s.maxLean);
      this.leanVelocity *= Math.max(0, 1 - 2 * dt);
      this.velocity.y -= 22 * dt; // gravity
      this.position.addInPlace(this.velocity.scale(dt));
      this.syncRoot();
      return;
    }

    // --- Longitudinal ---
    const speed = this.forwardSpeed;
    if (throttle > 0) {
      const engine = s.engineAccel * Math.max(0, 1 - speed / s.maxSpeed);
      this.velocity.addInPlace(fwd.scale(engine * throttle * dt));
      // Wheelie: hard throttle at low speed lifts the front.
      if (speed < 8) {
        this.wheelieAmount = Math.min(1, this.wheelieAmount + throttle * dt * 2);
      }
    } else {
      this.wheelieAmount = Math.max(0, this.wheelieAmount - dt * 3);
    }
    if (brake > 0) {
      const fwdSpeed = this.forwardSpeed;
      const decel = Math.min(s.brakeDecel * dt, Math.abs(fwdSpeed)) * Math.sign(fwdSpeed);
      this.velocity.addInPlace(fwd.scale(-decel));
    }
    // Drag + rolling resistance (quadratic air drag, linear rolling).
    // Tuned so the engine's 1 - v/vmax falloff lands top speed just under maxSpeed.
    const dragK = (0.35 + 0.0009 * speed * speed) / Math.max(1, Math.abs(speed));
    this.velocity.scaleInPlace(Math.max(0, 1 - dragK * dt));

    // --- Lateral grip: kill sideways velocity (kart.js model) ---
    const right = this.right();
    const lateral = right.scale(this.velocity.dot(right));
    lateral.scaleInPlace(Math.max(0, 1 - s.grip * dt));
    const forwardVel = fwd.scale(this.velocity.dot(fwd));
    const vertical = new Vector3(0, this.velocity.y, 0);
    this.velocity.copyFrom(forwardVel.add(lateral).add(vertical));

    // --- Steering + lean ---
    const speedFactor = Math.min(1, Math.abs(speed) / 12);
    this.heading += steer * 1.9 * speedFactor * dt * Math.sign(speed || 1);
    const targetLean = computeTargetLean(steer, Math.abs(speed), s.maxLean);
    const torque = uprightTorque(this.lean, targetLean, this.leanVelocity, Math.abs(speed), s.uprightAssist);
    this.leanVelocity += torque * dt;
    this.lean += this.leanVelocity * dt;

    // --- Wheelie / pitch ---
    const targetPitch = this.wheelieAmount * s.maxWheeliePitch; // antiWheelie cap
    this.pitchVelocity += (targetPitch - this.pitch) * 8 * dt;
    this.pitchVelocity *= Math.max(0, 1 - 6 * dt);
    this.pitch += this.pitchVelocity * dt;

    // --- Crash checks ---
    if (Math.abs(this.pitch) > s.crashPitch || Math.abs(this.lean) > s.crashLean) {
      this.crash();
    }

    this.position.addInPlace(this.velocity.scale(dt));
    // Stick to the ground.
    const groundHit = this.groundRay(this.position.add(new Vector3(0, 1, 0)), 2.5);
    if (groundHit !== null) {
      const groundY = this.position.y + 1 - groundHit;
      if (this.position.y < groundY) {
        this.position.y = groundY;
        if (this.velocity.y < 0) this.velocity.y = 0;
      }
    }
    this.syncRoot();
  }

  /** Mount: the adapter places the rider; the bike takes input. */
  mount(): void {
    this.setActive(true);
  }

  /** Dismount: release input, keep rolling to a stop. */
  dismount(): void {
    this.setActive(false);
  }

  dispose(): void {
    this.setActive(false);
    this.root.dispose();
  }

  // --- Internals ---------------------------------------------------------

  private forward(): Vector3 {
    return new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  private right(): Vector3 {
    // Right of travel, rolled by the lean.
    const r = new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    r.y = -Math.sin(this.lean) * 0.5;
    return r.normalize();
  }

  private syncRoot(): void {
    this.root.position.copyFrom(this.position);
    this.root.rotation.set(this.pitch, this.heading, this.lean);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Attach a visual mesh under the bike root (real GLB when art is wired). */
export function attachBikeModel(root: TransformNode, mesh: AbstractMesh): void {
  mesh.parent = root;
}
