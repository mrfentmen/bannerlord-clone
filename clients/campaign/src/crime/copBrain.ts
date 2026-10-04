/**
 * Foot cop AI — finite-state brain for one police officer on foot.
 *
 * Ported from leonida's `police/CopBrain.ts` (MIT; license caveat in
 * `types.ts`). The three.js `Vector3` scratch math is replaced with plain
 * `{x, y, z}` arithmetic; the `PedBrain`/`IPed` engine types are replaced
 * with the minimal `CopPed` interface below so this stays pure and
 * unit-testable. The engine adapter (Babylon ped → CopPed) lives in
 * `director.ts`.
 *
 * Behaviour: levels 1–2 against an unarmed, non-fleeing player — walk up
 * and arrest (the director counts the contact time and busts). Otherwise:
 * keep a 12–20 m standoff, strafe, and fire whenever there is line of
 * sight. Any damage taken makes the cop lethal for good.
 */
import { CRIME_CONFIG } from "./config.js";
import { COP_FIRE_INTERVAL, type CopWeapon, type DispatchTier } from "./policeData.js";
import type { V3 } from "./types.js";

const K = CRIME_CONFIG.cop;

export type CopMode = "ride" | "approach" | "arrest" | "combat" | "standDown";

/** Minimal ped surface the brain needs. The Babylon adapter implements this. */
export interface CopPed {
  position: V3;
  /** Engine ped state; the brain sets 'scripted' while owned. */
  state: string;
  /** Non-null while the ped is seated in a vehicle. */
  vehicle: unknown | null;
  handsUp: boolean;
  knockedDown: boolean;
  stop(): void;
  moveToward(target: V3, speed: number): void;
  face(target: V3): void;
}

/** Line-of-sight queries, injected (Babylon: `scene.pickWithRay`). */
export interface CopSight {
  toPlayer(eye: V3, range: number): boolean;
}

export interface CopRng {
  range(min: number, max: number): number;
}

export type CopFireFn = (
  shooter: CopPed,
  weapon: CopWeapon,
  from: V3,
  dir: V3,
  accuracy: number,
) => void;

export interface CopContext {
  level: number;
  heat: number;
  tier: DispatchTier;
  holdFire: boolean;
  playerAlive(): boolean;
  playerArmed(): boolean;
  /** Player speed m/s (on foot or in a vehicle). */
  playerSpeed(): number;
  playerInVehicle(): boolean;
  playerPosition(): V3;
  rng: CopRng;
  sight: CopSight;
  fire: CopFireFn;
  reportSighting(source: "cop" | "cruiser" | "heli"): void;
}

export class CopBrain {
  mode: CopMode = "ride";
  provoked = false;
  /** True when this cop is inside arrest range with line of sight (read by the director). */
  arrestContact = false;
  protected readonly swat: boolean;
  private fireTimer: number = K.firstShotDelay;
  private losTimer = 0;
  private hasLos = false;
  private strafeDir = 1;
  private strafeTimer = 0;

  constructor(
    protected readonly ctx: CopContext,
    readonly weapon: CopWeapon,
    swat = false,
  ) {
    this.swat = swat;
  }

  protected baseAccuracy(): number {
    return this.swat ? K.accuracySwat : K.accuracyBase;
  }

  get accuracy(): number {
    return Math.min(0.95, this.baseAccuracy() + this.ctx.heat / K.heatDivisor + this.ctx.tier.accuracyBonus);
  }

  update(ped: CopPed, dt: number): void {
    this.arrestContact = false;
    if (ped.knockedDown) return;
    ped.state = "scripted";
    if (ped.vehicle) {
      this.mode = "ride";
      return;
    }
    const ctx = this.ctx;
    if (ctx.level === 0 || !ctx.playerAlive() || ctx.holdFire) {
      this.mode = "standDown";
      ped.stop();
      ped.handsUp = false;
      return;
    }
    const player = ctx.playerPosition();
    const dist = horizontal(ped.position, player);
    const lethal = ctx.tier.lethal || this.provoked || this.swat || ctx.playerArmed();
    const fleeing = ctx.playerSpeed() > K.fleeSpeed || ctx.playerInVehicle();

    if (!lethal && !fleeing) {
      this.arrestApproach(ped, player, dist);
      return;
    }
    if (!lethal && fleeing) {
      // Chase a running suspect; shooting starts only once provoked or the level climbs.
      this.mode = "approach";
      ped.moveToward(player, K.runSpeed);
      ped.face(player);
      this.refreshLos(ped, dt, dist);
      if (this.hasLos) this.arrestContact = dist <= K.arrestRange;
      return;
    }
    this.combat(ped, player, dist, dt);
  }

  private arrestApproach(ped: CopPed, player: V3, dist: number): void {
    ped.face(player);
    if (dist > K.arrestRange) {
      this.mode = "approach";
      ped.moveToward(player, dist > K.approachWalkDistance ? K.runSpeed : K.walkSpeed * 1.6);
      return;
    }
    this.mode = "arrest";
    ped.stop();
    const eye = { x: ped.position.x, y: ped.position.y + K.eyeHeight, z: ped.position.z };
    this.hasLos = this.ctx.sight.toPlayer(eye, K.sightRange);
    if (this.hasLos) {
      this.ctx.reportSighting("cop");
      this.arrestContact = true;
    }
  }

  private combat(ped: CopPed, player: V3, dist: number, dt: number): void {
    this.mode = "combat";
    ped.face(player);
    if (dist > K.chaseDistance || dist > K.standoffMax) {
      ped.moveToward(player, K.runSpeed);
    } else if (dist < K.standoffMin) {
      const away = normalize2(ped.position.x - player.x, ped.position.z - player.z);
      ped.moveToward(
        { x: ped.position.x + away.x * 4, y: ped.position.y, z: ped.position.z + away.z * 4 },
        K.backOffSpeed,
      );
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = this.ctx.rng.range(K.strafeSwitchMin, K.strafeSwitchMax);
        this.strafeDir = -this.strafeDir;
      }
      // Sidestep around the player so the cop is not a stationary target.
      const side = normalize2(player.z - ped.position.z, -(player.x - ped.position.x));
      ped.moveToward(
        {
          x: ped.position.x + side.x * 3 * this.strafeDir,
          y: ped.position.y,
          z: ped.position.z + side.z * 3 * this.strafeDir,
        },
        K.strafeSpeed,
      );
    }
    this.refreshLos(ped, dt, dist);
    if (this.hasLos && dist <= K.arrestRange) this.arrestContact = true;

    this.fireTimer -= dt;
    if (this.fireTimer > 0 || !this.hasLos || dist > K.sightRange) return;
    const cadence = COP_FIRE_INTERVAL[this.weapon];
    this.fireTimer = cadence * (1 + this.ctx.rng.range(-K.cadenceJitter, K.cadenceJitter));
    const eye: V3 = { x: ped.position.x, y: ped.position.y + K.eyeHeight, z: ped.position.z };
    const dir = aimAtPlayer(eye, player, this.accuracy, this.ctx.rng);
    this.ctx.fire(ped, this.weapon, eye, dir, this.accuracy);
  }

  private refreshLos(ped: CopPed, dt: number, dist: number): void {
    this.losTimer -= dt;
    if (this.losTimer > 0) return;
    this.losTimer = K.losInterval;
    const eye = { x: ped.position.x, y: ped.position.y + K.eyeHeight, z: ped.position.z };
    this.hasLos = dist <= K.sightRange && this.ctx.sight.toPlayer(eye, K.sightRange);
    if (this.hasLos) this.ctx.reportSighting("cop");
  }

  /** Call when the ped takes damage or is hit by a vehicle — makes the cop lethal for good. */
  onDamaged(): void {
    this.provoked = true;
    this.fireTimer = Math.min(this.fireTimer, 0.2);
  }
}

/**
 * Aim direction with accuracy-scaled spread. Pure — unit-tested.
 * Lower accuracy → wider cone; perfect accuracy → straight at the chest.
 */
export function aimAtPlayer(eye: V3, player: V3, accuracy: number, rng: CopRng): V3 {
  const dx = player.x - eye.x;
  const dy = player.y + 1.2 - eye.y; // chest height
  const dz = player.z - eye.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const spread = (1 - accuracy) * 0.12;
  return {
    x: dx / len + rng.range(-spread, spread),
    y: dy / len + rng.range(-spread, spread),
    z: dz / len + rng.range(-spread, spread),
  };
}

function horizontal(a: V3, b: V3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function normalize2(x: number, z: number): { x: number; z: number } {
  const len = Math.sqrt(x * x + z * z) || 1;
  return { x: x / len, z: z / len };
}
