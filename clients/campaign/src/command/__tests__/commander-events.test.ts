/**
 * Commander battle-event hooks for haptics (MASTER_PLAN task 7).
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import type { CommandSurface, CommandableUnit, Order } from "../types.js";

function fakeSurface() {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  const unitsList: CommandableUnit[] = [
    { id: "a", label: "A", kind: "infantry", count: 10, x: 100, z: 100 },
    { id: "b", label: "B", kind: "archers", count: 8, x: 300, z: 100 },
  ];
  const orders: Order[] = [];
  let notify: () => void = () => {};
  const surface: CommandSurface = {
    units: () => unitsList,
    screenToField: (sx, sy) => ({ x: sx, z: sy }),
    fieldToScreen: (x, z) => ({ x, y: z }),
    overlay: () => overlayEl,
    issueOrder: (o) => {
      orders.push(o);
    },
    onUnitsChanged: (fn) => {
      notify = fn;
      return () => {};
    },
  };
  return { surface, unitsList, orders, changed: () => notify() };
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

afterEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("commander battle events (task 7)", () => {
  it("fires onOrder when the radial issues an order", () => {
    const { surface } = fakeSurface();
    const onOrder = vi.fn();
    const commander = createCommander(surface, input, { onOrder });
    input.dispatch("battle.selectAll", "keyboard");
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 300 }));
    input.handleKeyEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 150 }));
    input.handleKeyUp(new KeyboardEvent("keyup", { key: " " }));
    expect(onOrder).toHaveBeenCalledTimes(1);
    expect(onOrder).toHaveBeenCalledWith("attack", ["a", "b"]);
    commander.destroy();
  });

  it("fires onSelect on select-all", () => {
    const { surface } = fakeSurface();
    const onSelect = vi.fn();
    const commander = createCommander(surface, input, { onSelect });
    input.dispatch("battle.selectAll", "keyboard");
    expect(onSelect).toHaveBeenCalledTimes(1);
    commander.destroy();
  });

  it("fires onHit when unit counts drop, not when they rise", () => {
    const { surface, unitsList, changed } = fakeSurface();
    const onHit = vi.fn();
    const commander = createCommander(surface, input, { onHit });
    unitsList[0]!.count = 4; // casualties
    changed();
    expect(onHit).toHaveBeenCalledTimes(1);
    unitsList[0]!.count = 20; // reinforcements: no rumble
    changed();
    expect(onHit).toHaveBeenCalledTimes(1);
    commander.destroy();
  });
});
