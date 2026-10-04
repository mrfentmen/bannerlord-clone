/**
 * Task 35: selected unit info panel — who the player has picked, at a glance.
 *
 * The panel subscribes to the selection source and lists each selected unit's
 * side, state and health. Empty selection shows the panel's empty state rather
 * than vanishing, so the player can tell "nothing selected" apart from "panel
 * broken". Health is a real fraction off the unit's own max — the panel owns
 * no numbers.
 */

import "./selectedUnitPanel.css";
import { h } from "../ui/dom.js";

export interface SelectedUnit {
  /** 0 = player, 1 = enemy. */
  team: number;
  /** Brain state: idle, moving, attacking, engaging, dead… */
  state: string;
  health: number;
  maxHealth: number;
}

export interface SelectedUnitSource {
  onSelection(fn: (units: SelectedUnit[]) => void): () => void;
}

export interface SelectedUnitPanel {
  root: HTMLElement;
  destroy(): void;
}

export function createSelectedUnitPanel(source: SelectedUnitSource): SelectedUnitPanel {
  const list = h("ul", { class: "hud-selunit__list" });
  const root = h(
    "section",
    { class: "hud-selunit", "aria-label": "Selected units" },
    h("h3", { class: "hud-selunit__title" }, "Selected"),
    list,
  );

  function render(units: SelectedUnit[]): void {
    list.replaceChildren();
    if (units.length === 0) {
      list.appendChild(
        h("li", { class: "hud-selunit__empty" }, "No units selected"),
      );
      return;
    }
    for (const u of units) {
      const fraction = u.maxHealth > 0 ? Math.max(0, Math.min(1, u.health / u.maxHealth)) : 0;
      const bar = h("span", { class: "hud-selunit__bar" });
      bar.style.width = `${Math.round(fraction * 100)}%`;
      list.appendChild(
        h(
          "li",
          { class: `hud-selunit__item hud-selunit__item--${u.team === 0 ? "ally" : "enemy"}` },
          h("span", { class: "hud-selunit__state" }, u.state),
          h("span", { class: "hud-selunit__hp" }, bar),
        ),
      );
    }
  }

  const unsubscribe = source.onSelection(render);

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
