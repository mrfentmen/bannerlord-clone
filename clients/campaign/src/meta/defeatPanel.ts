/**
 * Defeat panel (Rowan solo task 2).
 *
 * Game-over screen for a wiped-out clan. Offers continue-as-heir when an
 * heir exists (resolved through the injected hasHeir check against the
 * succession rules), plus starting over or returning to the title.
 */

import { h } from "../ui/dom.js";
import { panel } from "../ui/kit.js";
import { evaluateDefeat, type DefeatStanding } from "./defeat.js";

export interface DefeatPanelOptions {
  standing: () => DefeatStanding;
  /** Whether a valid heir exists to continue the campaign. */
  hasHeir: () => boolean;
  onContinueAsHeir: () => void;
  onNewCampaign: () => void;
  onTitle: () => void;
  onClose: () => void;
}

export function defeatPanel(options: DefeatPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Defeat",
    testId: "defeat-panel",
    onClose: options.onClose,
  });

  const result = evaluateDefeat(options.standing());
  body.appendChild(
    h("h2", { class: "defeat__title", "data-testid": "defeat-title" }, result.epitaph || "Defeat"),
  );
  const list = h("ul", { class: "defeat__lines", "data-testid": "defeat-summary" });
  for (const line of result.summaryLines) {
    list.appendChild(h("li", {}, line));
  }
  body.appendChild(list);

  const heirOk = options.hasHeir();
  const actions = h("div", { class: "defeat__actions" });
  const heirBtn = h(
    "button",
    {
      type: "button",
      class: "btn btn--primary",
      "data-testid": "defeat-continue-heir",
      disabled: heirOk ? null : true,
      title: heirOk ? "" : "No heir survives to continue the line",
    },
    "Continue as heir",
  );
  heirBtn.addEventListener("click", () => {
    if (options.hasHeir()) options.onContinueAsHeir();
  });
  const newBtn = h(
    "button",
    { type: "button", class: "btn", "data-testid": "defeat-new-campaign" },
    "Start new campaign",
  );
  newBtn.addEventListener("click", () => options.onNewCampaign());
  const titleBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "defeat-to-title" },
    "Return to title",
  );
  titleBtn.addEventListener("click", () => options.onTitle());
  actions.append(heirBtn, newBtn, titleBtn);
  body.appendChild(actions);

  return root;
}
