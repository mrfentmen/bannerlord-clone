/**
 * The formation preview ghost (Buffy task 71): `formationSlots` is the pure
 * shape maths, and the ghost draws those slots on the field.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";
import { formationSlots, FORMATION_SPACING_M } from "../formation.js";
import { createFormationGhost } from "../formationGhost.js";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import type { CommandSurface, CommandableUnit, FormationKind, Order } from "../types.js";

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
    fieldToScreen: (x, z) => ({ x: x * 2, y: z * 2 }),
    overlay: () => overlayEl,
    issueOrder: (o) => { orders.push(o); },
    onUnitsChanged: () => () => {},
  };
  return { surface, orders };
}

function pick(testId: string): void {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

function ghostSlots(): NodeListOf<Element> {
  return document.querySelectorAll(".cmd-ghost__slot");
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("formationSlots", () => {
  it("has nothing to place when there are no units", () => {
    for (const formation of ["line", "column", "wedge", "circle"] as FormationKind[]) {
      expect(formationSlots(formation, 0)).toEqual([]);
      expect(formationSlots(formation, -3)).toEqual([]);
    }
  });

  it("line is a front across x, centred on the middle unit", () => {
    expect(formationSlots("line", 3, 2)).toEqual([
      { x: -2, z: 0 },
      { x: 0, z: 0 },
      { x: 2, z: 0 },
    ]);
    // An odd and an even count both sit centred on the middle.
    expect(formationSlots("line", 4, 2).map((s) => s.x)).toEqual([-3, -1, 1, 3]);
  });

  it("column is a single file down z", () => {
    expect(formationSlots("column", 3, 2)).toEqual([
      { x: 0, z: -2 },
      { x: 0, z: 0 },
      { x: 0, z: 2 },
    ]);
  });

  it("wedge opens back from an apex at the front, one row wider each time", () => {
    expect(formationSlots("wedge", 4, 2)).toEqual([
      { x: 0, z: 0 }, // apex
      { x: -2, z: -2 }, // second rank, two units
      { x: -2, z: 0 },
      { x: -2, z: 2 },
    ]);
    // Six units adds a third rank of three, so no two units share a spot.
    const six = formationSlots("wedge", 6, 2);
    expect(six).toHaveLength(6);
    expect(new Set(six.map((s) => `${s.x},${s.z}`)).size).toBe(6);
  });

  it("circle spreads on a ring, and grows the ring with the group", () => {
    const three = formationSlots("circle", 3, 2);
    expect(three).toHaveLength(3);
    // Circumference is roughly count * spacing, so a bigger group stands wider.
    const radiusOf = (slots: { x: number; z: number }[]): number =>
      Math.hypot(slots[0]!.x, slots[0]!.z);
    expect(radiusOf(formationSlots("circle", 8, 2))).toBeGreaterThan(radiusOf(three));
  });

  it("every slot is the given distance from the centre line, as a formation should be", () => {
    for (const formation of ["line", "column", "wedge", "circle"] as FormationKind[]) {
      const slots = formationSlots(formation, 5, 2);
      expect(slots).toHaveLength(5);
      // No unit sits on the same spot as another.
      expect(new Set(slots.map((s) => `${s.x},${s.z}`)).size).toBe(5);
    }
    expect(FORMATION_SPACING_M).toBe(2);
  });
});

describe("formation ghost", () => {
  it("draws one slot per unit at the projected position", () => {
    const { surface } = fakeSurface();
    const ghost = createFormationGhost(surface);
    surface.overlay().appendChild(ghost.root);
    try {
      ghost.show("line", 3, { x: 50, z: 10 });

      const slots = ghostSlots();
      expect(slots).toHaveLength(3);
      // Slots at x = 48, 50, 52 with z = 10, projected at 2 px per metre.
      expect((slots[0] as HTMLElement).style.left).toBe("96px");
      expect((slots[0] as HTMLElement).style.top).toBe("20px");
      expect((slots[1] as HTMLElement).style.left).toBe("100px");
      expect((slots[2] as HTMLElement).style.left).toBe("104px");
      expect(ghost.root.hidden).toBe(false);
    } finally {
      ghost.destroy();
    }
  });

  it("shows nothing for an empty group, and stays hidden", () => {
    const { surface } = fakeSurface();
    const ghost = createFormationGhost(surface);
    surface.overlay().appendChild(ghost.root);
    try {
      ghost.show("line", 0, { x: 50, z: 10 });
      expect(ghostSlots()).toHaveLength(0);
      expect(ghost.root.hidden).toBe(true);
    } finally {
      ghost.destroy();
    }
  });

  it("redraws rather than accumulating when moved", () => {
    const { surface } = fakeSurface();
    const ghost = createFormationGhost(surface);
    surface.overlay().appendChild(ghost.root);
    try {
      ghost.show("line", 3, { x: 50, z: 10 });
      // A column of two at z = 40 stands at z = 39 and z = 41.
      ghost.show("column", 2, { x: 80, z: 40 });

      expect(ghostSlots()).toHaveLength(2);
      expect((ghostSlots()[0] as HTMLElement).style.top).toBe("78px");
      expect((ghostSlots()[1] as HTMLElement).style.top).toBe("82px");
    } finally {
      ghost.destroy();
    }
  });

  it("hide clears the slots", () => {
    const { surface } = fakeSurface();
    const ghost = createFormationGhost(surface);
    surface.overlay().appendChild(ghost.root);
    ghost.show("wedge", 4, { x: 0, z: 0 });
    expect(ghostSlots()).toHaveLength(4);

    ghost.hide();

    expect(ghostSlots()).toHaveLength(0);
    expect(ghost.root.hidden).toBe(true);
  });
});

describe("formation ghost in the commander", () => {
  it("previews the chosen formation under the pointer", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pick("cmd-formation-line");

      // No pointer move yet, so the ghost sits at the default centre.
      expect(ghostSlots()).toHaveLength(2); // two selected units

      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 60, clientY: 30 }));

      // Line of two at the pointer: x = 59 and 61, z = 30.
      expect((ghostSlots()[0] as HTMLElement).style.left).toBe("118px");
      expect((ghostSlots()[0] as HTMLElement).style.top).toBe("60px");
    } finally {
      commander.destroy();
    }
  });

  it("appears and disappears with the formation choice", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      expect(ghostSlots()).toHaveLength(0); // nothing chosen yet

      pick("cmd-formation-wedge");
      expect(ghostSlots()).toHaveLength(2);

      pick("cmd-formation-loose");
      expect(ghostSlots()).toHaveLength(0);
      expect(
        (document.querySelector('[data-testid="cmd-formation-ghost"]') as HTMLElement).hidden,
      ).toBe(true);
    } finally {
      commander.destroy();
    }
  });

  it("follows the selection size", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      pick("cmd-formation-circle");
      expect(ghostSlots()).toHaveLength(0); // nothing selected

      commander.selection.select(["a"]);
      expect(ghostSlots()).toHaveLength(1);

      commander.selection.select(["a", "b"]);
      expect(ghostSlots()).toHaveLength(2);

      commander.selection.clear();
      expect(ghostSlots()).toHaveLength(0);
    } finally {
      commander.destroy();
    }
  });

  it("destroy takes the ghost out of the DOM", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    input.dispatch("battle.selectAll", "keyboard");
    pick("cmd-formation-line");
    expect(document.querySelector('[data-testid="cmd-formation-ghost"]')).not.toBeNull();

    commander.destroy();

    expect(document.querySelector('[data-testid="cmd-formation-ghost"]')).toBeNull();
    expect(ghostSlots()).toHaveLength(0);
  });
});