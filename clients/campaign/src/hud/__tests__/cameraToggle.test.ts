/**
 * Task 27: the camera mode toggle.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCameraToggle } from "../cameraToggle.js";

function btn(id: "follow" | "free"): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-testid="hud-camera-${id}"]`);
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("camera mode toggle", () => {
  it("starts in follow, with follow pressed", () => {
    const onMode = vi.fn();
    const toggle = createCameraToggle({ onMode });
    document.body.append(toggle.root);

    expect(toggle.mode()).toBe("follow");
    expect(btn("follow")?.getAttribute("aria-pressed")).toBe("true");
    expect(btn("free")?.getAttribute("aria-pressed")).toBe("false");
    expect(onMode).not.toHaveBeenCalled(); // the mode was already right

    toggle.destroy();
  });

  it("switches to free and tells the scene", () => {
    const onMode = vi.fn();
    const toggle = createCameraToggle({ onMode });
    document.body.append(toggle.root);

    btn("free")?.click();

    expect(toggle.mode()).toBe("free");
    expect(onMode.mock.calls).toEqual([["free"]]);
    expect(btn("free")?.getAttribute("aria-pressed")).toBe("true");
    expect(btn("follow")?.getAttribute("aria-pressed")).toBe("false");

    toggle.destroy();
  });

  it("switches back and forth", () => {
    const onMode = vi.fn();
    const toggle = createCameraToggle({ onMode });
    document.body.append(toggle.root);

    btn("free")?.click();
    btn("follow")?.click();

    expect(toggle.mode()).toBe("follow");
    expect(onMode.mock.calls).toEqual([["free"], ["follow"]]);

    toggle.destroy();
  });

  it("pressing the mode already in force changes nothing and says nothing", () => {
    const onMode = vi.fn();
    const toggle = createCameraToggle({ onMode });
    document.body.append(toggle.root);

    btn("follow")?.click();
    btn("follow")?.click();

    expect(onMode).not.toHaveBeenCalled();

    toggle.destroy();
  });

  it("can start in free", () => {
    const toggle = createCameraToggle({ onMode: vi.fn(), mode: "free" });
    document.body.append(toggle.root);

    expect(toggle.mode()).toBe("free");
    expect(btn("free")?.getAttribute("aria-pressed")).toBe("true");

    toggle.destroy();
  });

  it("setMode is the same path as a press, and a no-op when unchanged", () => {
    const onMode = vi.fn();
    const toggle = createCameraToggle({ onMode });
    document.body.append(toggle.root);

    toggle.setMode("follow");
    expect(onMode).not.toHaveBeenCalled();

    toggle.setMode("free");
    expect(onMode.mock.calls).toEqual([["free"]]);
    expect(btn("free")?.getAttribute("aria-pressed")).toBe("true");

    toggle.destroy();
  });

  it("names both modes and the group for a screen reader", () => {
    const toggle = createCameraToggle({ onMode: vi.fn() });
    document.body.append(toggle.root);

    expect(toggle.root.getAttribute("aria-label")).toBe("Camera mode");
    expect(btn("follow")?.getAttribute("aria-label")).toBe("Follow camera");
    expect(btn("free")?.getAttribute("aria-label")).toBe("Free camera");

    toggle.destroy();
  });

  it("destroy removes the buttons and stops them responding", () => {
    const onMode = vi.fn();
    const toggle = createCameraToggle({ onMode });
    document.body.append(toggle.root);
    const free = btn("free")!;

    toggle.destroy();
    free.click();

    expect(onMode).not.toHaveBeenCalled();
    expect(toggle.root.isConnected).toBe(false);
  });
});