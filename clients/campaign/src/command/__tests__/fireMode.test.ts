/**
 * The fire-mode row (Buffy tasks 74-75): fire at will and hold fire, each a
 * button that dispatches its own input action.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFireModeToggle, FIRE_MODE_BUTTONS } from "../fireMode.js";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import { createInputRegistry, type InputRegistry } from "../../input/registry.js";
import { FIRE_MODE_LABEL, type CommandSurface, type CommandableUnit, type Order } from "../types.js";

function fakeSurface(): { surface: CommandSurface; orders: Order[] } {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  const units: CommandableUnit[] = [
    { id: "a", label: "A", kind: "infantry", count: 10, x: 100, z: 100 },
    { id: "b", label: "B", kind: "archers", count: 8, x: 300, z: 100 },
  ];
  const orders: Order[] = [];
  const surface: CommandSurface = {
    units: () => units,
    screenToField: (sx, sy) => ({ x: sx, z: sy }),
    fieldToScreen: (x, z) => ({ x, y: z }),
    overlay: () => overlayEl,
    issueOrder: (o) => { orders.push(o); },
    onUnitsChanged: () => () => {},
  };
  return { surface, orders };
}

/** A registry that already knows the fire-at-will action, as the commander makes it. */
function fireRegistry(): InputRegistry {
  const registry = createInputRegistry();
  for (const spec of FIRE_MODE_BUTTONS) {
    registry.registerAction({
      id: spec.action,
      label: FIRE_MODE_LABEL[spec.mode],
      category: "battle-command",
      description: spec.hint,
      defaultKeys: [{ key: "F6" }],
    });
  }
  return registry;
}

function pick(testId: string): void {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("fire-mode toggle", () => {
  it("has both modes, off to start, each saying what it does", () => {
    const toggle = createFireModeToggle({ registry: fireRegistry() });
    document.body.appendChild(toggle.root);
    try {
      expect(toggle.root.getAttribute("aria-label")).toBe("Fire mode");
      expect(toggle.current()).toBeNull();
      const labels = [...toggle.root.querySelectorAll(".cmd-fire__label")].map((el) => el.textContent);
      expect(labels).toEqual(["Fire at will", "Hold fire"]);
      const atWill = document.querySelector('[data-testid="cmd-fire-at-will"]') as HTMLButtonElement;
      const holdFire = document.querySelector('[data-testid="cmd-hold-fire"]') as HTMLButtonElement;
      expect(atWill.getAttribute("aria-pressed")).toBe("false");
      expect(atWill.title).toContain("without waiting to be told");
      expect(holdFire.title).toContain("only at a target");
    } finally {
      toggle.destroy();
    }
  });

  it("each button dispatches its own action and only its own reflects", () => {
    const registry = fireRegistry();
    const fired: string[] = [];
    for (const spec of FIRE_MODE_BUTTONS) {
      registry.on(spec.action, (ev) => fired.push(`${spec.action}:${ev.source}`));
    }
    const onPress = vi.fn();
    const toggle = createFireModeToggle({ registry, onPress });
    document.body.appendChild(toggle.root);
    try {
      pick("cmd-fire-at-will");
      expect(fired).toEqual(["battle.fireAtWill:touch"]);
      expect(onPress).toHaveBeenLastCalledWith("at-will");
      expect(toggle.current()).toBe("at-will");
      expect(
        document.querySelector('[data-testid="cmd-fire-at-will"]')!.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(
        document.querySelector('[data-testid="cmd-hold-fire"]')!.getAttribute("aria-pressed"),
      ).toBe("false");

      pick("cmd-hold-fire");
      expect(fired).toEqual(["battle.fireAtWill:touch", "battle.holdFire:touch"]);
      expect(toggle.current()).toBe("hold-fire");
      // Exactly one mode in force at a time.
      expect(toggle.root.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
      expect(
        document.querySelector('[data-testid="cmd-hold-fire"]')!.getAttribute("aria-pressed"),
      ).toBe("true");
    } finally {
      toggle.destroy();
    }
  });

  it("set() reflects a mode without dispatching anything", () => {
    const registry = fireRegistry();
    const fired: string[] = [];
    for (const spec of FIRE_MODE_BUTTONS) {
      registry.on(spec.action, () => fired.push(spec.action));
    }
    const toggle = createFireModeToggle({ registry });
    document.body.appendChild(toggle.root);
    try {
      toggle.set("at-will");

      expect(toggle.current()).toBe("at-will");
      expect(fired).toEqual([]);
    } finally {
      toggle.destroy();
    }
  });

  it("destroy takes the row out of the DOM", () => {
    const toggle = createFireModeToggle({ registry: fireRegistry() });
    document.body.appendChild(toggle.root);
    toggle.destroy();
    expect(document.querySelector('[data-testid="cmd-fire"]')).toBeNull();
  });
});

describe("fire-at-will in the commander", () => {
  it("sits in the order row's slot", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      const slot = document.querySelector('[data-testid="cmd-orderpanel-slot"]')!;
      expect(slot.querySelector('[data-testid="cmd-fire"]')).not.toBeNull();
    } finally {
      commander.destroy();
    }
  });

  it("F6 puts the selection on fire at will and orders it", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pointerMove(640, 480);
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "F6" }));

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({ fireMode: "at-will", target: { x: 640, z: 480 } });
      expect(document.querySelector('[data-testid="cmd-fire-at-will"]')!.getAttribute("aria-pressed")).toBe(
        "true",
      );
    } finally {
      commander.destroy();
    }
  });

  it("with nothing selected the hotkey changes no order", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "F6" }));
      expect(orders).toHaveLength(0);
    } finally {
      commander.destroy();
    }
  });

  it("the button is the hotkey: both put the group on fire at will and order it", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pointerMove(500, 500);
      pick("cmd-fire-at-will");

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        kind: "attack",
        fireMode: "at-will",
        target: { x: 500, z: 500 },
      });

      // The mode is remembered, so a later order carries it too.
      input.dispatch("battle.orderHold", "keyboard");
      expect(orders[1]).toMatchObject({ kind: "hold", fireMode: "at-will" });
    } finally {
      commander.destroy();
    }
  });

  it("leaves the fire mode off orders until it is asked for", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.dispatch("battle.orderHold", "keyboard");
      expect(orders[0]!.fireMode).toBeUndefined();
    } finally {
      commander.destroy();
    }
  });

  it("F7 puts the group on hold fire and orders them to hold where they are", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pointerMove(640, 480);
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "F7" }));

      // Pointerless: hold fire says how they fight, not where to stand.
      expect(orders[0]).toMatchObject({ kind: "hold", fireMode: "hold-fire" });
      expect(orders[0]!.target).toBeUndefined();
      expect(
        document.querySelector('[data-testid="cmd-hold-fire"]')!.getAttribute("aria-pressed"),
      ).toBe("true");

      // A later order keeps the mode, and switching back is one press.
      input.dispatch("battle.orderHold", "keyboard");
      expect(orders[1]!.fireMode).toBe("hold-fire");
      pick("cmd-fire-at-will");
      input.dispatch("battle.orderHold", "keyboard");
      expect(orders[2]!.fireMode).toBe("at-will");
    } finally {
      commander.destroy();
    }
  });

  it("destroy removes the row", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    expect(document.querySelector('[data-testid="cmd-fire"]')).not.toBeNull();
    commander.destroy();
    expect(document.querySelector('[data-testid="cmd-fire"]')).toBeNull();
  });
});

/** Move the pointer so targeted orders have somewhere to point. */
function pointerMove(x: number, y: number): void {
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
}