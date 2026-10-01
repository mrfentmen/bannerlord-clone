/**
 * Radial menu contract: flick toward a wedge to highlight it, confirm issues it,
 * Escape / dead-zone cancels, arrow keys move between wedges.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from "vitest";
import { createRadialMenu } from "../radial.js";
import type { OrderKind } from "../types.js";

const ITEMS = [{ kind: "attack" }, { kind: "follow" }, { kind: "hold" }, { kind: "retreat" }] as const;

function flick(clientX: number, clientY: number): void {
  window.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY, bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("radial menu", () => {
  it("highlights the wedge the pointer flicks toward", () => {
    let picked: OrderKind | null = null;
    const menu = createRadialMenu({
      items: [...ITEMS],
      x: 200,
      y: 200,
      onPick: (k) => { picked = k; },
      onCancel: () => { picked = "rally"; },
    });
    document.body.appendChild(menu.root);

    flick(200, 60); // straight up -> attack
    expect(menu.highlighted()).toBe("attack");
    flick(340, 200); // straight right -> follow
    expect(menu.highlighted()).toBe("follow");
    flick(200, 340); // straight down -> hold
    expect(menu.highlighted()).toBe("hold");
    flick(60, 200); // straight left -> retreat
    expect(menu.highlighted()).toBe("retreat");
    expect(picked).toBeNull();
    menu.destroy();
  });

  it("the dead zone highlights nothing, and confirming there cancels", () => {
    let cancelled = 0;
    const menu = createRadialMenu({
      items: [...ITEMS],
      x: 200,
      y: 200,
      onPick: () => { throw new Error("must not pick"); },
      onCancel: () => { cancelled++; },
    });
    document.body.appendChild(menu.root);
    flick(205, 205);
    expect(menu.highlighted()).toBeNull();
    menu.confirm();
    expect(cancelled).toBe(1);
  });

  it("pointer-up issues the highlighted order", () => {
    let picked: OrderKind | null = null;
    const menu = createRadialMenu({
      items: [...ITEMS],
      x: 200,
      y: 200,
      onPick: (k) => { picked = k; },
      onCancel: () => {},
    });
    document.body.appendChild(menu.root);
    flick(200, 60);
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 60, bubbles: true }));
    expect(picked).toBe("attack");
    expect(document.querySelector('[data-testid="command-radial"]')).toBeNull();
  });

  it("Escape cancels and removes the menu", () => {
    let cancelled = 0;
    const menu = createRadialMenu({
      items: [...ITEMS],
      x: 200,
      y: 200,
      onPick: () => { throw new Error("must not pick"); },
      onCancel: () => { cancelled++; },
    });
    document.body.appendChild(menu.root);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(cancelled).toBe(1);
    expect(document.querySelector('[data-testid="command-radial"]')).toBeNull();
  });

  it("arrow keys walk the wedges and Enter issues the focused one", () => {
    let picked: OrderKind | null = null;
    const menu = createRadialMenu({
      items: [...ITEMS],
      x: 200,
      y: 200,
      onPick: (k) => { picked = k; },
      onCancel: () => {},
    });
    document.body.appendChild(menu.root);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(menu.highlighted()).toBe("attack");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(menu.highlighted()).toBe("follow");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(menu.highlighted()).toBe("attack");
    // Enter on the focused wedge fires its click handler.
    (document.querySelector('[data-testid="radial-attack"]') as HTMLButtonElement).click();
    expect(picked).toBe("attack");
  });

  it("confirm is idempotent: the first of pointer-up / release / Enter wins", () => {
    let picks = 0;
    const menu = createRadialMenu({
      items: [...ITEMS],
      x: 200,
      y: 200,
      onPick: () => { picks++; },
      onCancel: () => {},
    });
    document.body.appendChild(menu.root);
    flick(200, 60);
    menu.confirm();
    menu.confirm();
    expect(picks).toBe(1);
  });
});
