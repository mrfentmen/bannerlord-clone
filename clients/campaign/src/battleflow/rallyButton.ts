/**
 * Rally button with visible cooldown (Rowan solo task 23).
 *
 * The button the battle HUD mounts: shows "Rally (Ready)" or the cooldown
 * countdown, disables while cooling down or spent. The HUD owns the tick
 * that re-renders the label; this module owns the label math.
 */

import { h } from "../ui/dom.js";
import {
  canRally,
  rallyCooldownLabel,
  useRally,
  type RallyState,
} from "./rally.js";

export interface RallyButtonOptions {
  state: RallyState;
  nowMs: () => number;
  /** Called with the morale boost when the player rallies. */
  onRally: (boost: number) => void;
}

export function rallyButton(options: RallyButtonOptions): HTMLElement {
  const btn = h(
    "button",
    {
      type: "button",
      class: "btn rally-btn",
      "data-testid": "rally-btn",
    },
    "",
  ) as HTMLButtonElement;

  function render(): void {
    const now = options.nowMs();
    const label = rallyCooldownLabel(options.state, now);
    btn.textContent = `Rally (${label})`;
    btn.disabled = !canRally(options.state, now);
    btn.setAttribute("aria-label", `Rally troops: ${label}`);
  }

  btn.addEventListener("click", () => {
    const boost = useRally(options.state, options.nowMs());
    if (boost !== null) {
      options.onRally(boost);
      render();
    }
  });

  render();
  // Expose a re-render for the HUD's tick.
  (btn as unknown as { refreshRally: () => void }).refreshRally = render;
  return btn;
}
