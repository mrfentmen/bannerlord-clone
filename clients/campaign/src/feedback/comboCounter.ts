/**
 * Task 48: the HUD combo counter. Kills inside a rolling 10 s window stack
 * into one `×N` badge; it appears on the second kill and disappears when the
 * window runs dry. The kill feed is still the record of what happened, so
 * this layer is `aria-hidden` like its siblings.
 *
 * The badge is timer-driven, never polled: a single timeout wakes at the
 * moment the oldest kill expires, re-renders, and re-arms only while kills
 * remain. A new kill restarts that one timer.
 */

import "./comboCounter.css";
import { h } from "../ui/dom.js";
import type { FeedbackSource, Unsubscribe } from "./types.js";

/** Kills older than this stop counting toward the combo. */
export const COMBO_WINDOW_MS = 10_000;

export interface ComboCounter {
  root: HTMLElement;
  destroy(): void;
}

export function createComboCounter(source: FeedbackSource): ComboCounter {
  const badge = h("span", {
    class: "fb-combo",
    "data-testid": "fb-combo",
    hidden: true,
  });
  const root = h(
    "div",
    { class: "fb-combo-layer", "data-testid": "fb-combo-layer", "aria-hidden": "true" },
    badge,
  );

  /** Kill timestamps still inside the window, oldest first. */
  let times: number[] = [];
  let timer = 0;

  const unsub: Unsubscribe = source.onHeroKill((k) => {
    if (k.killerSide !== "ally") return; // the enemy's streak is their own business
    times.push(Date.now());
    refresh();
  });

  function refresh(): void {
    const now = Date.now();
    times = times.filter((at) => now - at < COMBO_WINDOW_MS);
    render();
    window.clearTimeout(timer);
    const oldest = times[0];
    if (oldest === undefined) return;
    timer = window.setTimeout(refresh, COMBO_WINDOW_MS - (now - oldest));
  }

  function render(): void {
    const n = times.length;
    badge.hidden = n < 2;
    badge.textContent = n < 2 ? "" : `×${n}`;
  }

  return {
    root,
    destroy() {
      unsub();
      window.clearTimeout(timer);
      times = [];
      root.remove();
    },
  };
}
