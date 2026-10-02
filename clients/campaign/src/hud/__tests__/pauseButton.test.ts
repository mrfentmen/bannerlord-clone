/**
 * Task 28: the pause button.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPauseButton } from "../pauseButton.js";

function button(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-testid="hud-pause"]');
}

function label(): string {
  return button()?.querySelector(".hud-pause__label")?.textContent ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("pause button", () => {
  it("starts running, offering to pause", () => {
    const control = createPauseButton({ onPauseChange: vi.fn() });
    document.body.append(control.root);

    expect(control.paused()).toBe(false);
    expect(button()?.getAttribute("aria-pressed")).toBe("false");
    expect(label()).toBe("Pause");

    control.destroy();
  });

  it("holds the battle and offers to resume", () => {
    const onPauseChange = vi.fn();
    const control = createPauseButton({ onPauseChange });
    document.body.append(control.root);

    button()?.click();

    expect(control.paused()).toBe(true);
    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    expect(label()).toBe("Resume");
    expect(onPauseChange.mock.calls).toEqual([[true]]);

    control.destroy();
  });

  it("resumes on the second press", () => {
    const onPauseChange = vi.fn();
    const control = createPauseButton({ onPauseChange });
    document.body.append(control.root);

    button()?.click();
    button()?.click();

    expect(control.paused()).toBe(false);
    expect(label()).toBe("Pause");
    expect(onPauseChange.mock.calls).toEqual([[true], [false]]);

    control.destroy();
  });

  it("can start held, with the button already showing it", () => {
    const onPauseChange = vi.fn();
    const control = createPauseButton({ onPauseChange, paused: true });
    document.body.append(control.root);

    expect(control.paused()).toBe(true);
    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    expect(label()).toBe("Resume");
    expect(onPauseChange).not.toHaveBeenCalled(); // it was already held

    control.destroy();
  });

  it("setPaused is the same path as a press, and a no-op when unchanged", () => {
    const onPauseChange = vi.fn();
    const control = createPauseButton({ onPauseChange });
    document.body.append(control.root);

    control.setPaused(false);
    expect(onPauseChange).not.toHaveBeenCalled();

    control.setPaused(true);
    expect(onPauseChange.mock.calls).toEqual([[true]]);
    expect(button()?.getAttribute("aria-pressed")).toBe("true");

    control.destroy();
  });

  it("names the control for a screen reader", () => {
    const control = createPauseButton({ onPauseChange: vi.fn() });
    document.body.append(control.root);

    expect(control.root.getAttribute("aria-label")).toBe("Pause");

    control.destroy();
  });

  it("destroy removes the button and stops it responding", () => {
    const onPauseChange = vi.fn();
    const control = createPauseButton({ onPauseChange });
    document.body.append(control.root);
    const el = button()!;

    control.destroy();
    el.click();

    expect(onPauseChange).not.toHaveBeenCalled();
    expect(control.root.isConnected).toBe(false);
  });
});