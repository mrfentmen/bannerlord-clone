/**
 * The order panel (Buffy tasks 59-61): a bottom row of order buttons that dispatch
 * the same input actions the hotkeys do (task 60 adds their tooltips), enabled
 * only while something is selected.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInputRegistry, type InputRegistry } from "../../input/registry.js";
import { createOrderPanel, ORDER_BUTTONS } from "../orderPanel.js";
import { createCommander } from "../commander.js";
import type { CommandSurface, CommandableUnit, Order } from "../types.js";

function fakeSurface(): { surface: CommandSurface; orders: Order[] } {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  const unitsList: CommandableUnit[] = [
    { id: "a", label: "A", kind: "infantry", count: 10, x: 100, z: 100 },
    { id: "b", label: "B", kind: "archers", count: 8, x: 300, z: 100 },
  ];
  const orders: Order[] = [];
  const surface: CommandSurface = {
    units: () => unitsList,
    screenToField: (sx, sy) => ({ x: sx, z: sy }),
    fieldToScreen: (x, z) => ({ x, y: z }),
    overlay: () => overlayEl,
    issueOrder: (o) => { orders.push(o); },
    onUnitsChanged: () => () => {},
  };
  return { surface, orders };
}

/**
 * A registry carrying every action the panel names: the catalog's own, plus the
 * ones the commander registers at load. The runtime ones get a distinctive
 * binding so a test can tell a catalog default from a registered one.
 */
function battleRegistry(): InputRegistry {
  const registry = createInputRegistry();
  for (const spec of ORDER_BUTTONS) {
    if (registry.actions().some((a) => a.id === spec.action)) continue;
    registry.registerAction({
      id: spec.action,
      label: spec.label,
      category: "battle-command",
      description: `${spec.label} test action.`,
      defaultKeys: [{ key: "z", shift: true }],
    });
  }
  return registry;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("order panel", () => {
  it("renders one button per order, in panel order", () => {
    const registry = createInputRegistry();
    const panel = createOrderPanel({ registry });
    try {
      expect(panel.root.getAttribute("role")).toBe("toolbar");
      expect(panel.root.getAttribute("aria-label")).toBe("Orders");
      const labels = panel.buttons().map(
        (b) => b.querySelector(".cmd-order__label")!.textContent,
      );
      expect(labels).toEqual([
        "Attack",
        "Attack-move",
        "Charge",
        "Follow",
        "Hold",
        "Spread out",
        "Form up",
        "Retreat",
      ]);
      expect(panel.buttons().map((b) => b.dataset.action)).toEqual(ORDER_BUTTONS.map((s) => s.action));
    } finally {
      panel.destroy();
    }
  });

  it("presses the input action its hotkey presses", () => {
    const registry = createInputRegistry();
    const fired: string[] = [];
    for (const spec of ORDER_BUTTONS) {
      // The catalog already owns attack/follow/hold/retreat; the commander
      // registers the rest at runtime. Mirror that here.
      if (!registry.actions().some((a) => a.id === spec.action)) {
        registry.registerAction({
          id: spec.action,
          label: spec.label,
          category: "battle-command",
          description: spec.label,
          defaultKeys: [],
        });
      }
      registry.on(spec.action, (ev) => fired.push(`${spec.action}:${ev.source}`));
    }
    const panel = createOrderPanel({ registry });
    try {
      panel.setEnabled(true);
      panel.buttons()[0]!.click(); // Attack
      panel.buttons()[4]!.click(); // Hold

      expect(fired).toEqual(["battle.orderAttack:touch", "battle.orderHold:touch"]);
    } finally {
      panel.destroy();
    }
  });

  it("is hidden and disabled until the host says there is something to order", () => {
    const registry = createInputRegistry();
    const panel = createOrderPanel({ registry });
    try {
      expect(panel.root.hidden).toBe(true);
      expect(panel.buttons().every((b) => b.disabled)).toBe(true);

      panel.setEnabled(true);
      expect(panel.root.hidden).toBe(false);
      expect(panel.buttons().some((b) => b.disabled)).toBe(false);

      panel.setEnabled(false);
      expect(panel.root.hidden).toBe(true);
      expect(panel.buttons().some((b) => b.disabled)).toBe(true);
    } finally {
      panel.destroy();
    }
  });

  it("reports presses to the host", () => {
    const registry = createInputRegistry(); // battle.orderHold is already in the catalog
    const onPress = vi.fn();
    const panel = createOrderPanel({
      registry,
      buttons: [{ action: "battle.orderHold", label: "Hold", testId: "cmd-order-hold" }],
      onPress,
    });
    try {
      panel.setEnabled(true);
      panel.buttons()[0]!.click();
      expect(onPress).toHaveBeenCalledWith("battle.orderHold");
    } finally {
      panel.destroy();
    }
  });

  it("destroy takes the row out of the DOM", () => {
    const registry = createInputRegistry();
    const panel = createOrderPanel({ registry });
    document.body.appendChild(panel.root);
    expect(document.querySelector('[data-testid="cmd-orderpanel"]')).not.toBeNull();
    panel.destroy();
    expect(document.querySelector('[data-testid="cmd-orderpanel"]')).toBeNull();
  });
});

describe("order panel tooltips (task 60)", () => {
  it("gives every button the registry's own label and description as its tooltip", () => {
    const registry = createInputRegistry();
    for (const spec of ORDER_BUTTONS) {
      if (registry.actions().some((a) => a.id === spec.action)) continue;
      registry.registerAction({
        id: spec.action,
        label: spec.label,
        category: "battle-command",
        description: `Test description for ${spec.label}.`,
        defaultKeys: [],
      });
    }
    const panel = createOrderPanel({ registry });
    document.body.appendChild(panel.root);
    try {
      const hold = document.querySelector('[data-testid="cmd-order-hold"]') as HTMLButtonElement;
      // Straight from the action catalog, not a second copy of the wording.
      expect(hold.title).toBe(
        "Order: hold position. Selected units hold where they stand.",
      );
      expect(hold.getAttribute("aria-describedby")).toBe("cmd-order-hold-hint");
      const hint = document.getElementById("cmd-order-hold-hint")!;
      expect(hint.textContent).toBe(hold.title);
      expect(hint.className).toBe("cmd-order__hint");
    } finally {
      panel.destroy();
    }
  });

  it("every button has a tooltip and a matching hint element", () => {
    const registry = createInputRegistry();
    const panel = createOrderPanel({ registry });
    document.body.appendChild(panel.root);
    try {
      for (const btn of panel.buttons()) {
        expect(btn.title.length).toBeGreaterThan(0);
        const id = btn.getAttribute("aria-describedby")!;
        const hint = document.getElementById(id);
        expect(hint, `no hint for ${btn.dataset.action}`).not.toBeNull();
        expect(hint!.textContent).toBe(btn.title);
      }
    } finally {
      panel.destroy();
    }
  });

  it("falls back to the label when the registry does not know the action", () => {
    const registry = createInputRegistry();
    const panel = createOrderPanel({
      registry,
      buttons: [{ action: "battle.orderNope", label: "Nope", testId: "cmd-order-nope" }],
    });
    document.body.appendChild(panel.root);
    try {
      const btn = document.querySelector('[data-testid="cmd-order-nope"]') as HTMLButtonElement;
      expect(btn.title).toBe("Nope");
    } finally {
      panel.destroy();
    }
  });
});

describe("order panel hotkeys (task 61)", () => {
  function chipOf(testId: string): string {
    return document.querySelector(`[data-testid="${testId}-key"]`)!.textContent ?? "";
  }

  it("shows each button's current binding on the button", () => {
    const registry = battleRegistry();
    const panel = createOrderPanel({ registry });
    document.body.appendChild(panel.root);
    try {
      // Catalog defaults: hold is h/F3, attack is f/F1.
      expect(chipOf("cmd-order-hold")).toBe("h / F3");
      expect(chipOf("cmd-order-attack")).toBe("f / F1");
      // Runtime-registered actions show their own binding.
      expect(chipOf("cmd-order-form-up")).toBe("Shift+z");
    } finally {
      panel.destroy();
    }
  });

  it("follows a rebind instead of going stale", () => {
    const registry = battleRegistry();
    const panel = createOrderPanel({ registry });
    document.body.appendChild(panel.root);
    try {
      expect(chipOf("cmd-order-hold")).toBe("h / F3");

      registry.setBinding("battle.orderHold", [{ key: "k" }]);

      expect(chipOf("cmd-order-hold")).toBe("k");
    } finally {
      panel.destroy();
    }
  });

  it("says 'unbound' rather than showing an empty chip", () => {
    const registry = battleRegistry();
    const panel = createOrderPanel({ registry });
    document.body.appendChild(panel.root);
    try {
      registry.setBinding("battle.orderHold", []);
      expect(chipOf("cmd-order-hold")).toBe("unbound");
    } finally {
      panel.destroy();
    }
  });

  it("says 'unbound' for an action the registry has never heard of", () => {
    const registry = createInputRegistry();
    const panel = createOrderPanel({
      registry,
      buttons: [{ action: "battle.orderNope", label: "Nope", testId: "cmd-order-nope" }],
    });
    document.body.appendChild(panel.root);
    try {
      expect(chipOf("cmd-order-nope")).toBe("unbound");
    } finally {
      panel.destroy();
    }
  });

  it("stops listening for rebinds once destroyed", () => {
    const registry = battleRegistry();
    const panel = createOrderPanel({ registry });
    document.body.appendChild(panel.root);
    panel.destroy();

    expect(document.querySelector('[data-testid="cmd-order-hold-key"]')).toBeNull();
    // No listener left behind to write into a row that no longer exists.
    expect(() => registry.setBinding("battle.orderHold", [{ key: "k" }])).not.toThrow();
  });
});

describe("order panel in the commander", () => {
  it("appears once units are selected and issues the order that button names", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      const row = document.querySelector('[data-testid="cmd-orderpanel"]') as HTMLElement;
      expect(row.hidden).toBe(true);

      surface.overlay().dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
      );
      expect(row.hidden).toBe(false);

      (document.querySelector('[data-testid="cmd-order-hold"]') as HTMLButtonElement).click();

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({ kind: "hold", unitIds: ["a"] });
    } finally {
      commander.destroy();
    }
  });

  it("hides again when the selection empties", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      const row = document.querySelector('[data-testid="cmd-orderpanel"]') as HTMLElement;
      commander.selection.select(["a"]);
      expect(row.hidden).toBe(false);
      commander.selection.clear();
      expect(row.hidden).toBe(true);
    } finally {
      commander.destroy();
    }
  });

  it("destroy removes the row", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    expect(document.querySelector('[data-testid="cmd-orderpanel"]')).not.toBeNull();
    commander.destroy();
    expect(document.querySelector('[data-testid="cmd-orderpanel"]')).toBeNull();
  });
});