/**
 * Keybinding editor contract: click-to-capture rebinds, Escape cancels, conflicts
 * warn inline, reset restores defaults.
 *
 * The editor drives the shared `input` singleton, so every test resets bindings
 * first and last — nothing here may leak a chord into another file's tests.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keybindingEditor, chordLabel } from "../KeybindingEditor.js";
import { input } from "../../../input/index.js";

function chip(actionId: string, index = 0): HTMLButtonElement {
  const el = document.querySelector(`[data-testid="binding-${actionId}-chord-${index}"]`);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`chip missing: ${actionId}[${index}]`);
  return el;
}

function press(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      ctrlKey: !!mods.ctrl,
      shiftKey: !!mods.shift,
      altKey: !!mods.alt,
      bubbles: true,
      cancelable: true,
    }),
  );
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

afterEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("keybinding editor", () => {
  it("lists every registry action grouped by category", () => {
    document.body.appendChild(keybindingEditor({ onClose: () => {} }));
    for (const id of ["ui.cancel", "map.panUp", "battle.orderAttack"]) {
      expect(document.querySelector(`[data-testid="binding-${id}"]`)).not.toBeNull();
    }
    const text = document.body.textContent ?? "";
    expect(text).toContain("Interface");
    expect(text).toContain("Campaign map");
    expect(text).toContain("Battle command");
  });

  it("click-to-capture rebinds the chord", () => {
    document.body.appendChild(keybindingEditor({ onClose: () => {} }));
    expect(chip("ui.confirm").textContent).toBe("Enter");
    chip("ui.confirm").click();
    expect(chip("ui.confirm").textContent).toBe("press a key…");
    press("x");
    expect(chip("ui.confirm").textContent).toBe("X");
    expect(input.bindingFor("ui.confirm")).toEqual([{ key: "x" }]);
  });

  it("captures chords with modifiers", () => {
    document.body.appendChild(keybindingEditor({ onClose: () => {} }));
    chip("battle.orderAttack").click();
    press("s", { ctrl: true, shift: true });
    expect(chip("battle.orderAttack").textContent).toBe("Ctrl+Shift+S");
  });

  it("Escape cancels the capture without changing anything", () => {
    document.body.appendChild(keybindingEditor({ onClose: () => {} }));
    chip("ui.confirm").click();
    press("Escape");
    expect(chip("ui.confirm").textContent).toBe("Enter");
    expect(input.bindingFor("ui.confirm")).toEqual([{ key: "Enter" }]);
  });

  it("shows an inline conflict warning when two actions share a chord", () => {
    document.body.appendChild(keybindingEditor({ onClose: () => {} }));
    // Rebind Confirm onto F, which "Order: attack" already owns.
    chip("ui.confirm").click();
    press("f");
    expect(chip("ui.confirm").textContent).toBe("F");
    const warn = document.querySelector('[data-testid="binding-ui.confirm-conflict"]');
    expect(warn?.textContent).toContain("Order: attack");
    const warn2 = document.querySelector('[data-testid="binding-battle.orderAttack-conflict"]');
    expect(warn2?.textContent).toContain("Confirm");
  });

  it("reset restores one action to its defaults", () => {
    document.body.appendChild(keybindingEditor({ onClose: () => {} }));
    chip("ui.confirm").click();
    press("x");
    expect(chip("ui.confirm").textContent).toBe("X");
    (document.querySelector('[data-testid="binding-ui.confirm-reset"]') as HTMLButtonElement).click();
    expect(chip("ui.confirm").textContent).toBe("Enter");
  });

  it("reset-all restores every action", () => {
    document.body.appendChild(keybindingEditor({ onClose: () => {} }));
    input.setBinding("ui.cancel", [{ key: "F9" }]);
    input.setBinding("ui.confirm", [{ key: "F10" }]);
    (document.querySelector('[data-testid="bindings-reset-all"]') as HTMLButtonElement).click();
    expect(chip("ui.cancel").textContent).toBe("Esc");
    expect(chip("ui.confirm").textContent).toBe("Enter");
  });

  it("the close button calls onClose", () => {
    let closed = 0;
    document.body.appendChild(keybindingEditor({ onClose: () => { closed++; } }));
    const close = document.querySelector('[aria-label="Close Controls"]');
    (close as HTMLButtonElement).click();
    expect(closed).toBe(1);
  });

  it("chordLabel formats the usual suspects", () => {
    expect(chordLabel({ key: " " })).toBe("Space");
    expect(chordLabel({ key: "Escape" })).toBe("Esc");
    expect(chordLabel({ key: "ArrowLeft" })).toBe("←");
    expect(chordLabel({ key: "a", ctrl: true })).toBe("Ctrl+A");
    expect(chordLabel({ key: "Tab", shift: true })).toBe("Shift+Tab");
  });
});
