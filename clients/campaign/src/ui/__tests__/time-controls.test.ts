/**
 * Time controls UI tests. MASTER_PLAN.md section 4A (tasks 135-137).
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTimeControls,
  formatCampaignDate,
  type TimeControlsCallbacks,
  type TimeControlsState,
  type TimeScale,
} from "../time-controls.js";

function state(over: Partial<TimeControlsState> = {}): TimeControlsState {
  return { day: 1, year: 1300, timeScale: 1, ...over };
}

function callbacks(over: Partial<TimeControlsCallbacks> = {}): TimeControlsCallbacks {
  return { onSetTimeScale: vi.fn(), ...over };
}

/** Button by scale; throws with a clear message instead of `!` noise. */
function scaleBtn(root: HTMLElement, scale: TimeScale): HTMLButtonElement {
  const el = root.querySelector<HTMLButtonElement>(`[data-testid="time-scale-${scale}"]`);
  if (!el) throw new Error(`missing button for scale ${scale}`);
  return el;
}

describe("formatCampaignDate", () => {
  it("matches the HUD convention (day month year)", () => {
    expect(formatCampaignDate(1, 1300)).toBe("1 January 1300");
    expect(formatCampaignDate(13, 1301)).toBe("13 January 1301");
    expect(formatCampaignDate(14, 1301)).toBe("14 February 1301");
  });
});

describe("createTimeControls", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders pause, 1x, 4x and 16x buttons (task 135)", () => {
    const handle = createTimeControls(state(), callbacks());
    document.body.appendChild(handle.root);
    const btns = [0, 1, 4, 16].map((s) => scaleBtn(handle.root, s as TimeScale));
    expect(btns[0]!.getAttribute("aria-label")).toBe("Paused");
    expect(btns[1]!.textContent).toBe("1x");
    expect(btns[2]!.textContent).toBe("4x");
    expect(btns[3]!.textContent).toBe("16x");
    expect(btns[1]!.getAttribute("aria-pressed")).toBe("true");
    handle.destroy();
  });

  it("clicking a speed calls onSetTimeScale and shows a pending chip (task 135)", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    scaleBtn(handle.root, 16).click();
    expect(cb.onSetTimeScale).toHaveBeenCalledWith(16);
    const pending = handle.root.querySelector('[data-testid="time-pending"]');
    expect(pending?.textContent).toContain("Syncing 16x");
    handle.destroy();
  });

  it("keeps the pending chip while the sim has not acknowledged yet", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    scaleBtn(handle.root, 4).click();
    // Sim ticks once with the old speed: still pending (acknowledged within 2 ticks).
    handle.update(state({ timeScale: 1, day: 2 }));
    expect(handle.root.querySelector('[data-testid="time-pending"]')).not.toBeNull();
    handle.destroy();
  });

  it("clears the pending chip and announces when the sim acknowledges the speed (task 135)", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    scaleBtn(handle.root, 4).click();
    handle.update(state({ timeScale: 4, day: 2 }));
    expect(handle.root.querySelector('[data-testid="time-pending"]')).toBeNull();
    const region = handle.root.querySelector("[role=\"status\"]");
    expect(region?.textContent).toContain("Speed changed to Fast speed");
    handle.destroy();
  });

  it("renders the calendar date from the sim tick (task 136)", () => {
    const handle = createTimeControls(state({ day: 25, year: 1300 }), callbacks());
    document.body.appendChild(handle.root);
    const date = handle.root.querySelector('[data-testid="time-date"]');
    expect(date?.textContent).toBe("25 January 1300");
    handle.destroy();
  });

  it("advances the date when the sim tick moves forward (task 136)", () => {
    const handle = createTimeControls(state({ day: 25, year: 1300 }), callbacks());
    document.body.appendChild(handle.root);
    handle.update(state({ day: 26, year: 1300 }));
    const date = handle.root.querySelector('[data-testid="time-date"]');
    expect(date?.textContent).toBe("26 February 1300"); // hud.ts convention: (day - 1) % 12 picks the month.
    handle.destroy();
  });

  it("spacebar toggles pause without opening any panel (task 137)", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(cb.onSetTimeScale).toHaveBeenCalledWith(0);
    expect(event.defaultPrevented).toBe(true);
    // No panel callbacks exist on this module: nothing to open.
    handle.destroy();
  });

  it("spacebar resumes normal speed when paused (task 137)", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 0 }), cb);
    document.body.appendChild(handle.root);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(cb.onSetTimeScale).toHaveBeenCalledWith(1);
    handle.destroy();
  });

  it("spacebar does nothing while typing in an input (task 137)", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(cb.onSetTimeScale).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("spacebar does nothing when a button is focused (task 137)", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    other.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(cb.onSetTimeScale).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("ignores repeat keydowns (task 137)", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, repeat: true }));
    expect(cb.onSetTimeScale).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("destroy removes the spacebar listener", () => {
    const cb = callbacks();
    const handle = createTimeControls(state({ timeScale: 1 }), cb);
    document.body.appendChild(handle.root);
    handle.destroy();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(cb.onSetTimeScale).not.toHaveBeenCalled();
  });
});
