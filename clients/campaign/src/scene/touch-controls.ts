/**
 * Touch controls for the map and battle cameras. MASTER_PLAN.md section 4F task 154.
 *
 * Babylon's pointer input already speaks multitouch: pinch to zoom, two-finger
 * drag to pan. This module pins the sensitivities down so those gestures behave
 * in mobile Safari, and stamps `touch-action: none` on the canvas so the browser
 * does not steal the gestures for its own scrolling.
 *
 * The campaign client calls it right after creating the CampaignScene or
 * BattleScene camera; `detach()` restores nothing on the camera but stops the
 * control so scenes can be torn down cleanly.
 */

import type { ArcRotateCamera } from "@babylonjs/core";

/** The subset of the Babylon pointer input we configure. */
interface PointerInputShape {
  multiTouchPanAndZoom?: boolean;
  multiTouchPanning?: boolean;
  pinchDeltaPercentage?: number;
  pinchPrecision?: number;
  panningSensibility?: number;
}

export interface TouchControlsHandle {
  detach(): void;
}

export function attachTouchControls(camera: ArcRotateCamera, canvas: HTMLCanvasElement): TouchControlsHandle {
  // Without this, mobile Safari eats two-finger gestures for page scroll/zoom.
  canvas.style.touchAction = "none";

  const pointers = camera.inputs.attached["pointers"] as PointerInputShape | undefined;
  if (pointers) {
    // Pinch to zoom, two-finger drag to pan. These are the Babylon defaults in
    // recent versions, but pinning them means a Babylon upgrade cannot silently
    // drop mobile gestures.
    if ("multiTouchPanAndZoom" in pointers) pointers.multiTouchPanAndZoom = true;
    if ("multiTouchPanning" in pointers) pointers.multiTouchPanning = true;
    if ("pinchDeltaPercentage" in pointers) pointers.pinchDeltaPercentage = 0.02;
    if ("pinchPrecision" in pointers) pointers.pinchPrecision = 50;
  }

  camera.attachControl(canvas, true);
  return {
    detach(): void {
      camera.detachControl();
    },
  };
}
