/**
 * Task 48: combo counter — the player's kills inside a rolling 10-second
 * window.
 *
 * Only the player's kills count: the counter is a reward readout, not a census.
 * Two quick kills show "Double kill", three "Triple kill", beyond that the raw
 * count. The window slides — a kill older than ten seconds stops feeding the
 * streak — and the counter hides itself when the streak is over, because a
 * permanent "x1" would be decoration, not information. The clock is injected
 * so tests can run the window without waiting ten seconds.
 */

import "./comboCounter.css";
import { h } from "../ui/dom.js";
import type { CombatEventSource } from "../scene/combatEvents.js";

export interface ComboCounter {
  root: HTMLElement;
  destroy(): void;
}

/** ms a kill keeps feeding the streak. */
export const COMBO_WINDOW_MS = 10_000;

const NAMES: Record<number, string> = { 2: "Double kill", 3: "Triple kill" };

export function createComboCounter(
  source: CombatEventSource,
  opts: { windowMs?: number; now?: () => number } = {},
): ComboCounter {
  const windowMs = opts.windowMs ?? COMBO_WINDOW_MS;
  const now = opts.now ?? (() => Date.now());

  const label = h("span", { class: "hud-combo__label" }, "");
  const root = h(
    "div",
    { class: "hud-combo", "aria-live": "polite", "aria-label": "Kill streak" },
    label,
  );
  root.hidden = true;

  const killTimes: number[] = [];

  function render(): void {
    const t = now();
    let oldest: number | undefined;
    while ((oldest = killTimes[0]) !== undefined && t - oldest > windowMs) killTimes.shift();
    if (killTimes.length < 2) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const n = killTimes.length;
    label.textContent = NAMES[n] ?? `${n} kills`;
  }

  const unsubscribe = source.onKill((e) => {
    if (e.killerTeam !== 0) return;
    killTimes.push(now());
    render();
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
