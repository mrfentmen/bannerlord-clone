/**
 * Stance icons on units (Buffy task 73): one icon per selected unit, positioned
 * from the battlefield projection and shaped per stance.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createStanceIcons } from "../stanceIcons.js";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import type { CommandSurface, CommandableUnit, Order } from "../types.js";

function fakeSurface(): { surface: CommandSurface; orders: Order[] } {
  const overlayEl = document.createElement("div");
  document.body.appendChild(overlayEl);
  const units: CommandableUnit[] = [
    { id: "a", label: "A", kind: "infantry", count: 10, x: 100, z: 200 },
    { id: "b", label: "B", kind: "archers", count: 8, x: 300, z: 50 },
    { id: "dead", label: "C", kind: "cavalry", count: 0, x: 0, z: 0 },
  ];
  const orders: Order[] = [];
  const surface: CommandSurface = {
    units: () => units,
    screenToField: (sx, sy) => ({ x: sx, z: sy }),
    fieldToScreen: (x, z) => ({ x: x + 10, y: z + 5 }),
    overlay: () => overlayEl,
    issueOrder: (o) => { orders.push(o); },
    onUnitsChanged: () => () => {},
  };
  return { surface, orders };
}

function pick(testId: string): void {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

function icons(): NodeListOf<Element> {
  return document.querySelectorAll('[data-testid="cmd-stance-icon"]');
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("stance icons", () => {
  it("shows nothing when no stance is chosen", () => {
    const { surface } = fakeSurface();
    const stanceIcons = createStanceIcons(surface);
    surface.overlay().appendChild(stanceIcons.root);
    try {
      stanceIcons.update(surface.units(), null);
      expect(icons()).toHaveLength(0);
      expect(stanceIcons.root.hidden).toBe(true);
    } finally {
      stanceIcons.destroy();
    }
  });

  it("puts one icon over each unit, lifted off the ground point", () => {
    const { surface } = fakeSurface();
    const stanceIcons = createStanceIcons(surface);
    surface.overlay().appendChild(stanceIcons.root);
    try {
      stanceIcons.update([surface.units()[0]!], "aggressive");

      const icon = icons()[0] as HTMLElement;
      expect(icons()).toHaveLength(1);
      expect(icon.dataset.unit).toBe("a");
      // Unit at (100, 200) projects to (110, 205); the icon sits 26px above it.
      expect(icon.style.left).toBe("110px");
      expect(icon.style.top).toBe("179px");
      expect(icon.title).toBe("Aggressive stance");
      expect(stanceIcons.root.hidden).toBe(false);
    } finally {
      stanceIcons.destroy();
    }
  });

  it("gives each stance a different shape, so they read without colour", () => {
    const { surface } = fakeSurface();
    const stanceIcons = createStanceIcons(surface);
    surface.overlay().appendChild(stanceIcons.root);
    try {
      const shapes = new Set<string>();
      for (const stance of ["aggressive", "defensive", "passive"] as const) {
        stanceIcons.update([surface.units()[0]!], stance);
        const icon = icons()[0] as HTMLElement;
        shapes.add(icon.textContent ?? "");
        expect(icon.className).toContain(`cmd-stance-icon--${stance}`);
        expect(icon.title).toContain("stance");
      }
      expect(shapes.size).toBe(3);
    } finally {
      stanceIcons.destroy();
    }
  });

  it("never icons a destroyed unit", () => {
    const { surface } = fakeSurface();
    const stanceIcons = createStanceIcons(surface);
    surface.overlay().appendChild(stanceIcons.root);
    try {
      stanceIcons.update([surface.units()[2]!], "defensive");
      expect(icons()).toHaveLength(0);
      expect(stanceIcons.root.hidden).toBe(true);
    } finally {
      stanceIcons.destroy();
    }
  });

  it("replaces the previous set rather than stacking icons", () => {
    const { surface } = fakeSurface();
    const stanceIcons = createStanceIcons(surface);
    surface.overlay().appendChild(stanceIcons.root);
    try {
      stanceIcons.update(surface.units().slice(0, 2), "aggressive");
      expect(icons()).toHaveLength(2);
      stanceIcons.update([surface.units()[0]!], "passive");
      expect(icons()).toHaveLength(1);
      expect(icons()[0]!.textContent).toBe("○");
    } finally {
      stanceIcons.destroy();
    }
  });

  it("destroy clears the icons and the layer", () => {
    const { surface } = fakeSurface();
    const stanceIcons = createStanceIcons(surface);
    surface.overlay().appendChild(stanceIcons.root);
    stanceIcons.update([surface.units()[0]!], "defensive");
    expect(icons()).toHaveLength(1);

    stanceIcons.destroy();

    expect(icons()).toHaveLength(0);
    expect(document.querySelector('[data-testid="cmd-stance-icons"]')).toBeNull();
  });
});

describe("stance icons in the commander", () => {
  it("appears the moment a stance is picked, over the selected units only", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      pick("cmd-stance-aggressive");
      expect(icons()).toHaveLength(0); // nothing selected yet

      commander.selection.select(["a", "b"]);

      expect(icons()).toHaveLength(2);
      expect(icons()[0]!.textContent).toBe("▲");
    } finally {
      commander.destroy();
    }
  });

  it("drops the icons when the selection empties or the stance goes back to Default", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      commander.selection.select(["a"]);
      pick("cmd-stance-defensive");
      expect(icons()).toHaveLength(1);

      commander.selection.clear();
      expect(icons()).toHaveLength(0);

      commander.selection.select(["a"]);
      pick("cmd-stance-default");
      expect(icons()).toHaveLength(0);
    } finally {
      commander.destroy();
    }
  });

  it("moves the icons with the units as the camera moves", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      commander.selection.select(["a"]);
      pick("cmd-stance-passive");
      expect((icons()[0] as HTMLElement).style.left).toBe("110px");

      surface.fieldToScreen = (x, z) => ({ x: x * 2, y: z * 2 });
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 1, clientY: 1 }));

      expect((icons()[0] as HTMLElement).style.left).toBe("200px");
    } finally {
      commander.destroy();
    }
  });

  it("destroy takes the icon layer with it", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    commander.selection.select(["a"]);
    pick("cmd-stance-aggressive");
    expect(document.querySelector('[data-testid="cmd-stance-icons"]')).not.toBeNull();

    commander.destroy();

    expect(document.querySelector('[data-testid="cmd-stance-icons"]')).toBeNull();
    expect(icons()).toHaveLength(0);
  });
});