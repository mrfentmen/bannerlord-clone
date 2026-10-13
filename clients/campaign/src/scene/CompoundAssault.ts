/**
 * CompoundAssault — fortified-compound assault prototype (sieges, modernized).
 *
 * A walled compound with a destructible gate, guards inside, and the
 * player's squad outside. Breach the gate (ram it with squad fire or plant
 * a breaching charge), then clear the rooms. Built on the battle system:
 * the gate is a `Destructible` implementing the `SoldierLike` interface, so
 * the existing `UnitBrain` targeting/attack code works on it unchanged —
 * no special-casing in the AI.
 *
 * Refs: `docs/code-pulls/siege-combat/NOTES.md` (design notes, unlicensed —
 * reimplemented, not copied), `docs/code-pulls/rts-battle`.
 */

import { MeshBuilder, StandardMaterial, Color3, Vector3, type Mesh, type Scene } from "@babylonjs/core";
import type { BattleScene } from "./BattleScene.js";
import { BattleSoldier } from "./BattleSoldier.js";
import { UnitBrain, INFANTRY_STATS, type SoldierLike } from "./battleUnit.js";

/**
 * Something with HP that units can attack: gates, doors, barricades.
 * Implements SoldierLike so UnitBrain acquires and damages it like any enemy.
 */
export class Destructible implements SoldierLike {
  readonly root = { position: new Vector3(), rotation: { y: 0 } };
  private hp: number;
  readonly maxHp: number;
  private readonly mesh: Mesh;

  constructor(scene: Scene, position: Vector3, width: number, height: number, depth: number, hp: number, color: Color3) {
    this.hp = hp;
    this.maxHp = hp;
    this.root.position.copyFrom(position);
    this.mesh = MeshBuilder.CreateBox("destructible", { width, height, depth }, scene);
    this.mesh.position.copyFrom(position);
    const mat = new StandardMaterial("destructible-mat", scene);
    mat.diffuseColor = color;
    this.mesh.material = mat;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get healthFraction(): number {
    return this.hp / this.maxHp;
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    if (!this.alive) {
      // Breached: knock the gate flat and out of the way.
      this.mesh.rotation.x = Math.PI / 2.3;
      this.mesh.position.y = 0.4;
    }
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

interface WallBox {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** Null for the gate (the Destructible owns its mesh). */
  mesh: Mesh | null;
  gate?: Destructible;
}

export interface CompoundAssaultOptions {
  battle: BattleScene;
  /** Attackers. Default 4. */
  squadCount?: number;
  /** Defenders inside. Default 3. */
  guardCount?: number;
  /** Half-size of the compound square in metres. Default 20. */
  halfSize?: number;
  onBreached?: () => void;
  onEnd?: (result: { victory: boolean; squadAlive: number; guardsAlive: number }) => void;
}

export class CompoundAssault {
  private readonly walls: WallBox[] = [];
  private readonly soldiers: BattleSoldier[] = [];
  private readonly brains: UnitBrain[] = [];
  private gate: Destructible;
  private gateBrain: UnitBrain;
  private readonly half: number;
  private readonly onBreached: (() => void) | undefined;
  private readonly onEnd:
    | ((result: { victory: boolean; squadAlive: number; guardsAlive: number }) => void)
    | undefined;
  private breached = false;
  private ended = false;
  private chargeFuse = -1;
  private disposed = false;

  private constructor(
    soldiers: BattleSoldier[],
    brains: UnitBrain[],
    walls: WallBox[],
    gate: Destructible,
    gateBrain: UnitBrain,
    options: CompoundAssaultOptions,
  ) {
    this.soldiers = soldiers;
    this.brains = brains;
    this.walls = walls;
    this.gate = gate;
    this.gateBrain = gateBrain;
    this.half = options.halfSize ?? 20;
    this.onBreached = options.onBreached;
    this.onEnd = options.onEnd;
  }

  static async create(options: CompoundAssaultOptions & { battle: BattleScene }): Promise<CompoundAssault> {
    const { battle } = options;
    const scene = battle.scene;
    const half = options.halfSize ?? 20;
    const squadCount = options.squadCount ?? 4;
    const guardCount = options.guardCount ?? 3;

    const walls: WallBox[] = [];
    const wallMat = new StandardMaterial("compound-wall-mat", scene);
    wallMat.diffuseColor = new Color3(0.45, 0.42, 0.38);
    const addWall = (cx: number, cz: number, w: number, d: number): WallBox => {
      const mesh = MeshBuilder.CreateBox("compound-wall", { width: w, height: 4, depth: d }, scene);
      mesh.position.set(cx, 2, cz);
      mesh.material = wallMat;
      const box: WallBox = { cx, cz, hx: w / 2, hz: d / 2, mesh };
      walls.push(box);
      return box;
    };

    // North, east, west walls; south wall split for the gate gap (|x| < 3).
    addWall(0, half, half * 2 + 1, 1);
    addWall(half, 0, 1, half * 2 + 1);
    addWall(-half, 0, 1, half * 2 + 1);
    // South wall: two segments, gate gap 6 m wide centred at x=0.
    const segW = half - 3;
    addWall(-(3 + segW / 2), -half, segW, 1);
    addWall(3 + segW / 2, -half, segW, 1);

    // The gate: destructible, team 1 so the squad's brains acquire it.
    const gate = new Destructible(
      scene, new Vector3(0, 1.75, -half), 6, 3.5, 0.8, 120, new Color3(0.5, 0.32, 0.15),
    );
    const gateBrain = new UnitBrain(gate, 1, INFANTRY_STATS);
    const gateBox: WallBox = { cx: 0, cz: -half, hx: 3, hz: 0.4, mesh: null, gate };
    walls.push(gateBox);

    const soldiers: BattleSoldier[] = [];
    const brains: UnitBrain[] = [];

    // Squad outside, south of the gate.
    for (let i = 0; i < squadCount; i++) {
      const x = (i - (squadCount - 1) / 2) * 3;
      const soldier = await BattleSoldier.create(scene, {
        position: new Vector3(x, 0.12, -half - 18),
      });
      soldiers.push(soldier);
      brains.push(new UnitBrain(soldier, 0, INFANTRY_STATS));
    }
    // Guards inside, spread around the compound.
    const guardSpots = [
      new Vector3(-half / 2, 0.12, 0),
      new Vector3(half / 2, 0.12, 0),
      new Vector3(0, 0.12, half / 2),
      new Vector3(-half / 2, 0.12, -half / 2),
      new Vector3(half / 2, 0.12, -half / 2),
    ];
    for (let i = 0; i < guardCount; i++) {
      const spot = guardSpots[i % guardSpots.length]!;
      const soldier = await BattleSoldier.create(scene, { position: spot.clone() });
      soldiers.push(soldier);
      const brain = new UnitBrain(soldier, 1, INFANTRY_STATS);
      brains.push(brain);
      // Guards hold until the attackers come into acquire range.
    }

    const assault = new CompoundAssault(soldiers, brains, walls, gate, gateBrain, options);
    void battle;
    return assault;
  }

  /** Order the squad to breach: attack-move at the gate. */
  orderBreach(): void {
    for (const brain of this.brains) {
      if (brain.team !== 0) continue;
      brain.commandAttackMove(new Vector3(0, 0, -this.half));
    }
  }

  /** Order the squad to clear: attack-move to the compound centre. */
  orderClear(): void {
    for (const brain of this.brains) {
      if (brain.team !== 0) continue;
      brain.commandAttackMove(new Vector3(0, 0, 0));
    }
  }

  /**
   * Plant a breaching charge on the gate: 3 s fuse, then 150 damage in a
   * small blast. The ram (squad fire) works too — this is the fast option.
   */
  plantCharge(): void {
    if (!this.gate.alive || this.chargeFuse >= 0) return;
    this.chargeFuse = 3;
  }

  get gateAlive(): boolean {
    return this.gate.alive;
  }

  /** Push units out of wall boxes (the gate box is removed once breached). */
  private collideWalls(): void {
    for (const brain of this.brains) {
      if (!brain.alive) continue;
      const p = brain.position;
      for (const wall of this.walls) {
        if (wall.gate !== undefined && !wall.gate.alive) continue;
        const dx = p.x - wall.cx;
        const dz = p.z - wall.cz;
        const px = wall.hx + 0.5 - Math.abs(dx);
        const pz = wall.hz + 0.5 - Math.abs(dz);
        if (px > 0 && pz > 0) {
          if (px < pz) p.x = wall.cx + Math.sign(dx || 1) * (wall.hx + 0.5);
          else p.z = wall.cz + Math.sign(dz || 1) * (wall.hz + 0.5);
        }
      }
    }
  }

  update(dt: number): void {
    if (this.ended || this.disposed) return;
    dt = Math.min(dt, 1 / 10);

    // Breaching charge fuse.
    if (this.chargeFuse > 0) {
      this.chargeFuse -= dt;
      if (this.chargeFuse <= 0) {
        this.chargeFuse = -1;
        this.gate.damage(150);
      }
    }

    const enemies: UnitBrain[] = [...this.brains, this.gateBrain];
    for (const brain of this.brains) {
      // Guards (team 1) never target their own gate.
      const foes = brain.team === 1 ? this.brains : enemies;
      brain.update(dt, foes);
    }
    this.collideWalls();

    if (!this.breached && !this.gate.alive) {
      this.breached = true;
      this.onBreached?.();
      // Breach the compound: squad pushes to the centre automatically.
      this.orderClear();
    }

    const squadAlive = this.brains.some((b) => b.team === 0 && b.alive);
    const guardsAlive = this.brains.some((b) => b.team === 1 && b.alive);
    if (!squadAlive || !guardsAlive) {
      this.ended = true;
      this.onEnd?.({
        victory: !guardsAlive && squadAlive,
        squadAlive: this.brains.filter((b) => b.team === 0 && b.alive).length,
        guardsAlive: this.brains.filter((b) => b.team === 1 && b.alive).length,
      });
    }
  }

  get isEnded(): boolean {
    return this.ended;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const soldier of this.soldiers) soldier.dispose();
    for (const wall of this.walls) wall.mesh?.dispose();
    this.gate.dispose();
    this.brains.length = 0;
    this.soldiers.length = 0;
    this.walls.length = 0;
  }
}
