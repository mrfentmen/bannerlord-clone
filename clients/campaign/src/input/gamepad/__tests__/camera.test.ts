import { describe, expect, it } from "vitest";
import { createStickCamera, type StickCameraOptions } from "../camera.js";
import type { GamepadManager } from "../manager.js";
import type { CameraDelta } from "../../../scene/CampaignScene.js";

function fakeManager(
  axes: [number, number, number, number] = [0, 0, 0, 0],
  triggers: [number, number] = [0, 0],
): GamepadManager {
  return {
    axes: () => axes,
    triggers: () => triggers,
  } as GamepadManager;
}

function drive(
  opts: Partial<StickCameraOptions> & { manager: GamepadManager },
): { deltas: CameraDelta[] } {
  const deltas: CameraDelta[] = [];
  const cam = createStickCamera({
    control: (d) => deltas.push(d),
    ...opts,
  });
  cam.update(0);
  cam.update(100); // dt = 0.1s
  return { deltas };
}

describe("twin-stick camera (task 2)", () => {
  it("pans with the left stick, scaled by speedScale", () => {
    const { deltas } = drive({
      manager: fakeManager([0.5, -0.25, 0, 0]),
      speedScale: () => 2,
    });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.panX).toBeCloseTo(0.5 * 20_000 * 2 * 0.1, 6);
    expect(deltas[0]!.panZ).toBeCloseTo(-0.25 * 20_000 * 2 * 0.1, 6);
    expect(deltas[0]!.dAlpha).toBeUndefined();
  });

  it("orbits with the right stick", () => {
    const { deltas } = drive({ manager: fakeManager([0, 0, 1, -1]) });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.dAlpha).toBeCloseTo(-1.4 * 0.1, 6);
    expect(deltas[0]!.dBeta).toBeCloseTo(-0.9 * 0.1, 6);
  });

  it("flips orbit pitch when inverted", () => {
    const { deltas } = drive({
      manager: fakeManager([0, 0, 0, 1]),
      invertOrbitY: () => true,
    });
    expect(deltas[0]!.dBeta).toBeCloseTo(-0.9 * 0.1, 6);
  });

  it("zooms with the triggers: RT in, LT out, both cancel", () => {
    const zoomIn = drive({ manager: fakeManager([0, 0, 0, 0], [0, 1]) });
    expect(zoomIn.deltas[0]!.zoomFactor).toBeCloseTo(Math.exp(-0.08), 6);

    const zoomOut = drive({ manager: fakeManager([0, 0, 0, 0], [1, 0]) });
    expect(zoomOut.deltas[0]!.zoomFactor).toBeCloseTo(Math.exp(0.08), 6);

    const cancel = drive({ manager: fakeManager([0, 0, 0, 0], [1, 1]) });
    expect(cancel.deltas).toEqual([]);
  });

  it("does nothing when disabled, inactive, or idle", () => {
    const hot: [number, number, number, number] = [1, 1, 1, 1];
    expect(drive({ manager: fakeManager(hot), isEnabled: () => false }).deltas).toEqual([]);
    expect(drive({ manager: fakeManager(hot), isActive: () => false }).deltas).toEqual([]);
    expect(drive({ manager: fakeManager() }).deltas).toEqual([]);
  });

  it("clamps dt so a backgrounded tab can't teleport the camera", () => {
    const deltas: CameraDelta[] = [];
    const cam = createStickCamera({
      manager: fakeManager([1, 0, 0, 0]),
      control: (d) => deltas.push(d),
    });
    cam.update(0);
    cam.update(60_000); // 60s gap clamps to 0.1s
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.panX).toBeCloseTo(20_000 * 0.1, 6);
  });

  it("honours custom speeds", () => {
    const { deltas } = drive({
      manager: fakeManager([1, 0, 1, 1], [0, 1]),
      panSpeed: 1000,
      orbitSpeed: 2,
      pitchSpeed: 3,
      zoomSpeed: 1,
    });
    expect(deltas[0]!.panX).toBeCloseTo(100, 6);
    expect(deltas[0]!.dAlpha).toBeCloseTo(-0.2, 6);
    expect(deltas[0]!.dBeta).toBeCloseTo(0.3, 6);
    expect(deltas[0]!.zoomFactor).toBeCloseTo(Math.exp(-0.1), 6);
  });
});
