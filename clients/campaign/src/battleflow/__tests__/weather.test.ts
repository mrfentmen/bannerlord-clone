import { describe, expect, it } from "vitest";
import { weatherFor, weatherMultiplier, WEATHER_KINDS } from "../weather.js";

describe("battle weather effects (solo task 30)", () => {
  it("is deterministic per encounter", () => {
    expect(weatherFor("enc-1")).toEqual(weatherFor("enc-1"));
  });

  it("covers all weather kinds across many encounters", () => {
    const kinds = new Set(Array.from({ length: 200 }, (_, i) => weatherFor(`enc-${i}`).kind));
    for (const k of WEATHER_KINDS) expect(kinds.has(k)).toBe(true);
  });

  it("clear weather has no modifiers", () => {
    // Find a clear-weather encounter deterministically.
    let clear = null;
    for (let i = 0; i < 200 && !clear; i++) {
      const w = weatherFor(`clear-hunt-${i}`);
      if (w.kind === "clear") clear = w;
    }
    expect(clear).not.toBeNull();
    expect(clear!.modifiers).toHaveLength(0);
  });

  it("multiplier is 1 for unaffected targets", () => {
    const rain = { kind: "rain" as const, label: "Rain", description: "", modifiers: [{ target: "archers", effect: "", multiplier: 0.75 }] };
    expect(weatherMultiplier(rain, "infantry")).toBe(1);
    expect(weatherMultiplier(rain, "archers")).toBe(0.75);
  });

  it("stacks matching modifiers", () => {
    const fog = weatherFor("fog-hunt-0");
    if (fog.kind === "fog") {
      // archers get both the archer and the "all" modifier.
      expect(weatherMultiplier(fog, "archers")).toBeCloseTo(0.6 * 0.8, 5);
    }
  });
});
