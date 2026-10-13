/**
 * Task 622: models are released when the device says it is short of memory.
 *
 * The eviction order is the substance here. It is least-recently-used with bytes
 * as the tie-break, visible models are excluded outright rather than sorted to
 * the end, and a platform event with no byte figure still frees a fixed 32 MB.
 * The plan is returned rather than executed, so the scene tears down its own
 * nodes, and the watcher cooldown stops a repeated event from re-planning an
 * eviction that has already happened.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EVENT_TARGET_BYTES,
  DEFAULT_MAX_EVICTIONS,
  PressureWatcher,
  applyEvictionPlan,
  evictUnderPressure,
  type DisposableModel,
} from "../MemoryPressure.js";

function model(id: string, bytes: number, visible: boolean, lastUsedAt: number): DisposableModel {
  return { id, bytes, visible, lastUsedAt };
}

describe("evictUnderPressure (task 622)", () => {
  it("evicts least-recently-used first", () => {
    const models = [
      model('newest', 10, false, 300),
      model('oldest', 10, false, 100),
      model('middle', 10, false, 200),
    ];
    const plan = evictUnderPressure(models, { shortfallBytes: 10 });
    expect(plan.evict).toEqual(['oldest']);
    expect(plan.reclaimedBytes).toBe(10);
    expect(plan.targetBytes).toBe(10);
  });

  it("keeps going until the shortfall is covered", () => {
    const models = [
      model('a', 1000, false, 100),
      model('b', 1000, false, 200),
      model('c', 1000, false, 300),
    ];
    const plan = evictUnderPressure(models, { shortfallBytes: 2500 });
    expect(plan.evict).toEqual(['a', 'b', 'c']);
    expect(plan.reclaimedBytes).toBe(3000);
  });

  it("breaks a same-frame tie by size, biggest first", () => {
    const models = [
      model('small', 10, false, 100),
      model('large', 900, false, 100),
    ];
    expect(evictUnderPressure(models, { shortfallBytes: 950 }).evict).toEqual(['large', 'small']);
  });

  it("never evicts a model that is on screen", () => {
    const models = [
      model('infront', 5000, true, 1),
      model('behind', 10, false, 100),
      model('culled', 10, false, 200),
    ];
    const plan = evictUnderPressure(models, { shortfallBytes: 10_000 });
    expect(plan.evict).not.toContain('infront');
    expect(plan.protectedIds).toEqual(['infront']);
    // With only two eligible models, both go and the shortfall stays unmet.
    expect(plan.evict).toEqual(['behind', 'culled']);
    expect(plan.reclaimedBytes).toBe(20);
  });

  it("acts on a platform event that names no figure", () => {
    const models = Array.from({ length: 4 }, (_, i) => model(`m${i}`, 8 * 1024 * 1024, false, i));
    const plan = evictUnderPressure(models, { event: true });
    expect(plan.fromEvent).toBe(true);
    expect(plan.targetBytes).toBe(DEFAULT_EVENT_TARGET_BYTES);
    expect(plan.evict).toHaveLength(4);
    expect(plan.reclaimedBytes).toBeGreaterThanOrEqual(DEFAULT_EVENT_TARGET_BYTES);
  });

  it("honours a custom event target", () => {
    const models = [model('a', 1000, false, 1), model('b', 1000, false, 2)];
    expect(evictUnderPressure(models, { event: true }, { eventTargetBytes: 1500 }).evict).toEqual(['a', 'b']);
    // A target larger than everything cached still frees everything there is,
    // and a broken override falls back to the 32 MB default rather than to 0.
    expect(
      evictUnderPressure(models, { event: true }, { eventTargetBytes: 0 }).evict,
    ).toEqual(['a', 'b']);
  });

  it("caps one response at the eviction limit", () => {
    const models = Array.from({ length: 40 }, (_, i) => model(`m${i}`, 10, false, i));
    expect(evictUnderPressure(models, { shortfallBytes: 1e9 }).evict).toHaveLength(
      DEFAULT_MAX_EVICTIONS,
    );
    expect(evictUnderPressure(models, { shortfallBytes: 1e9 }, { maxEvictions: 3 }).evict).toHaveLength(3);
    // A broken cap falls back to the default rather than evicting everything.
    expect(
      evictUnderPressure(models, { shortfallBytes: 1e9 }, { maxEvictions: -1 }).evict,
    ).toHaveLength(DEFAULT_MAX_EVICTIONS);
  });

  it("evicts a fixed batch when the signal says nothing usable", () => {
    const models = [model('a', 10, false, 1), model('b', 10, false, 2)];
    expect(evictUnderPressure(models, {})).toEqual({
      evict: [],
      reclaimedBytes: 0,
      protectedIds: [],
      targetBytes: 0,
      fromEvent: false,
    });
    expect(evictUnderPressure(models, { shortfallBytes: Number.NaN }).evict).toEqual([]);
  });

  it("ignores a negative byte count on a model instead of subtracting it", () => {
    const models = [model('a', -500, false, 1), model('b', 100, false, 2)];
    const plan = evictUnderPressure(models, { event: true }, { eventTargetBytes: 50 });
    expect(plan.evict).toEqual(['a', 'b']);
    expect(plan.reclaimedBytes).toBe(100);
  });

  it("does nothing for a shortfall of zero", () => {
    const models = [model('a', 5000, false, 1)];
    expect(evictUnderPressure(models, { shortfallBytes: 0 }).evict).toEqual([]);
    expect(evictUnderPressure(models, { shortfallBytes: -100 }).evict).toEqual([]);
  });

  it("does nothing when there is nothing cached", () => {
    expect(evictUnderPressure([], { shortfallBytes: 1000 }).evict).toEqual([]);
  });
});

describe("applyEvictionPlan (task 622)", () => {
  it("disposes each model in the plan exactly once", () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const models: DisposableModel[] = [
      { ...model('a', 10, false, 1), dispose: disposeA },
      { ...model('b', 10, false, 2), dispose: disposeB },
    ];
    const plan = evictUnderPressure(models, { shortfallBytes: 20 });
    expect(applyEvictionPlan(models, plan)).toEqual(['a', 'b']);
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });

  it("skips a model the caller already freed, and one with no dispose", () => {
    const disposeA = vi.fn();
    const models: DisposableModel[] = [
      { ...model('a', 10, false, 1), dispose: disposeA },
      model('b', 10, false, 2),
    ];
    const released = applyEvictionPlan(models, { evict: ['a', 'b', 'gone'], reclaimedBytes: 20, protectedIds: [], targetBytes: 20, fromEvent: false });
    expect(released).toEqual(['a', 'b']);
    expect(disposeA).toHaveBeenCalledTimes(1);
  });

  it("does not dispose a protected model even if it is named", () => {
    const dispose = vi.fn();
    const models: DisposableModel[] = [{ ...model('visible', 10, true, 1), dispose }];
    applyEvictionPlan(models, { evict: ['visible'], reclaimedBytes: 10, protectedIds: ['visible'], targetBytes: 10, fromEvent: false });
    expect(dispose).toHaveBeenCalledTimes(0);
  });
});

describe("PressureWatcher (task 622)", () => {
  it("acts once per cooldown window", () => {
    let clock = 1_000;
    const watcher = new PressureWatcher(5000, () => clock);
    const models = [model('a', 10, false, 1)];

    expect(watcher.consider(models, { shortfallBytes: 10 })?.evict).toEqual(['a']);
    clock += 1000;
    expect(watcher.consider(models, { shortfallBytes: 10 })).toBeNull();
    clock += 4500;
    expect(watcher.consider(models, { shortfallBytes: 10 })?.evict).toEqual(['a']);
  });

  it("reports how long since the last plan and can be reset", () => {
    let clock = 0;
    const watcher = new PressureWatcher(1000, () => clock);
    const models = [model('a', 10, false, 1)];
    expect(watcher.sinceLastPlan()).toBeNull();
    watcher.consider(models, { shortfallBytes: 10 });
    clock += 250;
    expect(watcher.sinceLastPlan()).toBe(250);
    expect(watcher.consider(models, { shortfallBytes: 10 })).toBeNull();
    watcher.reset();
    expect(watcher.sinceLastPlan()).toBeNull();
    expect(watcher.consider(models, { shortfallBytes: 10 })).not.toBeNull();
  });
});