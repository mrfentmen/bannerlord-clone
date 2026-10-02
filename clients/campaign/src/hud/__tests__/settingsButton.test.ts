/**
 * Task 40: the settings gear.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsButton, SETTINGS_ACTION } from "../settingsButton.js";
import { createInputRegistry } from "../../input/registry.js";

function gear(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-testid="hud-settings"]');
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("settings gear", () => {
  it("fires the ui.settings action, which is how the app opens settings", () => {
    const registry = createInputRegistry();
    const opened = vi.fn();
    registry.on(SETTINGS_ACTION, opened);
    const button = createSettingsButton({ registry });
    document.body.append(button.root);

    gear()?.click();

    expect(opened).toHaveBeenCalledTimes(1);
    button.destroy();
  });

  it("routes through the registry rather than building a panel of its own", () => {
    const dispatch = vi.fn(() => true);
    const button = createSettingsButton({ registry: { dispatch } });
    document.body.append(button.root);

    gear()?.click();

    expect(dispatch.mock.calls).toEqual([[SETTINGS_ACTION, "api"]]);
    button.destroy();
  });

  it("has an accessible name even though it is a single glyph", () => {
    const button = createSettingsButton({ registry: { dispatch: vi.fn(() => true) } });
    document.body.append(button.root);

    expect(gear()?.getAttribute("aria-label")).toBe("Settings");
    expect(gear()?.querySelector(".hud-settings__glyph")?.getAttribute("aria-hidden")).toBe("true");
    expect(button.root.getAttribute("aria-label")).toBe("Settings");

    button.destroy();
  });

  it("defaults to the client's own registry when none is given", () => {
    // No registry passed: the button must still build and stay silent rather
    // than throwing, because the action having no listener is a real state.
    const button = createSettingsButton();
    document.body.append(button.root);

    expect(() => gear()?.click()).not.toThrow();

    button.destroy();
  });

  it("destroy removes the button and stops it responding", () => {
    const dispatch = vi.fn(() => true);
    const button = createSettingsButton({ registry: { dispatch } });
    document.body.append(button.root);
    const el = gear()!;

    button.destroy();
    el.click();

    expect(dispatch).not.toHaveBeenCalled();
    expect(button.root.isConnected).toBe(false);
  });
});