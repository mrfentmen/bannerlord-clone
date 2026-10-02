/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createInputRegistry } from "../../../input/registry.js";
import { formatBinding, shortcutsReference } from "../ShortcutsReference.js";

describe("shortcuts reference panel (solo task 11)", () => {
  it("lists every action with its current binding", () => {
    const registry = createInputRegistry();
    const el = shortcutsReference({ registry, onClose: () => {} });
    for (const action of registry.actions()) {
      const label = el.querySelector(`[data-testid="shortcut-label-${action.id}"]`);
      const binding = el.querySelector(`[data-testid="shortcut-binding-${action.id}"]`);
      expect(label?.textContent).toBe(action.label);
      expect(binding).not.toBeNull();
    }
  });

  it("reflects rebound keys", () => {
    const registry = createInputRegistry();
    registry.setBinding("ui.cancel", [{ key: "q", ctrl: true }]);
    const el = shortcutsReference({ registry, onClose: () => {} });
    expect(el.querySelector('[data-testid="shortcut-binding-ui.cancel"]')?.textContent).toBe("Ctrl+q");
  });

  it("shows Unbound for actions with no binding", () => {
    const registry = createInputRegistry();
    const el = shortcutsReference({ registry, onClose: () => {} });
    expect(el.querySelector('[data-testid="shortcut-binding-ui.settings"]')?.textContent).toBe("Unbound");
  });

  it("formats chords with modifiers", () => {
    expect(formatBinding({ key: "f" })).toBe("f");
    expect(formatBinding({ key: " ", shift: true })).toBe("Shift+Space");
    expect(formatBinding({ key: "s", ctrl: true, alt: true })).toBe("Ctrl+Alt+s");
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    const el = shortcutsReference({ registry: createInputRegistry(), onClose });
    (el.querySelector('[data-testid="shortcuts-close"]') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
