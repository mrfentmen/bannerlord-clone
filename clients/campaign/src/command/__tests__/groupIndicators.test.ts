/**
 * Control group indicators (Buffy task 69): numbered chips for the control
 * groups that exist, and a click that recalls through the input registry.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupIndicators } from "../groupIndicators.js";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
import { createInputRegistry } from "../../input/registry.js";
import type { CommandSurface, CommandableUnit, Order } from "../types.js";

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

/** A registry that already has the nine control group actions, as the commander makes them. */
function groupRegistry(): ReturnType<typeof createInputRegistry> {
  const registry = createInputRegistry();
  for (let n = 1; n <= 9; n++) {
    registry.registerAction({
      id: `battle.controlGroup${n}`,
      label: `Control group ${n}`,
      category: "battle-command",
      description: `Recall control group ${n}.`,
      defaultKeys: [{ key: String(n) }],
    });
  }
  return registry;
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("control group indicators", () => {
  it("draws nothing when no group is bound", () => {
    const registry = groupRegistry();
    const groups = createGroupIndicators({ registry, members: () => [] });
    document.body.appendChild(groups.root);
    try {
      groups.update();
      expect(document.querySelectorAll(".cmd-group")).toHaveLength(0);
      expect(groups.root.getAttribute("aria-label")).toBe("Control groups");
    } finally {
      groups.destroy();
    }
  });

  it("draws one chip per bound group, showing its size", () => {
    const registry = groupRegistry();
    const members = (n: number): string[] => (n === 1 ? ["a", "b", "c"] : n === 2 ? ["a"] : []);
    const groups = createGroupIndicators({ registry, members });
    document.body.appendChild(groups.root);
    try {
      groups.update();

      const chips = document.querySelectorAll(".cmd-group");
      expect(chips).toHaveLength(2);
      expect((chips[0] as HTMLElement).dataset.group).toBe("1");
      expect(chips[0]!.textContent).toBe("13"); // "1" plus the headcount badge
      expect(chips[0]!.querySelector(".cmd-group__count")!.textContent).toBe("3");
      expect(chips[1]!.textContent).toBe("21"); // one unit, so a bare "1" and a badge of 1
      expect(chips[1]!.getAttribute("aria-label")).toBe("Recall control group 2, 1 unit");
    } finally {
      groups.destroy();
    }
  });

  it("drops a chip whose group is emptied and revives it on the next repaint", () => {
    const registry = groupRegistry();
    let groups1: string[] = ["a"];
    const groups = createGroupIndicators({
      registry,
      members: (n) => (n === 1 ? groups1 : []),
    });
    document.body.appendChild(groups.root);
    try {
      groups.update();
      expect(document.querySelectorAll(".cmd-group")).toHaveLength(1);

      groups1 = [];
      groups.update();
      expect(document.querySelectorAll(".cmd-group")).toHaveLength(0);

      groups1 = ["a", "b"];
      groups.update();
      const chip = document.querySelector(".cmd-group") as HTMLElement;
      expect(chip.querySelector(".cmd-group__count")!.textContent).toBe("2");
    } finally {
      groups.destroy();
    }
  });

  it("pressing a chip recalls that group through the registry", () => {
    const registry = groupRegistry();
    const recalled: string[] = [];
    for (let n = 1; n <= 9; n++) {
      registry.on(`battle.controlGroup${n}`, (ev) => recalled.push(`${n}:${ev.source}`));
    }
    const onRecall = vi.fn();
    const groups = createGroupIndicators({
      registry,
      members: (n) => (n === 3 ? ["a"] : []),
      onRecall,
    });
    document.body.appendChild(groups.root);
    try {
      groups.update();
      (document.querySelector('[data-testid="cmd-group-3"]') as HTMLButtonElement).click();

      expect(recalled).toEqual(["3:touch"]);
      expect(onRecall).toHaveBeenCalledWith(3);
    } finally {
      groups.destroy();
    }
  });

  it("destroy clears the chips and the row", () => {
    const registry = groupRegistry();
    const groups = createGroupIndicators({ registry, members: () => ["a"] });
    document.body.appendChild(groups.root);
    groups.update();
    expect(document.querySelectorAll(".cmd-group")).toHaveLength(9);

    groups.destroy();

    expect(document.querySelectorAll(".cmd-group")).toHaveLength(0);
    expect(document.querySelector('[data-testid="cmd-groups"]')).toBeNull();
  });
});

describe("control group indicators in the commander", () => {
  it("appears once a group is assigned, with the selection's headcount", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      expect(document.querySelectorAll(".cmd-group")).toHaveLength(0);

      input.dispatch("battle.selectAll", "keyboard");
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true }));

      const chip = document.querySelector('[data-testid="cmd-group-1"]') as HTMLElement;
      expect(chip).not.toBeNull();
      expect(chip.querySelector(".cmd-group__count")!.textContent).toBe("2");
    } finally {
      commander.destroy();
    }
  });

  it("clicking a chip recalls the group into the selection", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "4", ctrlKey: true }));
      commander.selection.clear();
      expect(commander.selection.selected()).toEqual([]);

      (document.querySelector('[data-testid="cmd-group-4"]') as HTMLButtonElement).click();

      expect(commander.selection.selected()).toEqual(["a", "b"]);
    } finally {
      commander.destroy();
    }
  });

  it("re-assigning a group updates the chip", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "2", ctrlKey: true }));
      expect(document.querySelector('[data-testid="cmd-group-2"] .cmd-group__count')!.textContent).toBe(
        "2",
      );

      commander.selection.select(["a"]);
      input.handleKeyEvent(new KeyboardEvent("keydown", { key: "2", ctrlKey: true }));

      expect(document.querySelector('[data-testid="cmd-group-2"] .cmd-group__count')!.textContent).toBe(
        "1",
      );
    } finally {
      commander.destroy();
    }
  });

  it("destroy removes the row", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    expect(document.querySelector('[data-testid="cmd-groups"]')).not.toBeNull();
    commander.destroy();
    expect(document.querySelector('[data-testid="cmd-groups"]')).toBeNull();
  });
});