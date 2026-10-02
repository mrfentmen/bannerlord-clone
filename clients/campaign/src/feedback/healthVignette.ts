/**
 * Task 56: low-health vignette. A red pulse at the screen edges while the
 * player is near death; its strength scales with missing health and it
 * vanishes at full health. Pure presentation — the sim reports hp.
 *
 * Task 24 (photosensitivity): the pulse is a 1.1 s CSS animation (~0.91 Hz),
 * registered in the flash registry. Under reduced motion the global
 * `data-reduce-motion` kill-switch in ui.css stops the animation entirely.
 */

import { h } from "../ui/dom.js";
import type { FeedbackSource, Unsubscribe } from "./types.js";
import { registerFlashSource, unregisterFlashSource } from "./photosensitive.js";

const FLASH_PROFILE_ID = "fb-vignette-pulse";

export interface HealthVignette {
  root: HTMLElement;
  destroy(): void;
}

export interface HealthVignetteOptions {
  /**
   * Master switch for the low-health vignette. Defaults to true; the battle
   * feedback hub drives it from `damageVignetteEnabled` (task 150).
   */
  enabled?: boolean;
}

export function createHealthVignette(
  source: FeedbackSource,
  opts: HealthVignetteOptions = {},
): HealthVignette {
  const veil = h("div", { class: "fb-vignette", "data-testid": "fb-vignette" });
  veil.hidden = true;
  registerFlashSource({
    id: FLASH_PROFILE_ID,
    label: "Low-health vignette pulse",
    kind: "css",
    maxRateHz: 1 / 1.1,
    note: "fb-vignette-pulse keyframes, 1.1 s period; killed by data-reduce-motion",
  });
  const unsubs: Unsubscribe[] = [];
  if (opts.enabled !== false) {
    unsubs.push(
      source.onPlayerHealth((hp, max) => {
        const missing = max <= 0 ? 0 : Math.min(1, Math.max(0, 1 - hp / max));
        // Only near death: the last 40% of the bar.
        const strength = Math.min(1, Math.max(0, (missing - 0.6) / 0.4));
        veil.hidden = strength <= 0;
        veil.style.setProperty("--vignette-strength", strength.toFixed(2));
      }),
    );
  }
  return {
    root: veil,
    destroy() {
      for (const u of unsubs) u();
      unregisterFlashSource(FLASH_PROFILE_ID);
      veil.remove();
    },
  };
}
