/**
 * Selection highlight rings (Buffy task 65): a DOM ring per selected unit,
 * sized from the battlefield projection so it tracks the camera.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createSelectionRings, ringDiameter } from "../selectionRings.js";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import type { CommandSurface, CommandableUnit } from "../types.js";

function fakeSurface(unitsList: CommandableUnit[]): CommandSurface {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  return {
    units: () => unitsList,
    // A scale of 5 px per metre, offset so the numbers are easy to read.
    screenToField: (sx, sy) => ({ x: sx, z: sy }),
    fieldToScreen: (x, z) => ({ x: 20 + x * 5, y: 30 + z * 5 }),
    overlay: () => overlayEl,
    issueOrder: () => {},
    onUnitsChanged: () => () => {},
  };
}

const units: CommandableUnit[] = [
  { id: "a", label: "A", kind: "infantry", count: 10, x: 100, z: 100 },
  { id: "b", label: "B", kind: "archers", count: 8, x: 300, z: 40 },
  { id: "dead", label: "C", kind: "cavalry", count: 0, x: 500, z: 400 },
];

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("ringDiameter", () => {
  it("measures the projection so the ring scales with the camera", () => {
    // 5 px per metre: the 2 m span is 10 px across.
    const project = (x: number, z: number) => ({ x: x * 5, y: z * 5 });
    expect(ringDiameter(project, { x: 0, z: 0 })).toBeCloseTo(10);

    // Zoomed out to 1 px per metre: 2 px.
    const far = (x: number, z: number) => ({ x: x, y: z });
    expect(ringDiameter(far, { x: 40, z: 40 })).toBeCloseTo(2);
  });

  it("falls back to a readable size when the projection collapses", () => {
    const flat = (): { x: number; y: number } => ({ x: 7, y: 7 });
    expect(ringDiameter(flat, { x: 1, z: 1 })).toBe(18);
  });
});

describe("selection rings", () => {
  it("draws one ring per unit, centred on the projected position", () => {
    const surface = fakeSurface(units);
    const rings = createSelectionRings(surface);
    surface.overlay().appendChild(rings.root);
    try {
      rings.update([units[0]!, units[1]!]);

      const drawn = surface.overlay().querySelectorAll('[data-testid="cmd-ring"]');
      expect(drawn).toHaveLength(2);
      const first = drawn[0] as HTMLElement;
      expect(first.dataset.unit).toBe("a");
      // 20 + 100*5 by 30 + 100*5, and the CSS centres the ring with a transform.
      expect(first.style.left).toBe("520px");
      expect(first.style.top).toBe("530px");
      expect(first.style.width).toBe("10px");
      expect(first.style.height).toBe("10px");
    } finally {
      rings.destroy();
    }
  });

  it("never rings a destroyed unit", () => {
    const surface = fakeSurface(units);
    const rings = createSelectionRings(surface);
    surface.overlay().appendChild(rings.root);
    try {
      rings.update([units[0]!, units[2]!]);
      expect(surface.overlay().querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(1);
    } finally {
      rings.destroy();
    }
  });

  it("drops the ring of a unit that leaves the selection, reusing the rest", () => {
    const surface = fakeSurface(units);
    const rings = createSelectionRings(surface);
    surface.overlay().appendChild(rings.root);
    try {
      rings.update([units[0]!, units[1]!]);
      const ringA = surface.overlay().querySelector('[data-unit="a"]');
      const ringB = surface.overlay().querySelector('[data-unit="b"]');

      rings.update([units[1]!]);

      expect(surface.overlay().querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(1);
      expect(surface.overlay().querySelector('[data-unit="a"]')).toBeNull();
      // B's ring is the very element it was — a repaint, not a rebuild.
      expect(surface.overlay().querySelector('[data-unit="b"]')).toBe(ringB);
      expect(ringA).not.toBeNull();
    } finally {
      rings.destroy();
    }
  });

  it("moves a ring when its unit moves", () => {
    const surface = fakeSurface([{ ...units[0]! }]);
    const rings = createSelectionRings(surface);
    surface.overlay().appendChild(rings.root);
    try {
      rings.update(surface.units());
      expect((surface.overlay().querySelector('[data-unit="a"]') as HTMLElement).style.left).toBe(
        "520px",
      );

      surface.units()[0]!.x = 120;
      rings.update(surface.units());

      expect((surface.overlay().querySelector('[data-unit="a"]') as HTMLElement).style.left).toBe(
        "620px",
      );
    } finally {
      rings.destroy();
    }
  });

  it("destroy takes the rings out of the DOM", () => {
    const surface = fakeSurface(units);
    const rings = createSelectionRings(surface);
    surface.overlay().appendChild(rings.root);
    rings.update([units[0]!]);
    expect(document.querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(1);

    rings.destroy();

    expect(document.querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="cmd-rings"]')).toBeNull();
  });
});

describe("selection rings in the commander", () => {
  function clickUnit(x: number, y: number): void {
    document.querySelector('[data-testid="cmd-rings"]')!.parentElement!.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y }),
    );
  }

  it("rings the units the commander selects", () => {
    const surface = fakeSurface(units);
    const commander = createCommander(surface);
    try {
      expect(document.querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(0);

      clickUnit(520, 530); // where A projects to
      expect(commander.selection.selected()).toEqual(["a"]);
      expect(document.querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(1);

      input.dispatch("battle.selectAll", "keyboard");
      expect(document.querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(2); // C is dead
    } finally {
      commander.destroy();
    }
  });

  it("repaints the rings as the camera moves under them", () => {
    const surface = fakeSurface(units);
    const commander = createCommander(surface);
    try {
      clickUnit(520, 530);
      const ring = () => document.querySelector('[data-unit="a"]') as HTMLElement;
      expect(ring().style.left).toBe("520px");

      // A camera drag: the units project somewhere else and a pointer move follows.
      surface.fieldToScreen = (x, z) => ({ x: 100 + x * 2, y: 100 + z * 2 });
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 5, clientY: 5 }));

      expect(ring().style.left).toBe("300px");
      expect(ring().style.width).toBe("4px");
    } finally {
      commander.destroy();
    }
  });

  it("destroy takes the rings with it", () => {
    const surface = fakeSurface(units);
    const commander = createCommander(surface);
    clickUnit(520, 530);
    expect(document.querySelector('[data-testid="cmd-rings"]')).not.toBeNull();

    commander.destroy();

    expect(document.querySelector('[data-testid="cmd-rings"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="cmd-ring"]')).toHaveLength(0);
  });
});