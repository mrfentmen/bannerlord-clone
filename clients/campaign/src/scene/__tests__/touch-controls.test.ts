/**
 * Touch controls tests. MASTER_PLAN.md section 4F task 154.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { ArcRotateCamera, Scene, Vector3 } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { attachTouchControls } from "../touch-controls.js";

function testScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
  return new Scene(engine);
}

function testCamera(scene: Scene): ArcRotateCamera {
  return new ArcRotateCamera("touch-cam", 0, 0.8, 100, new Vector3(0, 0, 0), scene);
}

describe("attachTouchControls", () => {
  it("stamps touch-action: none on the canvas so Safari does not steal gestures", () => {
    const scene = testScene();
    const canvas = document.createElement("canvas");
    attachTouchControls(testCamera(scene), canvas);
    expect(canvas.style.touchAction).toBe("none");
    scene.dispose();
  });

  it("enables multitouch pan and zoom on the pointer input", () => {
    const scene = testScene();
    const camera = testCamera(scene);
    attachTouchControls(camera, document.createElement("canvas"));
    const pointers = camera.inputs.attached["pointers"] as
      | { multiTouchPanAndZoom?: boolean; multiTouchPanning?: boolean }
      | undefined;
    expect(pointers).toBeDefined();
    expect(pointers?.multiTouchPanAndZoom).toBe(true);
    expect(pointers?.multiTouchPanning).toBe(true);
    scene.dispose();
  });

  it("detach stops camera control without throwing", () => {
    const scene = testScene();
    const handle = attachTouchControls(testCamera(scene), document.createElement("canvas"));
    expect(() => handle.detach()).not.toThrow();
    scene.dispose();
  });

  it("does not throw when the camera has no pointer input attached", () => {
    const scene = testScene();
    const camera = testCamera(scene);
    camera.inputs.remove(camera.inputs.attached["pointers"] as never);
    const canvas = document.createElement("canvas");
    expect(() => attachTouchControls(camera, canvas)).not.toThrow();
    expect(canvas.style.touchAction).toBe("none");
    scene.dispose();
  });
});
