import { describe, expect, it, vi } from "vitest";
import { ZoomTick, ZOOM_TICK_COOLDOWN_MS } from "../zoomTick.js";

describe("zoom tick (task 547)", () => {
  it("plays once when zoom starts", () => {
    const play = vi.fn();
    const tick = new ZoomTick(play, () => 1000);
    tick.input();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("coalesces a wheel or pinch burst until the cooldown has elapsed", () => {
    const play = vi.fn();
    let now = 0;
    const tick = new ZoomTick(play, () => now);
    tick.input();
    now = ZOOM_TICK_COOLDOWN_MS - 1;
    tick.input();
    expect(play).toHaveBeenCalledTimes(1);

    now = ZOOM_TICK_COOLDOWN_MS;
    tick.input();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("allows a new tick if the clock moves backwards", () => {
    const play = vi.fn();
    let now = 1000;
    const tick = new ZoomTick(play, () => now);
    tick.input();
    now = 10;
    tick.input();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("ignores a non-finite clock reading", () => {
    const play = vi.fn();
    const tick = new ZoomTick(play, () => Number.NaN);
    tick.input();
    expect(play).not.toHaveBeenCalled();
  });
});
