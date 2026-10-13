/**
 * CrimeDirector — owns the wanted machine and drives the whole police
 * response: witness checks, line-of-sight sweeps, dispatch planning,
 * arrest timing and heat persistence.
 *
 * Ported from leonida's `wanted/index.ts` (WantedSystem), `police/arrest.ts`
 * (Arrest) and `police/dispatch.ts` (Dispatcher) (MIT; license caveat in
 * `types.ts`). Deliberate differences: leonida's `Game` object (systems,
 * peds, vehicles, audio, ui) is replaced with the injected `CrimeHost`
 * below — this module spawns nothing itself. Spawning/despawning real
 * Babylon peds and vehicles is the adapter's job (see the hook snippet at
 * the bottom); the director only ever *requests* units through the host.
 */
import { CRIME_CONFIG } from "./config.js";
import { CopBrain, type CopContext, type CopPed, type CopRng, type CopSight } from "./copBrain.js";
import { PoliceDriver, type CruiserVehicle, type RoadGraph } from "./policeDriver.js";
import {
  dispatchTier,
  type CopWeapon,
  type DispatchTier,
} from "./policeData.js";
import type { CrimeType, HotScene, V3, WantedSnapshot, WantedState } from "./types.js";
import { WantedMachine } from "./wanted.js";

const W = CRIME_CONFIG.wanted;
const K = CRIME_CONFIG.cop;

export interface WitnessPed {
  position: V3;
  isCop: boolean;
  alive: boolean;
}

export type UnitKind = "cruiser" | "swat" | "heli" | "roadblock" | "footcop";

export interface ActiveUnit {
  id: string;
  kind: UnitKind;
}

export interface DispatchPlan {
  /** Unit kinds the adapter should spawn (near the player, off-screen). */
  spawn: UnitKind[];
  /** Active unit ids the adapter should release (level dropped). */
  release: string[];
}

/**
 * Everything the director needs from the engine. Implement once in the
 * Babylon adapter; the director never touches Babylon directly.
 */
export interface CrimeHost {
  queryPeds(position: V3, radius: number): WitnessPed[];
  lineOfSight(eye: V3, range: number): boolean;
  playerPosition(): V3;
  playerAlive(): boolean;
  playerArmed(): boolean;
  playerSpeed(): number;
  playerInVehicle(): boolean;
  playerVelocity(): V3 | null;
  rng: CopRng;
  roadGraph: RoadGraph;
  notify(text: string, kind: "info" | "warning"): void;
  playSound(id: string): void;
  onWantedChanged(level: number, state: WantedState, previousLevel: number): void;
  onWantedCleared(reason: string): void;
  onBusted(position: V3): void;
  /** Adapter spawns the unit and calls back `registerUnit`. */
  requestSpawn(kind: UnitKind, near: V3): void;
  /** Adapter despawns the unit and calls back `unregisterUnit`. */
  requestRelease(id: string): void;
}

export interface CrimeDirectorOptions {
  host: CrimeHost;
}

interface RegisteredCop {
  ped: CopPed;
  brain: CopBrain;
}

export class CrimeDirector {
  readonly machine: WantedMachine;
  private readonly host: CrimeHost;
  private readonly cops: RegisteredCop[] = [];
  private readonly drivers: PoliceDriver[] = [];
  private readonly units = new Map<string, ActiveUnit>();
  private nextUnitId = 1;
  private seenAt = -Infinity;
  private visionTimer = 0;
  private dispatchTimer = 0;
  private arrestTimer = 0;
  private arrestPrompted = false;
  private copCtx: CopContext;
  private readonly sight: CopSight;

  constructor(opts: CrimeDirectorOptions) {
    this.host = opts.host;
    const host = this.host;
    this.sight = { toPlayer: (eye, range) => host.lineOfSight(eye, range) };
    this.machine = new WantedMachine({
      changed: (level, state, prev) => {
        host.onWantedChanged(level, state, prev);
        if (level > 0) host.playSound("wanted.star.gain");
      },
      cleared: (reason) => {
        host.onWantedCleared(reason);
        if (reason === "evaded") host.playSound("wanted.lost");
        this.resetArrest();
      },
      starsGained: (count) => host.notify(`Wanted level ${this.machine.level} (+${count})`, "warning"),
      searching: () => host.playSound("wanted.searching"),
      hotSceneReraised: () => host.notify("The heat is back on — leave the area", "warning"),
    });
    const self = this;
    this.copCtx = {
      get level() {
        return self.machine.level;
      },
      get heat() {
        return self.machine.heat;
      },
      get tier() {
        return dispatchTier(self.machine.level);
      },
      holdFire: false,
      playerAlive: () => host.playerAlive(),
      playerArmed: () => host.playerArmed(),
      playerSpeed: () => host.playerSpeed(),
      playerInVehicle: () => host.playerInVehicle(),
      playerPosition: () => host.playerPosition(),
      rng: host.rng,
      sight: this.sight,
      fire: () => {
        /* The Babylon adapter applies damage; the pure brain only decides to shoot. */
      },
      reportSighting: () => this.markSeen(),
    };
  }

  // --- Crime intake ----------------------------------------------------------

  /** Report a crime the player (or their crew) committed. */
  reportCrime(type: CrimeType, position: V3, loud = false): void {
    const witness = this.witnessesOf(position, loud);
    this.machine.reportCrime(type, position, witness);
    if (witness.copSaw) this.markSeen();
  }

  /** A civilian finished a phone call: cops head to the scene, not the player. */
  reportedByPhone(position: V3): void {
    this.machine.reportedByPhone(position);
  }

  setLevel(level: number, state?: WantedState): void {
    this.machine.setLevel(level, state);
  }

  clear(reason: string): void {
    if (this.machine.level !== 0) this.machine.clear(reason);
  }

  // --- Per-frame ---------------------------------------------------------------

  tick(dt: number): void {
    const host = this.host;
    const playerPos = host.playerPosition();
    this.visionSweep(dt, playerPos);
    const seen = this.machine.level > 0 && this.machine.time - this.seenAt <= W.vision.seenWindow;
    this.machine.tick(dt, playerPos, seen && host.playerAlive());
    this.updateBrains(dt);
    this.updateArrest(dt);
    this.dispatchTick(dt, playerPos);
  }

  snapshot(): WantedSnapshot {
    const m = this.machine;
    return {
      level: m.level,
      state: m.state,
      heat: m.heat,
      evasion: m.evasion,
      evasionSeconds: m.evasionSeconds,
      searchCenter: m.level > 0 && m.hasSearchCenter && m.state !== "active" ? { ...m.searchCenter } : null,
      searchRadius: m.hasSearchCenter ? m.searchRadius : 0,
      hotScenes: m.hotScenes.map((s: HotScene) => ({ ...s, position: { ...s.position } })),
      playerSeen: m.level > 0 && m.time - this.seenAt <= W.vision.seenWindow,
    };
  }

  serialize(): { heat: number } {
    return { heat: this.machine.heat };
  }

  deserialize(data: { heat?: number } | null): void {
    if (data && typeof data.heat === "number")
      this.machine.heat = Math.max(0, Math.min(W.heat.max, data.heat));
    if (this.machine.level > 0) this.machine.clear("loaded");
  }

  // --- Adapter registration ------------------------------------------------------

  registerCop(ped: CopPed, brain: CopBrain): void {
    this.cops.push({ ped, brain });
  }

  unregisterCop(ped: CopPed): void {
    const i = this.cops.findIndex((c) => c.ped === ped);
    if (i >= 0) this.cops.splice(i, 1);
  }

  registerDriver(driver: PoliceDriver): void {
    this.drivers.push(driver);
  }

  registerUnit(kind: UnitKind): string {
    const id = `unit-${this.nextUnitId++}`;
    this.units.set(id, { id, kind });
    return id;
  }

  unregisterUnit(id: string): void {
    this.units.delete(id);
  }

  /** Pure dispatch plan: which units to spawn / release to match the wanted level. */
  planDispatch(): DispatchPlan {
    const tier = dispatchTier(this.machine.level);
    const want: Record<UnitKind, number> = {
      cruiser: tier.cruisers,
      swat: tier.swatVans,
      heli: tier.helicopters,
      roadblock: tier.roadblock ? 1 : 0,
      footcop: tier.roadblock ? tier.roadblockCops : 0,
    };
    const have: Record<UnitKind, string[]> = { cruiser: [], swat: [], heli: [], roadblock: [], footcop: [] };
    for (const u of this.units.values()) have[u.kind].push(u.id);
    const spawn: UnitKind[] = [];
    const release: string[] = [];
    (Object.keys(want) as UnitKind[]).forEach((kind) => {
      const deficit = want[kind] - have[kind].length;
      for (let i = 0; i < deficit; i++) spawn.push(kind);
      for (let i = 0; i < -deficit; i++) {
        const id = have[kind][i];
        if (id !== undefined) release.push(id);
      }
    });
    return { spawn, release };
  }

  /** Build a foot-cop brain (the adapter spawns the ped and registers both). */
  makeCopBrain(weapon: CopWeapon, swat = false): CopBrain {
    return new CopBrain(this.copCtx, weapon, swat);
  }

  /** Build a cruiser driver (the adapter spawns the vehicle and registers it). */
  makeDriver(): PoliceDriver {
    const d = new PoliceDriver(this.copCtx, this.host.roadGraph);
    this.registerDriver(d);
    return d;
  }

  /** Drive a registered cruiser for one tick (the adapter calls this per vehicle). */
  driveCruiser(driver: PoliceDriver, v: CruiserVehicle, dt: number): void {
    driver.update(v, dt);
  }

  // --- Internals -------------------------------------------------------------------

  private markSeen(): void {
    this.seenAt = this.machine.time;
  }

  private witnessesOf(position: V3, loud: boolean): { copSaw: boolean; civilianSaw: boolean } {
    const radius = loud ? W.witness.civilianLoudRadius : W.witness.civilianRadius;
    const copRadius = loud ? W.witness.copLoudRadius : W.witness.copRadius;
    const peds = this.host.queryPeds(position, Math.max(radius, copRadius));
    let copSaw = false;
    let civilianSaw = false;
    for (const p of peds) {
      if (!p.alive) continue;
      const d = Math.hypot(p.position.x - position.x, p.position.z - position.z);
      if (p.isCop) {
        if (d <= copRadius && this.host.lineOfSight({ x: p.position.x, y: p.position.y + 1.6, z: p.position.z }, copRadius))
          copSaw = true;
      } else if (d <= radius) {
        civilianSaw = true;
      }
      if (copSaw && civilianSaw) break;
    }
    return { copSaw, civilianSaw };
  }

  private visionSweep(dt: number, playerPos: V3): void {
    this.visionTimer -= dt;
    if (this.visionTimer > 0 || this.machine.level === 0) return;
    this.visionTimer = W.vision.interval;
    for (const { ped } of this.cops) {
      if (ped.knockedDown || ped.vehicle) continue;
      const d = Math.hypot(ped.position.x - playerPos.x, ped.position.z - playerPos.z);
      if (d > W.vision.footRange) continue;
      if (this.host.lineOfSight({ x: ped.position.x, y: ped.position.y + 1.6, z: ped.position.z }, W.vision.footRange)) {
        this.markSeen();
        break;
      }
    }
  }

  private updateBrains(dt: number): void {
    for (const { ped, brain } of this.cops) brain.update(ped, dt);
  }

  private updateArrest(dt: number): void {
    const level = this.machine.level;
    if (level === 0 || level > 3 || !this.host.playerAlive()) {
      this.resetArrest();
      return;
    }
    const still = this.host.playerSpeed() < (this.host.playerInVehicle() ? K.vehicleStillSpeed : K.fleeSpeed * 0.6);
    let contact = false;
    for (const { brain } of this.cops) {
      if (brain.arrestContact) {
        contact = true;
        break;
      }
    }
    if (contact && still) {
      this.arrestTimer += dt;
      if (!this.arrestPrompted) {
        this.arrestPrompted = true;
        this.host.notify("Freeze! Hands where I can see them", "warning");
      }
      if (this.arrestTimer >= K.arrestSeconds) this.bust();
    } else {
      // Contact lost: decay quickly rather than snap to zero.
      this.arrestTimer = Math.max(0, this.arrestTimer - dt * 2);
      if (this.arrestTimer === 0) this.arrestPrompted = false;
    }
  }

  private bust(): void {
    this.resetArrest();
    this.host.onBusted(this.host.playerPosition());
    this.machine.clear("busted");
  }

  private resetArrest(): void {
    this.arrestTimer = 0;
    this.arrestPrompted = false;
  }

  private dispatchTick(dt: number, playerPos: V3): void {
    this.dispatchTimer -= dt;
    if (this.dispatchTimer > 0) return;
    this.dispatchTimer = CRIME_CONFIG.dispatch.rebalanceInterval;
    const plan = this.planDispatch();
    for (const kind of plan.spawn) this.host.requestSpawn(kind, playerPos);
    for (const id of plan.release) this.host.requestRelease(id);
  }

  get tier(): DispatchTier {
    return dispatchTier(this.machine.level);
  }
}
