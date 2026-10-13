/**
 * HUD battle timer (task 38): elapsed battle time, `mm:ss`.
 *
 * One interval, started with the battle and stopped with it; the readout is
 * rendered on each tick from the wall clock, so a throttled background tab
 * catches up instead of drifting. The minutes field grows past 59 rather than
 * rolling into an hours field — a battle longer than an hour is its own story.
 *
 * `role="timer"` matches the deployment countdown in scene/BattleUI.ts. It is
 * not a live region: a per-second announcement would bury every other cue.
 */

import "./battleTimer.css";
import { h } from "./dom.js";

export interface BattleTimerOptions {
  /** Clock; defaults to `Date.now`. Injected for tests. */
  now?: () => number;
}

export interface BattleTimer {
  root: HTMLElement;
  /** Starts (or restarts) the clock. */
  start(): void;
  /** Freezes the readout at its current value. */
  stop(): void;
  /** Elapsed milliseconds; frozen after {@link BattleTimer.stop}. */
  elapsedMs(): number;
  destroy(): void;
}

/** `95000 -> "01:35"`. Minutes grow past two digits instead of wrapping. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function createBattleTimer(opts: BattleTimerOptions = {}): BattleTimer {
  const now = opts.now ?? (() => Date.now());
  const value = h("span", { class: "battle-timer__value", "data-testid": "battle-timer-value" }, "00:00");
  const root = h(
    "div",
    { class: "battle-timer", "data-testid": "battle-timer", role: "timer", "aria-label": "Battle time" },
    value,
  );

  let startedAt = 0;
  let frozen = 0;
  let interval = 0;
  let running = false;

  function render(): void {
    value.textContent = formatClock(running ? now() - startedAt : frozen);
  }

  return {
    root,
    start() {
      startedAt = now();
      frozen = 0;
      running = true;
      render();
      window.clearInterval(interval);
      interval = window.setInterval(render, 1000);
    },
    stop() {
      if (!running) return;
      frozen = now() - startedAt;
      running = false;
      window.clearInterval(interval);
      interval = 0;
      render();
    },
    elapsedMs() {
      return running ? now() - startedAt : frozen;
    },
    destroy() {
      running = false;
      window.clearInterval(interval);
      interval = 0;
      root.remove();
    },
  };
}
