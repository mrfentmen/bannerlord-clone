/**
 * Player character controller — first/third-person walking on the campaign map
 * (and later the battle scenes).
 *
 * Mechanics ported from:
 * - `ssatguru/BabylonJS-CharacterController` (Apache-2.0): kinematic movement,
 *   slope limits, step offset, elastic camera with collision, TPS<->FPS blend.
 * - `crazyramirez/BJS_Character_Controller_V2` (MIT): head-bob math (bobFreq
 *   9.5 walk / 14.5 sprint, bobAmpY 0.016/0.032, bobAmpX 0.009/0.020,
 *   exponential return to centre) and crouch.
 * Full report: `docs/code-pulls/babylon-controller/NOTES.md`.
 *
 * Deliberate differences from the sources: this game has no Babylon collision
 * meshes on its terrain — ground height comes from a `groundHeight(x, z)`
 * callback (the campaign passes `projection.heightAt(x, z) * VERTICAL_SCALE`,
 * which is exact and cheaper than raycasts). Slope and step handling work off
 * that heightfield. There is no animation ActionMap yet; the avatar is a
 * placeholder capsule until the real character model is wired.
 *
 * Input comes only through the `InputRegistry` (`player.*` actions in
 * `input/actions.ts`); this module never reads `KeyboardEvent.key` directly.
 * The controller is inert until `setActive(true)`: its action handlers are
 * gated on the active flag, so WASD keeps panning the map until walk mode
 * starts. While active, the map-pan `when: hasSelection` guard in main.ts
 * must also require walk mode off — see the hook snippet in the commit message.
 */

import {
  MeshBuilder,
  Ray,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
  type Mesh,
  type Scene,
} from "@babylonjs/core";
import type { InputRegistry } from "../input/registry.js";

export type Perspective = "tps" | "fps";

export interface PlayerControllerOptions {
  scene: Scene;
  input: InputRegistry;
  /** Canvas used for pointer-lock mouse look. */
  canvas: HTMLCanvasElement;
  /** Spawn position (y is ignored; the controller snaps to the ground). */
  start: Vector3;
  /** Exact ground height in world units. */
  groundHeight: (x: number, z: number) => number;
  /** Optional occluder test for the TPS camera (buildings etc). */
  occluderHit?: (origin: Vector3, direction: Vector3, maxDistance: number) => number | null;
  walkSpeed?: number;
  sprintSpeed?: number;
  crouchSpeed?: number;
  jumpSpeed?: number;
  gravity?: number;
  /** Radians. From ssatguru's maxSlopeLimit default (45). */
  maxSlope?: number;
  /** Max climbable step in metres per move (ssatguru stepOffset default 0.25, raised for curbs). */
  stepOffset?: number;
  /** TPS camera distance in metres. */
  cameraDistance?: number;
}

/** Held-key state, built from registry on/onRelease so the per-frame update polls. */
export interface HeldState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  crouch: boolean;
}

/**
 * Wish direction on the XZ plane from held keys and camera yaw.
 * Pure — unit-tested.
 */
export function computeWishDir(held: HeldState, yaw: number): Vector3 {
  const f = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
  const s = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (f === 0 && s === 0) return Vector3.Zero();
  // Camera-relative: yaw=0 faces -Z (Babylon convention).
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const x = -sin * f + cos * s;
  const z = -cos * f - sin * s;
  const len = Math.hypot(x, z);
  return new Vector3(x / len, 0, z / len);
}

/**
 * Head-bob offsets. Ported verbatim from crazyramirez's kinetic locomotion
 * bobbing: horizontal `cos(t*0.5)`, vertical `sin(t)`, sprint-scaled.
 * Pure — unit-tested.
 */
export function headBob(bobTime: number, sprinting: boolean): { x: number; y: number } {
  return {
    x: Math.cos(bobTime * 0.5) * (sprinting ? 0.02 : 0.009),
    y: Math.sin(bobTime) * (sprinting ? 0.032 : 0.016),
  };
}

/**
 * True when the ground normal at (x,z) is walkable: slope <= maxSlope.
 * The normal comes from central differences of the heightfield.
 * Pure — unit-tested.
 */
export function slopeWalkable(
  groundHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  maxSlopeRad: number,
): boolean {
  const e = 1.0;
  const dx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const dz = groundHeight(x, z + e) - groundHeight(x, z - e);
  // Gradient magnitude = tan(slope). Walkable when slope <= maxSlope.
  return Math.hypot(dx, dz) / (2 * e) <= Math.tan(maxSlopeRad);
}

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.1;

export class PlayerController {
  /** Drive this camera: `scene.activeCamera = controller.camera` in walk mode. */
  readonly camera: UniversalCamera;

  private readonly scene: Scene;
  private readonly input: InputRegistry;
  private readonly canvas: HTMLCanvasElement;
  private readonly groundHeight: (x: number, z: number) => number;
  private readonly occluderHit: ((origin: Vector3, direction: Vector3, maxDistance: number) => number | null) | undefined;

  private readonly walkSpeed: number;
  private readonly sprintSpeed: number;
  private readonly crouchSpeed: number;
  private readonly jumpSpeed: number;
  private readonly gravity: number;
  private readonly maxSlope: number;
  private readonly stepOffset: number;
  private readonly cameraDistance: number;

  private readonly held: HeldState = {
    forward: false, back: false, left: false, right: false, sprint: false, crouch: false,
  };
  private readonly unsubs: Array<() => void> = [];

  private readonly body: Mesh;
  private readonly avatar: Mesh;

  private active = false;
  private perspective: Perspective = "tps";
  private yaw = 0;
  private pitch = -0.15;
  private vy = 0;
  private grounded = true;
  private bobTime = 0;
  private eyeHeight = EYE_STAND;
  private pointerLocked = false;

  constructor(options: PlayerControllerOptions) {
    this.scene = options.scene;
    this.input = options.input;
    this.canvas = options.canvas;
    this.groundHeight = options.groundHeight;
    this.occluderHit = options.occluderHit;
    this.walkSpeed = options.walkSpeed ?? 4.3;
    this.sprintSpeed = options.sprintSpeed ?? 7.0;
    this.crouchSpeed = options.crouchSpeed ?? 2.2;
    this.jumpSpeed = options.jumpSpeed ?? 4.6;
    this.gravity = options.gravity ?? 18;
    this.maxSlope = options.maxSlope ?? (Math.PI / 4);
    this.stepOffset = options.stepOffset ?? 0.55;
    this.cameraDistance = options.cameraDistance ?? 3.5;

    // Collision body: invisible; the heightfield does the real work.
    this.body = MeshBuilder.CreateCapsule(
      "player-body",
      { radius: 0.35, height: 1.7 },
      this.scene,
    );
    this.body.isVisible = false;
    const gy = this.groundHeight(options.start.x, options.start.z);
    this.body.position.set(options.start.x, gy, options.start.z);

    // Placeholder avatar: visible in TPS, hidden in FPS. Swap for the real
    // character model when it is wired (Hana's lane).
    this.avatar = MeshBuilder.CreateCapsule(
      "player-avatar",
      { radius: 0.32, height: 1.65 },
      this.scene,
    );
    this.avatar.position.copyFrom(this.body.position);

    this.camera = new UniversalCamera("player-camera", this.body.position.clone(), this.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 5000;
    // The controller drives position/rotation manually every frame; Babylon's
    // built-in inputs would fight it.
    this.camera.inputs.clear();

    const gate = () => this.active;
    const hold = (key: keyof HeldState) => {
      this.unsubs.push(this.input.on(this.actionId(key), () => { this.held[key] = true; }, { when: gate }));
      this.unsubs.push(this.input.onRelease(this.actionId(key), () => { this.held[key] = false; }, { when: gate }));
    };
    hold("forward"); hold("back"); hold("left"); hold("right");
    hold("sprint"); hold("crouch");
    this.unsubs.push(this.input.on("player.jump", () => this.tryJump(), { when: gate }));
    this.unsubs.push(this.input.on("player.togglePerspective", () => this.togglePerspective(), { when: gate }));

    this.canvas.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.canvas.addEventListener("click", this.onCanvasClick);
  }

  private actionId(key: keyof HeldState): string {
    switch (key) {
      case "forward": return "player.moveForward";
      case "back": return "player.moveBack";
      case "left": return "player.moveLeft";
      case "right": return "player.moveRight";
      case "sprint": return "player.sprint";
      case "crouch": return "player.crouch";
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  get currentPerspective(): Perspective {
    return this.perspective;
  }

  get position(): Vector3 {
    return this.body.position.clone();
  }

  /** Teleport the player (used when entering walk mode at the party's position). */
  reposition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.avatar.position.set(x, y, z);
    this.vy = 0;
    this.grounded = true;
    // Snap the TPS camera behind the new spot so the first frame isn't a swoop
    // across the map.
    if (this.perspective === "tps") {
      this.camera.position.set(x, y + this.eyeHeight + 1.2, z + this.cameraDistance);
    }
  }

  setPerspective(p: Perspective): void {
    this.perspective = p;
    this.avatar.isVisible = p === "tps" && this.active;
  }

  togglePerspective(): void {
    this.setPerspective(this.perspective === "tps" ? "fps" : "tps");
  }

  setActive(on: boolean): void {
    if (this.active === on) return;
    this.active = on;
    this.avatar.isVisible = on && this.perspective === "tps";
    if (!on && this.pointerLocked) document.exitPointerLock();
  }

  private onCanvasClick = (): void => {
    if (this.active && !this.pointerLocked) {
      this.canvas.requestPointerLock();
    }
  };

  private onLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  private onMouseMove = (ev: MouseEvent): void => {
    if (!this.active || !this.pointerLocked) return;
    const sens = 0.0023;
    this.yaw -= ev.movementX * sens;
    this.pitch -= ev.movementY * sens;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
  };

  private tryJump(): void {
    if (this.grounded && !this.held.crouch) {
      this.vy = this.jumpSpeed;
      this.grounded = false;
    }
  }

  /**
   * One simulation step. Call every frame with the real dt while active.
   */
  update(dt: number): void {
    if (!this.active) return;
    dt = Math.min(dt, 1 / 20);

    const sprinting = this.held.sprint && this.held.forward && !this.held.crouch;
    const crouching = this.held.crouch;
    const speed = crouching ? this.crouchSpeed : sprinting ? this.sprintSpeed : this.walkSpeed;

    // Eye height eases toward the crouch target (crazyramirez crouch feel).
    const eyeTarget = crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight += (eyeTarget - this.eyeHeight) * (1 - Math.exp(-12 * dt));

    // -- horizontal -------------------------------------------------------
    const wish = computeWishDir(this.held, this.yaw);
    const moving = wish.lengthSquared() > 0;
    if (moving) {
      const step = wish.scale(speed * dt);
      const nx = this.body.position.x + step.x;
      const nz = this.body.position.z + step.z;
      const groundNow = this.groundHeight(this.body.position.x, this.body.position.z);
      const groundNext = this.groundHeight(nx, nz);
      const rise = groundNext - groundNow;
      if (rise <= this.stepOffset && slopeWalkable(this.groundHeight, nx, nz, this.maxSlope)) {
        this.body.position.x = nx;
        this.body.position.z = nz;
      }
      // else: blocked by a wall/cliff — no slide, stop. (Slide comes with vehicles.)
    }

    // -- vertical ---------------------------------------------------------
    const groundH = this.groundHeight(this.body.position.x, this.body.position.z);
    if (this.grounded) {
      // Walked off an edge or the ground fell away: start falling.
      if (this.body.position.y > groundH + 0.05) {
        this.grounded = false;
        this.vy = 0;
      } else {
        this.body.position.y = groundH;
        this.vy = 0;
      }
    }
    if (!this.grounded) {
      this.vy -= this.gravity * dt;
      this.body.position.y += this.vy * dt;
      if (this.body.position.y <= groundH) {
        this.body.position.y = groundH;
        this.grounded = true;
        this.vy = 0;
      }
    }

    // -- avatar -----------------------------------------------------------
    this.avatar.position.copyFrom(this.body.position);
    this.avatar.rotation.y = this.yaw + Math.PI;

    // -- head-bob ----------------------------------------------------------
    if (this.grounded && moving && speed > 0.1) {
      this.bobTime += dt * (sprinting ? 14.5 : 9.5);
    } else {
      this.bobTime = 0;
    }
    const bob = headBob(this.bobTime, sprinting);

    // -- camera ------------------------------------------------------------
    const headPos = new Vector3(
      this.body.position.x,
      this.body.position.y + this.eyeHeight,
      this.body.position.z,
    );
    if (this.perspective === "fps") {
      this.camera.position.set(
        headPos.x + bob.x * Math.cos(this.yaw),
        headPos.y + bob.y,
        headPos.z - bob.x * Math.sin(this.yaw),
      );
      this.camera.rotation.set(-this.pitch, this.yaw, 0);
    } else {
      // TPS chase: behind the head along yaw/pitch, pulled in on occlusion
      // (ssatguru's elastic camera, simplified to the heightfield + occluders).
      const dir = new Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        -Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch),
      );
      let dist = this.cameraDistance;
      if (this.occluderHit) {
        const hit = this.occluderHit(headPos, dir, dist);
        if (hit !== null) dist = Math.max(0.4, hit - 0.3);
      }
      const desired = headPos.add(dir.scale(dist));
      // Never let terrain swallow the camera.
      const camGround = this.groundHeight(desired.x, desired.z) + 0.35;
      if (desired.y < camGround) desired.y = camGround;
      // Ease toward the desired spot — the "elastic" feel.
      const k = 1 - Math.exp(-18 * dt);
      this.camera.position.x += (desired.x - this.camera.position.x) * k;
      this.camera.position.y += (desired.y - this.camera.position.y) * k;
      this.camera.position.z += (desired.z - this.camera.position.z) * k;
      this.camera.setTarget(headPos);
    }
  }

  /**
   * Ray helper Buffy/Pax can pass as `occluderHit` for building-aware TPS
   * camera collision: returns the nearest hit distance or null.
   */
  static rayOccluder(
    scene: Scene,
    predicate: (mesh: AbstractMesh) => boolean,
  ): (origin: Vector3, direction: Vector3, maxDistance: number) => number | null {
    return (origin, direction, maxDistance) => {
      const ray = new Ray(origin, direction, 0.1, maxDistance);
      const hit = scene.pickWithRay(ray, predicate);
      return hit?.hit && hit.distance !== undefined ? hit.distance : null;
    };
  }

  dispose(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.canvas.removeEventListener("click", this.onCanvasClick);
    this.camera.dispose();
    this.avatar.dispose();
    this.body.dispose();
  }
}
