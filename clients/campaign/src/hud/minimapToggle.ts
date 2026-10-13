/**
 * Task 26: the minimap toggle.
 *
 * The minimap itself is `scene/BattleUI.ts`'s `BattleMinimap`, whose `canvas` is
 * a public field — so this button is handed that element rather than owning a
 * second map. Hiding it is two things at once: the element stops being shown,
 * and `onVisibilityChange` tells the scene to stop drawing dots, so a hidden
 * minimap costs nothing per frame.
 *
 * The button is a real toggle button: `aria-pressed` carries the state, and the
 * label names the action the press will take, so it reads correctly whether a
 * screen reader user is told the state or the text.
 */

import "./minimapToggle.css";
import { h } from "../ui/dom.js";

export interface MinimapToggleOptions {
  /** The minimap element this button shows and hides. */
  target: HTMLElement;
  /**
   * Called whenever visibility changes, so the caller can stop drawing. Omitted
   * the button still hides the element.
   */
  onVisibilityChange?: (visible: boolean) => void;
  /** Whether the minimap starts shown; defaults to true. */
  visible?: boolean;
}

export interface MinimapToggle {
  root: HTMLElement;
  /** Whether the minimap is currently shown. */
  visible(): boolean;
  /** Sets the state without going through the button. */
  setVisible(visible: boolean): void;
  destroy(): void;
}

const SHOW_LABEL = "Show minimap";
const HIDE_LABEL = "Hide minimap";

export function createMinimapToggle(opts: MinimapToggleOptions): MinimapToggle {
  let shown = opts.visible !== false;
  const label = h("span", { class: "hud-minimap-toggle__label" }, HIDE_LABEL);
  const button = h(
    "button",
    {
      type: "button",
      class: "hud-minimap-toggle",
      "data-testid": "hud-minimap-toggle",
      "aria-pressed": String(shown),
    },
    h("span", { class: "hud-minimap-toggle__glyph", "aria-hidden": "true" }, "▣"),
    label,
  );
  const root = h(
    "div",
    { class: "hud-minimap-toggle-wrap", role: "group", "aria-label": "Minimap" },
    button,
  );

  function apply(visible: boolean): void {
    shown = visible;
    opts.target.hidden = !visible;
    button.setAttribute("aria-pressed", String(visible));
    label.textContent = visible ? HIDE_LABEL : SHOW_LABEL;
  }

  const onClick = (): void => {
    const next = !shown;
    apply(next);
    opts.onVisibilityChange?.(next);
  };
  button.addEventListener("click", onClick);

  // Applied at construction so the element and the button cannot disagree about
  // the state they start in.
  apply(shown);

  return {
    root,
    visible: () => shown,
    setVisible(visible: boolean) {
      if (visible === shown) return;
      apply(visible);
      opts.onVisibilityChange?.(visible);
    },
    destroy() {
      button.removeEventListener("click", onClick);
      root.remove();
    },
  };
}