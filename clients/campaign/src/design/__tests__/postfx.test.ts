/**
 * Post-processing toggle policy tests (MASTER_PLAN task 146).
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_POSTFX_TOGGLES, resolvePostFx, type PostFxToggles } from "../postfx.js";

const ALL_ON: PostFxToggles = { bloom: true, vignette: true, depthOfField: true, motionBlur: true };
const ALL_OFF: PostFxToggles = { bloom: false, vignette: false, depthOfField: false, motionBlur: false };

describe("resolvePostFx", () => {
  it("passes each toggle through independently", () => {
    const on = resolvePostFx(ALL_ON, 0.5, false);
    expect(on).toEqual({ bloomEnabled: true, depthOfFieldEnabled: true, motionBlurEnabled: true, vignetteEnabled: true });
    const off = resolvePostFx(ALL_OFF, 0.5, false);
    expect(off).toEqual({ bloomEnabled: false, depthOfFieldEnabled: false, motionBlurEnabled: false, vignetteEnabled: false });
    // One toggle on, the rest off: no cross-talk.
    const onlyBloom = resolvePostFx({ ...ALL_OFF, bloom: true }, 0.5, false);
    expect(onlyBloom.bloomEnabled).toBe(true);
    expect(onlyBloom.depthOfFieldEnabled).toBe(false);
    expect(onlyBloom.motionBlurEnabled).toBe(false);
    expect(onlyBloom.vignetteEnabled).toBe(false);
  });

  it("gates the grade vignette instead of replacing it", () => {
    // Toggle on but the grade has no vignette: stays off.
    expect(resolvePostFx(ALL_ON, 0, false).vignetteEnabled).toBe(false);
    // Toggle off with a heavy grade vignette: stays off.
    expect(resolvePostFx({ ...ALL_ON, vignette: false }, 0.9, false).vignetteEnabled).toBe(false);
    // Both on: shows.
    expect(resolvePostFx(ALL_ON, 0.9, false).vignetteEnabled).toBe(true);
  });

  it("forces motion blur off under reduced motion", () => {
    expect(resolvePostFx(ALL_ON, 0.5, true).motionBlurEnabled).toBe(false);
    expect(resolvePostFx(ALL_ON, 0.5, false).motionBlurEnabled).toBe(true);
  });

  it("ships today's look as the default (only the grade vignette on)", () => {
    expect(DEFAULT_POSTFX_TOGGLES).toEqual({ bloom: false, vignette: true, depthOfField: false, motionBlur: false });
    const resolved = resolvePostFx(DEFAULT_POSTFX_TOGGLES, 0.4, false);
    expect(resolved).toEqual({ bloomEnabled: false, depthOfFieldEnabled: false, motionBlurEnabled: false, vignetteEnabled: true });
  });
});
