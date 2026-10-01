/**
 * Task 52: damage direction indicator. When a hit lands and the attacker's
 * position is known, an arc flashes around the impact point, rotated so its
 * gap points at the attacker. Without attacker data there is nothing honest
 * to point at, so the arc is skipped.
 */

import { h } from "../ui/dom.js";
import type { DamageTick, FeedbackProjection, FeedbackSource, Unsubscribe } from "./types.js";

const FADE_MS = 1200;

export interface DirectionIndicator {
  root: HTMLElement;
  destroy(): void;
}

export function createDirectionIndicator(
  source: FeedbackSource,
  projection: FeedbackProjection,
): DirectionIndicator {
  const layer = h("div", { class: "fb-direction-layer", "data-testid": "fb-direction-layer" });
  const unsubs: Unsubscribe[] = [source.onDamage(onDamage)];

  function onDamage(d: DamageTick): void {
    if (d.fromX === undefined || d.fromZ === undefined) return;
    const hit = projection.fieldToScreen(d.x, d.z);
    const from = projection.fieldToScreen(d.fromX, d.fromZ);
    const dx = from.x - hit.x;
    const dy = from.y - hit.y;
    if (dx === 0 && dy === 0) return;
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
      layer.remove();
    },
  };
}
