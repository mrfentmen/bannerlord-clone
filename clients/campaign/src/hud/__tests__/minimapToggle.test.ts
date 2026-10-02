/**
 * Task 26: the minimap toggle.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMinimapToggle } from "../minimapToggle.js";

function toggle(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-testid="hud-minimap-toggle"]');
}

function label(): string {
  return toggle()?.querySelector(".hud-minimap-toggle__label")?.textContent ?? "";
}

/** The element `BattleMinimap` would hand over: its canvas. */
function minimapCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("minimap toggle", () => {
  it("shows the minimap to begin with, matching the button's own state", () => {
    const map = minimapCanvas();
    const control = createMinimapToggle({ target: map });
    document.body.append(map, control.root);

    expect(map.hidden).toBe(false);
    expect(control.visible()).toBe(true);
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
    expect(label()).toBe("Hide minimap");

    control.destroy();
  });

  it("hides the minimap and says so when pressed", () => {
    const map = minimapCanvas();
    const control = createMinimapToggle({ target: map });
    document.body.append(map, control.root);

    toggle()?.click();

    expect(map.hidden).toBe(true);
    expect(control.visible()).toBe(false);
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
    expect(label()).toBe("Show minimap");

    control.destroy();
  });

  it("comes back on a second press", () => {
    const map = minimapCanvas();
    const control = createMinimapToggle({ target: map });
    document.body.append(map, control.root);

    toggle()?.click();
    toggle()?.click();

    expect(map.hidden).toBe(false);
    expect(control.visible()).toBe(true);

    control.destroy();
  });

  it("tells the scene about every change, so a hidden map costs nothing", () => {
    const map = minimapCanvas();
    const onVisibilityChange = vi.fn();
    const control = createMinimapToggle({ target: map, onVisibilityChange });
    document.body.append(map, control.root);

    toggle()?.click();
    toggle()?.click();

    expect(onVisibilityChange.mock.calls).toEqual([[false], [true]]);

    control.destroy();
  });

  it("starts hidden when the caller says the minimap is off", () => {
    const map = minimapCanvas();
    const control = createMinimapToggle({ target: map, visible: false });
    document.body.append(map, control.root);

    expect(map.hidden).toBe(true);
    expect(control.visible()).toBe(false);
    expect(label()).toBe("Show minimap");

    control.destroy();
  });

  it("setVisible is the same path as the button, and a no-op when nothing changed", () => {
    const map = minimapCanvas();
    const onVisibilityChange = vi.fn();
    const control = createMinimapToggle({ target: map, onVisibilityChange });
    document.body.append(map, control.root);

    control.setVisible(true); // already visible
    expect(onVisibilityChange).not.toHaveBeenCalled();

    control.setVisible(false);
    expect(map.hidden).toBe(true);
    expect(onVisibilityChange.mock.calls).toEqual([[false]]);

    control.destroy();
  });

  it("destroy removes the button and stops it responding", () => {
    const map = minimapCanvas();
    const control = createMinimapToggle({ target: map });
    document.body.append(map, control.root);
    const button = toggle()!;

    control.destroy();
    expect(control.root.isConnected).toBe(false);

    button.click();
    expect(map.hidden).toBe(false);
  });
});