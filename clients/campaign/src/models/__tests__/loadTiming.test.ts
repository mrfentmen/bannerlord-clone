/**
 * Task 623: model load times are measured and the slow ones are named.
 *
 * The clock is injected, so every assertion here is exact rather than
 * approximate: a 1.2 s load crosses the 1 s budget and warns once, ending the
 * same load twice throws rather than double-counting, and `slowest()` is what a
 * debug overlay reads -- an average over a preload pass hides one slow building
 * among thirty instant props.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SLOW_LOAD_MS,
  LoadTimer,
  formatBytes,
} from "../LoadTiming.js";

/** A clock a test drives by hand. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("LoadTimer (task 623)", () => {
  it("measures one load between begin and end", () => {
    const clock = fakeClock();
    const timer = new LoadTimer({ now: clock.now, onWarn: () => {} });
    const load = timer.begin('humvee');
    clock.advance(120);
    expect(load.end()).toEqual({ id: 'humvee', durationMs: 120 });
    expect(timer.count()).toBe(1);
    expect(timer.totalMs()).toBe(120);
    expect(timer.meanMs()).toBe(120);
  });

  it("carries the byte size through when the caller knew it", () => {
    const clock = fakeClock();
    const timer = new LoadTimer({ now: clock.now, onWarn: () => {} });
    timer.begin('humvee', 916 * 1024).end();
    timer.begin('crate').end();
    expect(timer.all()).toEqual([
      { id: 'humvee', durationMs: 0, bytes: 916 * 1024 },
      { id: 'crate', durationMs: 0 },
    ]);
  });

  it("warns once about a load over the budget, naming it", () => {
    const clock = fakeClock();
    const onWarn = vi.fn();
    const timer = new LoadTimer({ now: clock.now, onWarn });
    const load = timer.begin('skyscraper', 20 * 1024 * 1024);
    clock.advance(DEFAULT_SLOW_LOAD_MS + 200);
    load.end();
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn.mock.calls[0]?.[0]).toBe(
      'ModelLoader: "skyscraper" took 1200 ms, 20 MB (over the 1000 ms budget)',
    );
  });

  it("says nothing about a load inside the budget", () => {
    const clock = fakeClock();
    const onWarn = vi.fn();
    const timer = new LoadTimer({ now: clock.now, onWarn });
    const load = timer.begin('sandbags');
    clock.advance(DEFAULT_SLOW_LOAD_MS);
    load.end();
    expect(onWarn).not.toHaveBeenCalled();
  });

  it("honours a custom budget and rejects a broken one", () => {
    const clock = fakeClock();
    const onWarn = vi.fn();
    const fast = new LoadTimer({ now: clock.now, onWarn, slowThresholdMs: 100 });
    const load = fast.begin('crate');
    clock.advance(150);
    load.end();
    expect(onWarn).toHaveBeenCalledTimes(1);

    const broken = new LoadTimer({ now: clock.now, onWarn: () => {}, slowThresholdMs: Number.NaN });
    const second = broken.begin('crate');
    clock.advance(150);
    second.end();
    expect(broken.slowest(1)[0]?.durationMs).toBe(150);
  });

  it("throws when a load is ended twice rather than counting it twice", () => {
    const timer = new LoadTimer({ now: fakeClock().now, onWarn: () => {} });
    const load = timer.begin('humvee');
    load.end();
    expect(() => load.end()).toThrow(/ended twice/);
    expect(timer.count()).toBe(1);
  });

  it("never reports a negative duration if the clock jumps backwards", () => {
    let t = 1000;
    const timer = new LoadTimer({ now: () => t, onWarn: () => {} });
    const load = timer.begin('a');
    t = 0;
    expect(load.end().durationMs).toBe(0);
  });

  it("sorts the slowest loads first, which is what an overlay needs", () => {
    const clock = fakeClock();
    const timer = new LoadTimer({ now: clock.now, onWarn: () => {} });
    for (const [id, ms] of [['a', 30], ['b', 900], ['c', 120]] as const) {
      const load = timer.begin(id);
      clock.advance(ms);
      load.end();
    }
    expect(timer.slowest(2).map((s) => s.id)).toEqual(['b', 'c']);
    expect(timer.meanMs()).toBeCloseTo(350);
    expect(timer.slowest(0)).toEqual([]);
    expect(timer.slowest(-1)).toEqual([]);
  });

  it("summarises a session in one line", () => {
    const clock = fakeClock();
    const timer = new LoadTimer({ now: clock.now, onWarn: () => {} });
    expect(timer.summary()).toBe('models: none loaded');
    const a = timer.begin('a', 1024);
    clock.advance(100);
    a.end();
    const b = timer.begin('b', 2 * 1024 * 1024);
    clock.advance(900);
    b.end();
    expect(timer.summary()).toBe(
      'models: 2 loaded in 1000 ms (mean 500 ms, 2 MB), slowest "b" 900 ms',
    );
  });

  it("accepts a sample measured elsewhere and drops a broken one", () => {
    const timer = new LoadTimer({ onWarn: () => {} });
    timer.record({ id: 'x', durationMs: 50 });
    timer.record({ id: 'y', durationMs: Number.NaN });
    timer.record({ id: 'z', durationMs: -20 });
    expect(timer.all().map((s) => [s.id, s.durationMs])).toEqual([
      ['x', 50],
      ['z', 0],
    ]);
  });

  it("clears its samples", () => {
    const timer = new LoadTimer({ onWarn: () => {} });
    timer.record({ id: 'x', durationMs: 10 });
    timer.clear();
    expect(timer.count()).toBe(0);
    expect(timer.summary()).toBe('models: none loaded');
  });

  it("defaults to a console warning only when one was not supplied", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let t = 0;
    const timer = new LoadTimer({ now: () => t });
    const load = timer.begin('slow');
    t = 5000;
    load.end();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("formats byte counts for a log line", () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1_572_864)).toBe('1.5 MB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB');
  });
});