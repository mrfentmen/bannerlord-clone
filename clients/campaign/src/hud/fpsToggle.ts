/**
 * Task 41: FPS counter — the debug toggle for the performance overlay.
 *
 * The overlay itself lives in `ui/perfOverlay.ts` (it renders the frame stats);
 * this is the HUD's switch for it. A button, not a key binding: the task says
 * toggleable, and a visible switch is discoverable in a way a hotkey is not.
 * `aria-pressed` tracks the real overlay state, read back on every click, so
 * the button cannot drift from what the overlay is actually doing.
 */

import "./fpsToggle.css";
import { h } from "../ui/dom.js";
import { isPerfOverlayVisible, setPerfOverlayVisible } from "../ui/perfOverlay.js";

export interface FpsToggle {
  root: HTMLElement;
  destroy(): void;
}

export function createFpsToggle(): FpsToggle {
  const btn = h(
    "button",
    { type: "button", class: "hud-fps", "aria-pressed": "false", title: "Toggle FPS counter" },
    h("span", { "aria-hidden": "true" }, "FPS"),
  );
  const root = h("div", { class: "hud-fps__wrap" }, btn);

  function sync(): void {
    btn.setAttribute("aria-pressed", String(isPerfOverlayVisible()));
  }

  btn.addEventListener("click", () => {
    setPerfOverlayVisible(!isPerfOverlayVisible());
    sync();
  });
  sync();

  return {
    root,
    destroy() {
      root.remove();
    },
  };
}
