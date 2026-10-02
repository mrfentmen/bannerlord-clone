/**
 * Commander integration: gestures and keys against a fake battlefield surface,
 * including the double-click select-all-of-kind gesture (task 66).
 * Uses the real input registry, so bindings are reset around every test.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import { settings } from "../../settings/index.js";
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

/** A full press-and-release on the overlay: one click, no drag. */
function clickAt(surface: FakeSurface, x: number, y: number, extra: PointerEventInit = {}): void {
  pointer(surface.overlay(), "pointerdown", { button: 0, clientX: x, clientY: y, ...extra });
  pointer(window, "pointerup", { button: 0, clientX: x, clientY: y, ...extra });
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

  it("right-click on the field moves the selection there (task 51)", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    input.dispatch("battle.selectAll", "keyboard");

    surface.overlay().dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 250, clientY: 350 }),
    );

    expect(surface.orders).toHaveLength(1);
    expect(surface.orders[0]).toMatchObject({
      kind: "move",
      unitIds: ["a", "b", "c"],
      target: { x: 250, z: 350 },
    });
    // A single leg: a plain move, not a queued waypoint chain.
    expect(surface.orders[0]!.waypoints).toBeUndefined();
    commander.destroy();
  });

  it("right-click with nothing selected moves nobody, and the browser menu stays suppressed", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);

    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    surface.overlay().dispatchEvent(ev);

    expect(surface.orders).toHaveLength(0);
    expect(ev.defaultPrevented).toBe(true);
    commander.destroy();
  });

  it("right-click drops any queued waypoints and moves to the clicked spot (task 51)", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    input.dispatch("battle.selectAll", "keyboard");

    // Queue two legs with Shift+click, then right-click somewhere else.
    pointer(surface.overlay(), "pointerdown", { button: 0, clientX: 700, clientY: 100, shiftKey: true });
    pointer(window, "pointerup", { button: 0, clientX: 700, clientY: 100, shiftKey: true });
    pointer(surface.overlay(), "pointerdown", { button: 0, clientX: 700, clientY: 300, shiftKey: true });
    pointer(window, "pointerup", { button: 0, clientX: 700, clientY: 300, shiftKey: true });
    expect(document.querySelectorAll('[data-testid="cmd-waypoints"] .cmd-waypoint')).toHaveLength(2);

    surface.overlay().dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 200, clientY: 200 }),
    );

    const last = surface.orders[surface.orders.length - 1]!;
    expect(last.kind).toBe("move");
    expect(last.target).toEqual({ x: 200, z: 200 });
    expect(last.waypoints).toBeUndefined();
    expect(document.querySelector('[data-testid="cmd-waypoints"]')).toBeNull();
    commander.destroy();
  });

  it("Ctrl+click adds to the selection without dropping what is already in it (task 67)", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      clickAt(surface, 100, 100); // A
      clickAt(surface, 300, 100, { ctrlKey: true }); // add B
      clickAt(surface, 500, 400, { ctrlKey: true }); // add C
      expect(commander.selection.selected()).toEqual(["a", "b", "c"]);

      // Clicking a selected unit again keeps it: add is not toggle.
      clickAt(surface, 100, 100, { ctrlKey: true });
      expect(commander.selection.selected()).toEqual(["a", "b", "c"]);

      // A plain click still replaces the whole selection.
      clickAt(surface, 300, 100);
      expect(commander.selection.selected()).toEqual(["b"]);
    } finally {
      commander.destroy();
    }
  });

  it("Cmd+click adds too, and Shift+click still toggles (task 67)", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      clickAt(surface, 100, 100);
      clickAt(surface, 300, 100, { metaKey: true });
      expect(commander.selection.selected()).toEqual(["a", "b"]);

      clickAt(surface, 100, 100, { shiftKey: true }); // toggles A back out
      expect(commander.selection.selected()).toEqual(["b"]);
    } finally {
      commander.destroy();
    }
  });

  it("double-clicking a unit selects every unit of that kind (task 66)", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    // Two infantry, one archer, one cavalry in the fixture.
    surface.unitsList.push({
      id: "d", label: "D", kind: "infantry", count: 5, x: 150, z: 100,
    });

    clickAt(surface, 100, 100);
    expect(commander.selection.selected()).toEqual(["a"]);

    clickAt(surface, 100, 100); // the second click lands on the same unit
    expect(commander.selection.selected()).toEqual(["a", "d"]);

    commander.destroy();
  });

  it("two clicks on different units, or too slowly, are not a double-click (task 66)", () => {
    vi.useFakeTimers();
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      clickAt(surface, 100, 100); // A
      clickAt(surface, 300, 100); // B — a different unit, so a plain select
      expect(commander.selection.selected()).toEqual(["b"]);

      clickAt(surface, 300, 100); // B again...
      vi.advanceTimersByTime(500); // ...but too late to count as a double
      expect(commander.selection.selected()).toEqual(["b"]);
    } finally {
      vi.useRealTimers();
      commander.destroy();
    }
  });

  it("a click on empty ground between two clicks cancels the double (task 66)", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      clickAt(surface, 100, 100);
      clickAt(surface, 700, 700); // ground: clears the selection and the pending double
      clickAt(surface, 100, 100);

      expect(commander.selection.selected()).toEqual(["a"]);
    } finally {
      commander.destroy();
    }
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

  it("holdToggles makes the radial a press-press toggle (task 23)", () => {
    settings.set({ holdToggles: true });
    try {
      const surface = fakeSurface();
      const commander = createCommander(surface);
      input.dispatch("battle.selectAll", "keyboard");

      pointer(window, "pointermove", { clientX: 400, clientY: 300 });
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: " " }));
      expect(document.querySelector('[data-testid="command-radial"]')).not.toBeNull();

      // Release does NOT confirm in toggle mode: the radial stays open.
      input.handleKeyUp(new KeyboardEvent("keyup", { key: " " }));
      expect(document.querySelector('[data-testid="command-radial"]')).not.toBeNull();
      expect(surface.orders).toHaveLength(0);

      // Flick up, press again: confirms the highlighted order.
      pointer(window, "pointermove", { clientX: 400, clientY: 150 });
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: " " }));
      expect(surface.orders).toHaveLength(1);
      expect(surface.orders[0]).toMatchObject({ kind: "attack", unitIds: ["a", "b", "c"] });
      expect(document.querySelector('[data-testid="command-radial"]')).toBeNull();
      commander.destroy();
    } finally {
      settings.set({ holdToggles: false });
    }
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
