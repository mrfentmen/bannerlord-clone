/**
 * Individual post-processing toggles (MASTER_PLAN task 146).
 *
 * Bloom, pipeline vignette, and depth of field toggle independently on the
 * Babylon DefaultRenderingPipeline; motion blur is a standalone
 * MotionBlurPostProcess the scene attaches to the camera. This module is the
 * pure policy: given the player's toggles, the look grade's vignette weight,
 * and the reduced-motion flag, it resolves the exact flags. The scene owns
 * the pipeline and applies the resolved flags; nothing here touches Babylon,
 * so it unit-tests without an engine.
 *
 * Interaction rules:
 * - Vignette is a gate on the look grade's vignette (task 145): the grade
 *   still decides the weight, this toggle decides whether it shows at all.
 * - Motion blur is a reduced-motion casualty (task 20): it never turns on
 *   while reduceMotion is set, no matter the toggle.
 */

export interface PostFxToggles {
  bloom: boolean;
  vignette: boolean;
  depthOfField: boolean;
  motionBlur: boolean;
}

export interface ResolvedPostFx {
  bloomEnabled: boolean;
  depthOfFieldEnabled: boolean;
  motionBlurEnabled: boolean;
  vignetteEnabled: boolean;
}

export const DEFAULT_POSTFX_TOGGLES: PostFxToggles = {
  bloom: false,
  vignette: true,
  depthOfField: false,
  motionBlur: false,
};

export function resolvePostFx(
  toggles: PostFxToggles,
  gradeVignetteWeight: number,
  reduceMotion: boolean,
): ResolvedPostFx {
  return {
    bloomEnabled: toggles.bloom,
    depthOfFieldEnabled: toggles.depthOfField,
    motionBlurEnabled: toggles.motionBlur && !reduceMotion,
    vignetteEnabled: toggles.vignette && gradeVignetteWeight > 0,
  };
}
