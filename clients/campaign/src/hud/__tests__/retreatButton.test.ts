/**
 * Task 30: the retreat button, over the confirmation dialog from task 29.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRetreatButton, RETREAT_BODY, RETREAT_TITLE } from "../retreatButton.js";
import { _resetModalStackForTests, modalDepth } from "../../ui/focusTrap.js";

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="hud-confirm"]');
}

function press(testId: "hud-confirm-confirm" | "hud-confirm-cancel"): void {
  document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
}

function retreat(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-testid="hud-retreat"]');
}

beforeEach(() => {
  document.body.replaceChildren();
  _resetModalStackForTests();
});

afterEach(() => {
  _resetModalStackForTests();
});

describe("retreat button", () => {
  it("asks before it retreats, and says what retreating costs", () => {
    const onRetreat = vi.fn();
    const button = createRetreatButton({ onRetreat });
    document.body.append(button.root);

    retreat()?.click();

    expect(onRetreat).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(RETREAT_TITLE);
    expect(dialog()?.textContent).toContain(RETREAT_BODY);
    expect(dialog()?.textContent).toContain("recorded as a retreat");

    button.destroy();
  });

  it("confirms on the dialog's own button, not a generic one", () => {
    const onRetreat = vi.fn();
    const button = createRetreatButton({ onRetreat });
    document.body.append(button.root);

    retreat()?.click();
    expect(dialog()?.textContent).toContain("Retreat");

    press("hud-confirm-confirm");

    expect(onRetreat).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();

    button.destroy();
  });

  it("does nothing when the player backs out", () => {
    const onRetreat = vi.fn();
    const button = createRetreatButton({ onRetreat });
    document.body.append(button.root);

    retreat()?.click();
    press("hud-confirm-cancel");

    expect(onRetreat).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();

    button.destroy();
  });

  it("Escape is a way out that does not retreat", () => {
    const onRetreat = vi.fn();
    const button = createRetreatButton({ onRetreat });
    document.body.append(button.root);

    retreat()?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onRetreat).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();

    button.destroy();
  });

  it("opens one dialog however many times the button is pressed", () => {
    const button = createRetreatButton({ onRetreat: vi.fn() });
    document.body.append(button.root);

    retreat()?.click();
    retreat()?.click();

    expect(document.querySelectorAll('[data-testid="hud-confirm"]')).toHaveLength(1);

    button.destroy();
  });

  it("opens again after a cancelled one", () => {
    const onRetreat = vi.fn();
    const button = createRetreatButton({ onRetreat });
    document.body.append(button.root);

    retreat()?.click();
    press("hud-confirm-cancel");
    expect(button.dialog()).toBeNull();

    retreat()?.click();
    expect(button.dialog()).not.toBeNull();

    button.destroy();
  });

  it("names the control for a screen reader", () => {
    const button = createRetreatButton({ onRetreat: vi.fn() });
    document.body.append(button.root);

    expect(button.root.getAttribute("aria-label")).toBe("Retreat");
    expect(retreat()?.textContent).toBe("Retreat");

    button.destroy();
  });

  it("destroy closes an open dialog rather than leaving it on screen", () => {
    const button = createRetreatButton({ onRetreat: vi.fn() });
    document.body.append(button.root);
    retreat()?.click();

    button.destroy();

    expect(dialog()).toBeNull();
    expect(modalDepth()).toBe(0);
    expect(retreat()).toBeNull();
  });
});