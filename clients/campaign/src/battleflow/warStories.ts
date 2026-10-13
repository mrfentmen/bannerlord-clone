/**
 * War stories log (Rowan solo task 47).
 *
 * Memorable battles are recorded as short narratives in localStorage:
 * the outcome, the odds, the MVP, and the cost, woven into a few
 * sentences the player can revisit. A battle is "memorable" when it was
 * a close win, a heroic upset, or a costly victory.
 */

export interface BattleTale {
  id: string;
  date: number;
  title: string;
  narrative: string;
  playerWon: boolean;
  memorable: boolean;
}

export interface TaleFacts {
  battleName: string;
  playerWon: boolean;
  winChance: number;
  playerLosses: number;
  enemyLosses: number;
  mvpName?: string;
}

const STORE_KEY = "campaign.war-stories.v1";
const MAX_TALES = 50;

/** A battle is memorable: upset win, narrow win, or costly victory. */
export function isMemorable(f: TaleFacts): boolean {
  if (f.playerWon && f.winChance < 0.35) return true; // heroic upset
  if (f.playerWon && f.playerLosses >= f.enemyLosses) return true; // costly victory
  if (!f.playerWon && f.winChance > 0.65) return true; // shocking defeat
  return false;
}

/** Weave the facts into a short narrative. */
export function tellTale(f: TaleFacts): string {
  const odds =
    f.winChance < 0.35 ? "against desperate odds" : f.winChance > 0.65 ? "as favorites" : "on even terms";
  const outcome = f.playerWon
    ? `carried the day ${odds}`
    : `were broken ${odds}`;
  const cost = `at the cost of ${f.playerLosses} of our own for ${f.enemyLosses} of theirs`;
  const mvp = f.mvpName ? ` ${f.mvpName} was cited for valor.` : "";
  return `At ${f.battleName}, our forces ${outcome}, ${cost}.${mvp}`;
}

/** Record a battle; returns the tale (memorable flag included). */
export function recordWarStory(facts: TaleFacts): BattleTale {
  const tale: BattleTale = {
    id: `tale-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    date: Date.now(),
    title: facts.battleName,
    narrative: tellTale(facts),
    playerWon: facts.playerWon,
    memorable: isMemorable(facts),
  };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const tales = raw ? (JSON.parse(raw) as BattleTale[]) : [];
    tales.unshift(tale);
    localStorage.setItem(STORE_KEY, JSON.stringify(tales.slice(0, MAX_TALES)));
  } catch {
    // Session-only tales.
  }
  return tale;
}

/** All recorded tales, newest first. */
export function warStories(): BattleTale[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Only the memorable ones. */
export function memorableTales(): BattleTale[] {
  return warStories().filter((t) => t.memorable);
}
