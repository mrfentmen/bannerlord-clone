/**
 * The formation preview ghost (Buffy task 71): a faint marker per unit showing
 * where the group will stand if the order is issued where the pointer is.
 *
 * The ghost is DOM in the command overlay, projected through the surface's
 * `fieldToScreen` like the selection rings — the command layer draws over the
 * battlefield and never puts a mesh in it. The shape maths is `formationSlots`,
 * which is pure and tested on its own.
 */

import "./formationGhost.css";
import { h } from "../ui/dom.js";
import { formationSlots } from "./formation.js";
import type { CommandSurface, FormationKind } from "./types.js";

export interface FormationGhost {
  root: HTMLElement;
  /**
   * Show `count` slots of `formation` centred on a field position. A count of
   * zero hides the ghost — there is nothing to preview.
   */
  show(formation: FormationKind, count: number, at: { x: number; z: number }): void;
  hide(): void;
  destroy(): void;
}

export function createFormationGhost(surface: CommandSurface): FormationGhost {
  const root = h("div", {
    class: "cmd-ghost",
    "aria-hidden": "true",
    "data-testid": "cmd-formation-ghost",
  });
  if (getComputedStyle(surface.overlay()).position === "static") {
    root.style.position = "fixed";
  }

  const dots: HTMLElement[] = [];

  function hide(): void {
    for (const dot of dots) dot.remove();
    dots.length = 0;
    root.hidden = true;
  }

  return {
    root,
    show(formation, count, at) {
      hide();
      if (count <= 0) return;
      for (const slot of formationSlots(formation, count)) {
        const p = surface.fieldToScreen(at.x + slot.x, at.z + slot.z);
        const dot = h("div", { class: "cmd-ghost__slot" });
        dot.style.left = `${p.x}px`;
        dot.style.top = `${p.y}px`;
        root.appendChild(dot);
        dots.push(dot);
      }
      root.hidden = false;
    },
    hide,
    destroy() {
      hide();
      root.remove();
    },
  };
}