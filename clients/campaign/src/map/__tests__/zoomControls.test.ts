/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createZoomControls, ZOOM_STEP } from "../zoomControls.js";
import { input } from "../../input/index.js";

const built: { destroy(): void }[] = [];

function build(overrides: Partial<Parameters<typeof createZoomControls>[0]> = {}) {
  const handle = createZoomControls({ onZoom: vi.fn(), ...overrides });
  built.push(handle);
  return handle;
}

afterEach(() => {
  while (built.length) built.pop()!.destroy();
  document.documentElement.removeAttribute("data-colorblind-mode");
});

describe("map zoom controls (task 171)", () => {
  it("draws a labelled group with two real buttons", () => {
    const { root } = build();
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-label")).toBe("Map zoom");
    const inButton = root.querySelector('[data-testid="map-zoom-in"]')!;
    const outButton = root.querySelector('[data-testid="map-zoom-out"]')!;
    expect(inButton.tagName).toBe("BUTTON");
    expect(outButton.tagName).toBe("BUTTON");
    expect(inButton.getAttribute("aria-label")).toBe("Zoom in");
    expect(outButton.getAttribute("aria-label")).toBe("Zoom out");
  });

  it("sends a multiplicative step away and toward the camera", () => {
    const onZoom = vi.fn();
    const { root } = build({ onZoom });
    (root.querySelector('[data-testid="map-zoom-out"]') as HTMLButtonElement).click();
    (root.querySelector('[data-testid="map-zoom-in"]') as HTMLButtonElement).click();
    expect(onZoom.mock.calls).toEqual([[ZOOM_STEP], [1 / ZOOM_STEP]]);
    // A factor, not a delta: the gesture is the same at every zoom level.
    expect(ZOOM_STEP).toBeGreaterThan(1);
  });

  it("drives the same callback from the input registry, not a raw key listener", () => {
    const onZoom = vi.fn();
    build({ onZoom });
    input.dispatch("map.zoomIn", "keyboard");
    input.dispatch("map.zoomOut", "keyboard");
    expect(onZoom.mock.calls).toEqual([[1 / ZOOM_STEP], [ZOOM_STEP]]);
  });

  it("respects the when guard", () => {
    const onZoom = vi.fn();
    const { root } = build({ onZoom, when: () => false });
    (root.querySelector('[data-testid="map-zoom-in"]') as HTMLButtonElement).click();
    input.dispatch("map.zoomIn", "keyboard");
    expect(onZoom).not.toHaveBeenCalled();
  });

  it("stops firing after destroy, from both routes", () => {
    const onZoom = vi.fn();
    const handle = build({ onZoom });
    handle.destroy();
    (handle.root.querySelector('[data-testid="map-zoom-in"]') as HTMLButtonElement).click();
    input.dispatch("map.zoomIn", "keyboard");
    input.dispatch("map.zoomOut", "keyboard");
    expect(onZoom).not.toHaveBeenCalled();
  });

  it("removes both listeners on destroy without being asked twice", () => {
    const onZoom = vi.fn();
    const handle = createZoomControls({ onZoom });
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
    input.dispatch("map.zoomIn", "keyboard");
    expect(onZoom).not.toHaveBeenCalled();
  });

  it("keeps two controls independent", () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = createZoomControls({ onZoom: first });
    const b = createZoomControls({ onZoom: second });
    built.push(a, b);
    (a.root.querySelector('[data-testid="map-zoom-in"]') as HTMLButtonElement).click();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("gives each control its own testid when asked", () => {
    const { root } = build({ testId: "photo-zoom" });
    expect(root.getAttribute("data-testid")).toBe("photo-zoom");
  });
});