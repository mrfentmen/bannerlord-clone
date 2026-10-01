/**
 * @vitest-environment jsdom
 *
 * Photo mode bar tests (MASTER_PLAN task 123).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createPhotoMode } from "../photoMode.js";
import { mountPhotoModeBar, type PhotoModeBarOptions } from "../photoModeBar.js";

function options(overrides: Partial<PhotoModeBarOptions> = {}): PhotoModeBarOptions {
  return {
    photo: createPhotoMode(),
    onOrbit: vi.fn(),
    onZoom: vi.fn(),
    captureFrame: () => "data:image/png,xxx",
    setInterfaceHidden: vi.fn(),
    suspendInput: vi.fn(),
    resumeInput: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
}

describe("mountPhotoModeBar", () => {
  let anchors: HTMLAnchorElement[];
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    anchors = [];
    document.body.innerHTML = "";
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        anchors.push(this);
      });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    document.body.innerHTML = "";
  });

  it("enters photo mode, hides the interface, and suspends input on mount", () => {
    const opts = options();
    const bar = mountPhotoModeBar(opts);
    expect(bar.photo.state().active).toBe(true);
    expect(bar.photo.state().uiHidden).toBe(true);
    expect(opts.setInterfaceHidden).toHaveBeenCalledWith(true);
    expect(opts.suspendInput).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="photo-bar"]')).not.toBeNull();
    bar.destroy();
  });

  it("orbit buttons update photo state and drive the camera", () => {
    const opts = options();
    const bar = mountPhotoModeBar(opts);
    (document.querySelector('[data-testid="photo-orbit-left"]') as HTMLElement).click();
    expect(bar.photo.state().yaw).toBeCloseTo(-0.18, 5);
    expect(opts.onOrbit).toHaveBeenCalledWith(-0.18, 0);
    (document.querySelector('[data-testid="photo-orbit-up"]') as HTMLElement).click();
    expect(bar.photo.state().pitch).toBeCloseTo(0.3 - 0.18, 5);
    bar.destroy();
  });

  it("zoom buttons update photo state and drive the camera", () => {
    const opts = options();
    const bar = mountPhotoModeBar(opts);
    (document.querySelector('[data-testid="photo-zoom-in"]') as HTMLElement).click();
    expect(bar.photo.state().distance).toBeCloseTo(10 / 1.25, 5);
    expect(opts.onZoom).toHaveBeenCalledWith(1 / 1.25);
    (document.querySelector('[data-testid="photo-zoom-out"]') as HTMLElement).click();
    expect(bar.photo.state().distance).toBeCloseTo(10, 5);
    expect(opts.onZoom).toHaveBeenCalledWith(1.25);
    bar.destroy();
  });

  it("arrow keys orbit and Escape exits", () => {
    const opts = options();
    const bar = mountPhotoModeBar(opts);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(bar.photo.state().yaw).toBeCloseTo(0.18, 5);
    expect(opts.onOrbit).toHaveBeenCalledWith(0.18, 0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(opts.onExit).toHaveBeenCalledTimes(1);
    expect(opts.resumeInput).toHaveBeenCalledTimes(1);
    expect(opts.setInterfaceHidden).toHaveBeenLastCalledWith(false);
    expect(document.querySelector('[data-testid="photo-bar"]')).toBeNull();
    expect(bar.photo.state().active).toBe(false);
  });

  it("the h key toggles the interface", () => {
    const opts = options();
    const bar = mountPhotoModeBar(opts);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    expect(opts.setInterfaceHidden).toHaveBeenLastCalledWith(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    expect(opts.setInterfaceHidden).toHaveBeenLastCalledWith(true);
    bar.destroy();
  });

  it("capture downloads the frame as a PNG", () => {
    const opts = options();
    const bar = mountPhotoModeBar(opts);
    (document.querySelector('[data-testid="photo-capture"]') as HTMLElement).click();
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.href).toBe("data:image/png,xxx");
    expect(anchors[0]!.download).toMatch(/^campaign-photo-\d+\.png$/);
    const error = document.querySelector('[data-testid="photo-error"]') as HTMLElement;
    expect(error.hidden).toBe(true);
    bar.destroy();
  });

  it("a failed capture shows an error and downloads nothing", () => {
    const opts = options({ captureFrame: () => null });
    const bar = mountPhotoModeBar(opts);
    (document.querySelector('[data-testid="photo-capture"]') as HTMLElement).click();
    expect(anchors).toHaveLength(0);
    const error = document.querySelector('[data-testid="photo-error"]') as HTMLElement;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("could not be captured");
    bar.destroy();
  });

  it("destroy is idempotent and removes the key handler", () => {
    const opts = options();
    const bar = mountPhotoModeBar(opts);
    bar.destroy();
    bar.destroy();
    expect(opts.onExit).toHaveBeenCalledTimes(1);
    expect(opts.resumeInput).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(opts.onExit).toHaveBeenCalledTimes(1);
  });
});
