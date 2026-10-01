/**
 * MASTER_PLAN task 30: the performance overlay measures FPS and frame time
 * from rAF deltas and reads draw calls from an injected provider, refreshing
 * its readout on an interval.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  installPerfOverlay,
  isPerfOverlayVisible,
  resetPerfOverlayForTests,
  setPerfOverlayVisible,
  setPerfStatsProvider,
} from "../perfOverlay.js";

describe("performance overlay (task 30)", () => {
  let now: number;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    now = 1000;
    rafCallbacks = [];
    resetPerfOverlayForTests();
    document.body.innerHTML = "";
    installPerfOverlay({
      now: () => now,
      raf: (cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      },
      updateIntervalMs: 500,
    });
  });

  function frames(count: number, deltaMs: number) {
    for (let i = 0; i < count; i++) {
      now += deltaMs;
      const cbs = rafCallbacks.splice(0);
      for (const cb of cbs) cb(now);
    }
  }

  function readout(): string {
    return document.querySelector(".perf-overlay__readout")?.textContent ?? "";
  }

  it("is hidden until shown", () => {
    expect(isPerfOverlayVisible()).toBe(false);
    expect(document.querySelector(".perf-overlay")).toBeNull();
  });

  it("measures fps and frame time from rAF deltas", () => {
    setPerfOverlayVisible(true);
    frames(40, 16.666); // ~60fps for 666ms, crossing the 500ms refresh
    expect(readout()).toContain("60 fps");
    expect(readout()).toContain("16.7 ms");
  });

  it("shows draw calls from the provider, n/a without one", () => {
    setPerfOverlayVisible(true);
    frames(40, 16.666);
    expect(readout()).toContain("draws n/a");

    setPerfStatsProvider({ drawCalls: () => 148 });
    frames(40, 16.666);
    expect(readout()).toContain("148 draws");
  });

  it("hides via the close button and reports visibility", () => {
    setPerfOverlayVisible(true);
    expect(isPerfOverlayVisible()).toBe(true);
    (document.querySelector(".perf-overlay__close") as HTMLButtonElement).click();
    expect(isPerfOverlayVisible()).toBe(false);
    expect(document.querySelector(".perf-overlay")).toBeNull();
  });

  it("shows at boot with ?perf=1", () => {
    const url = window.location.href;
    window.history.replaceState(null, "", "?perf=1");
    try {
      installPerfOverlay({
        now: () => now,
        raf: (cb) => {
          rafCallbacks.push(cb);
          return 1;
        },
      });
      expect(isPerfOverlayVisible()).toBe(true);
    } finally {
      window.history.replaceState(null, "", url);
    }
  });
});
