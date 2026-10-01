/**
 * Field checks for the encounter and battle replies.
 *
 * CONSTITUTION.md section 1.3: every external call is untrusted. The shared
 * provider validates each snapshot and order reply before a panel reads it
 * (`src/data/wire.ts`), and the battle client is an external call too, so it
 * checks its replies the same way and with the same helpers from
 * `src/data/checks.ts` rather than casting `await response.json() as
 * Encounter` and letting a missing field surface three frames away as a
 * blank forces table.
 *
 * The shapes are transcribed from `services/simulation/cmd/apiserver/wire/battle.go`.
 */

import {
  isArray,
  isFiniteNumber,
  isOneOf,
  isRecord,
  isString,
  listProblem,
} from "../data/checks.js";

const ENCOUNTER_STATUSES = ["pending", "resolved", "escalated"] as const;
const BATTLE_STATUSES = ["active", "ended"] as const;

/** One side of an encounter, as the pre-battle table reads it. */
export function encounterSideProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isFiniteNumber(raw.partyId)) return "has no partyId";
  if (!isString(raw.name)) return "has no name";
  if (!isFiniteNumber(raw.troops)) return "troops is not a number";
  if (!isFiniteNumber(raw.power)) return "power is not a number";
  return null;
}

/** The auto-resolve outcome, present only once an encounter is resolved. */
export function encounterResolutionProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isFiniteNumber(raw.winnerPartyId)) return "has no winnerPartyId";
  if (!isFiniteNumber(raw.attackerLosses)) return "attackerLosses is not a number";
  if (!isFiniteNumber(raw.defenderLosses)) return "defenderLosses is not a number";
  if (!isFiniteNumber(raw.loot)) return "loot is not a number";
  return null;
}

/** A pending, resolved or escalated encounter. */
export function encounterProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.id)) return "has no id";
  const attacker = encounterSideProblem(raw.attacker);
  if (attacker) return `attacker ${attacker}`;
  const defender = encounterSideProblem(raw.defender);
  if (defender) return `defender ${defender}`;
  if (!isOneOf(raw.status, ENCOUNTER_STATUSES)) return "status is not pending, resolved or escalated";
  // A resolution is the server's answer to an auto-resolve. It is optional on the wire
  // (`resolution,omitempty`) and a pending encounter legitimately has none, so it is
  // only checked when it is there.
  if (raw.resolution !== undefined && raw.resolution !== null) {
    const problem = encounterResolutionProblem(raw.resolution);
    if (problem) return `resolution ${problem}`;
  }
  return null;
}

/**
 * The encounter list.
 *
 * The route answers `null` rather than `[]` for a party that has met nobody
 * (`ListEncountersForParty` returns a nil slice), which is a legitimate answer
 * and not a fault: an empty world and a broken world look identical otherwise.
 * `null` is therefore read as the empty list, and anything else has to be a
 * list of encounters.
 */
export function encounterListProblem(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (!isArray(raw)) return "the reply is not a list of encounters";
  return listProblem(raw, encounterProblem, (i) => `encounter ${i}`);
}

/** One side of a live battle. */
export function battleSideProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "is not a JSON object";
  if (!isFiniteNumber(raw.partyId)) return "has no partyId";
  if (!isString(raw.name)) return "has no name";
  if (!isFiniteNumber(raw.troops)) return "troops is not a number";
  if (!isFiniteNumber(raw.morale)) return "morale is not a number";
  return null;
}

/** A live or ended battle session. */
export function battleProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return "the reply is not a JSON object";
  if (!isString(raw.id)) return "has no id";
  if (!isString(raw.encounterId)) return "has no encounterId";
  if (!isOneOf(raw.status, BATTLE_STATUSES)) return "status is not active or ended";
  if (!isFiniteNumber(raw.tick)) return "tick is not a number";
  const attacker = battleSideProblem(raw.attacker);
  if (attacker) return `attacker ${attacker}`;
  const defender = battleSideProblem(raw.defender);
  if (defender) return `defender ${defender}`;
  return null;
}