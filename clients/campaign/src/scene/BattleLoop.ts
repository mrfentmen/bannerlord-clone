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
import { CombatEventBus } from "./combatEvents.js";
import { MoraleSystem } from "./unitMorale.js";

export interface BattleResult {
  /** True when every enemy is dead and at least one player soldier stands. */
  victory: boolean;
  playerCasualties: number;
  enemyCasualties: number;
  /** Seconds the fight lasted. */
  duration: number;
  /**
   * Troops that threw down their weapons — prisoners for the campaign's
   * ransom system, not corpses. (A surrendered unit is alive and has not
   * fled, so without counting them the battle would never end on mass
   * surrender.)
   */
  playerSurrendered: number;
  enemySurrendered: number;
}

export interface BattleLoopOptions {
  battle: BattleScene;
  /** Soldiers on the player's side. Default 5. */
  playerCount?: number;
  /** Soldiers on the enemy side. Default 5. */
  enemyCount?: number;
  onEnd?: (result: BattleResult) => void;
  /**
   * Distance LOD (task 296): brains farther than this many metres from the
   * battle camera think every third tick instead of every tick. Default
   * Infinity — off — so a loop that never asked for it behaves exactly as
   * before. Rendering is untouched; only the thinking throttles.
   */
  cullDistance?: number;
}

export class BattleLoop {
  private readonly brains: UnitBrain[] = [];
  private readonly soldiers: BattleSoldier[] = [];
  private readonly onEnd: ((result: BattleResult) => void) | undefined;
  private readonly battle: BattleScene;
  /**
   * The fight's honest feed (tasks 31, 45-48): every strike and kill the
   * brains actually performed. HUD components subscribe; nothing here is
   * invented.
   */
  readonly combatEvents = new CombatEventBus();
  private morale: MoraleSystem | null = null;
  private readonly cullDistance: number;
  private tickCount = 0;
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
    this.cullDistance = options.cullDistance ?? Infinity;
    this.battle = battle;
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

    // Morale: routers flee for their own edge, the same edge "retreat" uses.
    // The system is created after the brains so its alive-set diff starts true.
    loop.morale = new MoraleSystem(brains, {
      routPointFor: (team) =>
        new Vector3(0, 0, team === 0 ? -(half - margin) : half - margin),
    });

    // Every strike becomes a combat event: the HUD's kill feed, hit marker,
    // damage direction and combo counter all read this bus, so they can only
    // ever show what actually happened on the field.
    for (const brain of brains) {
      brain.onStrike = (attacker, victim, amount, killed) => {
        const from = attacker.position.subtract(victim.position);
        from.y = 0;
        if (from.lengthSquared() > 0) from.normalize();
        const vp = victim.position;
        loop.combatEvents.emitStrike({
          attackerTeam: attacker.team,
          victimTeam: victim.team,
          fromDirection: { x: from.x, z: from.z },
          killed,
          amount,
          victimPosition: { x: vp.x, y: vp.y, z: vp.z },
        });
        if (killed) {
          loop.combatEvents.emitKill({ victimTeam: victim.team, killerTeam: attacker.team });
        }
      };
    }

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
    this.tickCount++;
    this.morale?.update(dt);
    // Distance LOD (task 296): far brains think every third tick. The camera
    // pose is read once per frame, not per brain.
    const camPos = this.cullDistance === Infinity
      ? null
      : this.battle.getCamera()?.position ?? null;
    for (const brain of this.brains) {
      if (camPos !== null) {
        const dx = brain.position.x - camPos.x;
        const dz = brain.position.z - camPos.z;
        if (dx * dx + dz * dz > this.cullDistance * this.cullDistance) {
          if (this.tickCount % 3 !== 0) continue;
          brain.update(dt * 3, this.brains);
          continue;
        }
      }
      brain.update(dt, this.brains);
    }
    // The fled are gone: hide their soldiers the first frame they leave.
    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      const soldier = this.soldiers[i];
      if (brain?.hasFled && soldier && soldier.root.isEnabled()) {
        soldier.root.setEnabled(false);
      }
    }
    // A side is done when nothing on it is still fighting: the dead, the
    // fled, and the surrendered are all out. (Surrendered units are alive
    // and have not fled — without the isSurrendered check a mass surrender
    // would soft-lock the battle.)
    const stillFighting = (b: UnitBrain) => b.alive && !b.hasFled && !b.isSurrendered;
    const playerAlive = this.brains.some((b) => b.team === 0 && stillFighting(b));
    const enemyAlive = this.brains.some((b) => b.team === 1 && stillFighting(b));
    if (!playerAlive || !enemyAlive) {
      this.ended = true;
      const playerDead = this.brains.filter((b) => b.team === 0 && !b.alive).length;
      const enemyDead = this.brains.filter((b) => b.team === 1 && !b.alive).length;
      this.onEnd?.({
        victory: enemyAlive === false && playerAlive,
        playerCasualties: playerDead,
        enemyCasualties: enemyDead,
        duration: this.elapsed,
        playerSurrendered: this.brains.filter((b) => b.team === 0 && b.isSurrendered).length,
        enemySurrendered: this.brains.filter((b) => b.team === 1 && b.isSurrendered).length,
      });
    }
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get livingCount(): { player: number; enemy: number } {
    return {
      player: this.brains.filter((b) => b.team === 0 && b.alive && !b.hasFled).length,
      enemy: this.brains.filter((b) => b.team === 1 && b.alive && !b.hasFled).length,
    };
  }

  /** Living brains on the player's team — the orders UI commands these. */
  get playerBrains(): UnitBrain[] {
    return this.brains.filter((b) => b.team === 0 && b.alive && !b.hasFled);
  }

  /** Seconds since the loop started. */
  get elapsedSeconds(): number {
    return this.elapsed;
  }

  /** Total dead on a team (for the kill feed / HUD). */
  casualties(team: number): number {
    return this.brains.filter((b) => b.team === team && !b.alive).length;
  }

  /**
   * Average morale 0-100 across a team's living brains (0 when none left).
   * The brain tracks 0..1; the HUD reads 0-100. Named to avoid the
   * MoraleSystem field.
   */
  averageMorale(team: number): number {
    const living = this.brains.filter((b) => b.team === team && b.alive);
    if (living.length === 0) return 0;
    return (living.reduce((sum, b) => sum + b.morale, 0) / living.length) * 100;
  }

  /** Brains on a team currently in a given state (for the HUD feed). */
  countState(team: number, state: UnitBrain["state"]): number {
    return this.brains.filter((b) => b.team === team && b.state === state).length;
  }

  /**
   * Lowest health fraction among the player's living soldiers, 0..1 (task 33:
   * the low-health warning reads this). Null when no player soldier has ever
   * reported — same honesty rule as the troop counts: no report is not zero.
   */
  playerMinHealthFraction(): number | null {
    let min: number | null = null;
    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      const soldier = this.soldiers[i];
      if (!brain || !soldier) continue;
      if (brain.team !== 0 || !brain.alive) continue;
      const max = soldier.maxHealth;
      if (max <= 0) continue;
      const fraction = Math.max(0, soldier.health / max);
      min = min === null ? fraction : Math.min(min, fraction);
    }
    return min;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.morale?.destroy();
    this.morale = null;
    for (const soldier of this.soldiers) soldier.dispose();
    this.brains.length = 0;
    this.soldiers.length = 0;
  }
}
