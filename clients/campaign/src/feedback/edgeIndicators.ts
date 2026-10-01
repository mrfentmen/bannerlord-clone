/**
 * Task 55: edge-of-screen unit indicators. Alive units whose projected
 * position falls outside the viewport get an arrow pinned to the screen edge,
 * rotated to point at the unit's true direction — correct through the full
 * 360°. On-screen units get no arrow. Call `refresh()` once per frame.
 */

import { h } from "../ui/dom.js";
import type { FeedbackProjection, FeedbackSource, TrackedUnit, Unsubscribe } from "./types.js";

const MARGIN = 28;

export interface EdgeIndicators {
  root: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export function createEdgeIndicators(
  source: FeedbackSource,
  projection: FeedbackProjection,
): EdgeIndicators {
  const layer = h("div", { class: "fb-edge-layer", "data-testid": "fb-edge-layer" });
  const nodes = new Map<string, HTMLElement>();
  const unsubs: Unsubscribe[] = [source.onUnitsChanged(sync)];
  let lastUnits: TrackedUnit[] = [];

  function sync(): void {
    lastUnits = source.units().filter((u) => u.alive);
    const wanted = new Set(lastUnits.map((u) => u.id));
    for (const [id, el] of nodes) {
      if (!wanted.has(id)) {
        el.remove();
        nodes.delete(id);
      }
    }
    for (const u of lastUnits) {
      if (!nodes.has(u.id)) {
        const el = h("div", {
          class: `fb-edge-arrow is-${u.side}`,
          "data-testid": "fb-edge-arrow",
          "data-unit": u.id,
        });
        el.textContent = "➤";
        layer.appendChild(el);
        nodes.set(u.id, el);
      }
    }
    refresh();
  }

  function refresh(): void {
    const { w, h } = projection.viewport();
    for (const u of lastUnits) {
      const el = nodes.get(u.id);
      if (!el) continue;
      const s = projection.fieldToScreen(u.x, u.z);
      const offscreen = s.x < 0 || s.y < 0 || s.x > w || s.y > h;
      el.hidden = !offscreen;
      if (!offscreen) continue;
      // Clamp to the viewport with a margin, then aim the arrow at the unit.
      const cx = Math.min(Math.max(s.x, MARGIN), w - MARGIN);
      const cy = Math.min(Math.max(s.y, MARGIN), h - MARGIN);
      const angleDeg = (Math.atan2(s.y - cy, s.x - cx) * 180) / Math.PI;
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) rotate(${angleDeg.toFixed(1)}deg)`;
    }
  }

  sync();

  return {
    root: layer,
    refresh,
    destroy() {
      for (const u of unsubs) u();
      layer.remove();
    },
  };
}
