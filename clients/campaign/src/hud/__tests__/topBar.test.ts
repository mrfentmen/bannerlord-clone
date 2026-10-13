/**
 * Task 21: the HUD top bar.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopBar } from "../topBar.js";
import { weatherFor } from "../../battleflow/weather.js";

function fakeClock(): () => number {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  return () => Date.now();
}

function text(root: HTMLElement, testId: string): string {
  return root.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hud top bar", () => {
  it("shows the battle name, the weather and the clock in one strip", () => {
    const bar = createTopBar({ battleName: "Vlandia vs Western Empire", weather: weatherFor("enc-1") });
    document.body.append(bar.root);

    expect(text(bar.root, "hud-topbar-name")).toBe("Vlandia vs Western Empire");
    expect(bar.root.tagName).toBe("HEADER");
    expect(bar.root.getAttribute("role")).toBe("banner");

    bar.destroy();
  });

  it("names the weather in words, from the same BattleWeather the simulation uses", () => {
    // Same encounter id, same sky: the bar must not hold a second weather table.
    const weather = weatherFor("enc-rainy-1");
    const bar = createTopBar({ battleName: "A vs B", weather });
    document.body.append(bar.root);

    expect(text(bar.root, "hud-topbar-weather")).toBe(weather.label);
    const chip = bar.root.querySelector(".hud-topbar__weather");
    expect(chip?.getAttribute("aria-label")).toBe(`Weather: ${weather.label}`);
    // The glyph is decorative, so it is hidden from assistive tech.
    expect(bar.root.querySelector(".hud-topbar__weather-glyph")?.getAttribute("aria-hidden")).toBe("true");

    bar.destroy();
  });

  it("carries the reused battle timer and lets the caller start it", () => {
    const now = fakeClock();
    const bar = createTopBar({ battleName: "A vs B", weather: weatherFor("enc-1"), now });
    document.body.append(bar.root);

    expect(text(bar.root, "battle-timer-value")).toBe("00:00");
    bar.timer.start();
    vi.advanceTimersByTime(65_000);
    expect(text(bar.root, "battle-timer-value")).toBe("01:05");

    bar.destroy();
  });

  it("destroy stops the embedded clock and removes the strip", () => {
    const now = fakeClock();
    const bar = createTopBar({ battleName: "A vs B", weather: weatherFor("enc-1"), now });
    document.body.append(bar.root);
    bar.timer.start();
    bar.destroy();

    expect(bar.root.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});