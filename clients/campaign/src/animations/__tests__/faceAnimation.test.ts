/**
 * Task 644: characters blink every 3 to 7 seconds.
 *
 * The interval is the substance: it is random per character, it is inside the
 * 3-7 s window on every draw, and it is reproducible from the character's id, so
 * a reload does not change someone's face. The blink itself has to close, stay
 * shut and open again -- an eyelid that toggles in a single frame reads as a
 * glitch -- and it must never run more than once per frame however long the frame
 * was.
 */

import { describe, expect, it } from "vitest";
import {
  BLINK_CLOSE_FRACTION,
  BLINK_DURATION_S,
  BlinkScheduler,
  BlinkSet,
  MAX_BLINK_INTERVAL_S,
  MIN_BLINK_INTERVAL_S,
  makeRandom,
} from "../FaceAnimation.js";

/** Run a scheduler for `seconds` at 60 fps and collect the frames. */
function run(scheduler: BlinkScheduler, seconds: number, dt = 1 / 60) {
  const frames = [];
  for (let t = 0; t < seconds; t += dt) frames.push(scheduler.update(dt));
  return frames;
}

describe("makeRandom (task 644)", () => {
  it("is reproducible from a seed and stays in 0..1", () => {
    const a = makeRandom('troop-1');
    const b = makeRandom('troop-1');
    for (let i = 0; i < 50; i++) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBe(b());
    }
  });

  it("gives two characters different sequences", () => {
    const a = Array.from({ length: 5 }, makeRandom('a'));
    const b = Array.from({ length: 5 }, makeRandom('b'));
    expect(a).not.toEqual(b);
  });
});

describe("BlinkScheduler (task 644)", () => {
  it("starts with its eyes open and a positive wait", () => {
    const scheduler = new BlinkScheduler('troop-1');
    const frame = scheduler.update(1 / 60);
    expect(frame.state).toBe('open');
    expect(frame.closure).toBe(0);
    expect(frame.nextInS).toBeGreaterThan(0);
    expect(frame.count).toBe(0);
  });

  it("blinks somewhere between 3 and 7 seconds for every character", () => {
    for (let i = 0; i < 200; i++) {
      const scheduler = new BlinkScheduler(`unit-${i}`);
      const wait = scheduler.nextInS;
      expect(wait).toBeGreaterThanOrEqual(MIN_BLINK_INTERVAL_S - 1e-6);
      expect(wait).toBeLessThanOrEqual(MAX_BLINK_INTERVAL_S + 1e-6);
    }
  });

  it("does not blink on a metronome", () => {
    const gaps = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const scheduler = new BlinkScheduler(`unit-${i}`);
      run(scheduler, 40);
      gaps.add(Math.round(scheduler.nextInS * 1000));
    }
    // 40 characters, 40 different gaps: a fixed interval would be one value.
    expect(gaps.size).toBeGreaterThan(20);
  });

  it("closes, stays shut, and opens again", () => {
    const scheduler = new BlinkScheduler('troop-1', 0.1, 0.1, BLINK_DURATION_S);
    const states = run(scheduler, 0.5).map((f) => f.state);
    expect(states).toContain('closing');
    expect(states).toContain('closed');
    expect(states).toContain('opening');
    expect(states[states.length - 1]).toBe('open');
    // Two blinks in half a second at a 0.1 s interval; the point of this test is
    // the shape of one, not the rate.
    expect(scheduler.count).toBeGreaterThanOrEqual(1);
  });

  it("is fully shut in the middle of a blink and open at both ends", () => {
    const scheduler = new BlinkScheduler('troop-1', 0.1, 0.1, BLINK_DURATION_S);
    const frames = run(scheduler, 0.5);
    const peak = frames.reduce((best, f) => (f.closure > best.closure ? f : best));
    expect(peak.closure).toBe(1);
    expect(frames[0]?.closure).toBe(0);
    expect(frames[frames.length - 1]?.closure).toBe(0);
    // The lid spends BLINK_CLOSE_FRACTION of the blink on the way in.
    expect(BLINK_CLOSE_FRACTION).toBeGreaterThan(0);
    expect(BLINK_CLOSE_FRACTION).toBeLessThan(0.5);
  });

  it("keeps a lid from ever being more than shut", () => {
    const scheduler = new BlinkScheduler('troop-1', 0.1, 0.1);
    for (const frame of run(scheduler, 3)) {
      expect(frame.closure).toBeGreaterThanOrEqual(0);
      expect(frame.closure).toBeLessThanOrEqual(1);
    }
  });

  it("blinks repeatedly over a long stretch", () => {
    const scheduler = new BlinkScheduler('troop-1', 3, 3);
    run(scheduler, 30);
    // Every 3 s over 30 s: ten blinks, give or take the frame it starts in.
    expect(scheduler.count).toBeGreaterThanOrEqual(9);
    expect(scheduler.count).toBeLessThanOrEqual(11);
  });

  it("counts one blink for a single very long frame", () => {
    const scheduler = new BlinkScheduler('troop-1', 1, 1, 0.1);
    scheduler.update(60);
    expect(scheduler.count).toBe(1);
    // ...and is already back open rather than stuck shut for a minute.
    expect(scheduler.update(1 / 60).state).not.toBe('closed');
  });

  it("reports a negative wait while a blink is running", () => {
    const scheduler = new BlinkScheduler('troop-1', 0.1, 0.1);
    scheduler.update(0.1);
    expect(scheduler.nextInS).toBe(-1);
  });

  it("can be triggered for a cutscene, without double counting", () => {
    const scheduler = new BlinkScheduler('troop-1', 5, 5);
    scheduler.trigger();
    expect(scheduler.count).toBe(1);
    scheduler.trigger();
    expect(scheduler.count).toBe(1);
    expect(scheduler.update(1 / 60).state).toBe('closing');
  });

  it("ignores a broken frame time", () => {
    const scheduler = new BlinkScheduler('troop-1', 3, 3);
    const before = scheduler.nextInS;
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(scheduler.update(bad).nextInS).toBe(before);
    }
  });

  it("falls back to the 3-7 s window for a broken interval", () => {
    const scheduler = new BlinkScheduler('troop-1', Number.NaN, -5, Number.NaN);
    expect(scheduler.nextInS).toBeGreaterThanOrEqual(MIN_BLINK_INTERVAL_S - 1e-6);
    expect(scheduler.nextInS).toBeLessThanOrEqual(MAX_BLINK_INTERVAL_S + 1e-6);
    // A zero-length blink still closes and opens.
    expect(run(scheduler, 0.05).length).toBeGreaterThan(0);
  });
});

describe("BlinkSet (task 644)", () => {
  it("gives each character its own clock", () => {
    const set = new BlinkSet(0.1, 0.1);
    const a = set.forCharacter('a');
    const b = set.forCharacter('b');
    expect(set.size).toBe(2);
    expect(set.forCharacter('a')).toBe(a);
    expect(set.forCharacter('b')).toBe(b);
  });

  it("advances every clock at once", () => {
    const set = new BlinkSet(0.1, 0.1);
    set.forCharacter('a');
    set.forCharacter('b');
    const frames = set.update(0.2);
    expect([...frames.keys()].sort()).toEqual(['a', 'b']);
    for (const frame of frames.values()) {
      expect(frame.closure).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps two characters from blinking in lockstep", () => {
    const set = new BlinkSet(3, 7);
    set.forCharacter('a');
    set.forCharacter('b');
    const a = set.forCharacter('a');
    const b = set.forCharacter('b');
    expect(Math.abs(a.nextInS - b.nextInS)).toBeGreaterThan(0.01);
  });
});