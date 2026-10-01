/**
 * Task 54: objective markers. Capture points and VIPs are projected into
 * screen space and drawn as DOM overlays, so they render above the 3D canvas
 * with no depth test and no fog applied — visible through fog at any range.
 * Call `refresh()` once per frame (the hub does this) to track the camera.
 */

import { h } from "../ui/dom.js";
import type { FeedbackProjection, FeedbackSource, Unsubscribe } from "./types.js";

export interface ObjectiveMarkers {
  root: HTMLElement;
  refresh(): void;
  destroy(): void;
}

const KIND_GLYPH: Record<string, string> = {
  capture: "◈",
  vip: "★",
  extract: "➤",
};

export function createObjectiveMarkers(
  source: FeedbackSource,
  projection: FeedbackProjection,
): ObjectiveMarkers {
  const layer = h("div", { class: "fb-objective-layer", "data-testid": "fb-objective-layer" });
  const nodes = new Map<string, HTMLElement>();
  const unsubs: Unsubscribe[] = [source.onObjectivesChanged(sync)];

  function sync(): void {
    const wanted = new Map(source.objectives().map((o) => [o.id, o]));
    for (const [id, el] of nodes) {
      if (!wanted.has(id)) {
        el.remove();
        nodes.delete(id);
      }
    }
    for (const o of wanted.values()) {
      let el = nodes.get(o.id);
      if (!el) {
        el = h("div", { class: `fb-objective is-${o.kind}`, "data-testid": "fb-objective" });
        layer.appendChild(el);
        nodes.set(o.id, el);
      }
      el.textContent = `${KIND_GLYPH[o.kind] ?? "◈"} ${o.label}`;
    }
    refresh();
  }

  function refresh(): void {
    for (const o of source.objectives()) {
      const el = nodes.get(o.id);
      if (!el) continue;
      const s = projection.fieldToScreen(o.x, o.z);
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -120%)`;
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
