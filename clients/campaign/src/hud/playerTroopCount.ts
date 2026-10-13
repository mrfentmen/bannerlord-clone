/**
 * Task 22: the player's living troop count.
 *
 * The count is whatever the battle says it is: this module owns no troops, no
 * arithmetic and no clock. It subscribes to a source and prints the number that
 * arrives, so a casualty removes one from the HUD at the moment the simulation
 * records it.
 *
 * Until the first figure arrives the readout says so rather than printing a
 * zero — an army that has not reported in is not an empty army, and the
 * difference is the whole reason this is a source and not a counter.
 *
 * The value is deliberately not a live region: a count that falls on every
 * casualty would bury every other announcement. It is readable on demand
 * instead, which is when a commander looks at it.
 */

import "./playerTroopCount.css";
import { h } from "../ui/dom.js";

export interface PlayerTroopSource {
  /** The player's living troop count. */
  onPlayerTroops(fn: (troops: number) => void): () => void;
}

export interface PlayerTroopCount {
  root: HTMLElement;
  destroy(): void;
}

/** Shown until the source reports, and again if a report is not a number. */
const UNKNOWN = "—";

export function createPlayerTroopCount(source: PlayerTroopSource): PlayerTroopCount {
  const value = h("span", { class: "hud-troops__value data", "data-testid": "hud-player-troops" }, UNKNOWN);
  const root = h(
    "div",
    { class: "hud-troops", role: "group", "aria-label": "Your troops", "data-live": "false" },
    h("span", { class: "hud-troops__label label" }, "Your troops"),
    value,
  );

  const unsubscribe = source.onPlayerTroops((troops) => {
    // A source that reports something that is not a count has failed, not told
    // us the army is empty; printing 0 here would be a lie in the player's
    // favour at the worst possible moment.
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