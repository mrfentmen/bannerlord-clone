/**
 * Task 333: hit flash — a red vignette that fires once when the player's side
 * takes a hit.
 *
 * This is the momentary one, not the low-health pulse: every incoming blow
 * flashes the edge briefly, so the player feels each hit even when their line
 * is still healthy. It listens for strikes against team 0 and does nothing
 * else — no thresholds, no state, just the flash.
 */

import "./hitFlash.css";
import { h } from "../ui/dom.js";
import type { CombatEventSource } from "../scene/combatEvents.js";

export interface HitFlash {
  root: HTMLElement;
  destroy(): void;
}

/** ms the vignette stays visible. Injected for tests. */
export const HIT_FLASH_MS = 220;

export function createHitFlash(
  source: CombatEventSource,
  opts: { showMs?: number; setTimeout?: (fn: () => void, ms: number) => unknown } = {},
): HitFlash {
  const showMs = opts.showMs ?? HIT_FLASH_MS;
  const later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));

  const root = h("div", { class: "hud-hitflash", "aria-hidden": "true" });

  const unsubscribe = source.onStrike((e) => {
    if (e.victimTeam !== 0) return;
    // Restart the flash if a second blow lands mid-flash: re-adding the class
    // retriggers the animation because the removal ran first.
    root.classList.remove("hud-hitflash--show");
    void root.offsetWidth;
    root.classList.add("hud-hitflash--show");
    later(() => root.classList.remove("hud-hitflash--show"), showMs);
  });

  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    },
  };
}
