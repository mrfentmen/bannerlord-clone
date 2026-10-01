/**
 * Task 56: low-health vignette. A red pulse at the screen edges while the
 * player is near death; its strength scales with missing health and it
 * vanishes at full health. Pure presentation — the sim reports hp.
 */

import { h } from "../ui/dom.js";
import type { FeedbackSource, Unsubscribe } from "./types.js";

export interface HealthVignette {
  root: HTMLElement;
  destroy(): void;
}

export function createHealthVignette(source: FeedbackSource): HealthVignette {
  const veil = h("div", { class: "fb-vignette", "data-testid": "fb-vignette" });
  veil.hidden = true;
  const unsubs: Unsubscribe[] = [
    source.onPlayerHealth((hp, max) => {
      const missing = max <= 0 ? 0 : Math.min(1, Math.max(0, 1 - hp / max));
      // Only near death: the last 40% of the bar.
      const strength = Math.min(1, Math.max(0, (missing - 0.6) / 0.4));
      veil.hidden = strength <= 0;
      veil.style.setProperty("--vignette-strength", strength.toFixed(2));
    }),
  ];
  return {
    root: veil,
    destroy() {
      for (const u of unsubs) u();
      veil.remove();
    },
  };
}
