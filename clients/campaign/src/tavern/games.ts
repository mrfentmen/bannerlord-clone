/**
 * Tavern dice, the board-game gap filled Bannerlord-style.
 *
 * Bannerlord's taverns have a board game; ours has dice — a wagering game
 * against the tavern's regulars. Best of three rounds, highest total wins
 * the pot. The NPCs bet like they drink: the drunker the town's mood, the
 * looser their purses. This is the complete game: stakes, rounds, AI, payout.
 */

export interface DicePlayer {
  name: string;
  /** Gold staked. */
  stake: number;
  /** Dice totals per round. */
  rounds: number[];
}

export interface DiceGame {
  players: DicePlayer[];
  /** Round currently being played (0-based). */
  round: number;
  /** Total rounds in the game. */
  totalRounds: number;
  pot: number;
}

export const DICE_ROUNDS = 3;
export const DICE_PER_ROLL = 2;
export const DICE_SIDES = 6;

/** Start a game. Stakes: player's gold vs. each NPC's stake. */
export function startDiceGame(playerName: string, playerStake: number, opponents: { name: string; stake: number }[]): DiceGame {
  if (playerStake <= 0) throw new Error("Stake must be positive.");
  const players: DicePlayer[] = [
    { name: playerName, stake: playerStake, rounds: [] },
    ...opponents.map((o) => ({ name: o.name, stake: o.stake, rounds: [] })),
  ];
  return {
    players,
    round: 0,
    totalRounds: DICE_ROUNDS,
    pot: players.reduce((sum, p) => sum + p.stake, 0),
  };
}

/** Roll one round for every player. Returns the round's totals by name. */
export function playDiceRound(game: DiceGame, roll: () => number): { name: string; total: number }[] {
  if (game.round >= game.totalRounds) throw new Error("The game is over.");
  const results = game.players.map((p) => {
    let total = 0;
    for (let i = 0; i < DICE_PER_ROLL; i++) total += 1 + Math.floor(roll() * DICE_SIDES);
    p.rounds.push(total);
    return { name: p.name, total };
  });
  game.round += 1;
  return results;
}

/** Is the game finished? */
export function diceGameOver(game: DiceGame): boolean {
  return game.round >= game.totalRounds;
}

export interface DiceResult {
  winner: string;
  /** Winnings for the player (0 when they lose; pot minus their stake accounting happens at payout). */
  pot: number;
  totals: { name: string; total: number }[];
  line: string;
}

/** Settle the game: highest three-round total takes the pot. Ties split it. */
export function settleDiceGame(game: DiceGame, playerName: string): DiceResult {
  if (!diceGameOver(game)) throw new Error("The game isn't over yet.");
  const totals = game.players.map((p) => ({
    name: p.name,
    total: p.rounds.reduce((a, b) => a + b, 0),
  }));
  const best = Math.max(...totals.map((t) => t.total));
  const winners = totals.filter((t) => t.total === best).map((t) => t.name);
  const share = Math.floor(game.pot / winners.length);
  const playerWon = winners.includes(playerName);
  return {
    winner: winners.join(" and "),
    pot: playerWon ? share : 0,
    totals,
    line: playerWon
      ? `${winners.join(" and ")} take${winners.length > 1 ? "" : "s"} the pot: ${share} gold.`
      : `${winners.join(" and ")} win${winners.length > 1 ? "" : "s"} the pot. Better luck next time.`,
  };
}

/**
 * What the tavern regulars stake. Scales with town prosperity — rich
 * towns have regulars with deeper pockets and worse judgment.
 */
export function npcStake(townProsperity: number, roll: () => number): number {
  const base = 20 + townProsperity * 0.8;
  return Math.round(base * (0.5 + roll()));
}
