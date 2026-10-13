/**
 * Stance icons on units (Buffy task 73): one small icon over each selected unit
 * showing the posture the player has chosen for it.
 *
 * DOM in the command overlay, projected like the selection rings and the
 * formation ghost — the command layer never puts a mesh in the battlefield. The
 * icons are shapes, not colours: UI_UX.md section 12 asks for status that reads
 * without colour vision, so aggressive, defensive and passive differ in outline
 * as well as in fill, and each carries its name for assistive tech.
 */

import "./stanceIcons.css";
import { h } from "../ui/dom.js";
import type { CommandableUnit, CommandSurface, StanceKind } from "./types.js";

/** Shape per stance. Distinct outlines, so the three read without colour. */
const STANCE_GLYPH: Record<StanceKind, string> = {
  aggressive: "▲",
  defensive: "■",
  passive: "○",
};

const STANCE_ICON_LABEL: Record<StanceKind, string> = {
  aggressive: "Aggressive stance",
  defensive: "Defensive stance",
  passive: "Passive stance",
};

/** Pixels between the unit's projected feet and its icon. */
const ICON_LIFT_PX = 26;

export interface StanceIcons {
  root: HTMLElement;
  /**
   * Show one icon per unit, in the given stance. A null stance hides the
   * overlay: with nothing chosen there is no posture to advertise.
   */
  update(units: CommandableUnit[], stance: StanceKind | null): void;
  destroy(): void;
}

export function createStanceIcons(surface: CommandSurface): StanceIcons {
  const root = h("div", {
    class: "cmd-stance-icons",
    "aria-hidden": "true",
    "data-testid": "cmd-stance-icons",
  });
  if (getComputedStyle(surface.overlay()).position === "static") {
    root.style.position = "fixed";
  }
  const icons = new Map<string, HTMLElement>();

  function hide(): void {
    for (const icon of icons.values()) icon.remove();
    icons.clear();
    root.hidden = true;
  }

  return {
    root,
    update(units, stance) {
      hide();
      if (!stance) return;
      for (const unit of units) {
        if (unit.count <= 0) continue;
        const at = surface.fieldToScreen(unit.x, unit.z);
        const icon = h("span", {
          class: `cmd-stance-icon cmd-stance-icon--${stance}`,
          "data-testid": "cmd-stance-icon",
          "data-unit": unit.id,
          title: STANCE_ICON_LABEL[stance],
        }, STANCE_GLYPH[stance]);
        icon.style.left = `${at.x}px`;
        icon.style.top = `${at.y - ICON_LIFT_PX}px`;
        root.appendChild(icon);
        icons.set(unit.id, icon);
      }
      root.hidden = icons.size === 0;
    },
    destroy() {
      hide();
      root.remove();
    },
  };
}