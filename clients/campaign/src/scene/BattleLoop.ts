/**
 * BattleLoop — one fight end-to-end.
 *
 * Spawns two teams of soldiers on the battlefield, issues attack-move orders,
 * ticks the unit brains (see `battleUnit.ts`), and fires `onEnd` when one
 * side is wiped. Buffy: create the BattleScene, then
 *
 *   const loop = await BattleLoop.create({ battle, playerCount: 5, enemyCount: 5,
 *     onEnd: (r) => { /* record aftermath, back to the map *\/ } });
 *
 * and call `loop.update(dt)` every frame while the battle scene is live.
 * `loop.dispose()` frees the soldiers.
 */

import { Vector3 } from "@babylonjs/core";
import type { BattleScene } from "./BattleScene.js";
import { BattleSoldier } from "./BattleSoldier.js";
import { INFANTRY_STATS, UnitBrain } from "./battleUnit.js";

export interface BattleResult {
  /** True when every enemy is dead and at least one player soldier stands. */
  victory: boolean;
  playerCasualties: number;
  enemyCasualties: number;
  /** Seconds the fight lasted. */
  duration: number;
}

export interface BattleLoopOptions {
  battle: BattleScene;
  /** Soldiers on the player's side. Default 5. */
  playerCount?: number;
  /** Soldiers on the enemy side. Default 5. */
  enemyCount?: number;
  onEnd?: (result: BattleResult) => void;
}

export class BattleLoop {
  private readonly brains: UnitBrain[] = [];
  private readonly soldiers: BattleSoldier[] = [];
  private readonly onEnd: ((result: BattleResult) => void) | undefined;
  private elapsed = 0;
  private ended = false;
  private disposed = false;

  private constructor(
    battle: BattleScene,
    soldiers: BattleSoldier[],
    brains: UnitBrain[],
    options: BattleLoopOptions,
  ) {
    this.soldiers = soldiers;
    this.brains = brains;
    this.onEnd = options.onEnd;
    void battle;
  }

  static async create(options: BattleLoopOptions): Promise<BattleLoop> {
    const { battle } = options;
    const playerCount = options.playerCount ?? 5;
    const enemyCount = options.enemyCount ?? 5;
    const half = battle.size / 2;
    const margin = Math.min(60, battle.size * 0.15);

    const soldiers: BattleSoldier[] = [];
    const brains: UnitBrain[] = [];

    const spawnTeam = async (team: number, count: number, zSide: number): Promise<void> => {
      for (let i = 0; i < count; i++) {
        // Line formation with slight jitter; teams start on opposite sides.
        const x = ((i - (count - 1) / 2) * 4) + (Math.random() - 0.5) * 1.5;
        const z = zSide * (half - margin) + (Math.random() - 0.5) * 6;
        const soldier = await BattleSoldier.create(battle.scene, {
          position: new Vector3(x, 0.12, z),
        });
        soldier.root.rotation.y = zSide > 0 ? Math.PI : 0;
        soldiers.push(soldier);
        brains.push(new UnitBrain(soldier, team, INFANTRY_STATS));
      }
    };

    await spawnTeam(0, playerCount, -1);
    await spawnTeam(1, enemyCount, 1);

    const loop = new BattleLoop(battle, soldiers, brains, options);

    // Opening orders: both sides attack-move at each other. The brains take
    // it from there — acquire, engage, attack, die.
    for (const brain of brains) {
      const target = brain.team === 0
        ? new Vector3(0, 0, half - margin)
        : new Vector3(0, 0, -(half - margin));
      brain.commandAttackMove(target);
    }
    return loop;
  }

  /** Advance the fight. Call every frame while the battle is live. */
  update(dt: number): void {
    if (this.ended || this.disposed) return;
    this.elapsed += dt;
    for (const brain of this.brains) {
      brain.update(dt, this.brains);
    }
    const playerAlive = this.brains.some((b) => b.team === 0 && b.alive);
    const enemyAlive = this.brains.some((b) => b.team === 1 && b.alive);
    if (!playerAlive || !enemyAlive) {
      this.ended = true;
      const playerDead = this.brains.filter((b) => b.team === 0 && !b.alive).length;
      const enemyDead = this.brains.filter((b) => b.team === 1 && !b.alive).length;
      this.onEnd?.({
        victory: enemyAlive === false && playerAlive,
        playerCasualties: playerDead,
        enemyCasualties: enemyDead,
        duration: this.elapsed,
      });
    }
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get livingCount(): { player: number; enemy: number } {
    return {
      player: this.brains.filter((b) => b.team === 0 && b.alive).length,
      enemy: this.brains.filter((b) => b.team === 1 && b.alive).length,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const soldier of this.soldiers) soldier.dispose();
    this.brains.length = 0;
    this.soldiers.length = 0;
  }
}
