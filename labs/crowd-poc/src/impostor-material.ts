/**
 * Far-tier billboard impostor material.
 *
 * ASSETS.md section 4.3 requires a billboard impostor as the third LOD tier, and ART_AND_AUDIO.md
 * section 7 requires the silhouette to read at distance. The atlas built by tools/impostor holds
 * the figure at N viewing angles across N frames of the walk cycle, so this material picks the
 * cell nearest the camera's bearing and shows the right phase of the gait.
 *
 * Two things make this tier cheap, which is the entire point of it existing:
 *
 *  - 2 triangles per unit, against 3,000 for the mid tier and 9,000 for the close tier.
 *  - No skinning at all. The gait is baked into the atlas, so there are no matrix texture fetches
 *    and no per-vertex work. That is what makes the far tier affordable at 1,000 units, and it is
 *    why the impostor is animated rather than a static cut-out.
 *
 * The billboard is built in the vertex shader from the instance position and the camera basis, so
 * the CPU never rotates anything.
 */

import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex";

const VERTEX = `
precision highp float;

#include<instancesDeclaration>

attribute vec3 position;   // unit quad: x in [-0.5,0.5] scaled, y in [0,1], z = 0
attribute vec2 uv;

uniform mat4 viewProjection;
uniform vec3 camPos;
uniform vec2 atlasAnglesFrames;   // angles across, frames down
uniform float height;              // metres, matches the troop
uniform float width;               // metres
uniform float globalTime;
uniform float frameCount;
uniform float loopDuration;
uniform float alphaCutoff;
uniform vec2 fadeRangeM;      // metres: fully visible below x, faded out above y

varying vec2 vAtlasUv;
varying float vFade;

void main() {
  #include<instancesVertex>
  vec3 origin = vec3(finalWorld[3][0], finalWorld[3][1], finalWorld[3][2]);

  // Camera-facing basis in world space, built from the view direction to this unit.
  vec3 toCam = camPos - origin;
  float dist = max(0.001, length(toCam));
  vec3 fwd = toCam / dist;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = vec3(0.0, 1.0, 0.0);

  // Choose the atlas column nearest the camera's horizontal bearing.
  float bearing = atan(toCam.x, toCam.z);
  float ang = bearing / 6.2831853 + 0.5;            // 0..1
  float col = floor(ang * atlasAnglesFrames.x);
  col = mod(col + atlasAnglesFrames.x, atlasAnglesFrames.x);

  // Row follows the same clock as the skinned tiers, so a unit that changes tier keeps its phase.
  float f = fract(globalTime / loopDuration);
  float row = floor(f * frameCount);
  row = mod(row, frameCount);

  vec2 cell = vec2(1.0 / atlasAnglesFrames.x, 1.0 / atlasAnglesFrames.y);
  vAtlasUv = (vec2(col, row) + uv) * cell;

  // Fade the impostor out over the back of the far tier, so handing over to the mid tier is not a
  // pop. The range is in METRES, matching the LOD thresholds: a fade written against a 0..1 factor
  // here evaluates to zero at every real distance and turns the whole tier black.
  vFade = 1.0 - smoothstep(fadeRangeM.x, fadeRangeM.y, dist);

  vec3 world = origin + right * (position.x * width) + up * (position.y * height);
  gl_Position = viewProjection * vec4(world, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
varying vec2 vAtlasUv;
varying float vFade;
uniform sampler2D atlas;
uniform vec3 tint;
uniform float alphaCutoff;

void main() {
  vec4 c = texture2D(atlas, vAtlasUv);
  // The atlas is baked on a transparent background, so coverage comes from alpha.
  if (c.a < alphaCutoff) discard;
  gl_FragColor = vec4(c.rgb * tint, 1.0) * vFade;
}
`;

export interface ImpostorMaterialOptions {
  scene: Scene;
  atlas: Texture;
  angles: number;
  frames: number;
  /** Seconds for one full gait cycle, matched to the baked clip duration. */
  loopDuration: number;
  height: number;
  width: number;
  tint: [number, number, number];
  /** Fade the impostor out between these distances, in metres. */
  fadeRangeM: [number, number];
}

export class ImpostorMaterial extends ShaderMaterial {
  constructor(opts: ImpostorMaterialOptions) {
    super("crowdImpostor", opts.scene, { vertexSource: VERTEX, fragmentSource: FRAGMENT }, {
      attributes: ["position", "uv", "world0", "world1", "world2", "world3"],
      uniforms: ["viewProjection", "world", "camPos", "atlasAnglesFrames", "height", "width",
        "globalTime", "frameCount", "alphaCutoff", "atlas", "tint", "fadeRangeM"],
    });
    this.setTexture("atlas", opts.atlas);
    this.setVector2("atlasAnglesFrames", new Vector2(opts.angles, opts.frames));
    this.setFloat("height", opts.height);
    this.setFloat("width", opts.width);
    this.setFloat("frameCount", opts.frames);
    this.setFloat("loopDuration", opts.loopDuration);
    this.setFloat("alphaCutoff", 0.35);
    this.setVector2("fadeRangeM", new Vector2(opts.fadeRangeM[0], opts.fadeRangeM[1]));
    this.setVector3("tint", new Vector3(...opts.tint));
    this.backFaceCulling = false;
  }

  setTime(seconds: number): void {
    this.setFloat("globalTime", seconds);
  }

  setCamera(x: number, y: number, z: number): void {
    this.setVector3("camPos", new Vector3(x, y, z));
  }
}

Effect.ShadersStore["crowdImpostorVertexShader"] = VERTEX;
Effect.ShadersStore["crowdImpostorFragmentShader"] = FRAGMENT;
