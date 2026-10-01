/**
 * Task 47: the selection panel. Lists the currently selected units as cards
 * with kind, headcount, and stance — the last order issued through the
 * commander ("advancing", "holding", ...). The panel is explicit that the
 * stance is the commander's last order, not live sim telemetry: the sim owns
 * ground truth and this module never touches it.
 */

import { h } from "../ui/dom.js";
import { STANCE_LABEL, type OrderKind } from "./types.js";

export interface PanelUnit {
  id: string;
  label: string;
  kind: string;
  count: number;
  /** Last order issued to this unit, if any. */
  lastOrder?: OrderKind;
}

export interface SelectionPanel {
  root: HTMLElement;
  update(units: PanelUnit[]): void;
  destroy(): void;
}

export function createSelectionPanel(): SelectionPanel {
  const root = h("div", {
    class: "cmd-panel",
    role: "region",
    "aria-label": "Selected units",
    "data-testid": "cmd-panel",
  });
  const list = h("ul", { class: "cmd-panel-list" });
  const hint = h("p", {
    class: "cmd-panel-hint",
    text: "Stance shows the last order you issued.",
  });
  root.append(list, hint);
  root.hidden = true;

  function update(units: PanelUnit[]): void {
    list.replaceChildren();
    root.hidden = units.length === 0;
    for (const u of units) {
      const li = h("li", { class: "cmd-panel-card" });
      li.append(
        h("span", { class: "cmd-panel-name", text: u.label }),
        h("span", { class: "cmd-panel-meta", text: `${u.count} · ${u.kind}` }),
        h("span", {
          class: "cmd-panel-stance",
          text: u.lastOrder ? STANCE_LABEL[u.lastOrder] : "awaiting orders",
        }),
      );
      list.append(li);
    }
  }

  function destroy(): void {
    root.remove();
  }

  return { root, update, destroy };
}
