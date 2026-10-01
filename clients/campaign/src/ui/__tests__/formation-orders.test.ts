/**
 * @vitest-environment jsdom
 *
 * Formation order UI: palette + hotkeys, drag-box selection, target picker,
 * order queue, stance toggles, face-direction drag, and order toasts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFormationOrdersPanel,
  isOrderName,
  ORDER_NAMES,
  type FormationInfo,
  type OrderPayload,
} from "../formation-orders.js";

const formations: FormationInfo[] = [
  { id: "f1", name: "Rifles Alpha" },
  { id: "f2", name: "Rifles Bravo" },
];
const enemies: FormationInfo[] = [{ id: "e1", name: "Enemy Gunners" }];

function setup() {
  const posted: OrderPayload[][] = [];
  const panel = createFormationOrdersPanel({
    formations,
    enemyFormations: enemies,
    postOrders: (orders) => {
      posted.push(orders);
    },
    formationScreenPos: (id) =>
      id === "f1" ? { x: 10, y: 10 } : id === "f2" ? { x: 90, y: 90 } : null,
  });
  document.body.append(panel.root);
  return { panel, posted };
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function shiftClick(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useFakeTimers();
});

describe("order names", () => {
  it("exposes the fourteen wire orders", () => {
    expect(ORDER_NAMES).toHaveLength(14);
    expect(ORDER_NAMES).toContain("hold-position");
    expect(ORDER_NAMES).toContain("face-direction");
  });

  it("rejects unknown order names", () => {
    expect(isOrderName("nuke-everything")).toBe(false);
    expect(isOrderName("charge")).toBe(true);
  });
});

describe("selection", () => {
  it("selects and replaces by default", () => {
    const { panel } = setup();
    panel.setSelected(["f1"]);
    expect(panel.getSelected()).toEqual(["f1"]);
    panel.setSelected(["f2"]);
    expect(panel.getSelected()).toEqual(["f2"]);
    panel.destroy();
  });

  it("ctrl selection toggles membership", () => {
    const { panel } = setup();
    panel.setSelected(["f1"], true);
    panel.setSelected(["f2"], true);
    expect(panel.getSelected()).toEqual(["f1", "f2"]);
    panel.setSelected(["f1"], true);
    expect(panel.getSelected()).toEqual(["f2"]);
    panel.destroy();
  });

  it("shows a prompt when nothing is selected", () => {
    const { panel } = setup();
    expect(panel.root.querySelector(".orders-none")).not.toBeNull();
    panel.destroy();
  });
});

describe("palette and hotkeys", () => {
  it("clicking a palette button issues the order immediately", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    click(panel.root.querySelector('[data-order="advance"]')!);
    expect(posted).toHaveLength(1);
    expect(posted[0]![0]!.name).toBe("advance");
    expect(posted[0]![0]!.params?.formation_id).toBe("f1");
    panel.destroy();
  });

  it("hotkey 2 issues advance in under 200ms", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    const start = performance.now();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
    const elapsed = performance.now() - start;
    expect(posted).toHaveLength(1);
    expect(posted[0]![0]!.name).toBe("advance");
    expect(elapsed).toBeLessThan(200);
    panel.destroy();
  });

  it("hotkeys 1-4 map to hold/advance/charge/fall-back", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    const expected: [string, string][] = [
      ["1", "hold-position"],
      ["2", "advance"],
      ["3", "charge"],
      ["4", "fall-back"],
    ];
    for (const [key] of expected) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    }
    expect(posted.map((p) => p[0]!.name)).toEqual(expected.map((e) => e[1]));
    panel.destroy();
  });

  it("unknown keys do nothing", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "9" }));
    expect(posted).toHaveLength(0);
    panel.destroy();
  });
});

describe("order queue", () => {
  it("shift-click queues instead of posting", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    shiftClick(panel.root.querySelector('[data-order="advance"]')!);
    shiftClick(panel.root.querySelector('[data-order="charge"]')!);
    expect(posted).toHaveLength(0);
    expect(panel.getQueue("f1").map((o) => o.name)).toEqual(["advance", "charge"]);
    // Queue chips render.
    expect(panel.root.querySelectorAll(".orders-chip.queue")).toHaveLength(2);
    panel.destroy();
  });

  it("a direct order flushes the queue first, in order", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    shiftClick(panel.root.querySelector('[data-order="advance"]')!);
    click(panel.root.querySelector('[data-order="charge"]')!);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.map((o) => o.name)).toEqual(["advance", "charge"]);
    expect(panel.getQueue("f1")).toHaveLength(0);
    panel.destroy();
  });

  it("right-click on a queue chip cancels it", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    shiftClick(panel.root.querySelector('[data-order="advance"]')!);
    const chip = panel.root.querySelector('.orders-chip.queue[data-index="0"]')!;
    chip.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(panel.getQueue("f1")).toHaveLength(0);
    expect(posted).toHaveLength(0);
    panel.destroy();
  });
});

describe("target selection", () => {
  it("clicking an enemy sets it as the attack target", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    click(panel.root.querySelector('[data-target="e1"]')!);
    expect(panel.getTarget()).toBe("e1");
    click(panel.root.querySelector('[data-order="charge"]')!);
    expect(posted[0]![0]!.params?.target_formation_id).toBe("e1");
    panel.destroy();
  });

  it("clicking the target again clears it", () => {
    const { panel } = setup();
    const btn = panel.root.querySelector('[data-target="e1"]')!;
    click(btn);
    click(btn);
    expect(panel.getTarget()).toBeNull();
    panel.destroy();
  });
});

describe("formation shapes", () => {
  it("issues change-formation with the shape param", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    click(panel.root.querySelector('[data-shape="wedge"]')!);
    expect(posted[0]![0]!.name).toBe("change-formation");
    expect(posted[0]![0]!.params?.shape).toBe("wedge");
    panel.destroy();
  });
});

describe("stances", () => {
  it("engage at will issues fire-at-will and marks the stance", () => {
    const { panel, posted } = setup();
    panel.setSelected(["f1"]);
    click(panel.root.querySelector('[data-stance="engage"]')!);
    expect(panel.getStance("f1")).toBe("engage");
    expect(posted[0]![0]!.name).toBe("fire-at-will");
    const btn = panel.root.querySelector('[data-stance="engage"]')!;
    expect(btn.classList.contains("active")).toBe(true);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    panel.destroy();
  });

  it("toggling the same stance clears it", () => {
    const { panel } = setup();
    panel.setSelected(["f1"]);
    const btn = panel.root.querySelector('[data-stance="brace"]')!;
    click(btn);
    expect(panel.getStance("f1")).toBe("brace");
    click(btn);
    expect(panel.getStance("f1")).toBeNull();
    expect(btn.classList.contains("active")).toBe(false);
    panel.destroy();
  });
});

describe("face-direction drag", () => {
  it("commits face-direction with an angle on drag release", () => {
    const arrows: unknown[] = [];
    const posted: OrderPayload[][] = [];
    const panel = createFormationOrdersPanel({
      formations,
      enemyFormations: enemies,
      postOrders: (orders) => {
        posted.push(orders);
      },
      onFaceArrow: (from, to) => arrows.push([from, to]),
    });
    document.body.append(panel.root);
    const surface = document.createElement("div");
    document.body.append(surface);
    panel.attachSurface(surface);
    panel.setSelected(["f1"]);
    click(panel.root.querySelector(".orders-section [title^='Drag']")!);

    const rect = { left: 0, top: 0 } as DOMRect;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    surface.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 0, clientY: 0 }));
    surface.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: 0 }));
    surface.dispatchEvent(new MouseEvent("mouseup", { clientX: 10, clientY: 0 }));

    expect(arrows.length).toBeGreaterThan(0);
    expect(posted).toHaveLength(1);
    expect(posted[0]![0]!.name).toBe("face-direction");
    expect(posted[0]![0]!.params?.angle_deg).toBe(0);
    panel.destroy();
  });
});

describe("drag-box selection", () => {
  it("selects formations inside the box", () => {
    const boxes: unknown[] = [];
    const panel = createFormationOrdersPanel({
      formations,
      enemyFormations: enemies,
      postOrders: () => {},
      formationScreenPos: (id) => (id === "f1" ? { x: 10, y: 10 } : { x: 90, y: 90 }),
      onSelectBox: (rect) => boxes.push(rect),
    });
    document.body.append(panel.root);
    const surface = document.createElement("div");
    document.body.append(surface);
    panel.attachSurface(surface);
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);

    surface.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 0, clientY: 0 }));
    surface.dispatchEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 50 }));
    surface.dispatchEvent(new MouseEvent("mouseup", { clientX: 50, clientY: 50 }));

    expect(panel.getSelected()).toEqual(["f1"]);
    expect(boxes.length).toBeGreaterThan(0);
    panel.destroy();
  });
});

describe("toasts", () => {
  it("every issued order shows a toast with formation name and order", () => {
    const { panel } = setup();
    panel.setSelected(["f1"]);
    click(panel.root.querySelector('[data-order="charge"]')!);
    const toast = panel.root.querySelector(".orders-toast");
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain("Rifles Alpha");
    expect(toast!.textContent).toContain("Charge");
    panel.destroy();
  });

  it("a toast fades and is removed", () => {
    const { panel } = setup();
    panel.setSelected(["f1"]);
    click(panel.root.querySelector('[data-order="charge"]')!);
    expect(panel.root.querySelectorAll(".orders-toast")).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    vi.advanceTimersByTime(500);
    expect(panel.root.querySelectorAll(".orders-toast")).toHaveLength(0);
    panel.destroy();
  });
});
