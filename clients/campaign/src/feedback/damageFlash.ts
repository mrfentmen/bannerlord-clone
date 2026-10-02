/**
 * MASTER_PLAN task 150: damage vignette. A quick red flash at the screen
 * edges the moment the player takes damage — the cinematic counterpart to
 * the low-health vignette (task 56), which only shows while near death.
 * Pure presentation — the sim reports hp.
 *
 * Photosensitivity (task 24): the flash is a single 350 ms fade per hit
 * (~2.86 Hz worst case, under the 3 Hz limit), registered in the flash
 * registry, and bursts of damage events are coalesced through the shared
 * flash gate so the edge can never strobe faster than 3 Hz.
 *
 * Reduced motion: the flash is suppressed entirely in JS (no element is
 * created) when `html[data-reduce-motion]` is set or the OS prefers reduced
 * motion — a static red overlay would be worse than none. The toggle
 * `damageVignetteEnabled` (settings) gates this and the low-health vignette
 * together; the battle feedback hub passes it through.
 */

import { h } from "../ui/dom.js";
import type { FeedbackSource, Unsubscribe } from "./types.js";
import {
  flashGate,
  registerFlashSource,
  unregisterFlashSource,
  type FlashGate,
} from "./photosensitive.js";

/** One flash: 350 ms fade, so the worst case is ~2.86 Hz — under 3 Hz. */
const FLASH_MS = 350;

const FLASH_PROFILE_ID = "fb-damage-flash";

export interface DamageFlashOptions {
  /**
   * Master switch for the damage flash. Defaults to true; the battle
   * feedback hub drives it from `damageVignetteEnabled`.
   */
  enabled?: boolean;
  /**
   * Flash gate override (tests). Defaults to the shared singleton — the
   * same gate every lane emitter uses in production.
   */
  gate?: FlashGate;
}

export interface DamageFlash {
  root: HTMLElement;
  destroy(): void;
}

function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.hasAttribute("data-reduce-motion")) return true;
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function createDamageFlash(
  source: FeedbackSource,
  opts: DamageFlashOptions = {},
): DamageFlash {
  const enabled = opts.enabled !== false;
  const gate = opts.gate ?? flashGate;
  const layer = h("div", { class: "fb-damage-layer", "data-testid": "fb-damage-layer" });
  registerFlashSource({
    id: FLASH_PROFILE_ID,
    label: "Damage edge flash",
    kind: "js",
    maxRateHz: 1 / (FLASH_MS / 1000),
    note: "single 350 ms fade per damage event; bursts coalesced by the flash gate; suppressed under reduced motion",
  });

  let lastHp: number | null = null;
  const unsubs: Unsubscribe[] = [];

  if (enabled) {
    unsubs.push(
      source.onPlayerHealth((hp, max) => {
        const prev = lastHp;
        lastHp = hp;
        if (prev === null || hp >= prev) return; // first report or heal: no flash
        // Reduced motion: never flash (accept: respects reduced-motion mode).
        if (prefersReducedMotion()) return;
        // Task 24: gate only real flashes, so a damage burst can never strobe.
        if (!gate.request(FLASH_PROFILE_ID)) return;
        const fraction = max > 0 ? Math.min(1, Math.max(0, (prev - hp) / max)) : 0;
        const flash = h("div", { class: "fb-damage-flash" });
        // Harder hits flash brighter; always visible enough to read as a hit.
        flash.style.setProperty("--flash-strength", (0.3 + 0.7 * fraction).toFixed(2));
        layer.appendChild(flash);
        requestAnimationFrame(() => flash.classList.add("is-visible"));
        setTimeout(() => flash.remove(), FLASH_MS);
      }),
    );
  }

  return {
    root: layer,
    destroy() {
      for (const u of unsubs) u();
      unregisterFlashSource(FLASH_PROFILE_ID);
      layer.remove();
    },
  };
}
