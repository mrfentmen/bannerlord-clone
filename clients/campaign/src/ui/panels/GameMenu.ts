/**
 * The pause / game menu (Rowan): what Escape opens when no panel is up.
 *
 * A modal dialog over the campaign map: resume, save/load, settings, controls,
 * and a two-step quit-to-title. main.ts holds the simulation clock at 0 while
 * the menu is open and restores the player's speed when it closes; this panel
 * only reports the open/close transitions through its callbacks, so the clock
 * policy stays in one place.
 *
 * Accessibility: role=dialog + aria-modal, labelled by the panel heading, and
 * the Resume button takes focus on open so keyboard play continues without a
 * pointer. Nothing here is icon-only (ART_DIRECTION.md 5.3): every button
 * carries a text label.
 */

import { h } from "../dom.js";
import { panel } from "../kit.js";
import "./GameMenu.css";

export interface GameMenuOptions {
  /** Resume the campaign: the host closes the menu and restores the clock. */
  onResume: () => void;
  /** Open the save/load panel (the menu closes first). */
  onSaveLoad: () => void;
  /** Open the settings panel (the menu closes first). */
  onSettings: () => void;
  /** Open the controls / keybinding editor (the menu closes first). */
  onControls: () => void;
  /** Quit to the title screen. The button asks twice: it arms, then fires. */
  onQuitToTitle: () => void;
  /** The menu closed (resume, the close button, or Escape). */
  onClose: () => void;
}

export interface GameMenuHandle {
  readonly root: HTMLElement;
  isOpen(): boolean;
  close(): void;
}

export function gameMenuPanel(options: GameMenuOptions): GameMenuHandle {
  let open = true;

  const close = (): void => {
    if (!open) return;
    open = false;
    options.onClose();
  };

  const { root, body } = panel({
    title: "Paused",
    testId: "game-menu",
    onClose: close,
  });
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");

  const entry = (label: string, testId: string, onClick: () => void, cls: string): HTMLButtonElement =>
    h("button", { type: "button", class: `${cls} game-menu__btn`, "data-testid": testId, onclick: onClick }, label);

  const resume = entry("Resume", "game-menu-resume", options.onResume, "btn btn--primary");
  const saveLoad = entry("Save / Load", "game-menu-saveload", options.onSaveLoad, "btn btn--quiet");
  const settings = entry("Settings", "game-menu-settings", options.onSettings, "btn btn--quiet");
  const controls = entry("Controls", "game-menu-controls", options.onControls, "btn btn--quiet");

  const quit = h(
    "button",
    { type: "button", class: "btn btn--danger game-menu__btn", "data-testid": "game-menu-quit" },
    "Quit to title",
  );
  let quitArmed = false;
  quit.addEventListener("click", () => {
    if (!quitArmed) {
      quitArmed = true;
      quit.textContent = "Confirm quit to title";
      quit.setAttribute("aria-label", "Confirm quit to title. Progress since the last save is lost.");
      return;
    }
    options.onQuitToTitle();
  });

  body.append(
    h("p", { class: "game-menu__note" }, "The campaign clock is held while this menu is open."),
    h(
      "div",
      { class: "game-menu__list", role: "group", "aria-label": "Game menu" },
      resume,
      saveLoad,
      settings,
      controls,
      quit,
    ),
  );

  const handle: GameMenuHandle = { root, isOpen: () => open, close };

  // Focus lands on Resume once the caller has mounted the root: microtasks run
  // after the synchronous mount, in browsers and in jsdom alike.
  queueMicrotask(() => resume.focus());

  return handle;
}
