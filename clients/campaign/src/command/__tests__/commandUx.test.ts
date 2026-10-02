/**
 * Commander UX batch (MASTER_PLAN tasks 40, 43-48; Buffy tasks 51-52, 54): quick
 * order hotkeys, waypoint queue, ping, rally point, order-delay courier,
 * stance panel, retreat horn, right-click move, attack-move mode, charge.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import type { CommandSurface, CommandableUnit, Order } from "../types.js";

interface FakeSurface extends CommandSurface {
  orders: Order[];
  unitsList: CommandableUnit[];
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

function fakeSurface(withBounds = false): FakeSurface {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  const unitsList: CommandableUnit[] = [
    { id: "a", label: "A", kind: "infantry", count: 10, x: 100, z: 100 },
    { id: "b", label: "B", kind: "archers", count: 8, x: 300, z: 100 },
    { id: "c", label: "C", kind: "cavalry", count: 6, x: 500, z: 400 },
  ];
  const orders: Order[] = [];
  const surface: FakeSurface = {
    orders,
    unitsList,
    units: () => unitsList,
    screenToField: (sx, sy) => ({ x: sx, z: sy }),
    fieldToScreen: (x, z) => ({ x, y: z }),
    overlay: () => overlayEl,
    issueOrder: (o) => { orders.push(o); },
    onUnitsChanged: () => () => {},
  };
  if (withBounds) {
    surface.bounds = { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 };
    surface.fieldBounds = () => surface.bounds!;
  }
  return surface;
}

function pointer(el: EventTarget, type: string, init: PointerEventInit): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
}

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
  vi.useRealTimers();
});

describe("command UX batch (tasks 40, 43-48)", () => {
  it("task 40: F1-F4 issue attack/follow/hold/retreat to the selection", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pointer(window, "pointermove", { clientX: 600, clientY: 600 });
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "F1" }));
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "F2" }));
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "F3" }));
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "F4" }));
      const kinds = surface.orders.map((o) => o.kind);
      expect(kinds).toEqual(["attack", "follow", "hold", "retreat"]);
      // Attack and follow aim at the pointer; hold and retreat are pointerless.
      expect(surface.orders[0]!.target).toEqual({ x: 600, z: 600 });
      expect(surface.orders[2]!.target).toBeUndefined();
      for (const o of surface.orders) expect(o.unitIds).toEqual(["a", "b", "c"]);
    } finally {
      commander.destroy();
    }
  });

  it("task 40: number keys 1-9 select control groups", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      clickAt(surface, 100, 100); // select A
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "7", ctrlKey: true }));
      commander.selection.clear();
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "7" }));
      expect(commander.selection.selected()).toEqual(["a"]);
    } finally {
      commander.destroy();
    }
  });

  it("task 43: Shift+click on empty ground queues waypoints and issues a move order", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      clickAt(surface, 700, 100, { shiftKey: true });
      clickAt(surface, 700, 300, { shiftKey: true });
      clickAt(surface, 700, 500, { shiftKey: true });
      const moves = surface.orders.filter((o) => o.kind === "move");
      expect(moves).toHaveLength(3);
      expect(moves[2]!.waypoints).toHaveLength(3);
      expect(moves[2]!.waypoints).toEqual([
        { x: 700, z: 100 },
        { x: 700, z: 300 },
        { x: 700, z: 500 },
      ]);
      const dots = document.querySelectorAll('[data-testid="cmd-waypoints"] .cmd-waypoint');
      expect(dots).toHaveLength(3);
      expect(dots[2]!.textContent).toBe("3");
    } finally {
      commander.destroy();
    }
  });

  it("task 44: Alt+click drops a ping that fades after 5 s", () => {
    vi.useFakeTimers();
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      clickAt(surface, 400, 400, { altKey: true });
      expect(document.querySelector('[data-testid="cmd-ping"]')).not.toBeNull();
      // The selection is untouched by a ping.
      expect(commander.selection.selected()).toEqual([]);
      vi.advanceTimersByTime(5000);
      expect(document.querySelector('[data-testid="cmd-ping"]')).toBeNull();
    } finally {
      commander.destroy();
    }
  });

  it("task 52: A arms attack-move and the next field click issues it", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "a" }));
      const hint = document.querySelector('[data-testid="cmd-modehint"]') as HTMLElement;
      expect(hint.hidden).toBe(false);
      expect(hint.textContent).toContain("Attack-move");

      clickAt(surface, 620, 480);

      const orders = surface.orders.filter((o) => o.kind === "attack-move");
      expect(orders).toHaveLength(1);
      expect(orders[0]!.target).toEqual({ x: 620, z: 480 });
      expect(orders[0]!.unitIds).toEqual(["a", "b", "c"]);
      // The mode is spent, and the hint goes with it.
      expect(hint.hidden).toBe(true);
      clickAt(surface, 620, 480);
      expect(surface.orders.filter((o) => o.kind === "attack-move")).toHaveLength(1);
    } finally {
      commander.destroy();
    }
  });

  it("task 52: attack-move mode does not arm with an empty selection, and Esc cancels it", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect((document.querySelector('[data-testid="cmd-modehint"]') as HTMLElement).hidden).toBe(true);
      clickAt(surface, 300, 300);
      expect(surface.orders).toHaveLength(0);

      input.dispatch("battle.selectAll", "keyboard");
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "a" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect((document.querySelector('[data-testid="cmd-modehint"]') as HTMLElement).hidden).toBe(true);
      clickAt(surface, 300, 300);
      expect(surface.orders).toHaveLength(0);
    } finally {
      commander.destroy();
    }
  });

  it("task 52: pressing A twice cancels the mode without ordering", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.dispatch("battle.orderAttackMove", "keyboard");
      input.dispatch("battle.orderAttackMove", "keyboard");
      clickAt(surface, 300, 300);
      expect(surface.orders).toHaveLength(0);
    } finally {
      commander.destroy();
    }
  });

  it("task 54: C charges at the pointer", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pointer(window, "pointermove", { clientX: 540, clientY: 260 });
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "c" }));

      expect(surface.orders).toHaveLength(1);
      expect(surface.orders[0]).toMatchObject({
        kind: "charge",
        unitIds: ["a", "b", "c"],
        target: { x: 540, z: 260 },
      });
    } finally {
      commander.destroy();
    }
  });

  it("task 54: charge with nothing selected orders nobody", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "c" }));
      expect(surface.orders).toHaveLength(0);
    } finally {
      commander.destroy();
    }
  });

  it("task 45: rally mode plants the flag and issues a rally order; Esc cancels", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.dispatch("battle.setRallyPoint", "keyboard");
      expect((document.querySelector('[data-testid="cmd-modehint"]') as HTMLElement)!.hidden).toBe(false);
      clickAt(surface, 450, 450);
      expect(document.querySelector('[data-testid="cmd-rally"]')).not.toBeNull();
      const rally = surface.orders.find((o) => o.kind === "rally");
      expect(rally?.target).toEqual({ x: 450, z: 450 });

      // Enter rally mode again, then cancel: no flag moves, no order.
      const ordersBefore = surface.orders.length;
      input.dispatch("battle.setRallyPoint", "keyboard");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      clickAt(surface, 100, 500);
      expect(surface.orders.length).toBe(ordersBefore);
    } finally {
      commander.destroy();
    }
  });

  it("task 46: issuing an order runs the courier with a countdown", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.dispatch("battle.orderHold", "keyboard");
      const courier = document.querySelector('[data-testid="cmd-courier"]');
      expect(courier).not.toBeNull();
      expect(courier!.textContent).toContain("Hold");
    } finally {
      commander.destroy();
    }
  });

  it("task 47: the selection panel shows stance from the last issued order", () => {
    const surface = fakeSurface();
    const commander = createCommander(surface);
    try {
      const panel = document.querySelector('[data-testid="cmd-panel"]') as HTMLElement;
      expect(panel.hidden).toBe(true);
      input.dispatch("battle.selectAll", "keyboard");
      expect(panel.hidden).toBe(false);
      expect(panel.textContent).toContain("awaiting orders");
      input.dispatch("battle.orderAttack", "keyboard");
      expect(panel.textContent).toContain("advancing");
      const cards = panel.querySelectorAll(".cmd-panel-card");
      expect(cards).toHaveLength(3);
    } finally {
      commander.destroy();
    }
  });

  it("task 48: the retreat horn routs the whole force to the map edge", () => {
    const surface = fakeSurface(true);
    const commander = createCommander(surface);
    try {
      // Only A is selected, but the horn takes everyone.
      clickAt(surface, 100, 100);
      input.dispatch("battle.retreatHorn", "keyboard");
      const horn = surface.orders.find((o) => o.kind === "retreat" && o.unitIds.length === 3);
      expect(horn).toBeTruthy();
      // South edge centre of the 0..1000 bounds.
      expect(horn!.target).toEqual({ x: 500, z: 0 });
    } finally {
      commander.destroy();
    }
  });

  it("task 48: without bounds the horn issues a targetless rout", () => {
    const surface = fakeSurface(false);
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.dispatch("battle.retreatHorn", "keyboard");
      const horn = surface.orders.find((o) => o.kind === "retreat");
      expect(horn!.unitIds).toEqual(["a", "b", "c"]);
      expect(horn!.target).toBeUndefined();
    } finally {
      commander.destroy();
    }
  });

  it("task 42: double-tap on a control group jumps the camera to it", () => {
    const surface = fakeSurface();
    const focused: { x: number; z: number }[] = [];
    surface.focusCamera = (x, z) => {
      focused.push({ x, z });
    };
    const commander = createCommander(surface);
    try {
      clickAt(surface, 100, 100); // select A
      clickAt(surface, 300, 100, { shiftKey: true }); // add B
      input.dispatch(
        "battle.controlGroup1",
        "keyboard",
        new KeyboardEvent("keydown", { key: "1", ctrlKey: true }),
      ); // assign group 1 = {a, b}
      clickAt(surface, 500, 400); // select only C, proving the recall restores
      input.dispatch("battle.controlGroup1", "keyboard"); // single tap: recall, no camera jump
      expect(focused).toEqual([]);
      input.dispatch("battle.controlGroup1", "keyboard"); // double-tap: camera jumps
      expect(focused).toHaveLength(1);
      expect(focused[0]!.x).toBeCloseTo(200, 5); // centroid of (100,100) and (300,100)
      expect(focused[0]!.z).toBeCloseTo(100, 5);
      // A third tap starts a fresh pair — no second jump without a fourth.
      input.dispatch("battle.controlGroup1", "keyboard");
      expect(focused).toHaveLength(1);
      input.dispatch("battle.controlGroup1", "keyboard");
      expect(focused).toHaveLength(2);
    } finally {
      commander.destroy();
    }
  });

  it("task 42: double-tap is safe when the scene has no camera hook", () => {
    const surface = fakeSurface(); // no focusCamera
    const commander = createCommander(surface);
    try {
      clickAt(surface, 100, 100);
      input.dispatch(
        "battle.controlGroup1",
        "keyboard",
        new KeyboardEvent("keydown", { key: "1", ctrlKey: true }),
      );
      expect(() => {
        input.dispatch("battle.controlGroup1", "keyboard");
        input.dispatch("battle.controlGroup1", "keyboard");
      }).not.toThrow();
    } finally {
      commander.destroy();
    }
  });
});
