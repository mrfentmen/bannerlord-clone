/**
 * The order panel (Buffy task 59): a bottom row of order buttons that dispatch
 * the same input actions the hotkeys do, enabled only while something is
 * selected.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInputRegistry } from "../../input/registry.js";
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
      const labels = panel.buttons().map((b) => b.textContent);
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