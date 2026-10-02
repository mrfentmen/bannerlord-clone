import { describe, expect, it } from "vitest";
import {
  applyMouseCameraBindings,
  DEFAULT_MOUSE_CAMERA_BINDINGS,
  loadMouseCameraBindings,
  MOUSE_BUTTON_LABELS,
  parseMouseCameraBindings,
  saveMouseCameraBindings,
  type MouseCameraBindings,
} from "../mouseBindings.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

function fakeCamera() {
  const camera = {
    _panningMouseButton: 2,
    inputs: { attached: { pointers: { buttons: [0, 1, 2] } } },
  } as unknown as import("@babylonjs/core/Cameras/arcRotateCamera.js").ArcRotateCamera;
  const pointers = camera.inputs.attached.pointers as unknown as import(
    "@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput.js"
  ).ArcRotateCameraPointersInput;
  return { camera, pointers };
}

describe("mouse-button camera remapping (solo task 13)", () => {
  it("parses stored bindings", () => {
    expect(parseMouseCameraBindings({ panButton: 0, rotateButton: 2 })).toEqual({
      panButton: 0,
      rotateButton: 2,
    });
  });

  it("falls back to defaults on garbage", () => {
    expect(parseMouseCameraBindings(null)).toEqual(DEFAULT_MOUSE_CAMERA_BINDINGS);
    expect(parseMouseCameraBindings({ panButton: 9 })).toEqual(DEFAULT_MOUSE_CAMERA_BINDINGS);
  });

  it("forces pan and rotate to differ", () => {
    const b = parseMouseCameraBindings({ panButton: 1, rotateButton: 1 });
    expect(b.panButton).not.toBe(b.rotateButton);
  });

  it("applies to the Babylon camera", () => {
    const { camera, pointers } = fakeCamera();
    const bindings: MouseCameraBindings = { panButton: 0, rotateButton: 2 };
    applyMouseCameraBindings(camera, bindings);
    expect(camera._panningMouseButton).toBe(0);
    expect(pointers.buttons).toEqual([0, 2]);
  });


  it("round-trips through storage", () => {
    const s = memStorage();
    expect(loadMouseCameraBindings(s)).toEqual(DEFAULT_MOUSE_CAMERA_BINDINGS);
    expect(saveMouseCameraBindings({ panButton: 0, rotateButton: 2 }, s)).toBe(true);
    expect(loadMouseCameraBindings(s)).toEqual({ panButton: 0, rotateButton: 2 });
    s.setItem("campaign.mouseCameraBindings.v1", "{nope");
    expect(loadMouseCameraBindings(s)).toEqual(DEFAULT_MOUSE_CAMERA_BINDINGS);
  });

  it("labels all three buttons", () => {
    expect(MOUSE_BUTTON_LABELS[0]).toBe("Left button");
    expect(MOUSE_BUTTON_LABELS[1]).toBe("Middle button");
    expect(MOUSE_BUTTON_LABELS[2]).toBe("Right button");
  });
});
