/**
 * Third-person player combat for the battle scene.
 * MASTER_PLAN.md section 2B (tasks 52-60, adopted from Rowan's lane).
 *
 * A self-contained module: the caller hands it a Scene (from createBattleScene),
 * an optional canvas for input, and optional callbacks. It owns the player mesh,
 * the follow camera, input handling, weapons, health/armor, stamina, death, and
 * respawn. Kill feed entries go through the battle HUD handle.
 *
 * Scale: 1 unit = 1 metre, same as the battle scene.
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  UniversalCamera,
  Vector3,
} from "@babylonjs/core";
import type { BattleHudHandle } from "../ui/battle-hud.js";

/** An enemy the player can hit. Fed by the caller (sim roster, test fixture). */
export interface CombatTarget {
  id: string;
  name: string;
  position: Vector3;
  alive: boolean;
  /** Called by the sim when this target takes damage. Returns true if killed. */
  damage(amount: number): boolean;
}

export interface PlayerCombatOptions {
  scene: Scene;
  /** Real canvas for production input. Omitted in tests. */
  canvas?: HTMLCanvasElement;
  /** Ground height sampler, metres. Defaults to flat 0. */
  groundY?: (x: number, z: number) => number;
  /** Battle HUD for kill feed entries. */
  hud?: BattleHudHandle;
  /** Enemies visible to the player's weapons. */
  getTargets?: () => CombatTarget[];
  /** Display name used in the kill feed. */
  playerName?: string;
  /** Fired when the player dies. */
  onPlayerDeath?: () => void;
  /** Fired when the player respawns. */
  onPlayerRespawn?: () => void;
}

export interface PlayerCombatState {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  stamina: number;
  maxStamina: number;
  magazine: number;
  magazineSize: number;
  reserveAmmo: number;
  reloading: boolean;
  aiming: boolean;
  crouching: boolean;
  sprinting: boolean;
  alive: boolean;
  weapon: "rifle" | "melee";
}

export interface PlayerCombatHandle {
  /** Advance simulation. Call once per frame with real delta seconds. */
  update(deltaSeconds: number): void;
  /** Inflict damage from a world-space direction (for the hit indicator). */
  takeDamage(amount: number, fromDirection: Vector3): void;
  /** Respawn at a position, full health/ammo. */
  respawn(x: number, z: number): void;
  /** Read-only snapshot of player state, for HUD/tests. */
  readonly state: PlayerCombatState;
  /** Player world position. */
  readonly position: Vector3;
  dispose(): void;
}

// -- tuning -----------------------------------------------------------------
const WALK_SPEED = 4.0;
const SPRINT_SPEED = 7.5;
const CROUCH_SPEED = 2.0;
const SPRINT_DRAIN = 18; // stamina per second
const MELEE_STAMINA_COST = 20;
const STAMINA_REGEN = 22; // per second when not sprinting/attacking
const MELEE_RANGE = 2.6;
const MELEE_ARC_DEG = 90;
const MELEE_DAMAGE = 35;
const MELEE_COOLDOWN = 0.6;
const RIFLE_DAMAGE = 26;
const HEADSHOT_MULT = 2.0;
const MAGAZINE_SIZE = 30;
const START_RESERVE = 120;
const RELOAD_SECONDS = 2.0;
const FIRE_INTERVAL = 0.14; // ~430 rpm
const HIP_SPREAD_DEG = 3.0;
const ADS_SPREAD_DEG = 0.6;
const MOVE_SPREAD_DEG = 2.0; // added at full sprint
const ADS_FOV = 40;
const HIP_FOV = 60;
const CAMERA_DISTANCE = 5.5;
const CAMERA_HEIGHT = 2.2;
const ADS_DISTANCE = 2.8;

/**
 * Angular spread for a rifle shot, degrees. ADS tightens it, movement widens it.
 * Pure function, tested directly.
 */
export function computeSpreadDeg(aiming: boolean, moveSpeed: number): number {
  const base = aiming ? ADS_SPREAD_DEG : HIP_SPREAD_DEG;
  const moveFactor = Math.min(1, moveSpeed / SPRINT_SPEED);
  return base + MOVE_SPREAD_DEG * moveFactor * (aiming ? 0.5 : 1);
}

/**
 * True when a target is inside the melee arc: within range and within half the
 * arc angle of the facing direction. Pure function, tested directly.
 */
export function meleeInArc(
  playerPos: Vector3,
  facingYaw: number,
  targetPos: Vector3,
  range: number,
  arcDeg: number,
): boolean {
  const dx = targetPos.x - playerPos.x;
  const dz = targetPos.z - playerPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return false;
  if (dist < 0.001) return true;
  // Facing yaw: 0 faces +z, increases clockwise (Babylon convention).
  const targetYaw = Math.atan2(dx, dz);
  let diff = targetYaw - facingYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= (arcDeg * Math.PI) / 360;
}

/**
 * Armor absorbs half the damage until depleted, then health takes it all.
 * Returns { health, armor } after the hit. Pure function, tested directly.
 */
export function applyDamageToPool(
  health: number,
  armor: number,
  amount: number,
): { health: number; armor: number } {
  let remaining = amount;
  let newArmor = armor;
  if (newArmor > 0) {
    const absorbed = Math.min(newArmor, remaining * 0.5);
    newArmor -= absorbed;
    remaining -= absorbed;
  }
  return { health: Math.max(0, health - remaining), armor: Math.max(0, newArmor) };
}

export function createPlayerCombat(options: PlayerCombatOptions): PlayerCombatHandle {
  const { scene } = options;
  const groundY = options.groundY ?? (() => 0);
  const getTargets = options.getTargets ?? (() => []);
  const playerName = options.playerName ?? "You";

  // -- player avatar --------------------------------------------------------
  // A simple humanoid from boxes: torso, head, legs, arms. Olive drab so the
  // player reads as friendly against rust-red attackers and steel-blue defenders.
  const avatar = new Mesh("player-avatar", scene);
  const clothMat = new StandardMaterial("player-cloth", scene);
  clothMat.diffuseColor = new Color3(0.32, 0.34, 0.2);
  clothMat.specularColor = new Color3(0.03, 0.03, 0.03);
  const skinMat = new StandardMaterial("player-skin", scene);
  skinMat.diffuseColor = new Color3(0.72, 0.55, 0.42);
  const torso = MeshBuilder.CreateBox("player-torso", { width: 0.55, height: 0.7, depth: 0.32 }, scene);
  torso.position.y = 1.05;
  torso.material = clothMat;
  const head = MeshBuilder.CreateBox("player-head", { width: 0.3, height: 0.32, depth: 0.3 }, scene);
  head.position.y = 1.62;
  head.material = skinMat;
  const legL = MeshBuilder.CreateBox("player-legL", { width: 0.2, height: 0.7, depth: 0.22 }, scene);
  legL.position.set(-0.14, 0.35, 0);
  legL.material = clothMat;
  const legR = MeshBuilder.CreateBox("player-legR", { width: 0.2, height: 0.7, depth: 0.22 }, scene);
  legR.position.set(0.14, 0.35, 0);
  legR.material = clothMat;
  const armL = MeshBuilder.CreateBox("player-armL", { width: 0.16, height: 0.6, depth: 0.18 }, scene);
  armL.position.set(-0.36, 1.05, 0);
  armL.material = clothMat;
  const armR = MeshBuilder.CreateBox("player-armR", { width: 0.16, height: 0.6, depth: 0.18 }, scene);
  armR.position.set(0.36, 1.05, 0);
  armR.material = clothMat;
  // The rifle: a dark box held forward when the rifle is equipped.
  const rifleMesh = MeshBuilder.CreateBox("player-rifle", { width: 0.08, height: 0.12, depth: 0.9 }, scene);
  rifleMesh.position.set(0.3, 1.15, 0.35);
  const gunMat = new StandardMaterial("player-gun", scene);
  gunMat.diffuseColor = new Color3(0.12, 0.12, 0.13);
  rifleMesh.material = gunMat;
  for (const part of [torso, head, legL, legR, armL, armR, rifleMesh]) {
    part.parent = avatar;
    part.isPickable = false;
  }
  avatar.position.set(0, groundY(0, 0), 0);

  // -- third-person camera --------------------------------------------------
  const camera = new UniversalCamera("player-camera", new Vector3(0, 3, -6), scene);
  camera.fov = HIP_FOV * (Math.PI / 180);
  camera.minZ = 0.3;
  scene.activeCamera = camera;

  // -- HUD overlays (DOM) ---------------------------------------------------
  // Crosshair, hit flash, directional damage indicator, stamina/health bars.
  // Built only when a real document exists; tests run headless.
  let crosshair: HTMLElement | null = null;
  let hitFlash: HTMLElement | null = null;
  let damageDir: HTMLElement | null = null;
  let bars: HTMLElement | null = null;
  let healthFill: HTMLElement | null = null;
  let staminaFill: HTMLElement | null = null;
  let ammoLabel: HTMLElement | null = null;
  let deathOverlay: HTMLElement | null = null;
  if (typeof document !== "undefined") {
    crosshair = document.createElement("div");
    crosshair.className = "player-crosshair";
    crosshair.innerHTML = "<span></span><span></span><span></span><span></span>";
    document.body.appendChild(crosshair);

    hitFlash = document.createElement("div");
    hitFlash.className = "player-hitflash";
    document.body.appendChild(hitFlash);

    damageDir = document.createElement("div");
    damageDir.className = "player-damage-dir";
    damageDir.textContent = "▲";
    document.body.appendChild(damageDir);

    bars = document.createElement("div");
    bars.className = "player-bars";
    bars.innerHTML =
      '<div class="player-health"><div class="player-health-fill"></div></div>' +
      '<div class="player-stamina"><div class="player-stamina-fill"></div></div>' +
      '<div class="player-ammo"></div>';
    document.body.appendChild(bars);
    healthFill = bars.querySelector(".player-health-fill");
    staminaFill = bars.querySelector(".player-stamina-fill");
    ammoLabel = bars.querySelector(".player-ammo");

    deathOverlay = document.createElement("div");
    deathOverlay.className = "player-death";
    deathOverlay.innerHTML = "<p>You are down. Press R to respawn.</p>";
    deathOverlay.style.display = "none";
    document.body.appendChild(deathOverlay);
  }

  // -- state ----------------------------------------------------------------
  const state: PlayerCombatState = {
    health: 100,
    maxHealth: 100,
    armor: 50,
    maxArmor: 50,
    stamina: 100,
    maxStamina: 100,
    magazine: MAGAZINE_SIZE,
    magazineSize: MAGAZINE_SIZE,
    reserveAmmo: START_RESERVE,
    reloading: false,
    aiming: false,
    crouching: false,
    sprinting: false,
    alive: true,
    weapon: "rifle",
  };

  let yaw = 0; // facing, radians. 0 faces +z.
  let pitch = 0; // camera pitch, radians.
  let fireCooldown = 0;
  let meleeCooldown = 0;
  let reloadTimer = 0;
  let deathTimer = 0;
  let damageDirTimer = 0;
  const keys = new Set<string>();

  // -- input ----------------------------------------------------------------
  const onKeyDown = (ev: KeyboardEvent): void => {
    keys.add(ev.code);
    if (ev.code === "Digit1") {
      state.weapon = "rifle";
      rifleMesh.isVisible = true;
    } else if (ev.code === "Digit2") {
      state.weapon = "melee";
      rifleMesh.isVisible = false;
    } else if (ev.code === "KeyR") {
      if (!state.alive) {
        doRespawn();
      } else {
        startReload();
      }
    }
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
    keys.delete(ev.code);
  };
  const onMouseDown = (ev: MouseEvent): void => {
    if (ev.button === 0) tryAttack();
    if (ev.button === 2) state.aiming = true;
  };
  const onMouseUp = (ev: MouseEvent): void => {
    if (ev.button === 2) state.aiming = false;
  };
  const onMouseMove = (ev: MouseEvent): void => {
    // Pointer-lock style: relative movement steers the camera.
    if (typeof document !== "undefined" && document.pointerLockElement === options.canvas) {
      yaw -= ev.movementX * 0.0022;
      pitch = Math.max(-1.2, Math.min(1.2, pitch - ev.movementY * 0.0022));
    }
  };
  const onContextMenu = (ev: Event): void => ev.preventDefault();
  const onCanvasClick = (): void => {
    // Click the canvas to capture the mouse for third-person aiming.
    options.canvas?.requestPointerLock?.();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }
  if (options.canvas) {
    options.canvas.addEventListener("mousedown", onMouseDown);
    options.canvas.addEventListener("mouseup", onMouseUp);
    options.canvas.addEventListener("mousemove", onMouseMove);
    options.canvas.addEventListener("click", onCanvasClick);
    options.canvas.addEventListener("contextmenu", onContextMenu);
  }

  // -- weapons ---------------------------------------------------------------
  function startReload(): void {
    if (state.reloading || state.weapon !== "rifle") return;
    if (state.magazine >= state.magazineSize || state.reserveAmmo <= 0) return;
    state.reloading = true;
    reloadTimer = RELOAD_SECONDS;
  }

  function finishReload(): void {
    const needed = state.magazineSize - state.magazine;
    const taken = Math.min(needed, state.reserveAmmo);
    state.magazine += taken;
    state.reserveAmmo -= taken;
    state.reloading = false;
  }

  function tryAttack(): void {
    if (!state.alive) return;
    if (state.weapon === "melee") {
      if (meleeCooldown > 0 || state.stamina < MELEE_STAMINA_COST) return;
      meleeCooldown = MELEE_COOLDOWN;
      state.stamina = Math.max(0, state.stamina - MELEE_STAMINA_COST);
      doMelee();
    } else {
      // Rifle: fire immediately on click. Hold-to-fire is handled per-frame
      // by the caller polling a held mouse button; the cooldown gates the rate.
      if (fireCooldown <= 0) doFire();
    }
  }

  function doMelee(): void {
    // Swing: a quick yaw of the right arm for feedback.
    armR.rotation.x = -1.2;
    setTimeout(() => {
      armR.rotation.x = 0;
    }, 180);
    for (const t of getTargets()) {
      if (!t.alive) continue;
      if (meleeInArc(avatar.position, yaw, t.position, MELEE_RANGE, MELEE_ARC_DEG)) {
        const killed = t.damage(MELEE_DAMAGE);
        if (killed) pushKillFeed(t.name);
      }
    }
  }

  function doFire(): void {
    if (fireCooldown > 0 || state.reloading || state.magazine <= 0) return;
    fireCooldown = FIRE_INTERVAL;
    state.magazine -= 1;

    // Shot ray: from the camera through the crosshair, with spread.
    const spreadRad = (computeSpreadDeg(state.aiming, currentSpeed()) * Math.PI) / 180;
    const dir = camera.getForwardRay().direction.clone();
    dir.x += (Math.random() - 0.5) * 2 * spreadRad;
    dir.y += (Math.random() - 0.5) * 2 * spreadRad;
    dir.normalize();
    const ray = new Ray(camera.position.clone(), dir, 300);

    // Test against live targets (sphere check, head = upper third).
    let best: CombatTarget | null = null;
    let bestDist = Infinity;
    let headshot = false;
    for (const t of getTargets()) {
      if (!t.alive) continue;
      const toTarget = t.position.subtract(ray.origin);
      const along = Vector3.Dot(toTarget, ray.direction);
      if (along < 0 || along > ray.length || along >= bestDist) continue;
      const closest = ray.origin.add(ray.direction.scale(along));
      const miss = Vector3.Distance(closest, t.position);
      // Target capsule ~0.6m radius, 1.8m tall; head is the top 0.5m.
      if (miss < 0.7) {
        best = t;
        bestDist = along;
        headshot = closest.y > t.position.y + 1.3;
      }
    }
    if (best) {
      const dmg = RIFLE_DAMAGE * (headshot ? HEADSHOT_MULT : 1);
      const killed = best.damage(dmg);
      if (killed) pushKillFeed(best.name);
    }
  }

  function pushKillFeed(victimName: string): void {
    options.hud?.pushKill({ tick: 0, killerName: playerName, victimName });
  }

  function currentSpeed(): number {
    if (state.crouching) return CROUCH_SPEED;
    if (state.sprinting) return SPRINT_SPEED;
    return WALK_SPEED;
  }

  // -- damage ----------------------------------------------------------------
  function takeDamage(amount: number, fromDirection: Vector3): void {
    if (!state.alive) return;
    const after = applyDamageToPool(state.health, state.armor, amount);
    state.health = after.health;
    state.armor = after.armor;
    // Hit flash.
    if (hitFlash) {
      hitFlash.classList.remove("show");
      // Force reflow so the animation restarts on rapid hits.
      void hitFlash.offsetWidth;
      hitFlash.classList.add("show");
      setTimeout(() => hitFlash?.classList.remove("show"), 220);
    }
    // Directional indicator: rotate the arrow so up = damage source bearing.
    if (damageDir) {
      const toSource = fromDirection.clone().negate();
      const bearing = Math.atan2(toSource.x, toSource.z) - yaw;
      damageDir.style.transform = `translate(-50%,-50%) rotate(${(bearing * 180) / Math.PI}deg)`;
      damageDir.classList.add("show");
      damageDirTimer = 1.2;
    }
    if (state.health <= 0) die();
  }

  function die(): void {
    state.alive = false;
    deathTimer = 0;
    // Collapse: lay the avatar on its side.
    avatar.rotation.z = Math.PI / 2;
    avatar.position.y = groundY(avatar.position.x, avatar.position.z) + 0.4;
    if (deathOverlay) deathOverlay.style.display = "flex";
    if (typeof document !== "undefined" && document.pointerLockElement) {
      document.exitPointerLock();
    }
    options.onPlayerDeath?.();
  }

  function doRespawn(): void {
    if (state.alive) return;
    respawn(avatar.position.x, avatar.position.z);
  }

  function respawn(x: number, z: number): void {
    state.health = state.maxHealth;
    state.armor = state.maxArmor;
    state.stamina = state.maxStamina;
    state.magazine = state.magazineSize;
    state.reserveAmmo = START_RESERVE;
    state.reloading = false;
    state.aiming = false;
    state.alive = true;
    avatar.rotation.z = 0;
    avatar.position.set(x, groundY(x, z), z);
    if (deathOverlay) deathOverlay.style.display = "none";
    options.onPlayerRespawn?.();
  }

  // -- per-frame --------------------------------------------------------------
  function update(dt: number): void {
    if (!state.alive) {
      // Death camera: slow pull-back and rise.
      deathTimer += dt;
      const back = Math.min(12, 6 + deathTimer * 2);
      camera.position.set(
        avatar.position.x - Math.sin(yaw) * back,
        avatar.position.y + 4 + deathTimer,
        avatar.position.z - Math.cos(yaw) * back,
      );
      camera.setTarget(avatar.position);
      return;
    }

    // Stance and sprint.
    state.crouching = keys.has("KeyC") || keys.has("ControlLeft");
    const wantSprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const moving =
      keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD");
    state.sprinting = wantSprint && moving && !state.crouching && state.stamina > 1;

    // Sprint interrupts reload (task 56).
    if (state.reloading) {
      if (state.sprinting) {
        state.reloading = false;
      } else {
        reloadTimer -= dt;
        if (reloadTimer <= 0) finishReload();
      }
    }

    // Stamina: sprint drains, idle regens (task 58).
    if (state.sprinting) {
      state.stamina = Math.max(0, state.stamina - SPRINT_DRAIN * dt);
    } else if (!moving) {
      state.stamina = Math.min(state.maxStamina, state.stamina + STAMINA_REGEN * dt);
    }

    // Movement relative to camera yaw.
    const speed = currentSpeed();
    let mx = 0;
    let mz = 0;
    if (keys.has("KeyW")) mz += 1;
    if (keys.has("KeyS")) mz -= 1;
    if (keys.has("KeyA")) mx -= 1;
    if (keys.has("KeyD")) mx += 1;
    if (mx !== 0 || mz !== 0) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      // Camera-relative: forward is the camera yaw.
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const wx = (mx * cos + mz * sin) * speed * dt;
      const wz = (-mx * sin + mz * cos) * speed * dt;
      avatar.position.x += wx;
      avatar.position.z += wz;
      // Face movement direction (unless aiming, then face camera yaw).
      if (!state.aiming) yaw = Math.atan2(wx, wz);
    }
    avatar.position.y = groundY(avatar.position.x, avatar.position.z);
    // Crouch: squash the avatar.
    const targetScaleY = state.crouching ? 0.65 : 1;
    avatar.scaling.y += (targetScaleY - avatar.scaling.y) * Math.min(1, dt * 10);

    // Cooldowns tick down.
    fireCooldown -= dt;
    meleeCooldown -= dt;

    // Third-person camera with collision (task 52).
    const dist = state.aiming ? ADS_DISTANCE : CAMERA_DISTANCE;
    const camH = state.aiming ? 1.7 : CAMERA_HEIGHT;
    const pivot = new Vector3(avatar.position.x, avatar.position.y + camH, avatar.position.z);
    const back = new Vector3(
      pivot.x - Math.sin(yaw) * Math.cos(pitch) * dist,
      pivot.y + Math.sin(pitch) * dist,
      pivot.z - Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    // Collision: pull the camera in front of whatever the ray hits.
    const toCam = back.subtract(pivot);
    const camLen = toCam.length();
    const ray = new Ray(pivot, toCam.normalize(), camLen);
    const hit = scene.pickWithRay(ray, (m) => m !== avatar && !m.name.startsWith("player-"));
    const finalDist = hit?.hit && hit.distance !== undefined ? Math.max(0.5, hit.distance - 0.3) : camLen;
    camera.position.copyFrom(pivot).addInPlace(toCam.scale(finalDist / camLen));
    camera.setTarget(new Vector3(pivot.x + Math.sin(yaw) * 8, pivot.y - Math.sin(pitch) * 8, pivot.z + Math.cos(yaw) * 8));

    // FOV: ADS zoom.
    const targetFov = (state.aiming ? ADS_FOV : HIP_FOV) * (Math.PI / 180);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);

    // Crosshair visibility and spread display.
    if (crosshair) {
      crosshair.style.display = state.weapon === "rifle" ? "block" : "none";
      const spreadPx = 6 + computeSpreadDeg(state.aiming, moving ? speed : 0) * 6;
      crosshair.style.setProperty("--spread", `${spreadPx.toFixed(1)}px`);
      crosshair.classList.toggle("ads", state.aiming);
    }

    // Damage direction indicator fade.
    if (damageDirTimer > 0) {
      damageDirTimer -= dt;
      if (damageDirTimer <= 0) damageDir?.classList.remove("show");
    }

    // HUD bars.
    if (healthFill) healthFill.style.width = `${(state.health / state.maxHealth) * 100}%`;
    if (staminaFill) staminaFill.style.width = `${(state.stamina / state.maxStamina) * 100}%`;
    if (ammoLabel) {
      ammoLabel.textContent = state.reloading
        ? "reloading…"
        : state.weapon === "rifle"
          ? `${state.magazine} / ${state.reserveAmmo}`
          : "melee";
    }
  }

  function dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
    if (options.canvas) {
      options.canvas.removeEventListener("mousedown", onMouseDown);
      options.canvas.removeEventListener("mouseup", onMouseUp);
      options.canvas.removeEventListener("mousemove", onMouseMove);
      options.canvas.removeEventListener("click", onCanvasClick);
      options.canvas.removeEventListener("contextmenu", onContextMenu);
    }
    crosshair?.remove();
    hitFlash?.remove();
    damageDir?.remove();
    bars?.remove();
    deathOverlay?.remove();
    avatar.dispose();
  }

  return {
    update,
    takeDamage,
    respawn,
    get state(): PlayerCombatState {
      return { ...state };
    },
    get position(): Vector3 {
      return avatar.position.clone();
    },
    dispose,
  };
}
