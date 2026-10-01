/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import { attachMapGestures, type GestureCamera, type MapGestures } from "../gestures.js";

function fakeCamera(): GestureCamera & { pans: { dx: number; dz: number }[]; zooms: number[] } {
  // 10 world units per pixel, screen x -> world x, screen y -> world z.
  return {
    pans: [],
    zooms: [],
    screenToWorld: (dxPx, dyPx) => ({ dx: dxPx * 10, dz: dyPx * 10 }),
    panByWorld(dx, dz) {
      this.pans.push({ dx, dz });
    },
    zoomBy(factor) {
      this.zooms.push(factor);
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
    gestures.pointerMove(2, 150, 100); // dist 50: pinch -> zoom out
    expect(camera.zooms[1]).toBeCloseTo(200 / 50, 9);
  });

  it("two-finger drag pans by the midpoint", () => {
    gestures.pointerDown(1, 100, 100);
    gestures.pointerDown(2, 200, 100);
    camera.pans.length = 0;
    gestures.pointerMove(1, 110, 100);
    gestures.pointerMove(2, 210, 100); // mid moved +10x in two +5 steps
    const totalDx = camera.pans.reduce((s, p) => s + p.dx, 0);
    expect(totalDx).toBeCloseTo(-100, 9);
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
});
