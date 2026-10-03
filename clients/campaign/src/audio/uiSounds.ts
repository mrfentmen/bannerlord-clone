/**
 * Tasks 531/535: the global UI sounds.
 *
 * The game has hundreds of buttons and switches, so the sounds are delegated
 * from the app root rather than attached to every control: a click anywhere on
 * a `<button>` plays the click, and a checkbox — the switch this UI uses for
 * settings toggles and mode modifiers — plays the toggle when it flips. Both
 * are delegated listeners, so controls added later are covered without their
 * builders knowing that audio exists.
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
