/**
 * Auto-detect benchmark tests (MASTER_PLAN task 13).
 */

import { describe, expect, it } from "vitest";
import {
  BENCHMARK_MIN_FRAMES,
  BENCHMARK_MIN_MS,
  FpsBenchmark,
  presetForFps,
} from "../autodetect.js";

describe("presetForFps", () => {
  it("picks Low on weak hardware", () => {
    expect(presetForFps(12)).toBe("low");
    expect(presetForFps(24.9)).toBe("low");
    expect(presetForFps(0)).toBe("low");
    expect(presetForFps(NaN)).toBe("low");
  });

  it("picks High or Ultra on strong hardware", () => {
    expect(presetForFps(50)).toBe("high");
    expect(presetForFps(54.9)).toBe("high");
    expect(presetForFps(55)).toBe("ultra");
    expect(presetForFps(120)).toBe("ultra");
  });

  it("lands in the middle for middling hardware", () => {
    expect(presetForFps(25)).toBe("medium");
    expect(presetForFps(44.9)).toBe("medium");
    expect(presetForFps(45)).toBe("high");
  });
});

describe("FpsBenchmark", () => {
  it("needs both the frame count and the wall-time window", () => {
    let t = 0;
    const bench = new FpsBenchmark(() => t);
    // 90 frames in 100ms: frame count met, wall time not.
    for (let i = 0; i < BENCHMARK_MIN_FRAMES; i++) {
      t += 100 / BENCHMARK_MIN_FRAMES;
      bench.frame();
    }
    expect(bench.done()).toBe(false);
    expect(bench.result()).toBeNull();
    // Advance past the wall-time floor without new frames: still not done,
    // because the frame count was sampled over too short a window — the
    // benchmark keeps sampling until both hold at once.
    t += BENCHMARK_MIN_MS;
    expect(bench.done()).toBe(false);
  });

  it("reports mean fps over a realistic sample", () => {
    let t = 0;
    const bench = new FpsBenchmark(() => t);
    // 120 frames at 60fps = 2000ms.
    let finished = false;
    for (let i = 0; i < 120; i++) {
      t += 1000 / 60;
      finished = bench.frame();
    }
    expect(finished).toBe(true);
    expect(bench.done()).toBe(true);
    // The window spans frames-1 intervals: 120 frames at 16.67ms ≈ 60.5fps.
    expect(Math.abs(bench.result()! - 60)).toBeLessThan(1);
    expect(presetForFps(bench.result()!)).toBe("ultra");
  });

  it("a 20fps device benchmarks into Low", () => {
    let t = 0;
    const bench = new FpsBenchmark(() => t);
    for (let i = 0; i < 120; i++) {
      t += 1000 / 20;
      bench.frame();
    }
    expect(bench.done()).toBe(true);
    expect(presetForFps(bench.result()!)).toBe("low");
  });
});
