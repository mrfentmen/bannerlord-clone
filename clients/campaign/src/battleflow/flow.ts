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
 *
 * Encounters reach the flow two ways:
 * - `begin()` creates one by hand (kept for explicit attacks and for the
 *   local fallback).
 * - The server auto-triggers encounters when hostile parties meet, and
 *   the UI picks them up via `pollEncounters()` / the `EncounterPoller`
 *   and starts the arc with `adoptEncounter()` — no manual creation.
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
import { appraiseLoot, appraisalSummary } from "./loot.js";
import {
  compareBattles,
  type BattleComparison,
  type BattleStats,
} from "./comparison.js";
import { rivalGrudge, trackRival } from "./rivals.js";
import { isMemorable, recordWarStory, type TaleFacts } from "./warStories.js";

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

function loadPrevStats(): BattleStats | null {
  try {
    const raw = localStorage.getItem(PREV_STATS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BattleStats>;
    if (typeof parsed.battleName !== "string" || typeof parsed.date !== "number") return null;
    return parsed as BattleStats;
  } catch {
    return null;
  }
}

function savePrevStats(stats: BattleStats): void {
  try {
    localStorage.setItem(PREV_STATS_KEY, JSON.stringify(stats));
  } catch {
    // Storage unavailable; comparison just restarts next session.
  }
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

/** Everything the live battle view needs. Morale is a 0..1 fraction on both sides. */
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
  /** Recorded aftermath: war story, rival, comparison, loot appraisal. */
  aftermath: BattleAftermath;
}

/**
 * Battle-end events recorded when the fighting stops: a war story when the
 * battle was memorable, the enemy commander tracked as a rival, a
 * comparison against the previous battle, and the loot appraisal.
 */
export interface BattleAftermath {
  /** Narrative of the battle, or null when it was not memorable. */
  warStory: string | null;
  /** One-line read on the enemy commander's record, or null when unknown. */
  rivalLine: string | null;
  /** Comparison against the previous battle, or null for the first. */
  comparison: BattleComparison | null;
  /** Human-readable loot appraisal. */
  lootAppraisal: string;
}

const PREV_STATS_KEY = "campaign.battleflow.prev-stats.v1";

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

export function winChance(attackerPower: number, defenderPower: number): number {
  const total = attackerPower + defenderPower;
  if (total <= 0) return 0.5;
  return attackerPower / total;
}

/**
 * Morale as a fraction of a full force, 0..1.
 *
 * The two sources of a `BattleSide` do not agree on the scale, and the local model has
 * always used a fraction while the server sends the campaign's own morale, which runs
 * 0..100 (`wire.BattleSide.Morale` is `model.Party.Morale`). Rendering one of them as
 * the other puts "5000%" on screen, so the conversion happens here, once, at the boundary
 * the view model owns, rather than in the renderer.
 *
 * Anything above 1 is the 0..100 scale. Exactly 1 is read as a full force rather than as
 * one percent: on the one value the two scales cannot be told apart, the reading that
 * shows a healthy army is the one that cannot hide a broken one.
 */
export function moraleFraction(morale: number): number {
  if (!Number.isFinite(morale)) return 0;
  const fraction = morale > 1 ? morale / 100 : morale;
  return Math.min(1, Math.max(0, fraction));
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
  #aftermath: BattleAftermath | null = null;

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

  /**
   * Poll the server for auto-triggered pending encounters involving the
   * player's party. Returns [] when the server is unreachable or the
   * route is not built yet (nothing to pick up). Other failures throw.
   */
  async pollEncounters(): Promise<Encounter[]> {
    try {
      const all = await this.api.listEncounters(this.#playerPartyId);
      return all.filter((e) => e.status === "pending");
    } catch (err) {
      if (err instanceof BattleApiError && err.serverBattleUnavailable) {
        return [];
      }
      throw err;
    }
  }

  /**
   * Adopt an auto-triggered encounter (from `pollEncounters()` or the
   * `EncounterPoller`) as the active encounter and show the pre-battle
   * screen. This replaces manual creation: the auto-trigger generates
   * the encounter, the flow starts its arc from it.
   */
  adoptEncounter(encounter: Encounter): void {
    this.#playerIsAttacker =
      encounter.attacker.partyId === this.#playerPartyId;
    this.#encounter = encounter;
    this.#battle = null;
    this.#mode = "server";
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
    this.#aftermath = this.#recordAftermath();
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
    this.#aftermath = this.#recordAftermath();
  }

  /** Reset the flow back to idle (e.g. after dismissing after-action). */
  reset(): void {
    this.#phase = "idle";
    this.#encounter = null;
    this.#battle = null;
    this.#localInitial = null;
    this.#aftermath = null;
  }

  // -- battle-end aftermath -------------------------------------------------

  /**
   * Record the battle-end events: war story (when memorable), rival
   * tracking, previous-battle comparison, and the loot appraisal.
   * Runs once per battle, in endBattle(); the view only reads the result.
   */
  #recordAftermath(): BattleAftermath {
    const encounter = this.#encounter;
    const battle = this.#battle;
    const fallback: BattleAftermath = {
      warStory: null,
      rivalLine: null,
      comparison: null,
      lootAppraisal: "No spoils.",
    };
    if (!encounter && !battle) return fallback;

    const attackerName = encounter?.attacker.name ?? battle?.attacker.name ?? "Attacker";
    const defenderName = encounter?.defender.name ?? battle?.defender.name ?? "Defender";
    const battleName = `${attackerName} vs ${defenderName}`;

    let playerWon = false;
    let playerLosses = 0;
    let enemyLosses = 0;
    let loot = 0;
    let ticks = 0;
    let enemyRemaining = 0;
    let enemyId = 0;
    let enemyName = "";
    let chance = 0.5;

    const r = encounter?.resolution;
    if (r) {
      const attackerWon = r.winnerPartyId === encounter!.attacker.partyId;
      playerWon =
        (this.#playerIsAttacker && attackerWon) ||
        (!this.#playerIsAttacker && !attackerWon);
      playerLosses = this.#playerIsAttacker ? r.attackerLosses : r.defenderLosses;
      enemyLosses = this.#playerIsAttacker ? r.defenderLosses : r.attackerLosses;
      loot = r.loot;
      const enemySide = this.#playerIsAttacker ? encounter!.defender : encounter!.attacker;
      enemyId = enemySide.partyId;
      enemyName = enemySide.name;
      enemyRemaining = Math.max(0, enemySide.troops - enemyLosses);
      chance = winChance(encounter!.attacker.power, encounter!.defender.power);
      if (!this.#playerIsAttacker) chance = 1 - chance;
    } else if (battle) {
      const attackerWon = battle.attacker.troops >= battle.defender.troops;
      playerWon =
        (this.#playerIsAttacker && attackerWon) ||
        (!this.#playerIsAttacker && !attackerWon);
      const initial = this.#localInitial ?? {
        attackerTroops: battle.attacker.troops,
        defenderTroops: battle.defender.troops,
      };
      const attackerLosses = Math.max(0, initial.attackerTroops - battle.attacker.troops);
      const defenderLosses = Math.max(0, initial.defenderTroops - battle.defender.troops);
      playerLosses = this.#playerIsAttacker ? attackerLosses : defenderLosses;
      enemyLosses = this.#playerIsAttacker ? defenderLosses : attackerLosses;
      ticks = battle.tick;
      const enemySide = this.#playerIsAttacker ? battle.defender : battle.attacker;
      enemyId = enemySide.partyId;
      enemyName = enemySide.name;
      enemyRemaining = Math.max(0, enemySide.troops);
      if (encounter) {
        chance = winChance(encounter.attacker.power, encounter.defender.power);
        if (!this.#playerIsAttacker) chance = 1 - chance;
      }
    } else {
      return fallback;
    }

    // War story: only memorable battles earn a tale.
    const facts: TaleFacts = { battleName, playerWon, winChance: chance, playerLosses, enemyLosses };
    const warStory = isMemorable(facts) ? recordWarStory(facts).narrative : null;

    // Rival: the enemy commander enters the book; escaping troops keep them at large.
    let rivalLine: string | null = null;
    if (enemyName) {
      const rival = trackRival(`party-${enemyId}`, enemyName, "the field", enemyRemaining > 0);
      rivalLine = rivalGrudge(rival);
    }

    // Previous-battle comparison.
    const current: BattleStats = {
      id: encounter?.id ?? battle?.id ?? `battle-${Date.now()}`,
      battleName,
      date: Date.now(),
      playerWon,
      playerKills: enemyLosses,
      playerLosses,
      loot,
      ticks,
    };
    let comparison: BattleComparison | null = null;
    const previous = loadPrevStats();
    if (previous) {
      try {
        comparison = compareBattles(previous, current);
      } catch {
        comparison = null;
      }
    }
    savePrevStats(current);

    // Loot appraisal: the spoils appraised as a single lot.
    const lootAppraisal =
      loot > 0
        ? appraisalSummary(
            appraiseLoot([
              {
                id: "spoils",
                description: "Battle spoils",
                category: "valuables",
                quantity: 1,
                unitValue: loot,
              },
            ]),
          )
        : "No spoils.";

    return { warStory, rivalLine, comparison, lootAppraisal };
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
      playerSide: { ...playerSide, morale: moraleFraction(playerSide.morale) },
      enemySide: { ...enemySide, morale: moraleFraction(enemySide.morale) },
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
        aftermath: this.#aftermath ?? {
          warStory: null,
          rivalLine: null,
          comparison: null,
          lootAppraisal: "No spoils.",
        },
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
        aftermath: this.#aftermath ?? {
          warStory: null,
          rivalLine: null,
          comparison: null,
          lootAppraisal: "No spoils.",
        },
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
