/**
 * The Five Endings — campaign victory conditions.
 *
 * Each ending is a long-term goal tracked across the entire campaign.
 * Unlike quests (which are tasks), endings are win conditions.
 * The player can pursue multiple endings; completing one wins the game.
 *
 * See lore.md sections 8 and 18 for narrative detail.
 */

export type EndingId =
  | "unifier"
  | "kingmaker"
  | "breadlord"
  | "ghost"
  | "survivor";

export interface EndingProgress {
  id: EndingId;
  title: string;
  description: string;
  /** 0-100, how close to completion */
  progress: number;
  /** Human-readable status, e.g. "14/26 states held" */
  status: string;
  /** Whether this ending is still achievable */
  viable: boolean;
}

export const ENDINGS: Record<EndingId, { title: string; description: string }> = {
  unifier: {
    title: "The Unifier",
    description:
      "Hold a majority of America (26+ states) under one banner for 365 days. The maps stop showing the old borders.",
  },
  kingmaker: {
    title: "The Kingmaker",
    description:
      "Never take the top seat. Put your chosen rulers on five thrones and own their debts. Win without a crown.",
  },
  breadlord: {
    title: "The Breadlord",
    description:
      "Control the food. In a hungry country, the hand that feeds is the hand that rules — without drawing a weapon.",
  },
  ghost: {
    title: "The Ghost",
    description:
      "Build a mercenary company so feared and so rich that sections pay you not to march. Power without territory.",
  },
  survivor: {
    title: "The Survivor",
    description:
      "Keep one town alive through famine, plague, siege, and betrayal for 20 years. The smallest ending. The hardest.",
  },
};

/**
 * Calculate ending progress from game state.
 * Called daily (or on significant events).
 */
export function calculateEndingProgress(state: {
  statesHeld: number;
  daysHeld: number;
  puppetsOnThrones: number;
  titlesHeld: number;
  foodControl: number; // 0-1, share of continent's food you control
  mercenaryReputation: number; // 0-100
  mercenaryWealth: number;
  homeTown: string | null;
  homeTownYearsSurvived: number;
}): EndingProgress[] {
  return [
    {
      id: "unifier",
      title: ENDINGS.unifier.title,
      description: ENDINGS.unifier.description,
      progress: Math.min(100, (state.statesHeld / 26) * 50 + (state.daysHeld / 365) * 50),
      status: `${state.statesHeld}/26 states, ${state.daysHeld}/365 days`,
      viable: state.statesHeld >= 1,
    },
    {
      id: "kingmaker",
      title: ENDINGS.kingmaker.title,
      description: ENDINGS.kingmaker.description,
      progress: Math.min(100, (state.puppetsOnThrones / 5) * 100),
      status: `${state.puppetsOnThrones}/5 puppets on thrones`,
      viable: state.titlesHeld === 0, // Disqualified if you take a throne yourself
    },
    {
      id: "breadlord",
      title: ENDINGS.breadlord.title,
      description: ENDINGS.breadlord.description,
      progress: Math.min(100, state.foodControl * 100),
      status: `${Math.round(state.foodControl * 100)}% of food supply controlled`,
      viable: true,
    },
    {
      id: "ghost",
      title: ENDINGS.ghost.title,
      description: ENDINGS.ghost.description,
      progress: Math.min(
        100,
        (state.mercenaryReputation / 100) * 50 + Math.min(50, state.mercenaryWealth / 10000)
      ),
      status: `Rep ${state.mercenaryReputation}/100, wealth ${state.mercenaryWealth}`,
      viable: true,
    },
    {
      id: "survivor",
      title: ENDINGS.survivor.title,
      description: ENDINGS.survivor.description,
      progress: Math.min(100, (state.homeTownYearsSurvived / 20) * 100),
      status: state.homeTown
        ? `${state.homeTown}: ${state.homeTownYearsSurvived}/20 years`
        : "No home town designated",
      viable: state.homeTown !== null,
    },
  ];
}

/**
 * Check if any ending is complete.
 * Returns the winning ending ID, or null.
 */
export function checkVictory(progress: EndingProgress[]): EndingId | null {
  for (const p of progress) {
    if (p.progress >= 100 && p.viable) {
      return p.id;
    }
  }
  return null;
}
