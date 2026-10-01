/**
 * @vitest-environment jsdom
 *
 * Trade routes panel tests (MASTER_PLAN tasks 102/103). jsdom has no canvas
 * 2d context, so the overlay render no-ops here; these tests cover the card
 * UI, the found form validation, and the two-step retire flow.
 */

import { describe, expect, it, afterEach } from "vitest";
import { routePanel, type RoutePanelOptions } from "../routePanel.js";
import { createRouteRegistry, type FoundInput } from "../routeRegistry.js";
import type { GoodId } from "../../data/types.js";

function fakeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const created: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const p of created.splice(0)) p.dispose();
  document.body.innerHTML = "";
});

const SETTLEMENTS = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Gamma" },
];
const GOODS = [{ id: "textiles" as GoodId, name: "Textiles" }];

function open(overrides: Partial<RoutePanelOptions> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const registry = createRouteRegistry(fakeStorage());
  const handle = routePanel({
    caravans: () => registry.list(),
    onFound: (input: FoundInput) =>
      registry.found(input, 0, { distanceKm: () => 80, kmPerDay: 40 }),
    onRetire: (id: string) => void registry.retire(id),
    settlements: () => SETTLEMENTS,
    goods: () => GOODS,
    models: () => [],
    toScreen: () => ({ x: 10, y: 10 }),
    overlayHost: host,
    renderSize: () => ({ width: 800, height: 600 }),
    onClose: () => {},
    ...overrides,
  });
  document.body.appendChild(handle.root);
  created.push(handle);
  return { handle, host, registry };
}

function foundViaForm(root: HTMLElement, name: string, stopIds: string[]): void {
  const q = (sel: string) => root.querySelector(sel) as HTMLInputElement | HTMLSelectElement;
  // Add stops first: each add re-renders the form, so the name goes in last.
  for (const id of stopIds) {
    (q('[data-testid="routes-stop-select"]') as HTMLSelectElement).value = id;
    (root.querySelector('[data-testid="routes-add-stop"]') as HTMLButtonElement).click();
  }
  (q('[data-testid="routes-name"]') as HTMLInputElement).value = name;
  (root.querySelector('[data-testid="routes-found"]') as HTMLButtonElement).click();
}

describe("routePanel", () => {
  it("shows an empty state with no caravans", () => {
    const { handle } = open();
    expect(handle.root.textContent).toContain("No caravans yet");
  });

  it("founds a caravan through the form and lists it", () => {
    const { handle, registry } = open();
    foundViaForm(handle.root, "Amber Run", ["a", "b"]);
    expect(registry.list()).toHaveLength(1);
    expect(handle.root.textContent).toContain("Amber Run");
    expect(handle.root.textContent).toContain("Alpha → Beta → Alpha");
  });

  it("keeps the typed name when stops are added", () => {
    const { handle } = open();
    const nameInput = () =>
      handle.root.querySelector('[data-testid="routes-name"]') as HTMLInputElement;
    nameInput().value = "Amber Run";
    (handle.root.querySelector('[data-testid="routes-stop-select"]') as HTMLSelectElement).value =
      "a";
    (handle.root.querySelector('[data-testid="routes-add-stop"]') as HTMLButtonElement).click();
    expect(nameInput().value).toBe("Amber Run");
    expect(
      handle.root.querySelectorAll('[data-testid="routes-stops"] li'),
    ).toHaveLength(1);
  });

  it("shows the registry's validation error inline", () => {
    const { handle, registry } = open();
    foundViaForm(handle.root, "Lonely", ["a"]);
    expect(registry.list()).toHaveLength(0);
    const err = handle.root.querySelector('[role="alert"]');
    expect(err?.textContent).toContain("at least two stops");
  });

  it("retires through a two-step confirm", () => {
    const { handle, registry } = open();
    foundViaForm(handle.root, "Amber Run", ["a", "b"]);
    const [c] = registry.list();
    const retireBtn = handle.root.querySelector(
      `[data-testid="routes-retire-${c!.id}"]`,
    ) as HTMLButtonElement;
    retireBtn.click();
    // First click only reveals the confirm; the caravan is still there.
    expect(registry.list()).toHaveLength(1);
    const confirm = handle.root.querySelector(
      `[data-testid="routes-retire-confirm-${c!.id}"]`,
    ) as HTMLButtonElement;
    confirm.click();
    expect(registry.list()).toHaveLength(0);
  });

  it("pins a pointer-transparent overlay canvas over the map", () => {
    const { host } = open();
    const overlay = host.querySelector("canvas.routes__overlay") as HTMLCanvasElement;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
  });

  it("dispose removes the overlay", () => {
    const { handle, host } = open();
    handle.dispose();
    expect(host.querySelector("canvas")).toBeNull();
  });
});
