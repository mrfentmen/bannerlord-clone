/**
 * The stance selector (Buffy task 72): aggressive / defensive / passive, with a
 * "Default" that means no stance at all.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStanceSelector, STANCE_CHOICES } from "../stance.js";
import { createCommander } from "../commander.js";
import { input } from "../../input/index.js";
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

function pick(testId: string): void {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
}

beforeEach(() => {
  input.resetAllBindings();
  document.body.replaceChildren();
});

describe("stance selector", () => {
  it("offers the three stances plus a no-choice option, in reading order", () => {
    const selector = createStanceSelector({ onPick: () => {} });
    document.body.appendChild(selector.root);
    try {
      expect(selector.root.getAttribute("aria-label")).toBe("Stance");
      const labels = [...selector.root.querySelectorAll(".cmd-stance__label")].map(
        (el) => el.textContent,
      );
      expect(labels).toEqual(["Default", "Aggressive", "Defensive", "Passive"]);
      // Every choice explains itself, because "defensive" means little alone.
      for (const choice of STANCE_CHOICES) {
        expect(choice.hint.length).toBeGreaterThan(10);
      }
    } finally {
      selector.destroy();
    }
  });

  it("starts on Default, so no order claims a stance nobody picked", () => {
    const selector = createStanceSelector({ onPick: () => {} });
    document.body.appendChild(selector.root);
    try {
      expect(selector.current()).toBeNull();
      expect(document.querySelector('[data-testid="cmd-stance-default"]')!.getAttribute("aria-pressed")).toBe(
        "true",
      );
    } finally {
      selector.destroy();
    }
  });

  it("marks exactly one choice pressed and reports the pick", () => {
    const onPick = vi.fn();
    const selector = createStanceSelector({ onPick });
    document.body.appendChild(selector.root);
    try {
      pick("cmd-stance-aggressive");
      expect(selector.current()).toBe("aggressive");
      expect(onPick).toHaveBeenLastCalledWith("aggressive");

      pick("cmd-stance-passive");
      expect(selector.current()).toBe("passive");
      expect(onPick).toHaveBeenLastCalledWith("passive");
      expect(selector.root.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    } finally {
      selector.destroy();
    }
  });

  it("set() restores state without firing the callback", () => {
    const onPick = vi.fn();
    const selector = createStanceSelector({ onPick });
    document.body.appendChild(selector.root);
    try {
      selector.set("defensive");
      expect(selector.current()).toBe("defensive");
      expect(onPick).not.toHaveBeenCalled();
    } finally {
      selector.destroy();
    }
  });

  it("destroy takes the row out of the DOM", () => {
    const selector = createStanceSelector({ onPick: () => {} });
    document.body.appendChild(selector.root);
    selector.destroy();
    expect(document.querySelector('[data-testid="cmd-stance"]')).toBeNull();
  });
});

describe("stance selector in the commander", () => {
  it("sits in the order row's slot", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    try {
      const slot = document.querySelector('[data-testid="cmd-orderpanel-slot"]')!;
      expect(slot.querySelector('[data-testid="cmd-stance"]')).not.toBeNull();
    } finally {
      commander.destroy();
    }
  });

  it("puts the chosen stance on the next order", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pick("cmd-stance-defensive");
      input.dispatch("battle.orderHold", "keyboard");

      expect(orders[0]!.stance).toBe("defensive");
    } finally {
      commander.destroy();
    }
  });

  it("leaves the stance off orders while Default is chosen", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pick("cmd-stance-passive");
      pick("cmd-stance-default");
      input.dispatch("battle.orderHold", "keyboard");

      expect(orders[0]!.stance).toBeUndefined();
    } finally {
      commander.destroy();
    }
  });

  it("carries stance and formation together, and each can be absent", () => {
    const { surface, orders } = fakeSurface();
    const commander = createCommander(surface);
    try {
      input.dispatch("battle.selectAll", "keyboard");
      pick("cmd-stance-aggressive");
      pick("cmd-formation-wedge");
      input.dispatch("battle.orderHold", "keyboard");
      expect(orders[0]).toMatchObject({ stance: "aggressive", formation: "wedge" });

      pick("cmd-formation-loose");
      input.dispatch("battle.orderHold", "keyboard");
      expect(orders[1]!.stance).toBe("aggressive");
      expect(orders[1]!.formation).toBeUndefined();
    } finally {
      commander.destroy();
    }
  });

  it("destroy removes the selector", () => {
    const { surface } = fakeSurface();
    const commander = createCommander(surface);
    expect(document.querySelector('[data-testid="cmd-stance"]')).not.toBeNull();
    commander.destroy();
    expect(document.querySelector('[data-testid="cmd-stance"]')).toBeNull();
  });
});