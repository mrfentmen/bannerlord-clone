/**
 * Campaign objectives (mandate §12).
 *
 * A short list of concrete early goals — muster troops, fill the war chest, scout
 * settlements, win a battle — that teach the player what the sandbox offers without
 * forcing a linear campaign. Every objective is measured from real state:
 * `PartyState` for troops and money, the simulation's own battle notifications for
 * victories, and the settlements the player has actually opened for scouting.
 *
 * Progress is re-evaluated from the live snapshot every time; completion is sticky
 * and persisted, so an objective stays done even if the underlying number later
 * drops (troops die, money is spent). The client never decides a battle was won —
 * the notification's winnerSide does.
 */

import type { PartyState, SimSnapshot } from "./types.js";

export interface Objective {
  id: string;
  title: string;
  description: string;
  /** Current progress in the same units as target. */
  progress: number;
  target: number;
  completed: boolean;
}

export interface ObjectiveInput {
  party: PartyState;
  /** Settlement ids the player has opened, tracked client-side. */
  visitedSettlementIds: ReadonlySet<string>;
  /** Battle notifications the snapshot carries, oldest to newest. */
  notifications: SimSnapshot["notifications"];
}

const DEFINITIONS = [
  {
    id: "muster",
    title: "Muster a warband",
    description: "Recruit 10 troops into your party. Towns and villages both hire.",
    target: 10,
  },
  {
    id: "war-chest",
    title: "Fill the war chest",
    description: "Hold $1,000 in party funds. Trade, quests and victories all pay.",
    target: 1000,
  },
  {
    id: "scout-region",
    title: "Scout the region",
    description: "Open the panels of 3 different settlements to learn the land.",
    target: 3,
  },
  {
    id: "first-blood",
    title: "Draw first blood",
    description: "Win a battle. The simulation's own outcome decides.",
    target: 1,
  },
] as const;

function troopCount(party: PartyState): number {
  return party.troops.reduce((sum, stack) => sum + stack.count, 0);
}

function battleWins(party: PartyState, notifications: SimSnapshot["notifications"]): number {
  return notifications.filter(
    (n) => n.kind === "battle" && `side-${n.winnerSide}` === party.factionId,
  ).length;
}

/**
 * Evaluate every objective against live state.
 *
 * `completedIds` is the persisted set of objectives already finished: once done, an
 * objective stays done. Everything else is a fresh reading — the numbers on screen
 * are the world as it is now.
 */
export function evaluateObjectives(
  input: ObjectiveInput,
  completedIds: ReadonlySet<string>,
): Objective[] {
  const progressFor = (id: string): number => {
    switch (id) {
      case "muster":
        return troopCount(input.party);
      case "war-chest":
        return Math.max(0, Math.floor(input.party.money));
      case "scout-region":
        return input.visitedSettlementIds.size;
      case "first-blood":
        return Math.min(1, battleWins(input.party, input.notifications));
      default:
        return 0;
    }
  };
  return DEFINITIONS.map((def) => {
    const progress = progressFor(def.id);
    return {
      ...def,
      progress: Math.min(progress, def.target),
      completed: completedIds.has(def.id) || progress >= def.target,
    };
  });
}

const STORAGE_KEY = "blc-objectives-v1";

export interface ObjectiveStore {
  visited: Set<string>;
  completed: Set<string>;
}

/** Load persisted objective state. Corrupt or missing storage starts empty. */
export function loadObjectiveStore(): ObjectiveStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { visited: new Set(), completed: new Set() };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { visited: new Set(), completed: new Set() };
    const { visited, completed } = parsed as { visited?: unknown; completed?: unknown };
    return {
      visited: new Set(Array.isArray(visited) ? visited.filter((v): v is string => typeof v === "string") : []),
      completed: new Set(Array.isArray(completed) ? completed.filter((v): v is string => typeof v === "string") : []),
    };
  } catch {
    return { visited: new Set(), completed: new Set() };
  }
}

/** Persist objective state. Storage failures are swallowed: objectives degrade to per-session. */
export function saveObjectiveStore(store: ObjectiveStore): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ visited: [...store.visited], completed: [...store.completed] }),
    );
  } catch {
    // Objectives keep working for this session; nothing the player needs to know.
  }
}
