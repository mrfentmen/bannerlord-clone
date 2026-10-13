/**
 * Task 23: the enemy's living troop count.
 *
 * The mirror of task 22, and deliberately the same widget: one label, one
 * number, one "no figure yet" state. A commander reads the two counts the same
 * way, so a player count in one visual form and an enemy count in another would
 * be a distinction without a difference.
 *
 * The figure comes from the enemy side of the live battle view, not from the
 * player's losses. In a battle the two are not the same number — the enemy's
 * dead are counted against the enemy — and showing a derived figure would be a
 * guess about units this HUD cannot see.
 */

import "./enemyTroopCount.css";
import { h } from "../ui/dom.js";

export interface EnemyTroopSource {
  /** The enemy's living troop count. */
  onEnemyTroops(fn: (troops: number) => void): () => void;
}

export interface EnemyTroopCount {
  root: HTMLElement;
  destroy(): void;
}

/** Shown until the source reports, and again if a report is not a number. */
const UNKNOWN = "—";

export function createEnemyTroopCount(source: EnemyTroopSource): EnemyTroopCount {
  const value = h("span", { class: "hud-enemy-troops__value data", "data-testid": "hud-enemy-troops" }, UNKNOWN);
  const root = h(
    "div",
    {
      class: "hud-enemy-troops",
      role: "group",
      "aria-label": "Enemy troops",
      "data-live": "false",
    },
    h("span", { class: "hud-enemy-troops__label label" }, "Enemy troops"),
    value,
  );

  const unsubscribe = source.onEnemyTroops((troops) => {
    if (!Number.isFinite(troops)) return;
    root.setAttribute("data-live", "true");
    value.textContent = String(Math.max(0, Math.trunc(troops)));
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}