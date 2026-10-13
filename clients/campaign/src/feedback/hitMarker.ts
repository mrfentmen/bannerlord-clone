/**
 * Task 46: the HUD hit marker. Every damage tick projects to a field position
 * and drops an `✕` there for {@link HIT_MARKER_MS}; crits get the bigger,
 * hotter marker. Markers are capped so a long melee cannot grow the DOM
 * without bound — the oldest is retired to make room.
 *
 * The marker is the information, not decoration, so it is drawn under reduced
 * motion too; the fade-in is simply skipped (copy of the kill-confirm rule,
 * and the opposite of damageFlash.ts, which adds nothing at all because the
 * vignette already says "you are hurt").
 */

import "./hitMarker.css";
import { h } from "../ui/dom.js";
import { prefersReducedMotion } from "./motion.js";
import type { DamageTick, FeedbackProjection, FeedbackSource, Unsubscribe } from "./types.js";

/** How long one marker stays on screen. */
export const HIT_MARKER_MS = 250;
/** Hard cap on simultaneous markers. */
export const MAX_HIT_MARKERS = 24;

export interface HitMarker {
  root: HTMLElement;
  destroy(): void;
}

export function createHitMarker(source: FeedbackSource, projection: FeedbackProjection): HitMarker {
  const root = h("div", {
    class: "fb-hitmarker-layer",
    "data-testid": "fb-hitmarker-layer",
    "aria-hidden": "true",
  });
  /** Live markers, oldest first, each mapped to its retire timer. */
  const nodes = new Map<HTMLElement, number>();

  const unsub: Unsubscribe = source.onDamage(show);

  function retire(node: HTMLElement): void {
    const timer = nodes.get(node);
    if (timer !== undefined) window.clearTimeout(timer);
    nodes.delete(node);
    node.remove();
  }

  function show(d: DamageTick): void {
    const at = projection.fieldToScreen(d.x, d.z);
    const node = h("div", {
      class: "fb-hitmarker",
      "data-testid": "fb-hitmarker",
      "data-crit": d.crit ? "true" : null,
    }, "✕");
    node.style.left = `${Math.round(at.x)}px`;
    node.style.top = `${Math.round(at.y)}px`;
    root.appendChild(node);
    nodes.set(node, window.setTimeout(() => retire(node), HIT_MARKER_MS));
    while (nodes.size > MAX_HIT_MARKERS) {
      const oldest = nodes.keys().next().value;
      if (oldest === undefined) break;
      retire(oldest);
    }
    if (!prefersReducedMotion()) requestAnimationFrame(() => node.classList.add("is-visible"));
  }

  return {
    root,
    destroy() {
      unsub();
      for (const timer of nodes.values()) window.clearTimeout(timer);
      nodes.clear();
      root.remove();
    },
  };
}
