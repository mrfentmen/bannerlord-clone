/**
 * The map's zoom controls (Buffy task 171).
 *
 * CampaignScene already owns zoom, pan and the wheel; this is the DOM affordance
 * that drives it from the button. It owns no camera and no zoom state — it sends
 * a step and the caller applies it to whatever it has — so it stays correct
 * whether it is wired to `scene.cameraControl({ zoomFactor })` or to a test double.
 *
 * The step is a multiplicative factor, not a delta, because the camera it drives is
 * an orbit camera: doubling the distance is the same gesture at every zoom level,
 * and an additive step would zoom faster the further out you already are.
 *
 * Two ways in, one way to leave. The buttons are real buttons with real names, and
 * the keyboard route goes through the app's input registry (`map.zoomIn` /
 * `map.zoomOut`) rather than a raw keydown listener, so the keybinding editor
 * already governs these chords and rebinding them changes these buttons too.
 * `destroy()` unsubscribes the registry handler along with the button listeners —
 * a map overlay that outlives its scene must not keep calling into it.
 */

import { h } from "../ui/dom.js";
import { input } from "../input/index.js";
import "./mapOverlay.css";

/** Multiplicative distance step per press. >1 pulls the camera back. */
export const ZOOM_STEP = 1.25;

export interface ZoomControlsOptions {
  /** One zoom step. `factor > 1` moves the camera away; `factor < 1` brings it in. */
  onZoom: (factor: number) => void;
  /**
   * Guard evaluated per press, for when the map is not the thing under the
   * pointer or the camera is mid-transition. Omit to always fire.
   */
  when?: () => boolean;
  testId?: string;
}

export interface ZoomControlsHandle {
  root: HTMLElement;
  /** The number of steps sent, for a caller that wants to assert on it. */
  destroy(): void;
}

export function createZoomControls(options: ZoomControlsOptions): ZoomControlsHandle {
  const root = h(
    "div",
    {
      class: "map-overlay map-overlay--zoom",
      "data-testid": options.testId ?? "map-zoom-controls",
      role: "group",
      "aria-label": "Map zoom",
    },
  );

  const fire = (factor: number): void => {
    if (options.when && !options.when()) return;
    options.onZoom(factor);
  };

  const out = h(
    "button",
    {
      type: "button",
      class: "btn map-overlay__btn",
      "data-testid": "map-zoom-out",
      "aria-label": "Zoom out",
      title: "Zoom out (minus)",
    },
    h("span", { class: "btn__label" }, "−"),
  );
  const inButton = h(
    "button",
    {
      type: "button",
      class: "btn map-overlay__btn",
      "data-testid": "map-zoom-in",
      "aria-label": "Zoom in",
      title: "Zoom in (equals)",
    },
    h("span", { class: "btn__label" }, "+"),
  );

  const onOutClick = (): void => fire(ZOOM_STEP);
  const onInClick = (): void => fire(1 / ZOOM_STEP);
  out.addEventListener("click", onOutClick);
  inButton.addEventListener("click", onInClick);
  root.append(out, inButton);

  // The same gesture by keyboard, through the registry rather than a raw listener,
  // so the keybinding editor governs these buttons along with everything else.
  const stopZoomIn = input.on("map.zoomIn", () => fire(1 / ZOOM_STEP));
  const stopZoomOut = input.on("map.zoomOut", () => fire(ZOOM_STEP));

  return {
    root,
    destroy(): void {
      out.removeEventListener("click", onOutClick);
      inButton.removeEventListener("click", onInClick);
      stopZoomIn();
      stopZoomOut();
    },
  };
}