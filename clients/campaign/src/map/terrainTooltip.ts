/**
 * The map's terrain tooltip (Buffy task 199).
 *
 * The scene knows what is under the pointer; this is the DOM box that says so. It
 * owns no picking and no terrain data — the caller hands it a biome id and, when
 * the ground under the cursor belongs to a named place, a name to go with it. The
 * wording comes from `BIOME_LABEL` in `src/modes/types.ts`, the same table the
 * battle scenes label terrain with, so "Forest" means one thing in the whole client.
 *
 * Two states and no third. The tooltip is either showing a biome or it is not; a
 * half-drawn box with no text in it reads as a rendering fault. So `show()` writes
 * the content and reveals, `hide()` clears it and takes the box out of the layout's
 * way, and the tooltip is never visible with nothing in it.
 *
 * It is `pointer-events: none` so it can never steal the click that was meant for
 * the ground underneath it.
 */

import { h } from "../ui/dom.js";
import { BIOME_LABEL, type BiomeId } from "../modes/types.js";
import "./mapOverlay.css";

export interface TerrainTooltipContent {
  /** The biome under the pointer, as the client already names them. */
  biome: BiomeId;
  /** A named place on this ground, when the ground belongs to one. */
  name?: string;
  /** One extra line from the caller: elevation, a road, whatever it knows. */
  detail?: string;
}

export interface TerrainTooltipHandle {
  root: HTMLElement;
  show(content: TerrainTooltipContent): void;
  hide(): void;
  /** True while the tooltip is showing something. */
  visible(): boolean;
  destroy(): void;
}

export function createTerrainTooltip(options: { testId?: string } = {}): TerrainTooltipHandle {
  const name = h("span", { class: "map-tooltip__name", "data-testid": "terrain-tooltip-name" });
  const biome = h("span", { class: "map-tooltip__detail", "data-testid": "terrain-tooltip-biome" });
  const detail = h("span", { class: "map-tooltip__detail", "data-testid": "terrain-tooltip-detail" });

  const root = h(
    "div",
    {
      class: "map-tooltip",
      "data-testid": options.testId ?? "terrain-tooltip",
      role: "tooltip",
      "aria-hidden": "true",
    },
    name,
    biome,
    detail,
  );
  // Hidden until there is something to say. `hidden` rather than a class so the
  // tooltip cannot be seen by a screen reader before it has content.
  root.hidden = true;

  const clear = (el: HTMLElement): void => {
    el.textContent = "";
  };

  return {
    root,
    show(content: TerrainTooltipContent): void {
      const label = BIOME_LABEL[content.biome];
      if (label === undefined) {
        // An unknown biome is not a terrain the client can name. Hide rather than
        // print the raw id, which would be a leak of the caller's internals.
        this.hide();
        return;
      }
      name.textContent = content.name ?? label;
      biome.textContent = content.name ? label : "";
      detail.textContent = content.detail ?? "";
      root.setAttribute("aria-label", content.name ? `${content.name}, ${label}` : label);
      root.setAttribute("aria-hidden", "false");
      root.hidden = false;
    },
    hide(): void {
      clear(name);
      clear(biome);
      clear(detail);
      root.setAttribute("aria-hidden", "true");
      root.hidden = true;
    },
    visible(): boolean {
      return !root.hidden;
    },
    destroy(): void {
      clear(name);
      clear(biome);
      clear(detail);
      root.hidden = true;
      root.remove();
    },
  };
}