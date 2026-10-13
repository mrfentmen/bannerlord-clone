/**
 * Task 83: level-up notifications.
 *
 * `unitXp.ts` already works out who levelled and how far; what was missing was
 * anything that *says so*. A line buried in a roster is not a notification —
 * the player who spent the battle winning needs to be told the unit came back
 * stronger without having to go looking for it.
 *
 * The panel is a polite live region, so it announces when it mounts instead of
 * interrupting whatever the player is already reading. It renders only the units
 * that actually levelled; a battle where nobody did has nothing to say and the
 * panel hides itself rather than printing "no level ups".
 */

import { h } from "../ui/dom.js";
import type { XpGain } from "./unitXp.js";
import "./reportContent.css";

export interface LevelUpNote {
  unitId: string;
  name: string;
  levelBefore: number;
  levelAfter: number;
  /** Levels gained this battle, normally 1. */
  levelsGained: number;
  xpGained: number;
  line: string;
}

export interface LevelUpPanel {
  root: HTMLElement;
  /** The notes shown, leader-most first. Empty when nobody levelled. */
  notes(): LevelUpNote[];
}

/**
 * The notes for this battle, most levels gained first, then the larger award,
 * then by name so two identical results never swap places between renders.
 */
export function levelUpNotes(gains: readonly XpGain[]): LevelUpNote[] {
  return gains
    .filter((g) => g.leveledUp)
    .map((g) => ({
      unitId: g.unitId,
      name: g.name,
      levelBefore: g.levelBefore,
      levelAfter: g.levelAfter,
      levelsGained: g.levelAfter - g.levelBefore,
      xpGained: g.xpGained,
      line: `${g.name} — level ${g.levelBefore} to ${g.levelAfter} (+${g.xpGained} XP)`,
    }))
    .sort(
      (a, b) => b.levelsGained - a.levelsGained || b.xpGained - a.xpGained || a.name.localeCompare(b.name),
    );
}

/**
 * The level-up notification for a battle. Hidden when nobody levelled, so the
 * caller can mount it unconditionally.
 */
export function createLevelUpPanel(gains: readonly XpGain[]): LevelUpPanel {
  const notes = levelUpNotes(gains);
  const root = h("div", {
    class: "aa-levelups",
    "data-testid": "aa-levelups",
    role: "status",
    "aria-live": "polite",
  });
  root.hidden = notes.length === 0;
  if (notes.length === 0) return { root, notes: () => [] };

  root.appendChild(h("h3", { class: "aa-levelups__title" }, `Level ups (${notes.length})`));
  const list = h("ul", { class: "aa-levelups__list" });
  for (const note of notes) {
    const row = h("li", { class: "aa-levelups__row", "data-unit-id": note.unitId });
    row.append(
      h("span", { class: "aa-levelups__name" }, note.name),
      h("span", { class: "aa-levelups__rank" }, `Level ${note.levelBefore} → ${note.levelAfter}`),
      h("span", { class: "aa-levelups__xp mono" }, `+${note.xpGained} XP`),
    );
    list.appendChild(row);
  }
  root.appendChild(list);
  return { root, notes: () => notes };
}