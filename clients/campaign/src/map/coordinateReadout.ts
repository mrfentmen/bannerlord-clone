/**
 * The map's coordinate readout (Buffy task 198).
 *
 * A corner box that says where the pointer is. It computes nothing about the map:
 * the caller hands it the geographic position it already resolved (the scene
 * picks the ground, the `Projection` in `src/world` turns world metres into
 * latitude and longitude), and this prints it. Four decimal places is about eleven
 * metres — finer than the eye can place on the map, coarse enough that the number
 * stops twitching while the pointer is still.
 *
 * The box is hidden whenever there is no pointer over the map, because a readout
 * holding the last place the cursor was is a claim about where the cursor is, and
 * it would be wrong. `clear()` puts it back to that state, and `set()` is the only
 * way to have it show anything.
 */

import { h } from "../ui/dom.js";
import "./mapOverlay.css";

/** Decimal places in the printed latitude and longitude. */
const COORDINATE_PRECISION = 4;

export interface MapPosition {
  lat: number;
  lon: number;
  /** What the pointer is over, when the caller knows. Printed ahead of the numbers. */
  label?: string;
}

export interface CoordinateReadoutHandle {
  root: HTMLElement;
  /** Show a position, or clear the readout with `null`. */
  set(position: MapPosition | null): void;
  /** The text currently printed, or `""` when hidden. */
  text(): string;
  destroy(): void;
}

export function createCoordinateReadout(options: { testId?: string } = {}): CoordinateReadoutHandle {
  const label = h("span", { class: "map-overlay__value", "data-testid": "map-readout-label" });
  const coords = h("span", { class: "map-overlay__value", "data-testid": "map-readout-coords" });

  const root = h(
    "div",
    {
      class: "map-overlay map-overlay--readout",
      "data-testid": options.testId ?? "map-coordinate-readout",
      "data-visible": "false",
      // The readout restates where the pointer is for anyone who cannot see it
      // under the cursor, so it is announced — politely, because it changes on
      // every mouse move and an assertive region would talk over everything.
      role: "status",
      "aria-live": "polite",
      "aria-atomic": "true",
    },
    label,
    coords,
  );

  const hide = (): void => {
    label.textContent = "";
    coords.textContent = "";
    root.setAttribute("data-visible", "false");
    root.removeAttribute("aria-label");
  };

  return {
    root,
    set(position: MapPosition | null): void {
      if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lon)) {
        // No pointer over the map, or a pick that resolved nowhere. Either way
        // there is no position to report and the box empties rather than guessing.
        hide();
        return;
      }
      const lat = position.lat.toFixed(COORDINATE_PRECISION);
      const lon = position.lon.toFixed(COORDINATE_PRECISION);
      coords.textContent = `${lat}°, ${lon}°`;
      label.textContent = position.label ?? "";
      root.setAttribute("aria-label", position.label ? `${position.label}, ${lat}, ${lon}` : `${lat}, ${lon}`);
      root.setAttribute("data-visible", "true");
    },
    text(): string {
      return coords.textContent ?? "";
    },
    destroy(): void {
      hide();
      root.remove();
    },
  };
}