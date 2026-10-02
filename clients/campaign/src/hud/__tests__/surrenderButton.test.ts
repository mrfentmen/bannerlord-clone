/**
 * Task 29: the surrender button and the confirmation dialog behind it.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSurrenderButton, SURRENDER_BODY, SURRENDER_TITLE } from "../surrenderButton.js";
import { createConfirmDialog } from "../confirmDialog.js";
import { _resetModalStackForTests, modalDepth } from "../../ui/focusTrap.js";

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="hud-confirm"]');
}

function press(testId: "hud-confirm-confirm" | "hud-confirm-cancel"): void {
  document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
}

function surrender(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-testid="hud-surrender"]');
}

beforeEach(() => {
  document.body.replaceChildren();
  _resetModalStackForTests();
});

afterEach(() => {
  _resetModalStackForTests();
});

describe("confirm dialog", () => {
  it("is a labelled modal that names its question and its consequence", () => {
    const confirm = createConfirmDialog({
      title: "Do the thing?",
      body: "It cannot be undone.",
      confirmLabel: "Do it",
      onConfirm: vi.fn(),
    });

    expect(confirm.root.getAttribute("role")).toBe("dialog");
    expect(confirm.root.getAttribute("aria-modal")).toBe("true");
    const labelledBy = confirm.root.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)?.textContent).toBe("Do the thing?");
    const describedBy = confirm.root.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toBe("It cannot be undone.");

    confirm.destroy();
  });

  it("confirms once and closes", () => {
    const onConfirm = vi.fn();
    const confirm = createConfirmDialog({
      title: "T",
      body: "B",
      confirmLabel: "Yes",
      onConfirm,
    });

    press("hud-confirm-confirm");

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();

    confirm.destroy();
  });

  it("cancels, reports the cancel, and closes", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const confirm = createConfirmDialog({ title: "T", body: "B", confirmLabel: "Yes", onConfirm, onCancel });

    press("hud-confirm-cancel");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();

    confirm.destroy();
  });

  it("Escape backs out rather than agreeing", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const confirm = createConfirmDialog({ title: "T", body: "B", confirmLabel: "Yes", onConfirm, onCancel });

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();

    confirm.destroy();
  });

  it("opens with focus on the button that changes nothing", () => {
    const confirm = createConfirmDialog({ title: "T", body: "B", confirmLabel: "Yes", onConfirm: vi.fn() });

    expect(document.activeElement?.getAttribute("data-testid")).toBe("hud-confirm-cancel");

    confirm.destroy();
  });

  it("destroy takes the dialog off the modal stack", () => {
    const confirm = createConfirmDialog({ title: "T", body: "B", confirmLabel: "Yes", onConfirm: vi.fn() });
    expect(modalDepth()).toBe(1);

    confirm.destroy();

    expect(modalDepth()).toBe(0);
    expect(dialog()).toBeNull();
  });
});

describe("surrender button", () => {
  it("asks before it surrenders, and says what surrendering does", () => {
    const onSurrender = vi.fn();
    const button = createSurrenderButton({ onSurrender });
    document.body.append(button.root);

    surrender()?.click();

    expect(onSurrender).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(SURRENDER_TITLE);
    expect(dialog()?.textContent).toContain(SURRENDER_BODY);
    expect(dialog()?.textContent).toContain("counted as surrendered");

    button.destroy();
  });

  it("surrenders only once the player confirms", () => {
    const onSurrender = vi.fn();
    const button = createSurrenderButton({ onSurrender });
    document.body.append(button.root);

    surrender()?.click();
    press("hud-confirm-confirm");

    expect(onSurrender).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(button.dialog()).toBeNull();

    button.destroy();
  });

  it("does nothing at all when the player backs out", () => {
    const onSurrender = vi.fn();
    const button = createSurrenderButton({ onSurrender });
    document.body.append(button.root);

    surrender()?.click();
    press("hud-confirm-cancel");

    expect(onSurrender).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();

    button.destroy();
  });

  it("Escape is a way out that does not surrender", () => {
    const onSurrender = vi.fn();
    const button = createSurrenderButton({ onSurrender });
    document.body.append(button.root);

    surrender()?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(onSurrender).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();

    button.destroy();
  });

  it("opens one dialog however many times the button is pressed", () => {
    const button = createSurrenderButton({ onSurrender: vi.fn() });
    document.body.append(button.root);

    surrender()?.click();
    surrender()?.click();

    expect(document.querySelectorAll('[data-testid="hud-confirm"]')).toHaveLength(1);

    button.destroy();
  });

  it("destroy closes an open dialog rather than leaving it on screen", () => {
    const button = createSurrenderButton({ onSurrender: vi.fn() });
    document.body.append(button.root);
    surrender()?.click();

    button.destroy();

    expect(dialog()).toBeNull();
    expect(modalDepth()).toBe(0);
    expect(surrender()).toBeNull();
  });
});