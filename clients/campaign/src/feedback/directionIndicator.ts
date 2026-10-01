/**
 * Task 52: damage direction indicator. When a hit lands and the attacker's
 * position is known, an arc flashes around the impact point, rotated so its
 * gap points at the attacker. Without attacker data there is nothing honest
 * to point at, so the arc is skipped.
 *
 * Task 24 (photosensitivity): the arc is a single 1200 ms fade per event
 * (~0.83 Hz worst case), registered in the flash registry, and bursts of
 * damage events are coalesced through the shared flash gate so arcs can
 * never strobe faster than 3 Hz.
 */

import { h } from "../ui/dom.js";
import type { DamageTick, FeedbackProjection, FeedbackSource, Unsubscribe } from "./types.js";
import {
  flashGate,
  registerFlashSource,
  unregisterFlashSource,
} from "./photosensitive.js";

const FADE_MS = 1200;

const FLASH_PROFILE_ID = "fb-direction-arc";

export interface DirectionIndicator {
  root: HTMLElement;
  destroy(): void;
}

export function createDirectionIndicator(
  source: FeedbackSource,
  projection: FeedbackProjection,
): DirectionIndicator {
  const layer = h("div", { class: "fb-direction-layer", "data-testid": "fb-direction-layer" });
  registerFlashSource({
    id: FLASH_PROFILE_ID,
    label: "Damage direction arc",
    kind: "js",
    maxRateHz: 1 / (FADE_MS / 1000),
    note: "single 1200 ms fade per damage event; bursts coalesced by the flash gate",
  });
  const unsubs: Unsubscribe[] = [source.onDamage(onDamage)];

  function onDamage(d: DamageTick): void {
    if (d.fromX === undefined || d.fromZ === undefined) return;
    const hit = projection.fieldToScreen(d.x, d.z);
    const from = projection.fieldToScreen(d.fromX, d.fromZ);
    const dx = from.x - hit.x;
    const dy = from.y - hit.y;
    if (dx === 0 && dy === 0) return;
    // Task 24: gate only real flashes (after the no-op checks above), so a
    // burst of damage events can never strobe arcs faster than 3 Hz.
    if (!flashGate.request(FLASH_PROFILE_ID)) return;
    // Screen angle, 0 = up, clockwise — matches the CSS conic arc below.
    const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const arc = h("div", { class: "fb-direction-arc" });
    arc.style.left = `${hit.x}px`;
    arc.style.top = `${hit.y}px`;
    arc.style.setProperty("--hit-angle", `${angleDeg.toFixed(1)}deg`);
    layer.appendChild(arc);
    requestAnimationFrame(() => arc.classList.add("is-visible"));
    setTimeout(() => arc.remove(), FADE_MS);
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
