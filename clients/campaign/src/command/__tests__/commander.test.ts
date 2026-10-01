/**
 * Commander integration: gestures and keys against a fake battlefield surface.
 * Uses the real input registry, so bindings are reset around every test.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import type { CommandSurface, CommandableUnit, Order } from "../types.js";

interface FakeSurface extends CommandSurface {
  orders: Order[];
  unitsList: CommandableUnit[];
}

function fakeSurface(): FakeSurface {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  const unitsList: CommandableUnit[] = [
    { id: "a", label: "A", kind: "infantry", count: 10, x: 100, z: 100 },
    { id: "b", label: "B", kind: "archers", count: 8, x: 300, z: 100 },
    { id: "c", label: "C", kind: "cavalry", count: 6, x: 500, z: 400 },
  ];
  const orders: Order[] = [];
  return {
    orders,
    unitsList,
    units: () => unitsList,
    screenToField: (sx, sy) => ({ x: sx, z: sy }),
    fieldToScreen: (x, z) => ({ x, y: z }),
    overlay: () => overlayEl,
    issueOrder: (o) => { orders.push(o); },
    onUnitsChanged: () => () => {},
  };
}

function pointer(el: EventTarget, type: string, init: PointerEventInit): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

afterEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("commander", () => {
  it("click selects the nearest unit, shift-click toggles", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    pointer(surface.overlay(), "pointerdown", { button: 0, clientX: 100, clientY: 100 });
    pointer(window, "pointerup", { button: 0, clientX: 100, clientY: 100 });
    expect(commander.selection.selected()).toEqual(["a"]);

    pointer(surface.overlay(), "pointerdown", { button: 0, clientX: 300, clientY: 100, shiftKey: true });
    pointer(window, "pointerup", { button: 0, clientX: 300, clientY: 100, shiftKey: true });
    expect(commander.selection.selected()).toEqual(["a", "b"]);
    commander.destroy();
  });

  it("drag box-select grabs multiple units", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    pointer(surface.overlay(), "pointerdown", { button: 0, clientX: 90, clientY: 90 });
    pointer(window, "pointermove", { clientX: 310, clientY: 110 });
    expect(document.querySelector('[data-testid="selection-marquee"]')).not.toBeNull();
    pointer(window, "pointerup", { button: 0, clientX: 310, clientY: 110 });
    expect(commander.selection.selected()).toEqual(["a", "b"]);
    commander.destroy();
  });

  it("select-all grabs every live unit", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    input.dispatch("battle.selectAll", "keyboard");
    expect(commander.selection.selected()).toEqual(["a", "b", "c"]);
    commander.destroy();
  });

  it("control groups: Ctrl+digit assigns, digit recalls", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    input.dispatch("battle.selectAll", "keyboard");
    input.handleKeyEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true }));
    commander.selection.clear();
    input.handleKeyEvent(new KeyboardEvent("keydown", { key: "1" }));
    expect(commander.selection.selected()).toEqual(["a", "b", "c"]);
    commander.destroy();
  });

  it("hold opens the radial and release issues the flicked order", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    input.dispatch("battle.selectAll", "keyboard");

    pointer(window, "pointermove", { clientX: 400, clientY: 300 });
    input.handleKeyEvent(new KeyboardEvent("keydown", { key: " " }));
    expect(document.querySelector('[data-testid="command-radial"]')).not.toBeNull();

    // Flick straight up: attack.
    pointer(window, "pointermove", { clientX: 400, clientY: 150 });
    input.handleKeyUp(new KeyboardEvent("keyup", { key: " " }));

    expect(surface.orders).toHaveLength(1);
    expect(surface.orders[0]).toMatchObject({ kind: "attack", unitIds: ["a", "b", "c"] });
    expect(document.querySelector('[data-testid="command-radial"]')).toBeNull();
    commander.destroy();
  });

  it("the radial does not open with an empty selection", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    input.handleKeyEvent(new KeyboardEvent("keydown", { key: " " }));
    input.handleKeyUp(new KeyboardEvent("keyup", { key: " " }));
    expect(document.querySelector('[data-testid="command-radial"]')).toBeNull();
    expect(surface.orders).toHaveLength(0);
    commander.destroy();
  });

  it("destroy detaches the commander", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    commander.destroy();
    input.dispatch("battle.selectAll", "keyboard");
    expect(commander.selection.selected()).toEqual([]);
  });
});
