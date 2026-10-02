/**
 * Task 28: the pause button.
 *
 * Pause is the one piece of battle state the HUD owns outright: whether the
 * clock is held is a fact about the screen, and it is what the button shows. The
 * simulation's clock belongs to whoever runs the battle loop, so the button
 * reports the state through `onPauseChange` and leaves applying it alone — the
 * same shape as the camera toggle, which hands its mode to
 * `BattleScene.setCameraMode`.
 *
 * Pressing the button while paused resumes, so one control covers both
 * directions; `aria-pressed` carries the state and the label carries the action,
 * which is the pairing the rest of the HUD uses.
 */

import "./pauseButton.css";
import { h } from "../ui/dom.js";

export interface PauseButtonOptions {
  /** Told when pause is turned on or off; the caller stops or starts the clock. */
  onPauseChange: (paused: boolean) => void;
  /** Whether the battle starts paused; defaults to false. */
  paused?: boolean;
}

export interface PauseButton {
  root: HTMLElement;
  /** Whether the battle is currently held. */
  paused(): boolean;
  /** Sets the state without going through the button. */
  setPaused(paused: boolean): void;
  destroy(): void;
}

const PAUSE_LABEL = "Pause";
const RESUME_LABEL = "Resume";

export function createPauseButton(opts: PauseButtonOptions): PauseButton {
  let held = opts.paused === true;
  const label = h("span", { class: "hud-pause__label" }, held ? RESUME_LABEL : PAUSE_LABEL);
  const button = h(
    "button",
    {
      type: "button",
      class: "hud-pause",
      "data-testid": "hud-pause",
      "aria-pressed": String(held),
    },
    h("span", { class: "hud-pause__glyph", "aria-hidden": "true" }, held ? "▶" : "‖"),
    label,
  );
  const root = h("div", { class: "hud-pause-wrap", role: "group", "aria-label": "Pause" }, button);

  function render(): void {
    button.setAttribute("aria-pressed", String(held));
    label.textContent = held ? RESUME_LABEL : PAUSE_LABEL;
    const glyph = button.querySelector(".hud-pause__glyph");
    if (glyph) glyph.textContent = held ? "▶" : "‖";
  }

  function set(next: boolean): void {
    if (next === held) return;
    held = next;
    render();
    opts.onPauseChange(held);
  }

  const onClick = (): void => set(!held);
  button.addEventListener("click", onClick);

  // Painted at construction so the button never starts out disagreeing with the
  // state it was given.
  render();

  return {
    root,
    paused: () => held,
    setPaused: set,
    destroy() {
      button.removeEventListener("click", onClick);
      root.remove();
    },
  };
}