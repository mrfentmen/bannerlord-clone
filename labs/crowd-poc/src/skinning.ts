/**
 * GPU vertex-texture skinning.
 *
 * SPEC.md section 5.1 and ASSETS.md section 4.2: animations are baked to textures and the GPU
 * skins every instance from a texture fetch. No per-instance CPU bone skinning past a few dozen
 * units, because the CPU cannot do it (see tools/benchmark.mjs --cpu-baseline for the measurement).
 *
 * How a vertex is skinned, per instance, in the vertex shader:
 *
 *   row  = clipRowStart[clip] + fract(time / duration + phase) * (frameCount - 1)
 *   skin = sum over the 4 influences of  weight_i * jointMatrix(joints_i, row)
 *   pos' = skin * position
 *
 * `jointMatrix` reads 4 texels. The matrix is stored column-major, one column per texel, so
 * mat4(t0, t1, t2, t3) reconstructs it directly and no transposing is needed in the shader.
 *
 * `phase` arrives as a per-instance vertex attribute, so a thousand units share one draw call and
 * still animate out of step with each other. That is the whole point: the CPU writes the instance
 * matrices once and then never touches them.
 */

import { Constants } from "@babylonjs/core/Engines/constants";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AnimHeader } from "./config";
import "@babylonjs/core/Shaders/ShadersInclude/instancesDeclaration";
import "@babylonjs/core/Shaders/ShadersInclude/instancesVertex";

export type { AnimClip, AnimHeader } from "./config";

/** Clip parameters live in fixed-size float arrays so they can be indexed by a loop counter. */
const MAX_CLIPS = 4;

const VERTEX = `
precision highp float;

#include<instancesDeclaration>

attribute vec3 position;
attribute vec3 normal;
attribute vec4 joints;
attribute vec4 weights;

// Per instance: x = clip index, y = phase in [0,1), z = shade variation, w = unused.
attribute vec4 instAnim;

uniform mat4 viewProjection;
uniform sampler2D animTex;
uniform vec2 animTexSize;
uniform float clipRowAt[${MAX_CLIPS}];
uniform float clipFramesAt[${MAX_CLIPS}];
uniform float clipDurationAt[${MAX_CLIPS}];
uniform float globalTime;
uniform vec3 lightDir;
// 0 = normal. 1 = skip skinning entirely, which shows the raw mesh through the instance matrices.
// 2 = skin against the clip's row 0 only, isolating the texture fetch from the frame arithmetic.
uniform float uDebug;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vShade;

// The baked matrix is column-major, one column per texel, so GLSL's mat4(c0,c1,c2,c3) is exact.
mat4 fetchJoint(float joint, float row) {
  float x0 = (joint * 4.0 + 0.5) / animTexSize.x;
  float x1 = (joint * 4.0 + 1.5) / animTexSize.x;
  float x2 = (joint * 4.0 + 2.5) / animTexSize.x;
  float x3 = (joint * 4.0 + 3.5) / animTexSize.x;
  float y = (floor(row) + 0.5) / animTexSize.y;
  return mat4(
    texture2D(animTex, vec2(x0, y)),
    texture2D(animTex, vec2(x1, y)),
    texture2D(animTex, vec2(x2, y)),
    texture2D(animTex, vec2(x3, y))
  );
}

void main() {
  int clip = int(instAnim.x + 0.5);

  // A loop index is a constant-index expression, so indexing a uniform array with it is
  // portable. Indexing with instAnim.x, which is not constant, would not be.
  float rowStart = 0.0;
  float frameCount = 2.0;
  float duration = 1.0;
  for (int i = 0; i < ${MAX_CLIPS}; i++) {
    if (i == clip) {
      rowStart = clipRowAt[i];
      frameCount = clipFramesAt[i];
      duration = clipDurationAt[i];
    }
  }

  float u = fract(globalTime / duration + instAnim.y);
  float row = rowStart + u * (frameCount - 1.0);
  if (uDebug > 1.5) { row = rowStart; }

  // uDebug == 1 leaves the skin matrix at identity, which skips the texture fetch entirely and
  // shows the raw mesh through the instance matrices. Used to tell "the geometry is wrong" apart
  // from "the skinning texture is wrong" without guessing.
  mat4 skin = mat4(1.0);
  if (uDebug < 0.5 || uDebug > 1.5) {
    skin = mat4(0.0);
    for (int i = 0; i < 4; i++) {
      float w = weights[i];
      if (w > 0.0) {
        skin += w * fetchJoint(joints[i], row);
      }
    }
  }

  vec4 skinned = skin * vec4(position, 1.0);

  #include<instancesVertex>

  vec4 worldPos = finalWorld * skinned;
  vWorld = worldPos.xyz;

  // The baked matrices are rigid (tools/pipeline/verify_bake.py asserts determinant 1 and
  // orthonormal axes), so the 3x3 part can transform a normal directly with no inverse
  // transpose. A sheared matrix would show up here as lighting that changes with the pose.
  vNormal = normalize(mat3(finalWorld) * (mat3(skin) * normal));

  vShade = (0.45 + 0.55 * max(0.0, dot(vNormal, lightDir))) * instAnim.z;
  gl_Position = viewProjection * worldPos;
}
`;

const FRAGMENT = `
precision highp float;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vShade;

uniform vec3 baseTint;
uniform float fogStart;
uniform float fogEnd;
uniform vec3 fogColor;

void main() {
  vec3 albedo = baseTint * (0.55 + 0.45 * vShade);
  float d = length(vWorld);
  float fog = clamp((d - fogStart) / max(1.0, fogEnd - fogStart), 0.0, 1.0);
  gl_FragColor = vec4(mix(albedo, fogColor, fog), 1.0);
}
`;

export interface SkinnedMaterialOptions {
  scene: Scene;
  header: AnimHeader;
  data: Float32Array;
  baseTint: [number, number, number];
  lightDir: [number, number, number];
  fogColor: [number, number, number];
  fogRange: [number, number];
  /** 0 normal, 1 skip skinning, 2 bind pose only. See the shader for what each isolates. */
  debug?: number;
}

export class SkinnedMaterial extends ShaderMaterial {
  private readonly animTex: RawTexture;

  constructor(opts: SkinnedMaterialOptions) {
    const { scene, header, data } = opts;
    super(
      "crowdSkin",
      scene,
      { vertexSource: VERTEX, fragmentSource: FRAGMENT },
      {
        attributes: [
          "position", "normal", "joints", "weights", "instAnim",
          "world0", "world1", "world2", "world3",
        ],
        uniforms: [
          "viewProjection", "world", "view", "animTex", "animTexSize",
          "clipRowAt", "clipFramesAt", "clipDurationAt", "globalTime",
          "lightDir", "baseTint", "fogStart", "fogEnd", "fogColor", "uDebug",
        ],
      }
    );

    this.animTex = RawTexture.CreateRGBATexture(
      data,
      header.width,
      header.height,
      scene,
      /* generateMipMaps */ false,
      /* invertY */ false,
      Texture.NEAREST_SAMPLINGMODE,
      Constants.TEXTURETYPE_FLOAT
    );
    this.animTex.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.animTex.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.setTexture("animTex", this.animTex);
    this.setVector2("animTexSize", new Vector2(header.width, header.height));

    const names = Object.keys(header.clips);
    const rows = new Array(MAX_CLIPS).fill(0);
    const frames = new Array(MAX_CLIPS).fill(1);
    const durations = new Array(MAX_CLIPS).fill(1);
    for (let i = 0; i < MAX_CLIPS; i++) {
      const c = header.clips[names[i]];
      if (!c) continue;
      rows[i] = c.rowStart;
      frames[i] = Math.max(1, c.rowCount);
      durations[i] = c.duration;
    }
    this.setFloats("clipRowAt", rows);
    this.setFloats("clipFramesAt", frames);
    this.setFloats("clipDurationAt", durations);

    this.setVector3("lightDir", new Vector3(...opts.lightDir));
    // vec3 uniforms, so setVector3. setColor3 reads .r/.g/.b, and handing it a Vector3 (which has
    // .x/.y/.z) silently produces a uniform full of NaN, which renders as black rather than failing.
    this.setVector3("baseTint", new Vector3(...opts.baseTint));
    this.setVector3("fogColor", new Vector3(...opts.fogColor));
    this.setFloat("uDebug", opts.debug ?? 0);
    this.setFloat("fogStart", opts.fogRange[0]);
    this.setFloat("fogEnd", opts.fogRange[1]);
    this.backFaceCulling = true;
  }

  setTime(seconds: number): void {
    this.setFloat("globalTime", seconds);
  }

  setDebug(mode: number): void {
    this.setFloat("uDebug", mode);
  }

  override dispose(): void {
    this.animTex.dispose();
    super.dispose();
  }
}
