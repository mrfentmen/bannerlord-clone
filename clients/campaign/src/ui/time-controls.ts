/**
 * Time controls UI. MASTER_PLAN.md section 4A (tasks 135-137).
 *
 *  - Pause / 1x / 4x / 16x buttons wired to `setTimeScale`. A speed change
 *    is acknowledged by the sim within 2 ticks: after a click this module
 *    shows a "Syncing" chip until the caller's tick-fed `update()` carries
 *    the new `timeScale`, then clears the chip and announces the change
 *    (task 135).
 *  - The calendar date advances with campaign ticks. The caller feeds the
 *    sim's day/year through `update()`; the rendered date always matches
 *    the sim tick (task 136).
 *  - A spacebar shortcut toggles pause without opening any panel. The
 *    listener ignores keypresses aimed at inputs, textareas, selects,
 *    editable regions, and buttons (so focused buttons keep their native
 *    space activation), and it cleans itself up in `destroy()` (task 137).
 *
 * Same pattern as the other UI modules: this module owns no sim connection
 * and no fetch. The caller (Rowan's campaign client) injects the
 * `onSetTimeScale` callback, wires it to the sim's setTimeScale endpoint,
 * and feeds sim state through `update()`; this module renders.
 */

import { announce, h, liveRegion, replace } from "./dom.js";
import { statusChip } from "./kit.js";

/** The four speed stops: paused, normal, fast, fastest (task 135). */
export const TIME_SCALES = [0, 1, 4, 16] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

const SCALE_LABELS: Record<TimeScale, string> = {
  0: "Pause",
  1: "1x",
  4: "4x",
  16: "16x",
};

const SCALE_NAMES: Record<TimeScale, string> = {
  0: "Paused",
  1: "Normal speed",
  4: "Fast speed",
  16: "Fastest speed",
};

/** Months for the campaign calendar, same convention as hud.ts. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The campaign calendar date for a sim day/year. Same convention as the
 * HUD: `${day} ${month} ${year}`.
 */
export function formatCampaignDate(day: number, year: number): string {
  return `${day} ${MONTHS[(Math.max(1, day) - 1) % 12]} ${year}`;
}

/** Sim-fed time state. */
export interface TimeControlsState {
  /** Current campaign day from the sim snapshot (task 136). */
  day: number;
  /** Current campaign year from the sim snapshot. */
  year: number;
  /** The time scale the sim is actually running at, from the latest tick. */
  timeScale: TimeScale | number;
}

export interface TimeControlsCallbacks {
  /** Wires to the sim's setTimeScale (task 135). */
  onSetTimeScale: (scale: TimeScale) => void;
  onClose?: () => void;
}

export interface TimeControlsHandle {
  root: HTMLElement;
  update: (state: TimeControlsState) => void;
  destroy: () => void;
}

/** True when the keypress is aimed at an editable field or control. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function createTimeControls(
  initial: TimeControlsState,
  callbacks: TimeControlsCallbacks,
): TimeControlsHandle {
  let state = initial;
  /** The last requested scale that the sim has not yet confirmed. */
  let pendingScale: TimeScale | null = null;
  const region = liveRegion();

  const root = h("div", {
    class: "time-controls",
    role: "group",
    "aria-label": "Time controls",
    "data-testid": "time-controls",
  });

  function requestScale(scale: TimeScale): void {
    pendingScale = scale;
    callbacks.onSetTimeScale(scale);
    render();
  }

  function togglePause(): void {
    requestScale(state.timeScale === 0 ? 1 : 0);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== " " && event.key !== "Spacebar") return;
    if (event.repeat) return;
    const target = event.target;
    if (isTypingTarget(target)) return;
    // A focused button handles space natively; do not steal it.
    if (target instanceof HTMLElement && target.tagName.toLowerCase() === "button") return;
    event.preventDefault();
    togglePause();
  }

  window.addEventListener("keydown", onKeyDown);

  function render(): void {
    const date = h("span", {
      class: "time-controls__date data",
      "data-testid": "time-date",
    }, formatCampaignDate(state.day, state.year));

    const buttons = h("div", { class: "time-controls__buttons", role: "group", "aria-label": "Speed" });
    for (const scale of TIME_SCALES) {
      const active = state.timeScale === scale;
      const btn = h(
        "button",
        {
          type: "button",
          class: `time-controls__btn${active ? " time-controls__btn--active" : ""}`,
          "data-testid": `time-scale-${scale}`,
          "aria-pressed": active ? "true" : "false",
          "aria-label": SCALE_NAMES[scale],
          title: SCALE_NAMES[scale],
        },
        SCALE_LABELS[scale],
      );
      btn.addEventListener("click", () => requestScale(scale));
      buttons.appendChild(btn);
    }

    const pending = h("div", { class: "time-controls__pending" });
    if (pendingScale !== null) {
      pending.appendChild(
        statusChip("warning", `Syncing ${SCALE_LABELS[pendingScale]}…`, {
          testId: "time-pending",
        }),
      );
    }

    replace(root, date, buttons, pending, region);
  }

  render();

  return {
    root,
    update(next: TimeControlsState) {
      // The sim has acknowledged the pending speed change (task 135).
      if (pendingScale !== null && next.timeScale === pendingScale) {
        pendingScale = null;
        announce(region, `Speed changed to ${SCALE_NAMES[next.timeScale as TimeScale] ?? next.timeScale}.`);
      }
      state = next;
      render();
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
