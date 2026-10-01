/**
 * The war memorial panel (MASTER_PLAN task 75).
 *
 * Renders every stone in the memorial, newest first: name, where they fell,
 * and their epitaph. Empty campaigns get an empty state in the product's
 * voice; clearing is two-step, like every other destructive action.
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import type { FallenRecord } from "./memorial.js";
import "./memorial.css";

export interface MemorialPanelOptions {
  /** Live accessor: the panel re-reads it on refresh(). */
  entries: () => FallenRecord[];
  onClear: () => void;
  onClose: () => void;
}

export interface MemorialPanelHandle {
  root: HTMLElement;
  /** Re-render the list (call when a new stone is carved while open). */
  refresh(): void;
  dispose(): void;
}

const SIDE_LABEL: Record<FallenRecord["side"], string> = {
  ally: "Fell beside us",
  enemy: "Fell against us",
  clan: "Of the clan",
};

function stoneEl(entry: FallenRecord): HTMLElement {
  const where = entry.battleLabel ? ` — ${entry.battleLabel}` : "";
  const by = entry.killerName ? ` (slain by ${entry.killerName})` : "";
  return h(
    "li",
    { class: "memorial__stone", "data-testid": "memorial-stone" },
    h("p", { class: "memorial__name label" }, `${entry.name}${where}`),
    h("p", { class: "memorial__side caption" }, `${SIDE_LABEL[entry.side]}${by}`),
    h("blockquote", { class: "memorial__epitaph" }, entry.epitaph),
  );
}

export function memorialPanel(options: MemorialPanelOptions): MemorialPanelHandle {
  const { root, body } = panel({
    title: "War memorial",
    testId: "memorial-panel",
    onClose: options.onClose,
  });

  const count = h("p", { class: "memorial__count", "data-testid": "memorial-count" });
  const list = h("ol", { class: "memorial__list" });

  const clearConfirm = h("div", { class: "memorial__confirm", hidden: true },
    h("p", { class: "label" }, "Strike every stone? This cannot be undone."),
    h("button", { type: "button", class: "btn btn--danger", "data-testid": "memorial-clear-confirm" }, "Strike them all"),
  );
  const clearBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "memorial-clear" },
    "Strike every stone",
  );
  clearBtn.addEventListener("click", () => {
    clearConfirm.hidden = false;
  });
  clearConfirm
    .querySelector('[data-testid="memorial-clear-confirm"]')
    ?.addEventListener("click", () => {
      options.onClear();
      clearConfirm.hidden = true;
      render();
    });

  body.append(count, list, clearBtn, clearConfirm);

  function render(): void {
    const entries = options.entries();
    count.textContent = entries.length === 1 ? "1 stone" : `${entries.length} stones`;
    list.replaceChildren();
    if (entries.length === 0) {
      list.appendChild(
        emptyState(
          "No stones yet",
          "When a named hero falls in battle, their stone is raised here with an epitaph.",
        ),
      );
      clearBtn.hidden = true;
      return;
    }
    clearBtn.hidden = false;
    for (const entry of entries) list.appendChild(stoneEl(entry));
  }
  render();

  let disposed = false;

  return {
    root,
    refresh() {
      if (!disposed) render();
    },
    dispose() {
      disposed = true;
      root.remove();
    },
  };
}
