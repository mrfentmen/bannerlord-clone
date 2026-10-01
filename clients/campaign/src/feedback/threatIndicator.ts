/**
 * Task 53: threat indicator. A flanking or rear hit flashes the screen edge
 * nearest the attacker's direction from the victim, so the player feels where
 * the danger is without looking at it. Rear attacks flash brighter; flank
 * hits flash dimmer.
 */

import { h } from "../ui/dom.js";
import type { FeedbackProjection, FeedbackSource, ThreatHit, Unsubscribe } from "./types.js";

const FLASH_MS = 900;

export interface ThreatIndicator {
  root: HTMLElement;
  destroy(): void;
}

type Edge = "top" | "right" | "bottom" | "left";

export function createThreatIndicator(
  source: FeedbackSource,
  projection: FeedbackProjection,
): ThreatIndicator {
  const layer = h("div", { class: "fb-threat-layer", "data-testid": "fb-threat-layer" });
  const unsubs: Unsubscribe[] = [source.onThreat(onThreat)];

  function onThreat(t: ThreatHit): void {
    const unit = source.units().find((u) => u.id === t.unitId);
    if (!unit) return;
    const victim = projection.fieldToScreen(unit.x, unit.z);
    const attacker = projection.fieldToScreen(t.fromX, t.fromZ);
    const dx = attacker.x - victim.x;
    const dy = attacker.y - victim.y;
    if (dx === 0 && dy === 0) return;
    const edge: Edge =
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
    const flash = h("div", {
      class: `fb-threat-edge is-${edge}${t.rear ? " is-rear" : ""}`,
    });
    layer.appendChild(flash);
    requestAnimationFrame(() => flash.classList.add("is-visible"));
    setTimeout(() => flash.remove(), FLASH_MS);
  }

  return {
    root: layer,
    destroy() {
      for (const u of unsubs) u();
      layer.remove();
    },
  };
}
