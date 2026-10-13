/**
 * End-of-campaign score (Rowan solo task 4).
 *
 * When a campaign ends — victory, defeat, or retirement — the chronicle
 * assigns a score. Three categories keep the number readable: Warfare,
 * Diplomacy, and Wealth. The total maps to a rank title. Pure functions;
 * the host feeds the input from lifetime stats and the data layer.
 */

export interface CampaignScoreInput {
  battlesWon: number;
  battlesLost: number;
  treatiesSigned: number;
  warsWon: number;
  /** Net worth in coin at campaign end. */
  wealth: number;
  townsControlled: number;
  daysElapsed: number;
  /** 0-100. */
  renown: number;
}

export interface CategoryScore {
  name: "Warfare" | "Diplomacy" | "Wealth";
  points: number;
  /** Human-readable breakdown lines. */
  lines: string[];
}

export interface CampaignScore {
  categories: CategoryScore[];
  total: number;
  rank: string;
}

const clampInt = (n: number): number => Math.max(0, Math.floor(n));

function rankFor(total: number): string {
  if (total >= 1200) return "Legend of the Age";
  if (total >= 800) return "Conqueror";
  if (total >= 500) return "High Lord";
  if (total >= 250) return "Lord";
  if (total >= 100) return "Mercenary Captain";
  return "Foot Soldier";
}

/** Deterministic scoring. Same input, same score, always. */
export function scoreCampaign(input: CampaignScoreInput): CampaignScore {
  const won = clampInt(input.battlesWon);
  const lost = clampInt(input.battlesLost);
  const treaties = clampInt(input.treatiesSigned);
  const wars = clampInt(input.warsWon);
  const towns = clampInt(input.townsControlled);
  const renown = Math.max(0, Math.min(100, input.renown));

  const warfarePts = won * 10 + wars * 50 - lost * 4 + towns * 25;
  const warfare: CategoryScore = {
    name: "Warfare",
    points: Math.max(0, warfarePts),
    lines: [
      `${won} battles won × 10`,
      `${wars} wars won × 50`,
      `${towns} towns held × 25`,
      `${lost} defeats × −4`,
    ],
  };

  const diplomacyPts = treaties * 30 + Math.round(renown * 2);
  const diplomacy: CategoryScore = {
    name: "Diplomacy",
    points: Math.max(0, diplomacyPts),
    lines: [`${treaties} treaties signed × 30`, `renown ${renown} × 2`],
  };

  const wealthPts = Math.floor(clampInt(input.wealth) / 100);
  const wealth: CategoryScore = {
    name: "Wealth",
    points: Math.max(0, wealthPts),
    lines: [`${clampInt(input.wealth)} coin ÷ 100`],
  };

  const categories = [warfare, diplomacy, wealth];
  const total = categories.reduce((sum, c) => sum + c.points, 0);
  return { categories, total, rank: rankFor(total) };
}
