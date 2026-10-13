/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { attachMapGestures, type GestureCamera, type MapGestures } from "../gestures.js";

function fakeCamera(): GestureCamera & {
  pans: { dx: number; dz: number }[];
  zooms: number[];
  rotations: number[];
  zoomInputs: number;
} {
  // 10 world units per pixel, screen x -> world x, screen y -> world z.
  return {
    pans: [],
    zooms: [],
    rotations: [],
    zoomInputs: 0,
    screenToWorld: (dxPx, dyPx) => ({ dx: dxPx * 10, dz: dyPx * 10 }),
    panByWorld(dx, dz) {
      this.pans.push({ dx, dz });
    },
    zoomBy(factor) {
      this.zooms.push(factor);
    },
    onZoomInput() {
      this.zoomInputs++;
    },
    rotateBy(dAlpha) {
      this.rotations.push(dAlpha);
    },
  };
}

describe("map touch gestures (task 4)", () => {
  let canvas: HTMLElement;
  let camera: ReturnType<typeof fakeCamera>;
  let gestures: MapGestures;

  beforeEach(() => {
    document.body.innerHTML = "";
    const parent = document.createElement("div");
    canvas = document.createElement("canvas");
    parent.appendChild(canvas);
    document.body.appendChild(parent);
    camera = fakeCamera();
    gestures = attachMapGestures(canvas, camera);
  });

  it("pans grab-the-map on a one-finger drag", () => {
    gestures.pointerDown(1, 100, 100);
    gestures.pointerMove(1, 150, 80);
    expect(camera.pans).toHaveLength(1);
    // Finger moved right 50 / up 20; the ground follows, so the target moves
    // the opposite way.
    expect(camera.pans[0]).toEqual({ dx: -500, dz: 200 });
    expect(camera.zooms).toEqual([]);
  });

  it("pinch out zooms in, pinch in zooms out", () => {
    gestures.pointerDown(1, 100, 100);
    gestures.pointerDown(2, 200, 100); // dist 100
    gestures.pointerMove(2, 300, 100); // dist 200: spread -> zoom in
    expect(camera.zooms).toHaveLength(1);
    expect(camera.zooms[0]).toBeCloseTo(0.5, 9);
    expect(camera.zoomInputs).toBe(1);
    gestures.pointerMove(2, 150, 100); // dist 50: pinch -> zoom out
    expect(camera.zooms[1]).toBeCloseTo(200 / 50, 9);
    expect(camera.zoomInputs).toBe(2);
  });

  it("does not report zoom when only the pinch rotation changes", () => {
    gestures.pointerDown(1, 100, 100);
    gestures.pointerDown(2, 200, 100);
    gestures.pointerMove(2, 100, 200); // same distance, different angle
    expect(camera.zooms).toEqual([]);
    expect(camera.zoomInputs).toBe(0);
  });

  it("two-finger twist rotates the camera (clockwise reads positive)", () => {
    gestures.pointerDown(1, 100, 100);
    gestures.pointerDown(2, 200, 100); // finger angle 0
    gestures.pointerMove(2, 200, 200); // angle π/4: B swung down = clockwise
    expect(camera.rotations).toHaveLength(1);
    expect(camera.rotations[0]).toBeCloseTo(Math.PI / 4, 9);
    gestures.pointerMove(2, 200, 100); // back to angle 0: counter-clockwise
    expect(camera.rotations[1]).toBeCloseTo(-Math.PI / 4, 9);
  });

  it("pinch zoom and rotate compose in one two-finger move", () => {
    gestures.pointerDown(1, 100, 100);
    gestures.pointerDown(2, 200, 100); // dist 100, angle 0
    gestures.pointerMove(2, 300, 200); // dist ~223, angle ~0.46: both change
    expect(camera.zooms).toHaveLength(1);
    expect(camera.rotations).toHaveLength(1);
    expect(camera.rotations[0]).toBeCloseTo(Math.atan2(100, 200), 9);
  });

  it("two-finger rotate re-anchors when a finger lifts", () => {
    gestures.pointerDown(1, 100, 100);
    gestures.pointerDown(2, 200, 100);
    gestures.pointerUp(2);
    gestures.pointerDown(2, 200, 100); // re-anchor at angle 0
    camera.rotations.length = 0;
    gestures.pointerMove(2, 200, 101); // tiny move: no rotation jump
    expect(camera.rotations).toHaveLength(1);
    expect(Math.abs(camera.rotations[0]!)).toBeLessThan(0.05);
  });

  it("ignores a third finger and resets cleanly", () => {
    gestures.pointerDown(1, 0, 0);
    gestures.pointerDown(2, 100, 0);
    gestures.pointerDown(3, 200, 0); // ignored
    gestures.pointerMove(3, 500, 500); // unknown id: no-op
    expect(camera.zooms).toEqual([]);
    gestures.pointerUp(3);
    gestures.pointerUp(2);
    // Back to one finger: no jump on the next move.
    camera.pans.length = 0;
    gestures.pointerMove(1, 10, 0);
    expect(camera.pans).toHaveLength(1);
    expect(camera.pans[0]!.dx).toBeCloseTo(-100, 9);
    expect(camera.pans[0]!.dz).toBeCloseTo(0, 9);
  });

  it("disposes without leaking listeners", () => {
    gestures.dispose();
    gestures.pointerDown(1, 0, 0);
    gestures.pointerMove(1, 50, 0);
    // Seam still works after dispose (listeners are gone, state is not).
    expect(camera.pans).toHaveLength(1);
  });

  it("a touch gesture never reaches Babylon's listeners and never clicks", () => {
    // Stand-ins for Babylon's own canvas-level listeners.
    const seen: string[] = [];
    canvas.addEventListener("pointerdown", () => seen.push("pointerdown"));
    canvas.addEventListener("click", () => seen.push("click"));

    // A real touch pointerdown: bubbles, cancelable, pointerType touch.
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    (down as unknown as { pointerType: string }).pointerType = "touch";
    (down as unknown as { pointerId: number }).pointerId = 7;
    (down as unknown as { clientX: number }).clientX = 100;
    (down as unknown as { clientY: number }).clientY = 100;
    canvas.dispatchEvent(down);

    // The parent's capture listener stopped the event before the canvas's own
    // listeners (Babylon's orbit/zoom) saw it...
    expect(seen).toEqual([]);
    // ...and cancelled it, so the browser will not synthesize a compatibility
    // click after the gesture's pointerup. That is the task 4 acceptance:
    // gestures work without triggering clicks.
    expect(down.defaultPrevented).toBe(true);
  });
});
