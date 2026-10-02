/**
 * The fire-mode row (Buffy task 74): the control that says whether the selected
 * group opens fire on its own. Task 75 adds hold fire beside it.
 *
 * A press dispatches the input action rather than writing state directly, so the
 * button and the hotkey are the same order with the same path through the
 * registry. The button reflects what was asked for, not what the sim has done —
 * this layer does not know, and does not guess.
 */

import "./fireMode.css";
import { h } from "../ui/dom.js";
import { FIRE_MODE_LABEL, type FireMode } from "./types.js";
import type { InputRegistry } from "../input/index.js";

export interface FireModeButtonSpec {
  mode: FireMode;
  /** Input action the press dispatches. */
  action: string;
  /** One line for the tooltip, saying what the mode means in play. */
  hint: string;
  testId: string;
}

/** Task 74's single button; task 75 prepends hold fire to this list. */
export const FIRE_MODE_BUTTONS: readonly FireModeButtonSpec[] = [
  {
    mode: "at-will",
    action: "battle.fireAtWill",
    hint: "Shoot anything in reach without waiting to be told.",
    testId: "cmd-fire-at-will",
  },
];

export interface FireModeToggleOptions {
  registry: InputRegistry;
  /** Fired after the action is dispatched, for a host that wants to follow along. */
  onPress?: (mode: FireMode) => void;
  buttons?: readonly FireModeButtonSpec[];
}

export interface FireModeToggle {
  root: HTMLElement;
  /** The mode last asked for, or null when none was. */
  current(): FireMode | null;
  /** Reflect a mode without dispatching — for reading state back in. */
  set(mode: FireMode | null): void;
  destroy(): void;
}

export function createFireModeToggle(options: FireModeToggleOptions): FireModeToggle {
  const { registry } = options;
  const buttons = new Map<FireMode, HTMLButtonElement>();
  let active: FireMode | null = null;

  const root = h("div", {
    class: "cmd-fire",
    role: "group",
    "aria-label": "Fire mode",
    "data-testid": "cmd-fire",
  });

  for (const spec of options.buttons ?? FIRE_MODE_BUTTONS) {
    const btn = h("button", {
      type: "button",
      class: "cmd-fire__mode",
      "aria-pressed": "false",
      "data-testid": spec.testId,
      "data-mode": spec.mode,
      title: spec.hint,
    }) as HTMLButtonElement;
    btn.appendChild(h("span", { class: "cmd-fire__label" }, FIRE_MODE_LABEL[spec.mode]));
    btn.addEventListener("click", () => {
      // A pointer activation carries no KeyboardEvent, so this is "touch" in the
      // registry's vocabulary — the same source the order panel uses.
      registry.dispatch(spec.action, "touch");
      set(spec.mode);
      options.onPress?.(spec.mode);
    });
    root.appendChild(btn);
    buttons.set(spec.mode, btn);
  }

  function set(mode: FireMode | null): void {
    active = mode;
    for (const [kind, btn] of buttons) {
      btn.setAttribute("aria-pressed", kind === mode ? "true" : "false");
      btn.classList.toggle("is-active", kind === mode);
    }
  }
  set(null);

  return {
    root,
    current: () => active,
    set,
    destroy() {
      root.remove();
    },
  };
}