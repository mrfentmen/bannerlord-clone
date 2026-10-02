/**
 * Deployment overlay (Buffy tasks 6-17).
 *
 * The overlay is the player's whole view of the deployment phase, so these tests
 * drive the real class against a real DOM: the countdown is checked with fake
 * timers because a 60 second test is not a test, and every panel the header grows
 * is read back out of the document rather than out of a private field, because
 * what the player can read is the only thing that counts.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeploymentUI, DEPLOY_SECONDS, factionColor, formatCountdown } from "../BattleUI.js";
import type { DeploymentZone } from "../BattleUI.js";
import { factionPalette } from "../../design/factions.js";
import { BANNER_COLORS } from "../../clan/bannerPalette.js";

const PLAYER_ZONE: DeploymentZone = { x: -20, z: 30, width: 24, depth: 12, faction: "player" };
const ENEMY_ZONE: DeploymentZone = { x: -20, z: -40, width: 24, depth: 12, faction: "enemy" };

function timerText(): string {
  return document.querySelector(".deploy-timer")?.textContent ?? "";
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-colorblind-mode");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatCountdown", () => {
  it("renders minutes and zero-padded seconds", () => {
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(90)).toBe("1:30");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("never shows a negative time, because a countdown below zero is a bug in the UI", () => {
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("deployment countdown (task 6)", () => {
  it("starts at a minute and counts down once a second", () => {
    vi.useFakeTimers();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE, ENEMY_ZONE], () => {});

    expect(timerText()).toBe("1:00");
    vi.advanceTimersByTime(1000);
    expect(timerText()).toBe("0:59");
    // The last tick is where the phase ends (task 8), so the visible run stops at 0:01.
    vi.advanceTimersByTime(58_000);
    expect(timerText()).toBe("0:01");

    ui.hide();
  });

  it("stops on hide, leaving no interval running", () => {
    vi.useFakeTimers();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});
    ui.hide();

    // Nothing is left to write to, and the timer count proves nothing ticked.
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(document.querySelector(".deploy-timer")).toBeNull();
  });

  it("takes an explicit duration", () => {
    vi.useFakeTimers();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});
    ui.startCountdown(30);

    expect(timerText()).toBe("0:30");
    vi.advanceTimersByTime(29_000);
    expect(timerText()).toBe("0:01");

    ui.hide();
  });

  it("shows the default duration", () => {
    expect(DEPLOY_SECONDS).toBe(60);
  });
});

describe("ready control per side (task 7)", () => {
  it("gives the player a real Ready button that ends the phase", () => {
    const onComplete = vi.fn();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE, ENEMY_ZONE], onComplete);

    const btn = document.querySelector<HTMLButtonElement>(".deploy-side--player .deploy-ready");
    expect(btn).not.toBeNull();
    expect(btn?.tagName).toBe("BUTTON");
    expect(btn?.textContent).toBe("Ready");

    btn?.click();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".battle-deployment")).toBeNull();

    ui.hide();
  });

  it("shows the enemy as already ready, because the AI never waits", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE, ENEMY_ZONE], () => {});

    const ai = document.querySelector(".deploy-side--enemy .deploy-ready--ai");
    expect(ai).not.toBeNull();
    expect(ai?.tagName).not.toBe("BUTTON");
    expect(ai?.textContent).toContain("Ready");
    // The glyph is decorative; the text beside it is what a screen reader reads.
    expect(ai?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(ai?.textContent).toContain("computer controlled");

    ui.hide();
  });

  it("offers exactly one action: the enemy side is not a control", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE, ENEMY_ZONE], () => {});

    expect(document.querySelectorAll("button")).toHaveLength(1);

    ui.hide();
  });
});

describe("auto-start when time runs out (task 8)", () => {
  it("ends the phase when the countdown reaches zero", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE, ENEMY_ZONE], onComplete);

    vi.advanceTimersByTime(60_000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".battle-deployment")).toBeNull();
    // Nothing is left running: the interval went with the overlay.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fires once, not once per tick at zero", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], onComplete);

    vi.advanceTimersByTime(500_000);
    expect(onComplete).toHaveBeenCalledTimes(1);

    ui.hide();
  });

  it("does not start the battle twice if the player pressed Ready first", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], onComplete);

    vi.advanceTimersByTime(30_000);
    document.querySelector<HTMLButtonElement>(".deploy-ready")?.click();
    expect(onComplete).toHaveBeenCalledTimes(1);

    // A second Ready press, and the rest of the countdown, must not add another.
    document.querySelector<HTMLButtonElement>(".deploy-ready")?.click();
    vi.advanceTimersByTime(60_000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("starts fresh when shown again", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], first);
    vi.advanceTimersByTime(60_000);
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    ui.show([PLAYER_ZONE], second);
    expect(timerText()).toBe("1:00");
    vi.advanceTimersByTime(60_000);
    expect(second).toHaveBeenCalledTimes(1);

    ui.hide();
  });
});

describe("unit count (task 9)", () => {
  it("states how many of the army are placed", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE, ENEMY_ZONE], () => {});

    ui.updateCount(12, 20);
    expect(document.querySelector(".deploy-count")?.textContent).toBe("12/20 placed");

    ui.updateCount(20, 20);
    expect(document.querySelector(".deploy-count")?.textContent).toBe("20/20 placed");

    ui.hide();
  });

  it("says nothing until the scene reports a count", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});

    expect(document.querySelector(".deploy-count")?.textContent).toBe("");

    ui.hide();
  });

  it("does not throw once the overlay is gone", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});
    ui.hide();

    expect(() => ui.updateCount(3, 10)).not.toThrow();
  });
});
describe("faction banner (task 12)", () => {
  it("names the player's faction in the header strip", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE, ENEMY_ZONE], () => {}, { playerFaction: "Pacific Compact" });

    const banner = document.querySelector(".deploy-info .deploy-banner");
    expect(banner).not.toBeNull();
    expect(banner?.querySelector(".deploy-banner__name")?.textContent).toBe("Pacific Compact");

    ui.hide();
  });

  it("puts the banner in the strip, not beside the instructions", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {}, { playerFaction: "Pacific Compact" });

    expect(document.querySelector(".deploy-info")).toBe(
      document.querySelector(".deploy-banner")?.parentElement,
    );

    ui.hide();
  });

  it("shows nothing when no faction was given", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});

    expect(document.querySelector(".deploy-banner")).toBeNull();
    expect(document.querySelector(".deploy-info")?.childElementCount).toBe(0);

    ui.hide();
  });

  it("takes the cloth from the locked faction palette for a playable side", () => {
    expect(factionColor("Pacific Compact")).toBe(factionPalette("off")["pacific-compact"].color);
    expect(factionColor("  mountain alliance ")).toBe(factionPalette("off")["mountain-alliance"].color);
  });

  it("follows the active colour-blind mode", () => {
    document.documentElement.setAttribute("data-colorblind-mode", "deuteranopia");
    expect(factionColor("Pacific Compact")).toBe(factionPalette("deuteranopia")["pacific-compact"].color);
  });

  it("falls back to the locked clan-banner palette for a name that is not a side", () => {
    const color = factionColor("Ironclaw Band");
    expect(BANNER_COLORS).toContain(color);
    // The same name always gets the same cloth, or a clan changes colour per battle.
    expect(factionColor("Ironclaw Band")).toBe(color);
    expect(factionColor("Nightjar Company")).not.toBe(color);
  });

  it("never invents a colour: every value comes from a locked palette", () => {
    const colors = ["Pacific Compact", "Atlantic Corridor", "Wanderer", "", "unmapped clan"].map(factionColor);
    const palette = new Set<string>([...BANNER_COLORS, ...Object.values(factionPalette("off")).map((s) => s.color)]);
    for (const color of colors) expect(palette.has(color)).toBe(true);
  });
});

describe("terrain name (task 13)", () => {
  it("names the ground in the same strip as the banner", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {}, { playerFaction: "Pacific Compact", terrainName: "Dry Fork" });

    const strip = document.querySelector(".deploy-info");
    const terrain = document.querySelector(".deploy-terrain");
    expect(terrain?.textContent).toBe("Dry Fork");
    expect(terrain?.parentElement).toBe(strip);
    expect(document.querySelector(".deploy-banner")?.parentElement).toBe(strip);

    ui.hide();
  });

  it("shows the terrain on its own when there is no banner", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {}, { terrainName: "Dry Fork" });

    expect(document.querySelector(".deploy-banner")).toBeNull();
    expect(document.querySelector(".deploy-terrain")?.textContent).toBe("Dry Fork");

    ui.hide();
  });

  it("shows neither when neither was given", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});

    expect(document.querySelector(".deploy-terrain")).toBeNull();

    ui.hide();
  });
});

describe("weather (task 14)", () => {
  it("gives each weather a glyph and a word", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {}, { weather: "rain" });

    const chip = document.querySelector(".deploy-weather");
    expect(chip?.querySelector(".deploy-weather__glyph")?.textContent).toBe("☂");
    expect(chip?.querySelector(".deploy-weather__label")?.textContent).toBe("Rain");

    ui.hide();
  });

  it("names the whole chip for a screen reader, glyph excluded", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {}, { weather: "fog" });

    const chip = document.querySelector(".deploy-weather");
    expect(chip?.getAttribute("role")).toBe("img");
    expect(chip?.getAttribute("aria-label")).toBe("Weather: Fog");
    expect(chip?.querySelector('[aria-hidden="true"]')).not.toBeNull();

    ui.hide();
  });

  it("covers every kind the info object accepts", () => {
    const seen = ["clear", "rain", "fog"] as const;
    for (const kind of seen) {
      const ui = new DeploymentUI();
      ui.show([PLAYER_ZONE], () => {}, { weather: kind });
      const chip = document.querySelector(".deploy-weather");
      expect(chip?.getAttribute("aria-label")).toMatch(/^Weather: /);
      expect(chip?.textContent?.replace("Weather: ", "").length).toBeGreaterThan(1);
      ui.hide();
    }
  });

  it("shares the strip with the banner and the terrain", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {}, {
      playerFaction: "Pacific Compact",
      terrainName: "Dry Fork",
      weather: "clear",
    });

    const strip = document.querySelector(".deploy-info");
    for (const selector of [".deploy-banner", ".deploy-terrain", ".deploy-weather"]) {
      expect(document.querySelector(selector)?.parentElement).toBe(strip);
    }

    ui.hide();
  });

  it("shows no chip when the sky was not reported", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});

    expect(document.querySelector(".deploy-weather")).toBeNull();

    ui.hide();
  });
});

describe("time of day (task 15)", () => {
  it("shows the time of day in the same strip", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {}, {
      playerFaction: "Pacific Compact",
      terrainName: "Dry Fork",
      weather: "clear",
      timeOfDay: "dusk",
    });

    const strip = document.querySelector(".deploy-info");
    const chip = document.querySelector(".deploy-time");
    expect(chip?.parentElement).toBe(strip);
    expect(chip?.getAttribute("aria-label")).toBe("Time of day: Dusk");
    expect(chip?.querySelector('[aria-hidden="true"]')?.textContent).toBe("◓");

    ui.hide();
  });

  it("gives every time of day its own shape, because the chip carries no word", () => {
    const glyphs: string[] = [];
    for (const time of ["dawn", "day", "dusk", "night"] as const) {
      const ui = new DeploymentUI();
      ui.show([PLAYER_ZONE], () => {}, { timeOfDay: time });
      glyphs.push(document.querySelector(".deploy-time__glyph")?.textContent ?? "");
      ui.hide();
    }
    expect(glyphs.every((glyph) => glyph.length > 0)).toBe(true);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("names each time of day differently for a screen reader", () => {
    const labels: string[] = [];
    for (const time of ["dawn", "day", "dusk", "night"] as const) {
      const ui = new DeploymentUI();
      ui.show([PLAYER_ZONE], () => {}, { timeOfDay: time });
      labels.push(document.querySelector(".deploy-time")?.getAttribute("aria-label") ?? "");
      ui.hide();
    }
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.startsWith("Time of day: ")).toBe(true);
  });

  it("shows no chip when the light was not reported", () => {
    const ui = new DeploymentUI();
    ui.show([PLAYER_ZONE], () => {});

    expect(document.querySelector(".deploy-time")).toBeNull();

    ui.hide();
  });
});
