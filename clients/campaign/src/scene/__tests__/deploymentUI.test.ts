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
import { DeploymentUI, DEPLOY_SECONDS, formatCountdown } from "../BattleUI.js";
import type { DeploymentZone } from "../BattleUI.js";

const PLAYER_ZONE: DeploymentZone = { x: -20, z: 30, width: 24, depth: 12, faction: "player" };
const ENEMY_ZONE: DeploymentZone = { x: -20, z: -40, width: 24, depth: 12, faction: "enemy" };

function timerText(): string {
  return document.querySelector(".deploy-timer")?.textContent ?? "";
}

beforeEach(() => {
  document.body.innerHTML = "";
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
    vi.advanceTimersByTime(59_000);
    expect(timerText()).toBe("0:00");

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
    vi.advanceTimersByTime(30_000);
    expect(timerText()).toBe("0:00");

    ui.hide();
  });

  it("shows the default duration", () => {
    expect(DEPLOY_SECONDS).toBe(60);
  });
});