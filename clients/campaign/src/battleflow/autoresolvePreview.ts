/**
 * Auto-resolve preview (Rowan solo task 28).
 *
 * Before the player picks auto-resolve, show what it will probably cost:
 * win chance, losses if they win, losses if they lose, and the expected
 * (probability-weighted) losses. The loss rates mirror the local resolve
 * model in flow.ts (12% for the winner, 45% for the loser); server-side
 * resolves may differ, and the preview says so.
 */

import type { Encounter } from "./types.js";
import { winChance } from "./flow.js";

export interface AutoresolvePreview {
  /** Player's win chance, 0..1. */
  winChance: number;
  /** Player losses if they win. */
  winLosses: number;
  /** Player losses if they lose. */
  lossLosses: number;
  /** Probability-weighted expected player losses. */
  expectedLosses: number;
  /** One-line summary for the pre-battle screen. */
  summary: string;
  note: string;
}

/** Winner's loss rate in the local resolve model. */
export const WINNER_LOSS_RATE = 0.12;
/** Loser's loss rate in the local resolve model. */
export const LOSER_LOSS_RATE = 0.45;

export function previewAutoResolve(
  encounter: Encounter,
  playerIsAttacker: boolean,
): AutoresolvePreview {
  const chance = winChance(encounter.attacker.power, encounter.defender.power);
  const playerTroops = playerIsAttacker ? encounter.attacker.troops : encounter.defender.troops;
  const playerWins = playerIsAttacker ? chance : 1 - chance;
  const winLosses = Math.round(playerTroops * WINNER_LOSS_RATE);
  const lossLosses = Math.round(playerTroops * LOSER_LOSS_RATE);
  const expectedLosses = Math.round(playerWins * winLosses + (1 - playerWins) * lossLosses);
  return {
    winChance: playerWins,
    winLosses,
    lossLosses,
    expectedLosses,
    summary: `Auto-resolve: ~${expectedLosses} losses expected (${Math.round(playerWins * 100)}% to win)`,
    note: "Estimate from the local battle model — a server resolve may differ.",
  };
}
