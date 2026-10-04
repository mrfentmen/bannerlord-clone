/**
 * Task 33: low-health warning — a red pulse around the screen edge when the
 * player's line is hurting.
 *
 * The reader reports the lowest health fraction among the player's living
 * soldiers (0..1), or null when nobody has reported. Below 30% the edge
 * pulses; at zero dead the warning stays off, because the dead are the kill
 * feed's business and a warning about corpses would be noise. The poll is a
 * read, same pattern as the live battle source — the warning never invents a
 * number.
 */

import "./lowHealthWarning.css";
import { h } from "../ui/dom.js";

export interface LowHealthWarning {
  root: HTMLElement;
  destroy(): void;
}

/** Fraction below which the edge pulses. */
export const LOW_HEALTH_FRACTION = 0.3;

export function createLowHealthWarning(
  readMinFraction: () => number | null,
  opts: {
    threshold?: number;
    pollMs?: number;
    setInterval?: (fn: () => void, ms: number) => unknown;
    clearInterval?: (handle: unknown) => void;
  } = {},
): LowHealthWarning {
  const threshold = opts.threshold ?? LOW_HEALTH_FRACTION;
  const pollMs = opts.pollMs ?? 500;
  const set = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clear = opts.clearInterval ?? ((handle) => clearInterval(handle as number));

  const root = h("div", { class: "hud-lowhp", "aria-hidden": "true" });

  function check(): void {
    const fraction = readMinFraction();
    const hurting = fraction !== null && fraction > 0 && fraction < threshold;
    root.classList.toggle("hud-lowhp--show", hurting);
  }

  check();
  const handle = set(check, pollMs);

  return {
    root,
    destroy() {
      clear(handle);
      root.remove();
    },
  };
}
