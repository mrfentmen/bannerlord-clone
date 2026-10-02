/**
 * Victory panel (Rowan solo task 1).
 *
 * Shown once per campaign when the victory condition is met. Offers the
 * player the choice every Bannerlord-style game needs: keep playing in the
 * sandbox, or retire in glory (retirement lands in solo task 3).
 */

import { h } from "../ui/dom.js";
import { panel } from "../ui/kit.js";
import { evaluateVictory, type VictoryStanding } from "./victory.js";

export interface VictoryPanelOptions {
  standing: () => VictoryStanding;
  /** Keep playing; the victory stays recorded. */
  onContinue: () => void;
  /** Open the retirement flow. */
  onRetire: () => void;
  onClose: () => void;
}

export function victoryPanel(options: VictoryPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Victory",
    testId: "victory-panel",
    onClose: options.onClose,
  });

  const result = evaluateVictory(options.standing());

  body.appendChild(
    h("h2", { class: "victory__title", "data-testid": "victory-title" }, result.title || "Dominion"),
  );
  const list = h("ul", { class: "victory__lines", "data-testid": "victory-summary" });
  for (const line of result.summaryLines) {
    list.appendChild(h("li", {}, line));
  }
  body.appendChild(list);

  const actions = h("div", { class: "victory__actions" });
  const cont = h(
    "button",
    { type: "button", class: "btn btn--primary", "data-testid": "victory-continue" },
    "Keep playing",
  );
  cont.addEventListener("click", () => options.onContinue());
  const retire = h(
    "button",
    { type: "button", class: "btn", "data-testid": "victory-retire" },
    "Retire in glory",
  );
  retire.addEventListener("click", () => options.onRetire());
  actions.append(cont, retire);
  body.appendChild(actions);

  return root;
}
