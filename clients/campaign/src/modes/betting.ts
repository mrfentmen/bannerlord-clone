/**
 * Task 62: tournament betting. Decimal odds from Elo ratings, a persistent
 * purse, and correct payouts — including the upset, where the underdog pays
 * more than the stake several times over.
 */

import type { TournamentFighter } from "./tournament.js";

const STORE_KEY = "campaign.purse.v1";
const STARTING_PURSE = 500;

export interface Bet {
  fighterId: string;
  stake: number;
  /** Decimal odds locked in when the bet was placed. */
  odds: number;
}

/** Win probability of a over b, Elo logistic. */
export function winProbability(a: TournamentFighter, b: TournamentFighter): number {
  return 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400));
}

/** Decimal odds for backing `a` against `b`, rounded to 2 places. */
export function decimalOdds(a: TournamentFighter, b: TournamentFighter): number {
  const p = Math.min(0.95, Math.max(0.05, winProbability(a, b)));
  return Math.round((1 / p) * 100) / 100;
}

/** Total returned on a winning bet: stake × odds. */
export function payout(bet: Bet): number {
  return Math.round(bet.stake * bet.odds * 100) / 100;
}

export interface Bookmaker {
  purse(): number;
  placeBet(fighterId: string, stake: number, odds: number): Bet;
  /** Settle after the bout: winners are paid, losers' stakes are gone. */
  settle(bets: Bet[], winnerId: string): number;
  reset(): void;
}

function loadPurse(): number {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? Number(JSON.parse(raw)) : NaN;
    return Number.isFinite(v) && v >= 0 ? v : STARTING_PURSE;
  } catch {
    return STARTING_PURSE;
  }
}

export function createBookmaker(): Bookmaker {
  let purse = loadPurse();

  function save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(purse));
    } catch {
      // Session-only purse.
    }
  }

  return {
    purse: () => purse,
    placeBet(fighterId, stake, odds) {
      if (!Number.isFinite(stake) || stake <= 0) throw new Error("stake must be positive");
      if (stake > purse) throw new Error("insufficient funds");
      if (!Number.isFinite(odds) || odds < 1) throw new Error("odds must be >= 1");
      purse = Math.round((purse - stake) * 100) / 100;
      save();
      return { fighterId, stake, odds };
    },
    settle(bets, winnerId) {
      let returned = 0;
      for (const bet of bets) {
        if (bet.fighterId === winnerId) returned += payout(bet);
      }
      purse = Math.round((purse + returned) * 100) / 100;
      save();
      return Math.round(returned * 100) / 100;
    },
    reset() {
      purse = STARTING_PURSE;
      save();
    },
  };
}
