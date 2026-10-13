/**
 * Task 40: the settings gear.
 *
 * The gear fires the `ui.settings` action through the client's one input
 * registry, which is already the way the app opens its settings surface from
 * anywhere else (`main.ts` binds the same action). Going through the registry
 * rather than calling a panel constructor means the gear and the keyboard end up
 * at exactly the same place, and a player who rebinds the action does not end up
 * with two ways in.
 *
 * The battle does not have a pause menu of its own — there is nothing in the
 * battle code that halts a clock — so the gear opens what the client actually
 * has: the settings panel, reached by the action that is already bound to it.
 */

import "./settingsButton.css";
import { h } from "../ui/dom.js";
import { input as appInput } from "../input/index.js";

/** The action the gear fires. Declared in `input/actions.ts` at boot. */
export const SETTINGS_ACTION = "ui.settings";

/** The slice of `InputRegistry` this button needs. */
export interface ActionDispatch {
  dispatch(id: string, source: "api"): boolean;
}

export interface SettingsButtonOptions {
  /** The registry to fire through; defaults to the client's. */
  registry?: ActionDispatch;
  /** Id of the action to fire; defaults to {@link SETTINGS_ACTION}. */
  action?: string;
}

export interface SettingsButton {
  root: HTMLElement;
  destroy(): void;
}

export function createSettingsButton(opts: SettingsButtonOptions = {}): SettingsButton {
  const registry = opts.registry ?? appInput;
  const action = opts.action ?? SETTINGS_ACTION;
  const button = h(
    "button",
    {
      type: "button",
      class: "hud-settings",
      "data-testid": "hud-settings",
      "aria-label": "Settings",
    },
    h("span", { class: "hud-settings__glyph", "aria-hidden": "true" }, "⚙"),
  );
  const root = h("div", { class: "hud-settings-wrap", role: "group", "aria-label": "Settings" }, button);

  const onClick = (): void => {
    registry.dispatch(action, "api");
  };
  button.addEventListener("click", onClick);

  return {
    root,
    destroy() {
      button.removeEventListener("click", onClick);
      root.remove();
    },
  };
}