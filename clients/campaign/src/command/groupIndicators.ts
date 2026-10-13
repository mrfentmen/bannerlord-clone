/**
 * Control group indicators (Buffy task 69): the bottom-left row of numbered
 * chips showing which control groups exist and how big they are.
 *
 * The commander already knows the groups (`selection.group(n)`); this only makes
 * them visible, so a player can see what they have bound without pressing
 * anything. Clicking a chip recalls that group through the same action the
 * number key fires, so the chips are the mouse route into the existing path.
 * Group membership itself stays in the selection model — nothing is cached here.
 */

import "./groupIndicators.css";
import { h } from "../ui/dom.js";
import type { InputRegistry } from "../input/index.js";

export interface GroupIndicatorsOptions {
  registry: InputRegistry;
  /** How many groups to watch, 1-9. */
  count?: number;
  /** Current membership per group; the caller reads it from the selection model. */
  members: (group: number) => string[];
  /** Fires when a chip is pressed, after the action is dispatched. */
  onRecall?: (group: number) => void;
}

export interface GroupIndicators {
  root: HTMLElement;
  /** Repaint from the current membership; empty groups drop their chip. */
  update(): void;
  destroy(): void;
}

const GROUP_COUNT = 9;

export function createGroupIndicators(options: GroupIndicatorsOptions): GroupIndicators {
  const { registry, members } = options;
  const count = options.count ?? GROUP_COUNT;

  const root = h("div", {
    class: "cmd-groups",
    role: "group",
    "aria-label": "Control groups",
    "data-testid": "cmd-groups",
  });
  const chips: (HTMLElement | null)[] = new Array(count).fill(null);

  return {
    root,
    update() {
      for (let n = 1; n <= count; n++) {
        const ids = members(n);
        let chip = chips[n - 1] ?? null;
        if (ids.length === 0) {
          chip?.remove();
          chips[n - 1] = null;
          continue;
        }
        if (!chip) {
          chip = h("button", {
            type: "button",
            class: "cmd-group",
            "data-group": String(n),
            "data-testid": `cmd-group-${n}`,
            title: `Control group ${n}: ${ids.length} unit${ids.length === 1 ? "" : "s"}. Ctrl+${n} re-assigns it.`,
            "aria-label": `Recall control group ${n}, ${ids.length} unit${ids.length === 1 ? "" : "s"}`,
          });
          chip.addEventListener("click", () => {
            registry.dispatch(`battle.controlGroup${n}`, "touch");
            options.onRecall?.(n);
          });
          root.appendChild(chip);
          chips[n - 1] = chip;
        }
        // The digit plus the headcount badge, rebuilt each repaint so the chip
        // never shows a stale size.
        const badge = h("span", { class: "cmd-group__count", "aria-hidden": "true" }, String(ids.length));
        chip.replaceChildren(document.createTextNode(String(n)), badge);
      }
    },
    destroy() {
      for (const chip of chips) chip?.remove();
      chips.length = 0;
      root.remove();
    },
  };
}