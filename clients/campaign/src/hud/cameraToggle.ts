/**
 * Task 27: the camera mode toggle.
 *
 * Two modes and no third: follow (the camera tracks the player) and free (the
 * player drives it). Both are named on the face of the control and the one that
 * is current is the one pressed, so nothing about the mode is hidden behind a
 * glyph or a tooltip.
 *
 * The camera belongs to the scene — `BattleScene.setCameraMode` is where the mode
 * takes effect — so this module takes an `onMode` callback and knows nothing
 * about Babylon. `CameraMode` is the HUD's own vocabulary and matches that
 * method's union exactly, so a caller passes the method straight through.
 */

import "./cameraToggle.css";
import { h } from "../ui/dom.js";

/** Follows the player, or leaves the camera in the player's hands. */
export type CameraMode = "follow" | "free";

export interface CameraToggleOptions {
  /** Told when the mode changes; the scene applies it. */
  onMode: (mode: CameraMode) => void;
  /** The mode to start in; defaults to `follow`. */
  mode?: CameraMode;
}

export interface CameraToggle {
  root: HTMLElement;
  /** The mode currently shown as on. */
  mode(): CameraMode;
  /** Sets the mode without going through the buttons. */
  setMode(mode: CameraMode): void;
  destroy(): void;
}

const MODES: Array<{ id: CameraMode; label: string; name: string }> = [
  { id: "follow", label: "Follow", name: "Follow camera" },
  { id: "free", label: "Free", name: "Free camera" },
];

export function createCameraToggle(opts: CameraToggleOptions): CameraToggle {
  let current: CameraMode = opts.mode ?? "follow";
  const buttons = new Map<CameraMode, HTMLButtonElement>();
  const listeners: Array<[HTMLButtonElement, () => void]> = [];

  function render(): void {
    for (const mode of MODES) {
      buttons.get(mode.id)?.setAttribute("aria-pressed", String(mode.id === current));
    }
  }

  const root = h("div", {
    class: "hud-camera-toggle",
    role: "group",
    "aria-label": "Camera mode",
    "data-testid": "hud-camera-toggle",
  });

  for (const mode of MODES) {
    const btn = h(
      "button",
      {
        type: "button",
        class: "hud-camera-toggle__btn",
        "data-testid": `hud-camera-${mode.id}`,
        "aria-pressed": String(mode.id === current),
        "aria-label": mode.name,
      },
      mode.label,
    );
    const onClick = (): void => {
      set(mode.id);
    };
    btn.addEventListener("click", onClick);
    listeners.push([btn, onClick]);
    buttons.set(mode.id, btn);
    root.appendChild(btn);
  }

  function set(mode: CameraMode): void {
    if (mode === current) return;
    current = mode;
    render();
    opts.onMode(mode);
  }

  return {
    root,
    mode: () => current,
    setMode: set,
    destroy() {
      for (const [btn, onClick] of listeners) btn.removeEventListener("click", onClick);
      root.remove();
    },
  };
}