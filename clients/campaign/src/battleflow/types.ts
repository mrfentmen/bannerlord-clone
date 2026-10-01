/**
 * Battle-flow wire types.
 *
 * Mirrors `services/simulation/cmd/apiserver/wire/battle.go` on the Go
 * side. The fault envelope mirrors `api/api.go`'s `ErrorBody`:
 * `{ error: { code, message }, reason }`.
 *
 * An encounter is the campaign-level event (two forces meet). It can be
 * auto-resolved or escalated into a real-time battle session where the
 * player issues orders. A battle is the live session: the player issues
 * orders, the simulation ticks, and the result is written back.
 */

/** One side of an encounter, for the pre-battle screen. */
export interface EncounterSide {
  partyId: number;
  name: string;
  troops: number;
  power: number;
}

/** The auto-resolve outcome of an encounter. */
export interface EncounterResolution {
  winnerPartyId: number;
  attackerLosses: number;
  defenderLosses: number;
  /** Loot taken by the winner, in the campaign's currency. */
  loot: number;
}

export type EncounterStatus = "pending" | "resolved" | "escalated";

/** A pending or finished encounter. */
export interface Encounter {
  id: string;
  attacker: EncounterSide;
  defender: EncounterSide;
  status: EncounterStatus;
  resolution?: EncounterResolution;
}

/** One side's live state in a battle. */
export interface BattleSide {
  partyId: number;
  name: string;
  troops: number;
  morale: number;
}

export type BattleStatus = "active" | "ended";

/** A live (or ended) battle session. */
export interface Battle {
  id: string;
  encounterId: string;
  status: BattleStatus;
  /** Battle clock (battle ticks, not campaign ticks). */
  tick: number;
  attacker: BattleSide;
  defender: BattleSide;
}

/**
 * The player's orders for the next battle tick. The exact order set is
 * intentionally small: the battle sim interprets these; the client does
 * not need the full order language.
 */
export interface BattleOrders {
  /** Push forward (0..1 intensity). */
  advance?: number;
  /** Hold position. */
  hold?: boolean;
  /** Withdraw. Ends the battle if both sides retreat or morale breaks. */
  retreat?: boolean;
  /** Concentrate on the enemy's weakest unit group. */
  focusFire?: boolean;
}

export type BattleEndReason = "victory" | "defeat" | "retreat" | "timeout";

/** Machine half of the server error envelope. Stable tokens, not prose. */
export interface ApiFault {
  code: string;
  message: string;
  reason: string;
}

/** Raw shape of the server error envelope. */
export interface ErrorEnvelope {
  error?: { code?: string; message?: string };
  reason?: string;
}

/** The server's "not implemented yet" signal. */
export const CODE_UNIMPLEMENTED = "unimplemented";
