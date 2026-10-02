/**
 * The formation selector (Buffy task 70): the player picks a shape, and the next
 * order the commander issues carries it.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFormationSelector, FORMATION_CHOICES } from "../formation.js";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import { FORMATION_LABEL, type CommandSurface, type CommandableUnit, type Order } from "../types.js";

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

function pick(testId: string): void {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("formation selector", () => {
  it("offers every formation plus a no-choice option", () => {
    const selector = createFormationSelector({ onPick: () => {} });
    document.body.appendChild(selector.root);
    try {
      expect(selector.root.getAttribute("aria-label")).toBe("Formation");
      const labels = [...selector.root.querySelectorAll(".cmd-formation__label")].map(
        (el) => el.textContent,
      );
      expect(labels).toEqual(["Loose", "Line", "Column", "Wedge", "Circle"]);
      // The same four shapes as the label table in types.ts, plus "no choice".
      expect(FORMATION_CHOICES.filter((c) => c.formation !== null).map((c) => c.label)).toEqual([
        FORMATION_LABEL.line,
        FORMATION_LABEL.column,
        FORMATION_LABEL.wedge,
        FORMATION_LABEL.circle,
      ]);
    } finally {
      selector.destroy();
    }
  });

  it("starts on 'Loose', so no order claims a shape the player did not pick", () => {
    const selector = createFormationSelector({ onPick: () => {} });
    document.body.appendChild(selector.root);
    try {
      expect(selector.current()).toBeNull();
      expect(
        document.querySelector('[data-testid="cmd-formation-loose"]')!.getAttribute("aria-pressed"),
      ).toBe("true");
    } finally {
      selector.destroy();
    }
  });

  it("marks exactly one choice pressed at a time and reports it", () => {
    const selector = createFormationSelector({ onPick: () => {} });
    document.body.appendChild(selector.root);
    try {
      pick("cmd-formation-wedge");
      expect(selector.current()).toBe("wedge");

      pick("cmd-formation-circle");
      expect(selector.current()).toBe("circle");
      const pressed = [...selector.root.querySelectorAll('[aria-pressed="true"]')];
      expect(pressed).toHaveLength(1);
      expect(pressed[0]!.getAttribute("data-testid")).toBe("cmd-formation-circle");
    } finally {
      selector.destroy();
    }
  });

  it("reports every pick, including going back to Loose", () => {
    const onPick = vi.fn();
    const selector = createFormationSelector({ onPick });
    document.body.appendChild(selector.root);
    try {
      pick("cmd-formation-line");
      pick("cmd-formation-line"); // picking the same one again still reports
      pick("cmd-formation-loose");
      expect(onPick.mock.calls).toEqual([["line"], ["line"], [null]]);
      expect(selector.current()).toBeNull();
    } finally {
      selector.destroy();
    }
  });

  it("set() restores state without firing the pick callback", () => {
    const onPick = vi.fn();
    const selector = createFormationSelector({ onPick });
    document.body.appendChild(selector.root);
    try {
      selector.set("column");
      expect(selector.current()).toBe("column");
      expect(onPick).not.toHaveBeenCalled();
    } finally {
      selector.destroy();
    }
  });

  it("destroy takes the row out of the DOM", () => {
    const selector = createFormationSelector({ onPick: () => {} });
    document.body.appendChild(selector.root);
    selector.destroy();
    expect(document.querySelector('[data-testid="cmd-formation"]')).toBeNull();
  });
});

describe("formation selector in the commander", () => {
  it("sits in the order row's slot", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      const slot = document.querySelector('[data-testid="cmd-orderpanel-slot"]')!;
      expect(slot.querySelector('[data-testid="cmd-formation"]')).not.toBeNull();
    } finally {
      commander.destroy();
    }
  });

  it("puts the chosen formation on the next order", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pick("cmd-formation-wedge");
      input.dispatch("battle.orderHold", "keyboard");

      expect(orders).toHaveLength(1);
      expect(orders[0]!.formation).toBe("wedge");
    } finally {
      commander.destroy();
    }
  });

  it("leaves the formation off orders while 'Loose' is chosen", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pick("cmd-formation-line");
      pick("cmd-formation-loose");
      input.dispatch("battle.orderHold", "keyboard");

      expect(orders[0]!.formation).toBeUndefined();
    } finally {
      commander.destroy();
    }
  });

  it("carries the formation on a right-click move too", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pick("cmd-formation-column");
      surface.overlay().dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 400, clientY: 500 }),
      );

      expect(orders[0]).toMatchObject({ kind: "move", formation: "column" });
    } finally {
      commander.destroy();
    }
  });

  it("destroy removes the selector", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    expect(document.querySelector('[data-testid="cmd-formation"]')).not.toBeNull();
    commander.destroy();
    expect(document.querySelector('[data-testid="cmd-formation"]')).toBeNull();
  });
});