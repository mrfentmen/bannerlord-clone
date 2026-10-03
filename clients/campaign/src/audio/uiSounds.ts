/**
 * Tasks 531/535/533/534: the UI's sound cues.
 *
 * The game has hundreds of buttons and switches, so the click and toggle are
 * delegated from the app root rather than attached to every control: a click
 * anywhere on a `<button>` plays the click, and a checkbox — the switch this
 * UI uses for settings toggles and mode modifiers — plays the toggle when it
 * flips. Because they are delegated listeners, controls added later are
 * covered without their builders knowing that audio exists.
 *
 * The verdict cue is the opposite case: accept/refuse outcomes are decided by
 * the code that owns the transaction, so those call sites ask for the sound by
 * name instead of the DOM guessing from a click.
 *
 * Install once, at boot. The returned function removes both listeners.
 */

import { getAudioManager } from "./AudioManager.js";

/** Installs the delegated UI sounds on `root`; returns the uninstaller. */
export function installUiSounds(root: HTMLElement): () => void {
  const onClick = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element && target.closest("button")) {
      getAudioManager().playUiSound("click");
    }
  };
  const onChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      getAudioManager().playUiSound("toggle");
    }
  };

  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("change", onChange);
  };
}

/**
 * Tasks 533/534: the verdict of an accept/refuse interaction — the confirm
 * chime when the action is accepted, the error buzz when it is refused.
 */
export function playVerdictSound(accepted: boolean): void {
  getAudioManager().playUiSound(accepted ? "confirm" : "error");
}
