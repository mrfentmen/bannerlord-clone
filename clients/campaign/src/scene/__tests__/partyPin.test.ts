/**
 * The party marker at campaign zoom.
 *
 * The convoy itself is about 12 m tall. On a 68 km wide region at the default camera
 * distance, one pixel is roughly 35 m, so the convoy covers a third of a pixel and the
 * player cannot find their own party. The pin exists to fix that, which means its size
 * is a function of camera distance rather than a constant — and a distance-dependent
 * size is exactly the sort of thing that silently stops working at the zoom limits.
 */

import { describe, expect, it } from "vitest";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { sizePartyPin } from "../CampaignScene.js";
import { markerWorldSize } from "../network.js";

/** The default campaign framing from `createCampaignScene`. */
const CAMPAIGN_RADIUS = 30_000;
const UPPER_RADIUS = 95_000;
const LOWER_RADIUS = 900;
const FOV = 0.8;
const VIEWPORT_PX = 1080;

function newScene(): Scene {
  return new Scene(
    new NullEngine({
      renderWidth: 64,
      renderHeight: 64,
      deterministicLockstep: false,
      textureSize: 64,
      lockstepMaxSteps: 4,
    }),
  );
}

function metresAt(radius: number, viewportPx = VIEWPORT_PX): number {
  return sizePartyPin(new Mesh("probe", newScene()), radius, viewportPx, FOV);
}

describe("the party pin", () => {
  it("reads as tens of pixels at the default campaign zoom", () => {
    // The whole point: roughly a fifth of the way across a 1080 px viewport, which is
    // about the size of a town marker at the same framing.
    const metres = metresAt(CAMPAIGN_RADIUS);
    expect(metres).toBeGreaterThan(300);
    expect(metres).toBeLessThan(700);
  });

  it("holds a constant apparent size as the camera moves", () => {
    // Halving the camera distance should halve the world size, or the pin grows on
    // screen as you approach it. Both radii are inside the unclamped band, since the
    // clamps are separately asserted below.
    const near = metresAt(CAMPAIGN_RADIUS / 2);
    const far = metresAt(CAMPAIGN_RADIUS);
    expect(near / far).toBeCloseTo(0.5, 6);
  });

  it("never grows past a city marker, so a town still outshouts the party", () => {
    // Checked against the real marker size rather than a copy of the number.
    expect(metresAt(UPPER_RADIUS)).toBeLessThan(markerWorldSize("city"));
  });

  it("never shrinks below the convoy it sits over", () => {
    // At the closest zoom an unclamped pin would be several hundred metres across and
    // would swallow the vehicles and the pennant.
    const closest = metresAt(LOWER_RADIUS);
    expect(closest).toBeGreaterThanOrEqual(30);
    expect(closest).toBeLessThan(markerWorldSize("village"));
  });

  it("survives a degenerate viewport instead of producing a zero-size pin", () => {
    // A zero viewport would otherwise divide by zero and collapse the pin to nothing.
    expect(Number.isFinite(metresAt(CAMPAIGN_RADIUS, 0))).toBe(true);
    expect(metresAt(CAMPAIGN_RADIUS, 0)).toBeGreaterThan(0);
  });

  it("writes the size it returns onto the mesh", () => {
    const pin = new Mesh("probe", newScene());
    const metres = sizePartyPin(pin, CAMPAIGN_RADIUS, VIEWPORT_PX, FOV);
    expect(pin.scaling.x).toBeCloseTo(metres, 6);
    expect(pin.scaling.y).toBeCloseTo(metres, 6);
    expect(pin.scaling.z).toBeCloseTo(metres, 6);
  });
});