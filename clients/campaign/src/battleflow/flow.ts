/**
 * Battle UI flow: pre-battle -> live battle -> after-action.
 *
 * The flow talks to the server through a narrow `BattleApi`. When the
 * server answers "unimplemented" (the battle endpoints are not built on
 * its side yet) or is unreachable, the flow does NOT crash and does NOT
 * pretend a server simulation ran. It switches to a local fallback mode
 * and completes the whole arc — pre-battle, orders, after-action —
 * against a small, deterministic local model, clearly labeled as local.
 *
 * The local model is a stand-in, not milo's battle sim and not the
 * server's. When the real endpoints land, the same UI code runs the
 * server mode without changes.
 */

import type {
  Battle,
  BattleEndReason,
  BattleOrders,
  BattleSide,
  Encounter,
  EncounterSide,
} from "./types";
import { BattleApiError, type BattleApi } from "./api";

export type FlowPhase = "idle" | "prebattle" | "live" | "afteraction";
export type FlowMode = "server" | "local";

/**
 * Describes the two forces when the server cannot. The app implements
 * this from the campaign snapshot (party names, troop counts, power).
 */
export interface LocalBattleSource {
  describeEncounter(
    attackerPartyId: number,
    defenderPartyId: number
  ): { attacker: EncounterSide; defender: EncounterSide };
}

/** Everything the pre-battle screen needs. */
export interface PrebattleView {
  mode: FlowMode;
  encounter: Encounter;
  /** Player's win chance, 0..1, from relative power. */
  playerWinChance: number;
  /** One-line read of the matchup. */
  assessment: string;
  playerIsAttacker: boolean;
}

/** Everything the live battle view needs. */
export interface LiveBattleView {
  mode: FlowMode;
  battle: Battle;
  playerSide: BattleSide;
  enemySide: BattleSide;
  playerIsAttacker: boolean;
  /** Orders the player can meaningfully give right now. */
  availableOrders: Array<"advance" | "hold" | "retreat" | "focusFire">;
}

/** Everything the after-action screen needs. */
export interface AfterActionView {
  mode: FlowMode;
  winner: "attacker" | "defender";
  playerWon: boolean;
  playerIsAttacker: boolean;
  attackerLosses: number;
  defenderLosses: number;
  loot: number;
  ticks: number;
  summary: string;
}

/** FNV-1a 32-bit, for deterministic local draws. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 0..1 draw from a seed. */
function seededDraw(seed: number): number {
  let s = seed;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  s ^= s >>> 15;
  return (s >>> 0) / 0xffffffff;
}

function winChance(attackerPower: number, defenderPower: number): number {
  const total = attackerPower + defenderPower;
  if (total <= 0) return 0.5;
  return attackerPower / total;
}

function assess(playerWinChance: number): string {
  if (playerWinChance >= 0.75) return "You hold a crushing advantage.";
  if (playerWinChance >= 0.6) return "You hold the advantage.";
  if (playerWinChance >= 0.45) return "Evenly matched. Orders will decide it.";
  if (playerWinChance >= 0.3) return "The enemy outmatches you. Pick your moment.";
  return "You are badly outmatched. Consider withdrawing.";
}

export class BattleFlow {
  #phase: FlowPhase = "idle";
  #mode: FlowMode = "server";
  #encounter: Encounter | null = null;
  #battle: Battle | null = null;
  #playerPartyId: number;
  #playerIsAttacker = true;
  #localInitial: { attackerTroops: number; defenderTroops: number } | null =
    null;

  constructor(
    private readonly api: BattleApi,
    private readonly local: LocalBattleSource,
    playerPartyId: number
  ) {
    this.#playerPartyId = playerPartyId;
  }

  get phase(): FlowPhase {
    return this.#phase;
  }

  get mode(): FlowMode {
    return this.#mode;
  }

  get encounter(): Encounter | null {
    return this.#encounter;
  }

  get battle(): Battle | null {
    return this.#battle;
  }

  /** Start the arc: arrange an encounter and show the pre-battle screen. */
  async begin(
    attackerPartyId: number,
    defenderPartyId: number
  ): Promise<void> {
    this.#playerIsAttacker = attackerPartyId === this.#playerPartyId;
    try {
      this.#encounter = await this.api.createEncounter(
        attackerPartyId,
        defenderPartyId
      );
      this.#mode = "server";
    } catch (err) {
      if (err instanceof BattleApiError && err.serverBattleUnavailable) {
        this.#encounter = this.#localEncounter(attackerPartyId, defenderPartyId);
        this.#mode = "local";
      } else {
        throw err;
      }
    }
    this.#battle = null;
    this.#phase = "prebattle";
  }

  /** Auto-resolve the encounter without a real-time battle. */
  async autoResolve(): Promise<void> {
    const encounter = this.#requireEncounter();
    if (this.#mode === "server") {
      try {
        this.#encounter = await this.api.resolveEncounter(encounter.id);
      } catch (err) {
        if (err instanceof BattleApiError && err.serverBattleUnavailable) {
          this.#encounter = this.#localResolve(encounter);
          this.#mode = "local";
        } else {
          throw err;
        }
      }
    } else {
      this.#encounter = this.#localResolve(encounter);
    }
    this.#phase = "afteraction";
  }

  /** Escalate the encounter into a real-time battle session. */
  async escalate(): Promise<void> {
    const encounter = this.#requireEncounter();
    if (this.#mode === "server") {
      try {
        this.#battle = await this.api.startBattle(encounter.id);
      } catch (err) {
        if (err instanceof BattleApiError && err.serverBattleUnavailable) {
          this.#battle = this.#localStartBattle(encounter);
          this.#mode = "local";
        } else {
          throw err;
        }
      }
    } else {
      this.#battle = this.#localStartBattle(encounter);
    }
    this.#phase = "live";
  }

  /** Re-read the live battle state (server mode only; local is instant). */
  async refresh(): Promise<void> {
    const battle = this.#requireBattle();
    if (this.#mode === "server") {
      this.#battle = await this.api.getBattle(battle.id);
      if (this.#battle.status === "ended") this.#phase = "afteraction";
    }
  }

  /** Issue orders for the next tick. In local mode this advances one tick. */
  async orders(orders: BattleOrders): Promise<void> {
    const battle = this.#requireBattle();
    if (this.#mode === "server") {
      try {
        this.#battle = await this.api.submitOrders(battle.id, orders);
      } catch (err) {
        if (err instanceof BattleApiError && err.serverBattleUnavailable) {
          // The server died mid-battle: finish locally rather than
          // stranding the player on a dead screen.
          this.#mode = "local";
          this.#battle = this.#localTick(battle, orders);
        } else {
          throw err;
        }
      }
    } else {
      this.#battle = this.#localTick(battle, orders);
    }
    if (this.#battle.status === "ended") this.#phase = "afteraction";
  }

  /** End the battle session and move to after-action. */
  async endBattle(reason: BattleEndReason): Promise<void> {
    const battle = this.#requireBattle();
    if (this.#mode === "server") {
      try {
        this.#battle = await this.api.endBattle(battle.id, reason);
      } catch (err) {
        if (err instanceof BattleApiError && err.serverBattleUnavailable) {
          this.#mode = "local";
          this.#battle = this.#localEndBattle(battle, reason);
        } else {
          throw err;
        }
      }
    } else {
      this.#battle = this.#localEndBattle(battle, reason);
    }
    this.#phase = "afteraction";
  }

  /** Reset the flow back to idle (e.g. after dismissing after-action). */
  reset(): void {
    this.#phase = "idle";
    this.#encounter = null;
    this.#battle = null;
    this.#localInitial = null;
  }

  // -- view models ----------------------------------------------------------

  prebattleView(): PrebattleView | null {
    const encounter = this.#encounter;
    if (!encounter || this.#phase !== "prebattle") return null;
    const chance = winChance(encounter.attacker.power, encounter.defender.power);
    return {
      mode: this.#mode,
      encounter,
      playerWinChance: this.#playerIsAttacker ? chance : 1 - chance,
      assessment: assess(this.#playerIsAttacker ? chance : 1 - chance),
      playerIsAttacker: this.#playerIsAttacker,
    };
  }

  liveView(): LiveBattleView | null {
    const battle = this.#battle;
    if (!battle || this.#phase !== "live") return null;
    const playerSide = this.#playerIsAttacker ? battle.attacker : battle.defender;
    const enemySide = this.#playerIsAttacker ? battle.defender : battle.attacker;
    return {
      mode: this.#mode,
      battle,
      playerSide,
      enemySide,
      playerIsAttacker: this.#playerIsAttacker,
      availableOrders: ["advance", "hold", "retreat", "focusFire"],
    };
  }

  afterActionView(): AfterActionView | null {
    if (this.#phase !== "afteraction") return null;
    const encounter = this.#encounter;
    const battle = this.#battle;
    if (!encounter && !battle) return null;

    if (encounter?.resolution) {
      const r = encounter.resolution;
      const winner = r.winnerPartyId === encounter.attacker.partyId ? "attacker" : "defender";
      const playerWon =
        (this.#playerIsAttacker && winner === "attacker") ||
        (!this.#playerIsAttacker && winner === "defender");
      return {
        mode: this.#mode,
        winner,
        playerWon,
        playerIsAttacker: this.#playerIsAttacker,
        attackerLosses: r.attackerLosses,
        defenderLosses: r.defenderLosses,
        loot: r.loot,
        ticks: 0,
        summary: playerWon
          ? `Victory. The field is yours, and ${r.loot} in spoils.`
          : "Defeat. Your force breaks and leaves the field.",
      };
    }

    if (battle) {
      const attackerWon = battle.attacker.troops >= battle.defender.troops;
      const winner = attackerWon ? "attacker" : "defender";
      const playerWon =
        (this.#playerIsAttacker && attackerWon) ||
        (!this.#playerIsAttacker && !attackerWon);
      const initial = this.#localInitial ?? {
        attackerTroops: battle.attacker.troops,
        defenderTroops: battle.defender.troops,
      };
      return {
        mode: this.#mode,
        winner,
        playerWon,
        playerIsAttacker: this.#playerIsAttacker,
        attackerLosses: Math.max(0, initial.attackerTroops - battle.attacker.troops),
        defenderLosses: Math.max(0, initial.defenderTroops - battle.defender.troops),
        loot: 0,
        ticks: battle.tick,
        summary: playerWon
          ? `Victory after ${battle.tick} ticks of fighting.`
          : `Defeat after ${battle.tick} ticks of fighting.`,
      };
    }

    return null;
  }

  // -- internals ------------------------------------------------------------

  #requireEncounter(): Encounter {
    if (!this.#encounter) throw new Error("No encounter is active.");
    return this.#encounter;
  }

  #requireBattle(): Battle {
    if (!this.#battle) throw new Error("No battle is active.");
    return this.#battle;
  }

  // -- local fallback model -------------------------------------------------
  //
  // Deterministic and deliberately simple. It exists so the UI arc is
  // complete and honest while the server endpoints are unimplemented;
  // it is not a simulation of record.

  #localEncounter(attackerPartyId: number, defenderPartyId: number): Encounter {
    const sides = this.local.describeEncounter(attackerPartyId, defenderPartyId);
    return {
      id: `local-${Date.now()}`,
      attacker: sides.attacker,
      defender: sides.defender,
      status: "pending",
    };
  }

  #localResolve(encounter: Encounter): Encounter {
    const chance = winChance(encounter.attacker.power, encounter.defender.power);
    const draw = seededDraw(hashSeed(encounter.id));
    const attackerWins = draw < chance;
    const loserTroops = attackerWins
      ? encounter.defender.troops
      : encounter.attacker.troops;
    return {
      ...encounter,
      status: "resolved",
      resolution: {
        winnerPartyId: attackerWins
          ? encounter.attacker.partyId
          : encounter.defender.partyId,
        attackerLosses: Math.round(
          encounter.attacker.troops * (attackerWins ? 0.12 : 0.45)
        ),
        defenderLosses: Math.round(
          encounter.defender.troops * (attackerWins ? 0.45 : 0.12)
        ),
        loot: Math.round(loserTroops * 2.5),
      },
    };
  }

  #localStartBattle(encounter: Encounter): Battle {
    this.#localInitial = {
      attackerTroops: encounter.attacker.troops,
      defenderTroops: encounter.defender.troops,
    };
    const side = (s: EncounterSide): BattleSide => ({
      partyId: s.partyId,
      name: s.name,
      troops: s.troops,
      morale: 1,
    });
    return {
      id: `local-battle-${Date.now()}`,
      encounterId: encounter.id,
      status: "active",
      tick: 0,
      attacker: side(encounter.attacker),
      defender: side(encounter.defender),
    };
  }

  #localTick(battle: Battle, orders: BattleOrders): Battle {
    const advance = Math.min(1, Math.max(0, orders.advance ?? 0));
    const attackFactor = 1 + advance * 0.8 + (orders.focusFire ? 0.4 : 0);
    const defenseFactor =
      (orders.hold ? 0.6 : 1) * (orders.retreat ? 1.5 : 1);

    // The player's orders apply to the player's side only; the enemy
    // fights with a fixed, modest posture.
    const attackerDealtMult = this.#playerIsAttacker ? attackFactor : 1;
    const attackerTakenMult = this.#playerIsAttacker ? defenseFactor : 1;
    const defenderDealtMult = this.#playerIsAttacker ? 1 : attackFactor;
    const defenderTakenMult = this.#playerIsAttacker ? 1 : defenseFactor;

    const attackerPower =
      Math.max(1, battle.attacker.troops) * battle.attacker.morale;
    const defenderPower =
      Math.max(1, battle.defender.troops) * battle.defender.morale;

    const attackerLoss = Math.max(
      1,
      Math.round(
        defenderPower * 0.03 * defenderDealtMult * attackerTakenMult
      )
    );
    const defenderLoss = Math.max(
      1,
      Math.round(
        attackerPower * 0.03 * attackerDealtMult * defenderTakenMult
      )
    );

    const attacker: BattleSide = {
      ...battle.attacker,
      troops: Math.max(0, battle.attacker.troops - attackerLoss),
    };
    const defender: BattleSide = {
      ...battle.defender,
      troops: Math.max(0, battle.defender.troops - defenderLoss),
    };
    const initial = this.#localInitial ?? {
      attackerTroops: attacker.troops + attackerLoss,
      defenderTroops: defender.troops + defenderLoss,
    };
    attacker.morale = Math.max(
      0,
      initial.attackerTroops > 0 ? attacker.troops / initial.attackerTroops : 0
    );
    defender.morale = Math.max(
      0,
      initial.defenderTroops > 0 ? defender.troops / initial.defenderTroops : 0
    );

    const tick = battle.tick + 1;
    const retreat = orders.retreat === true;
    const broken =
      attacker.troops === 0 ||
      defender.troops === 0 ||
      attacker.morale < 0.2 ||
      defender.morale < 0.2;
    const status = retreat || broken ? "ended" : "active";

    return { ...battle, tick, attacker, defender, status };
  }

  #localEndBattle(battle: Battle, reason: BattleEndReason): Battle {
    void reason;
    return { ...battle, status: "ended" };
  }
}
