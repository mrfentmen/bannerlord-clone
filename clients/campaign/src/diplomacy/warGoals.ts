/**
 * War goal declaration (Rowan solo task 83).
 *
 * Declare why you fight: conquest, liberation, tribute, or humiliation.
 * The goal shapes war weariness — wars fought for declared goals exhaust
 * slower than aimless ones, and undeclared wars exhaust fastest. Each war
 * tracks its goal and accumulated weariness. Persists in localStorage.
 */

export type WarGoal = "conquest" | "liberation" | "tribute" | "humiliation";

export const WAR_GOALS: WarGoal[] = ["conquest", "liberation", "tribute", "humiliation"];

export const WAR_GOAL_DESCRIPTIONS: Record<WarGoal, string> = {
  conquest: "Seize their lands for your own.",
  liberation: "Free oppressed towns from their yoke.",
  tribute: "Force them to pay yearly tribute.",
  humiliation: "Break their pride; demand a humiliating peace.",
};

export interface DeclaredWar {
  id: string;
  enemyId: string;
  enemyName: string;
  goal: WarGoal | null;
  /** 0..100 accumulated weariness. */
  weariness: number;
  seasonDeclared: number;
}

/** Weariness gained per season: declared goals exhaust slower. */
export function wearinessPerSeason(goal: WarGoal | null): number {
  if (goal == null) return 12;
  return goal === "liberation" ? 5 : goal === "conquest" ? 8 : goal === "tribute" ? 7 : 9;
}

const STORE_KEY = "campaign.war-goals.v1";

function load(): DeclaredWar[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(wars: DeclaredWar[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(wars));
  } catch {
    // Session-only wars.
  }
}

/** Declare a war goal against an enemy. */
export function declareWarGoal(
  enemyId: string,
  enemyName: string,
  goal: WarGoal,
  season: number,
): DeclaredWar {
  if (!(WAR_GOALS as readonly string[]).includes(goal)) {
    throw new Error(`unknown war goal: ${goal}`);
  }
  const wars = load();
  const existing = wars.find((w) => w.enemyId === enemyId);
  if (existing) {
    existing.goal = goal;
    save(wars);
    return existing;
  }
  const war: DeclaredWar = {
    id: `war-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    enemyId,
    enemyName,
    goal,
    weariness: 0,
    seasonDeclared: season,
  };
  wars.push(war);
  save(wars);
  return war;
}

/** Advance one season: weariness grows at the goal's rate. */
export function tickWarWeariness(): DeclaredWar[] {
  const wars = load();
  for (const war of wars) {
    war.weariness = Math.min(100, war.weariness + wearinessPerSeason(war.goal));
  }
  save(wars);
  return wars;
}

/** Active wars. */
export function activeWars(): DeclaredWar[] {
  return load();
}

/** Wars at or past exhaustion (weariness 100). */
export function exhaustedWars(): DeclaredWar[] {
  return load().filter((w) => w.weariness >= 100);
}
