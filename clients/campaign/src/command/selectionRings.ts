/**
 * Selection highlight rings (Buffy task 65): a ring on the field under every
 * selected unit, so a selection reads at a glance on a busy battlefield.
 *
 * The rings are DOM in the command overlay, not scene meshes — the command layer
 * draws over the battlefield and never reaches into it. The only thing it needs
 * from the scene is `fieldToScreen`, and the maths that turns that projection
 * into an on-screen size lives here as a pure function, so the camera-zoom
 * behaviour is testable without a scene.
 */

import "./selectionRings.css";
import { h } from "../ui/dom.js";
import type { CommandableUnit, CommandSurface } from "./types.js";

/** Battlefield span a ring covers, in metres — roughly a soldier's shoulders. */
const RING_SPAN_M = 2;
/** Used when the projection collapses, so a ring is never invisible. */
const RING_FALLBACK_PX = 18;

/**
 * Pure: on-screen size of a ring at a field position. Two field points
 * `RING_SPAN_M` apart are projected and the gap between them is the diameter,
 * so a ring shrinks as the camera pulls back exactly as the units do. A
 * projection that collapses to a point (camera on the spot, or a fake surface)
 * falls back to a readable size rather than an invisible ring.
 */
export function ringDiameter(
  project: (x: number, z: number) => { x: number; y: number },
  at: { x: number; z: number },
): number {
  const here = project(at.x, at.z);
  const there = project(at.x + RING_SPAN_M, at.z);
  const span = Math.hypot(there.x - here.x, there.y - here.y);
  return span > 0 ? span : RING_FALLBACK_PX;
}

export interface SelectionRings {
  root: HTMLElement;
  /** One ring per unit passed in; units not passed lose their ring. */
  update(units: CommandableUnit[]): void;
  destroy(): void;
}

export function createSelectionRings(surface: CommandSurface): SelectionRings {
  const root = h("div", {
    class: "cmd-rings",
    "aria-hidden": "true",
    "data-testid": "cmd-rings",
  });
  // Client coords from the projection need a positioned home; when the overlay
  // is static the rings pin to the viewport instead, same as the marquee.
  if (getComputedStyle(surface.overlay()).position === "static") {
    root.style.position = "fixed";
  }

  const rings = new Map<string, HTMLElement>();

  return {
    root,
    update(units) {
      const live = new Set<string>();
      for (const unit of units) {
        if (unit.count <= 0) continue;
        live.add(unit.id);
        let ring = rings.get(unit.id);
        if (!ring) {
          ring = h("div", {
            class: "cmd-ring",
            "data-testid": "cmd-ring",
            "data-unit": unit.id,
          });
          rings.set(unit.id, ring);
          root.appendChild(ring);
        }
        const at = surface.fieldToScreen(unit.x, unit.z);
        const size = ringDiameter(surface.fieldToScreen, unit);
        ring.style.left = `${at.x}px`;
        ring.style.top = `${at.y}px`;
        ring.style.width = `${size}px`;
        ring.style.height = `${size}px`;
      }
      for (const [id, ring] of rings) {
        if (live.has(id)) continue;
        ring.remove();
        rings.delete(id);
      }
    },
    destroy() {
      for (const ring of rings.values()) ring.remove();
      rings.clear();
      root.remove();
    },
  };
}