/**
 * Contextual tutorial hints (mandate §13).
 *
 * Short, dismissible hints that appear when the player's situation calls for them —
 * no destination set, few troops, food running low — rather than a front-loaded
 * lecture. Each hint has a trigger evaluated from live state; a hint shows only while
 * its trigger holds, and dismissing it (or disabling hints entirely) persists across
 * sessions.
 *
 * Hints never invent mechanics: every hint points at a real control or panel.
 */

import type { PartyState } from "./types.js";

export interface TutorialInput {
  party: PartyState;
  /** Settlements the player has opened. */
  visitedSettlementIds: ReadonlySet<string>;
  /** Days of food at current consumption. */
  daysOfFood: number;
  /** Whether the objectives panel has ever been opened. */
  objectivesOpened: boolean;
}

export interface TutorialHint {
  id: string;
  title: string;
  text: string;
}

export interface HintDefinition extends TutorialHint {
  /** True while the player's situation calls for this hint. */
  trigger: (input: TutorialInput) => boolean;
}

function troopCount(party: PartyState): number {
  return party.troops.reduce((sum, stack) => sum + stack.count, 0);
}

const DEFINITIONS: HintDefinition[] = [
  {
    id: "march",
    title: "March your party",
    text: "Click any settlement on the map to march there. Your route draws in purple, and the destination marker shows where the line ends.",
    trigger: (input) => !input.party.destination && input.visitedSettlementIds.size === 0,
  },
  {
    id: "recruit",
    title: "Recruit troops",
    text: "Your party is small. Open a town or village and hire recruits — strength keeps bandits away and wins battles.",
    trigger: (input) => troopCount(input.party) < 5 && input.visitedSettlementIds.size > 0,
  },
  {
    id: "food",
    title: "Stock food",
    text: "Your supplies are running low. Open a town's market and buy food before your party goes hungry.",
    trigger: (input) => input.daysOfFood < 3,
  },
  {
    id: "objectives",
    title: "Set your course",
    text: "The Objectives panel lists early goals — mustering troops, scouting the region, winning a battle. They are suggestions, not orders.",
    trigger: (input) => !input.objectivesOpened && input.visitedSettlementIds.size >= 2,
  },
];

/**
 * The first hint whose trigger holds and which the player has not dismissed, or
 * `null` when nothing calls for a hint. One hint at a time: a stack of advice is a
 * lecture.
 */
export function currentHint(
  input: TutorialInput,
  dismissedIds: ReadonlySet<string>,
  disabled: boolean,
): TutorialHint | null {
  if (disabled) return null;
  return DEFINITIONS.find((def) => !dismissedIds.has(def.id) && def.trigger(input)) ?? null;
}

export function hintById(id: string): TutorialHint | null {
  return DEFINITIONS.find((def) => def.id === id) ?? null;
}

const STORAGE_KEY = "blc-tutorial-v1";

export interface TutorialStore {
  dismissed: Set<string>;
  disabled: boolean;
  objectivesOpened: boolean;
}

/** Load persisted tutorial state. Corrupt or missing storage starts fresh. */
export function loadTutorialStore(): TutorialStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dismissed: new Set(), disabled: false, objectivesOpened: false };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { dismissed: new Set(), disabled: false, objectivesOpened: false };
    }
    const { dismissed, disabled, objectivesOpened } = parsed as {
      dismissed?: unknown;
      disabled?: unknown;
      objectivesOpened?: unknown;
    };
    return {
      dismissed: new Set(
        Array.isArray(dismissed) ? dismissed.filter((v): v is string => typeof v === "string") : [],
      ),
      disabled: disabled === true,
      objectivesOpened: objectivesOpened === true,
    };
  } catch {
    return { dismissed: new Set(), disabled: false, objectivesOpened: false };
  }
}

/** Persist tutorial state. Storage failures degrade to per-session hints. */
export function saveTutorialStore(store: TutorialStore): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dismissed: [...store.dismissed],
        disabled: store.disabled,
        objectivesOpened: store.objectivesOpened,
      }),
    );
  } catch {
    // Hints keep working for this session; nothing the player needs to know.
  }
}
