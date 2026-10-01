/**
 * Performance budgets and quality scaler tests. MASTER_PLAN.md section 4F.
 *
 * Task 151: this file pins the budget numbers. It is the CI perf test: CI runs
 * vitest, so any commit that edits PERFORMANCE_BUDGETS breaks the build here
 * and forces the change to be deliberate.
 */

import { describe, expect, it, vi } from "vitest";
import {
  PERFORMANCE_BUDGETS,
  QUALITY_TIERS,
  createFpsMonitor,
  createQualityScaler,
  shouldEngageDrop,
  withinBudget,
} from "../performance.js";

describe("performance budgets (task 151)", () => {
  it("campaign map budget is 60fps on desktop", () => {
    expect(PERFORMANCE_BUDGETS.campaignMapFps).toBe(60);
  });

  it("1k-unit battle budget is 30fps on desktop", () => {
    expect(PERFORMANCE_BUDGETS.battleFps).toBe(30);
    expect(PERFORMANCE_BUDGETS.battleUnitCount).toBe(1000);
    expect(PERFORMANCE_BUDGETS.platform).toBe("desktop");
  });

  it("withinBudget compares measured fps against the budget", () => {
    expect(withinBudget(60, PERFORMANCE_BUDGETS.campaignMapFps)).toBe(true);
    expect(withinBudget(59.9, PERFORMANCE_BUDGETS.campaignMapFps)).toBe(false);
    expect(withinBudget(30, PERFORMANCE_BUDGETS.battleFps)).toBe(true);
    expect(withinBudget(29.5, PERFORMANCE_BUDGETS.battleFps)).toBe(false);
  });
});

describe("fps monitor", () => {
  it("reports 0 with no frames", () => {
    const monitor = createFpsMonitor();
    expect(monitor.averageFps()).toBe(0);
  });

  it("computes fps from frame deltas", () => {
    const monitor = createFpsMonitor();
    for (let i = 0; i < 60; i += 1) monitor.recordFrame(1000 / 60);
    expect(monitor.averageFps()).toBeCloseTo(60, 0);
  });

  it("keeps only the window", () => {
    const monitor = createFpsMonitor(1000);
    for (let i = 0; i < 60; i += 1) monitor.recordFrame(1000 / 60);
    // Two slow seconds push the fast second out of the window.
    for (let i = 0; i < 60; i += 1) monitor.recordFrame(1000 / 30);
    expect(monitor.averageFps()).toBeLessThan(40);
  });
});

describe("shouldEngageDrop", () => {
  it("needs a full sustained window below the floor", () => {
    expect(shouldEngageDrop([20, 20], 30, 3000)).toBe(false);
    expect(shouldEngageDrop([20, 20, 20], 30, 3000)).toBe(true);
  });

  it("a single healthy second resets the engagement", () => {
    expect(shouldEngageDrop([20, 20, 60], 30, 3000)).toBe(false);
  });

  it("fps at exactly the floor does not engage", () => {
    expect(shouldEngageDrop([30, 30, 30], 30, 3000)).toBe(false);
  });
});

describe("quality tiers", () => {
  it("steps high -> medium -> low, dropping shadows, LOD, and post-processing", () => {
    expect(QUALITY_TIERS.map((t) => t.name)).toEqual(["high", "medium", "low"]);
    const [high, medium, low] = QUALITY_TIERS;
    expect(high).toMatchObject({ shadows: true, lodBias: 1, postProcessing: true, renderScale: 1 });
    expect(medium!.lodBias).toBeLessThan(high!.lodBias);
    expect(low).toMatchObject({ shadows: false, postProcessing: false });
    expect(low!.lodBias).toBeLessThan(medium!.lodBias);
    expect(low!.renderScale).toBeLessThan(high!.renderScale);
  });
});

describe("quality scaler (task 152)", () => {
  /** Feeds `seconds` of frames at `fps` into the scaler. */
  function feed(scaler: { recordFrame(d: number): void }, seconds: number, fps: number): void {
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i += 1) scaler.recordFrame(1000 / fps);
  }

  it("starts at high quality", () => {
    const scaler = createQualityScaler({ onTierChange: () => undefined });
    expect(scaler.currentTier().name).toBe("high");
  });

  it("drops a tier within 3s of a sustained sub-30fps run", () => {
    const seen: string[] = [];
    const scaler = createQualityScaler({ onTierChange: (t) => seen.push(t.name) });
    feed(scaler, 3, 20);
    expect(scaler.currentTier().name).toBe("medium");
    expect(seen).toEqual(["medium"]);
  });

  it("does not drop on a brief dip", () => {
    const seen: string[] = [];
    const scaler = createQualityScaler({ onTierChange: (t) => seen.push(t.name) });
    feed(scaler, 2, 20);
    feed(scaler, 5, 60);
    expect(scaler.currentTier().name).toBe("high");
    expect(seen).toEqual([]);
  });

  it("keeps dropping toward low under sustained slowness", () => {
    const seen: string[] = [];
    const scaler = createQualityScaler({ onTierChange: (t) => seen.push(t.name) });
    feed(scaler, 3, 20);
    feed(scaler, 3, 20);
    expect(scaler.currentTier().name).toBe("low");
    expect(seen).toEqual(["medium", "low"]);
  });

  it("steps back up after a sustained healthy run", () => {
    const seen: string[] = [];
    const scaler = createQualityScaler({ onTierChange: (t) => seen.push(t.name) });
    feed(scaler, 3, 20);
    expect(scaler.currentTier().name).toBe("medium");
    // 11s: float accumulation in the synthetic feed can cost a window, so feed
    // a second of margin over the 10s the scaler requires.
    feed(scaler, 11, 60);
    expect(scaler.currentTier().name).toBe("high");
    expect(seen).toEqual(["medium", "high"]);
  });

  it("resetToHigh restores the top tier", () => {
    const onTierChange = vi.fn();
    const scaler = createQualityScaler({ onTierChange });
    feed(scaler, 3, 20);
    scaler.resetToHigh();
    expect(scaler.currentTier().name).toBe("high");
    expect(onTierChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "high" }),
    );
  });
});
