/**
 * Task 38: HUD battle timer. Starts at 00:00, ticks mm:ss, grows past 59
 * minutes instead of wrapping, freezes on stop, and clears its interval on
 * destroy.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBattleTimer, formatClock } from "../battleTimer.js";

/** Only the clock timers are faked; `Date` moves with them. */
function useFakeClock(): void {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
}

function value(host: HTMLElement): string {
  return host.querySelector('[data-testid="battle-timer-value"]')?.textContent ?? "";
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatClock", () => {
  it("pads mm:ss and lets minutes grow past 59", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(9_400)).toBe("00:09");
    expect(formatClock(95_000)).toBe("01:35");
    expect(formatClock(3_599_000)).toBe("59:59");
    expect(formatClock(3_600_000)).toBe("60:00");
  });

  it("clamps a negative clock to zero rather than printing a minus sign", () => {
    expect(formatClock(-1)).toBe("00:00");
  });
});

describe("battle timer", () => {
  it("starts at 00:00 and ticks once a second", () => {
    useFakeClock();
    const timer = createBattleTimer();
    document.body.append(timer.root);

    expect(value(timer.root)).toBe("00:00");
    timer.start();
    vi.advanceTimersByTime(1_000);
    expect(value(timer.root)).toBe("00:01");
    vi.advanceTimersByTime(64_000);
    expect(value(timer.root)).toBe("01:05");
    expect(timer.elapsedMs()).toBe(65_000);

    timer.destroy();
  });

  it("reads the wall clock on each tick, so a delayed tick does not drift", () => {
    useFakeClock();
    let clock = 0;
    const timer = createBattleTimer({ now: () => clock });
    document.body.append(timer.root);

    timer.start();
    clock = 5_000; // five seconds pass while the tab is throttled and no tick fires
    vi.advanceTimersByTime(1_000); // the next tick arrives and reads the clock
    expect(value(timer.root)).toBe("00:05");

    timer.destroy();
  });

  it("freezes the readout on stop and clears the interval", () => {
    useFakeClock();
    const timer = createBattleTimer();
    document.body.append(timer.root);

    timer.start();
    vi.advanceTimersByTime(12_000);
    timer.stop();
    expect(value(timer.root)).toBe("00:12");
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(30_000);
    expect(value(timer.root)).toBe("00:12");
    expect(timer.elapsedMs()).toBe(12_000);

    timer.destroy();
  });

  it("restarts from zero when start is called twice", () => {
    useFakeClock();
    const timer = createBattleTimer();
    document.body.append(timer.root);

    timer.start();
    vi.advanceTimersByTime(9_000);
    timer.start();
    expect(value(timer.root)).toBe("00:00");
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(2_000);
    expect(value(timer.root)).toBe("00:02");

    timer.destroy();
  });

  it("destroy stops the clock and removes the readout", () => {
    useFakeClock();
    const timer = createBattleTimer();
    document.body.append(timer.root);
    timer.start();
    timer.destroy();

    expect(timer.root.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
