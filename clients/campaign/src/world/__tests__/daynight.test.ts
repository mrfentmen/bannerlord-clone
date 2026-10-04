/**
 * Clock, day/night and weather tests.
 */
import { describe, expect, it } from "vitest";
import { GameClock } from "../clock.js";
import { DayNightCycle, SKIES, skyForHour } from "../daynight.js";
import { WeatherSystem } from "../weather.js";

describe("GameClock", () => {
  it("starts at the given hour and advances with the time scale", () => {
    const clock = new GameClock({ startHour: 9, timeScale: 60 });
    expect(clock.hourOfDay).toBeCloseTo(9, 5);
    clock.tick(60); // 1 real minute = 1 game hour
    expect(clock.hourOfDay).toBeCloseTo(10, 5);
  });

  it("wraps past midnight", () => {
    const clock = new GameClock({ startHour: 23, timeScale: 60 });
    clock.tick(120);
    expect(clock.hourOfDay).toBeCloseTo(1, 5);
    expect(clock.day).toBe(1);
  });

  it("knows night from day", () => {
    const clock = new GameClock({ startHour: 12 });
    expect(clock.isNight).toBe(false);
    clock.setTime(2);
    expect(clock.isNight).toBe(true);
  });

  it("serializes and restores", () => {
    const clock = new GameClock({ startHour: 9 });
    clock.tick(30);
    const saved = clock.serialize();
    const clock2 = new GameClock();
    clock2.deserialize(saved);
    expect(clock2.hourOfDay).toBeCloseTo(clock.hourOfDay, 5);
  });
});

describe("skyForHour", () => {
  it("maps the day to sky periods", () => {
    expect(skyForHour(12, false)).toBe("day");
    expect(skyForHour(6, false)).toBe("dawn");
    expect(skyForHour(18.5, false)).toBe("sunset");
    expect(skyForHour(23, false)).toBe("night");
    expect(skyForHour(3, false)).toBe("night");
  });

  it("overcast wins at any hour", () => {
    expect(skyForHour(12, true)).toBe("overcast");
    expect(skyForHour(23, true)).toBe("overcast");
  });

  it("every sky points at a real HDRI", () => {
    for (const period of ["dawn", "day", "sunset", "night", "overcast"] as const) {
      expect(SKIES[period].hdr).toMatch(/\.hdr$/);
      expect(SKIES[period].sunIntensity).toBeGreaterThan(0);
    }
    expect(SKIES.night.ambient).toBeLessThan(SKIES.day.ambient);
  });
});

describe("DayNightCycle", () => {
  it("fires onSkyChange at period boundaries", () => {
    const clock = new GameClock({ startHour: 7.9, timeScale: 60 });
    const changes: string[] = [];
    const cycle = new DayNightCycle(clock, (sky) => changes.push(sky.period));
    expect(cycle.currentPeriod).toBe("dawn");
    cycle.tick(30); // +30 game-minutes → 8:24, day
    expect(cycle.currentPeriod).toBe("day");
    expect(changes).toContain("day");
  });

  it("overcast flips the sky immediately", () => {
    const clock = new GameClock({ startHour: 12, timeScale: 60 });
    const changes: string[] = [];
    const cycle = new DayNightCycle(clock, (sky) => changes.push(sky.period));
    cycle.setOvercast(true);
    cycle.tick(1);
    expect(cycle.currentPeriod).toBe("overcast");
  });
});

describe("WeatherSystem", () => {
  it("starts clear and rolls weather over time", () => {
    // Deterministic rng: always picks the first non-self option.
    const rng = { next: () => 0.999 };
    const weather = new WeatherSystem(rng, "clear");
    expect(weather.current.kind).toBe("clear");
    weather.tick(900); // roll
    weather.tick(300); // blend
    expect(weather.current.kind).not.toBe("clear");
  });

  it("clear weather is neutral, storms hurt visibility and grip", () => {
    const clear = new WeatherSystem({ next: () => 0 }, "clear");
    expect(clear.visibility()).toBe(1);
    expect(clear.gripFactor()).toBe(1);
    expect(clear.witnessFactor()).toBe(1);
    const storm = new WeatherSystem({ next: () => 0 }, "storm");
    storm.tick(900);
    storm.tick(300);
    expect(storm.visibility()).toBeLessThan(0.65);
    expect(storm.gripFactor()).toBeLessThan(0.8);
    expect(storm.witnessFactor()).toBeLessThan(0.7);
    expect(storm.forcesOvercast).toBe(true);
  });

  it("fog is the visibility killer, not the grip killer", () => {
    const fog = new WeatherSystem({ next: () => 0 }, "fog");
    expect(fog.visibility()).toBeLessThan(0.6);
    expect(fog.gripFactor()).toBeGreaterThan(0.9);
  });
});
