/**
 * @vitest-environment jsdom
 *
 * Game / pause menu tests: the five entries render with text labels, every
 * callback fires, close is idempotent, the quit button asks twice, and Resume
 * takes focus on open.
 */

import { describe, expect, it, vi } from "vitest";
import { gameMenuPanel } from "../GameMenu.js";

function options() {
  return {
    onResume: vi.fn(),
    onSaveLoad: vi.fn(),
    onSettings: vi.fn(),
    onControls: vi.fn(),
    onQuitToTitle: vi.fn(),
    onClose: vi.fn(),
  };
}

function mount() {
  const opts = options();
  const handle = gameMenuPanel(opts);
  document.body.appendChild(handle.root);
  return { opts, handle };
}

describe("gameMenuPanel", () => {
  it("renders a modal dialog with the five entries", () => {
    const { handle } = mount();
    const root = handle.root;
    expect(root.getAttribute("role")).toBe("dialog");
    expect(root.getAttribute("aria-modal")).toBe("true");
    expect(root.getAttribute("data-testid")).toBe("game-menu");

    const labels = [...root.querySelectorAll(".game-menu__list button")].map((b) => b.textContent);
    expect(labels).toEqual(["Resume", "Save / Load", "Settings", "Controls", "Quit to title"]);
  });

  it("fires each entry's callback", () => {
    const { opts, handle } = mount();
    const click = (testId: string) =>
      (handle.root.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();

    click("game-menu-resume");
    click("game-menu-saveload");
    click("game-menu-settings");
    click("game-menu-controls");
    expect(opts.onResume).toHaveBeenCalledTimes(1);
    expect(opts.onSaveLoad).toHaveBeenCalledTimes(1);
    expect(opts.onSettings).toHaveBeenCalledTimes(1);
    expect(opts.onControls).toHaveBeenCalledTimes(1);
  });

  it("asks twice before quitting to title", () => {
    const { opts, handle } = mount();
    const quit = handle.root.querySelector('[data-testid="game-menu-quit"]') as HTMLButtonElement;

    quit.click();
    expect(opts.onQuitToTitle).not.toHaveBeenCalled();
    expect(quit.textContent).toBe("Confirm quit to title");

    quit.click();
    expect(opts.onQuitToTitle).toHaveBeenCalledTimes(1);
  });

  it("close() is idempotent and reports isOpen()", () => {
    const { opts, handle } = mount();
    expect(handle.isOpen()).toBe(true);

    handle.close();
    handle.close();
    expect(handle.isOpen()).toBe(false);
    expect(opts.onClose).toHaveBeenCalledTimes(1);
  });

  it("the panel close button closes the menu once", () => {
    const { opts, handle } = mount();
    (handle.root.querySelector(".panel__close") as HTMLButtonElement).click();
    expect(opts.onClose).toHaveBeenCalledTimes(1);
    expect(handle.isOpen()).toBe(false);
  });

  it("focuses the Resume button on open", async () => {
    const { handle } = mount();
    await Promise.resolve();
    expect(document.activeElement).toBe(
      handle.root.querySelector('[data-testid="game-menu-resume"]'),
    );
  });

  it("announces that the clock is held", () => {
    const { handle } = mount();
    expect(handle.root.querySelector(".game-menu__note")?.textContent).toMatch(/clock is held/);
  });
});
