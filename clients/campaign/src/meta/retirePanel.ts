/**
 * Retirement panel (Rowan solo task 3).
 *
 * Shows the generated epilogue and asks twice before ending the campaign.
 * The host wires onRetire to the real teardown (save, bank legacy, title).
 */

import { h } from "../ui/dom.js";
import { panel } from "../ui/kit.js";
import {
  generateEpilogue,
  nextRetireState,
  type RetireState,
  type RetirementDeeds,
} from "./retire.js";

export interface RetirePanelOptions {
  deeds: () => RetirementDeeds;
  onRetire: () => void;
  onClose: () => void;
}

export function retirePanel(options: RetirePanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Retire",
    testId: "retire-panel",
    onClose: options.onClose,
  });

  let state: RetireState = "idle";

  const lines = h("ul", { class: "retire__lines", "data-testid": "retire-epilogue" });
  for (const line of generateEpilogue(options.deeds())) {
    lines.appendChild(h("li", {}, line));
  }
  body.appendChild(lines);

  const retireBtn = h(
    "button",
    { type: "button", class: "btn btn--danger", "data-testid": "retire-confirm" },
    "Retire this ruler",
  );
  const cancelBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "retire-cancel" },
    "Keep playing",
  );
  const render = (): void => {
    retireBtn.textContent = state === "armed" ? "Confirm retirement — this ends the campaign" : "Retire this ruler";
    retireBtn.setAttribute(
      "aria-label",
      state === "armed"
        ? "Confirm retirement. This ends the campaign."
        : "Retire this ruler. Asks for confirmation.",
    );
  };
  retireBtn.addEventListener("click", () => {
    state = nextRetireState(state, state === "idle" ? "arm" : "confirm");
    if (state === "done") {
      options.onRetire();
      return;
    }
    render();
  });
  cancelBtn.addEventListener("click", () => {
    state = nextRetireState(state, "cancel");
    render();
  });
  render();
  body.append(h("div", { class: "retire__actions" }, retireBtn, cancelBtn));

  return root;
}
