/**
 * Task 627: settlement windows light up at night and thin out through it.
 *
 * The behaviour that matters is the shape of the night: full at dusk, easing to
 * `lateNightFraction` at the deadest hour, back up at dawn, and nothing at all
 * in daylight -- across midnight, which is where a naive `hour > from && hour <
 * to` comparison falls apart. Windows are picked per id rather than at random,
 * so the same street at the same hour is the same street, and higher windows go
 * dark first.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NIGHT_POLICY,
  WINDOW_WARMTH_SPREAD,
  changedWindowCount,
  isNightHour,
  isWindowLit,
  litFractionAt,
  streetLightsAt,
  windowBrightness,
  windowLight,
  type WindowSpec,
} from "../WindowLights.js";

/** A street of windows, 0.5 m to 12 m up four buildings. */
function street(count = 40): WindowSpec[] {
  const windows: WindowSpec[] = [];
  for (let i = 0; i < count; i++) {
    windows.push({
      id: `b${i % 4}_w${i}`,
      buildingId: `b${i % 4}`,
      heightM: 0.5 + ((i * 7) % 24) / 2,
      brightness: 0.6,
    });
  }
  return windows;
}

describe("isNightHour (task 627)", () => {
  it("wraps over midnight", () => {
    expect(isNightHour(23)).toBe(true);
    expect(isNightHour(2)).toBe(true);
    expect(isNightHour(12)).toBe(false);
    expect(isNightHour(7)).toBe(false);
    // 18:30 is the boundary and belongs to the night.
    expect(isNightHour(18.5)).toBe(true);
    expect(isNightHour(18.4)).toBe(false);
    expect(isNightHour(5)).toBe(false);
    expect(isNightHour(4.9)).toBe(true);
  });

  it("normalises an out-of-range or broken hour", () => {
    expect(isNightHour(25)).toBe(isNightHour(1));
    expect(isNightHour(-1)).toBe(isNightHour(23));
    expect(isNightHour(Number.NaN)).toBe(false);
  });

  it("treats a policy with no daytime as all night", () => {
    expect(isNightHour(12, { ...DEFAULT_NIGHT_POLICY, lightsOnHour: 0, lightsOffHour: 0 })).toBe(true);
  });
});

describe("litFractionAt (task 627)", () => {
  it("is empty in daylight", () => {
    expect(litFractionAt(12)).toBe(0);
    expect(litFractionAt(6)).toBe(0);
  });

  it("is full at dusk and thins through the night", () => {
    expect(litFractionAt(18.5)).toBeCloseTo(1);
    const midnight = litFractionAt(0);
    const twoAm = litFractionAt(2);
    const fourAm = litFractionAt(4);
    expect(midnight).toBeLessThan(1);
    expect(twoAm).toBeLessThan(midnight);
    expect(fourAm).toBeLessThanOrEqual(twoAm);
    expect(fourAm).toBeGreaterThanOrEqual(DEFAULT_NIGHT_POLICY.lateNightFraction);
  });

  it("never leaves the 0..1 range, whatever policy it is given", () => {
    const absurd = { ...DEFAULT_NIGHT_POLICY, lateNightFraction: 5 };
    for (const hour of [0, 3, 12, 18.5, 23]) {
      const f = litFractionAt(hour, absurd);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe("window selection (task 627)", () => {
  it("lights the whole street at dusk and almost none at the deadest hour", () => {
    const windows = street();
    expect(windows.filter((w) => isWindowLit(w, 18.5)).length).toBe(windows.length);
    const deadest = windows.filter((w) => isWindowLit(w, 4.5)).length;
    expect(deadest).toBeLessThan(windows.length * 0.3);
    expect(deadest).toBeGreaterThan(0);
  });

  it("decides the same way every time for the same hour", () => {
    const windows = street();
    const first = streetLightsAt(windows, 23).map((l) => l.id);
    const second = streetLightsAt(windows, 23).map((l) => l.id);
    expect(second).toEqual(first);
  });

  it("lets higher windows go dark first", () => {
    const low = { id: 'low', buildingId: 'b', heightM: 1, brightness: 0.6 };
    const high = { id: 'high', buildingId: 'b', heightM: 11, brightness: 0.6 };
    let lowLit = 0;
    let highLit = 0;
    for (let i = 0; i < 40; i++) {
      const hour = 19 + i * 0.25;
      if (isWindowLit(low, hour)) lowLit++;
      if (isWindowLit(high, hour)) highLit++;
    }
    expect(lowLit).toBeGreaterThanOrEqual(highLit);
  });

  it("gives a lit window a brightness, a warmth and a building", () => {
    const lit = windowLight({ id: 'w1', buildingId: 'b1', heightM: 3, brightness: 0.8 }, 18.5);
    expect(lit).not.toBeNull();
    expect(lit?.id).toBe('w1');
    expect(lit?.buildingId).toBe('b1');
    expect(lit?.intensity).toBeLessThanOrEqual(1);
    expect(lit?.warmth).toBeGreaterThanOrEqual(0);
    expect(lit?.warmth).toBeLessThanOrEqual(WINDOW_WARMTH_SPREAD);
  });

  it("returns null for a dark window", () => {
    expect(windowLight({ id: 'w1', buildingId: 'b1', heightM: 3, brightness: 0.8 }, 12)).toBeNull();
  });

  it("boosts only a few windows, and never past full brightness", () => {
    const windows = street(80).map((w) => ({ ...w, brightness: 0.95 }));
    const lights = streetLightsAt(windows, 18.5);
    const boosted = lights.filter((l) => l.intensity > 0.95);
    expect(boosted.length).toBeGreaterThan(0);
    expect(boosted.length).toBeLessThan(windows.length * DEFAULT_NIGHT_POLICY.landmarkFraction * 3);
    expect(lights.every((l) => l.intensity <= 1)).toBe(true);
  });

  it("clamps a broken brightness instead of emitting a negative intensity", () => {
    for (const brightness of [-1, 0, Number.NaN]) {
      const lit = windowLight({ id: 'x', buildingId: 'b', heightM: 1, brightness }, 18.5);
      expect(lit?.intensity).toBeGreaterThanOrEqual(0);
    }
  });

  it("says how many windows changed between two hours", () => {
    const windows = street();
    expect(changedWindowCount(windows, 18.5, 18.5)).toBe(0);
    const changed = changedWindowCount(windows, 18.5, 4.5);
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(windows.length);
    // Daylight ends the night, so every window changes at once.
    expect(changedWindowCount(windows, 18.5, 12)).toBe(windows.length);
  });

  it("spreads authored brightness around the base value", () => {
    const values = street(30).map((w) => windowBrightness(0.6, w.id));
    expect(Math.min(...values)).toBeLessThan(0.6);
    expect(Math.max(...values)).toBeGreaterThan(0.6);
    expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("handles an empty street", () => {
    expect(streetLightsAt([], 22)).toEqual([]);
    expect(changedWindowCount([], 19, 4)).toBe(0);
  });
});