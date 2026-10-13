/**
 * Touch gestures for the 3D map canvas (MASTER_PLAN task 4).
 *
 * One-finger drag pans the map (grab-the-map: the ground follows the finger);
 * two fingers pinch to zoom and twist to rotate the camera, both at once.
 * Only touch pointers are intercepted — mouse keeps Babylon's default
 * orbit/wheel behaviour.
 *
 * Babylon's ArcRotateCamera would otherwise orbit on a one-finger drag, so the
 * canvas's touch pointerdowns are captured on the parent and stopPropagation'd
 * before Babylon's listeners see them. The pointerdown is also preventDefaulted,
 * which suppresses the browser's compatibility mouse events — a gesture never
 * synthesizes a click. The camera itself is driven through the small
 * `GestureCamera` interface, which the scene implements with its real
 * ArcRotateCamera; tests use a fake.
 */

export interface GestureCamera {
  /**
   * Convert a screen-space drag (px, +x right, +y down) into the world-space
   * ground vector the drag covers. Implemented by the scene from the live
   * camera orientation and zoom.
   */
  screenToWorld(dxPx: number, dyPx: number): { dx: number; dz: number };
  /** Move the camera target by world-unit deltas (x east, z south). */
  panByWorld(dx: number, dz: number): void;
  /** Multiply the camera radius by factor (<1 zooms in). */
  zoomBy(factor: number): void;
  /** Called after a non-zero zoom delta, for a zoom tick or other feedback. */
  onZoomInput?(): void;
  /**
   * Rotate the camera azimuth by radians. Positive dAlpha is a clockwise
   * finger twist (screen space, y down); the ground follows the fingers.
   */
  rotateBy(dAlpha: number): void;
}

export interface MapGestures {
  dispose(): void;
  /** Test seam + the DOM handlers below call these. */
  pointerDown(id: number, x: number, y: number): void;
  pointerMove(id: number, x: number, y: number): void;
  pointerUp(id: number): void;
}

interface Tracked {
  x: number;
  y: number;
  px: number;
  py: number;
}

export function attachMapGestures(element: HTMLElement, camera: GestureCamera): MapGestures {
  const pointers = new Map<number, Tracked>();
  let pinchDist = 0;
  let pinchAngle = 0;

  function syncPinch(): void {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
    // Re-anchor both fingers so the mode switch doesn't jump.
    for (const p of [a, b]) {
      p.px = p.x;
      p.py = p.y;
    }
  }

  /** Smallest signed angle from `from` to `to`, in [-π, π]. */
  function angleDelta(from: number, to: number): number {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function pointerDown(id: number, x: number, y: number): void {
    if (pointers.size >= 2) return; // ignore a third finger
    pointers.set(id, { x, y, px: x, py: y });
    if (pointers.size === 2) syncPinch();
  }

  function pointerMove(id: number, x: number, y: number): void {
    const p = pointers.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    if (pointers.size === 1) {
      const w = camera.screenToWorld(p.x - p.px, p.y - p.py);
      camera.panByWorld(-w.dx, -w.dz); // grab-the-map
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      // Pinch zoom and two-finger rotate compose in one move.
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && pinchDist > 0) {
        const factor = pinchDist / dist;
        if (factor !== 1) {
          camera.zoomBy(factor);
          camera.onZoomInput?.();
        }
      }
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      camera.rotateBy(angleDelta(pinchAngle, angle));
      pinchDist = dist;
      pinchAngle = angle;
    }
    p.px = p.x;
    p.py = p.y;
  }

  function pointerUp(id: number): void {
    pointers.delete(id);
    if (pointers.size === 1) {
      // Back to one finger: re-anchor it so the drag doesn't jump.
      const rest = [...pointers.values()][0];
      if (rest) {
        rest.px = rest.x;
        rest.py = rest.y;
      }
    } else if (pointers.size === 2) {
      syncPinch();
    }
  }

  // -- DOM wiring -----------------------------------------------------------
  // Touch pointerdowns are intercepted on the parent in the capture phase and
  // stopped before Babylon's canvas listeners see them; otherwise a one-finger
  // drag would orbit the camera at the same time as we pan it. The
  // preventDefault also suppresses the browser's compatibility mouse events,
  // so a gesture never synthesizes a click (task 4 acceptance).
  const parent = element.parentElement ?? element;
  const trackedIds = new Set<number>();

  function onDown(ev: PointerEvent): void {
    if (ev.pointerType !== "touch") return;
    if (!element.contains(ev.target as Node)) return;
    ev.stopPropagation();
    ev.preventDefault();
    trackedIds.add(ev.pointerId);
    pointerDown(ev.pointerId, ev.clientX, ev.clientY);
  }

  function onMove(ev: PointerEvent): void {
    if (!trackedIds.has(ev.pointerId)) return;
    ev.stopPropagation();
    ev.preventDefault();
    pointerMove(ev.pointerId, ev.clientX, ev.clientY);
  }

  function onUp(ev: PointerEvent): void {
    if (!trackedIds.has(ev.pointerId)) return;
    ev.stopPropagation();
    trackedIds.delete(ev.pointerId);
    pointerUp(ev.pointerId);
  }

  parent.addEventListener("pointerdown", onDown, { capture: true });
  window.addEventListener("pointermove", onMove, { capture: true });
  window.addEventListener("pointerup", onUp, { capture: true });
  window.addEventListener("pointercancel", onUp, { capture: true });

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    dispose() {
      parent.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
      pointers.clear();
      trackedIds.clear();
    },
  };
}
