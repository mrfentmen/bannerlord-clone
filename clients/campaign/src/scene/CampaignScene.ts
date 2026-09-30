/**
 * The campaign scene: engine, camera, lighting, the locked colour grade, and party
 * movement along the real roads.
 *
 * Post-processing is one pipeline built from `ART_DIRECTION.md` section 9, switchable
 * off at low quality because `ART_AND_AUDIO.md` section 10 requires it to be optional.
 * The grain is a real animated pass with a real shader, not an overlay image.
 */

import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Effect,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  PostProcess,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { mapColor, tokens } from "../design/tokens.js";
import { resolveGrade, type QualityLevel } from "../design/grade.js";
import { buildTerrain, terrainSummary } from "./terrain.js";
import {
  buildNetwork,
  buildRouteGraph,
  buildTowns,
  findRoute,
  type RouteGraph,
  type TownCluster,
} from "./network.js";
import type { Projection, WorldData } from "../world/types.js";

/** 1 unit = 1 metre (ART_DIRECTION.md section 7). */
export const VERTICAL_SCALE = 1.6;
const LIFT = 6;

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  world: WorldData;
  projection: Projection;
  year: number;
  quality: QualityLevel;
  onSelect: (settlementId: string) => void;
}

export interface SceneHandle {
  scene: Scene;
  engine: Engine;
  dispose(): void;
  focus(x: number, z: number, radius?: number): void;
  /** Draw the planned march route. An empty array clears it. */
  showRoute(points: Vector3[]): void;
  setPartyPosition(x: number, z: number, heading: number): void;
  setPartyVisible(visible: boolean): void;
  /** One line about what the map is showing, for the data-source panel. */
  summary(): string;
  towns: TownCluster[];
}

export function createCampaignScene(options: SceneOptions): SceneHandle {
  const { canvas, world, projection } = options;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(`${mapColor.sky}ff`);
  // Haze, not soup. At map scale the camera is 10 to 90 km from the far side of the
  // region, and the first value tried here fogged the entire terrain into a flat grey.
  // This one leaves the near half of the map clear and lets the far ridges recede,
  // which is what overcast distance actually does.
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0000085;
  scene.fogColor = Color3.FromHexString(mapColor.fog);
  scene.ambientColor = new Color3(0.3, 0.31, 0.3);

  // -- camera ---------------------------------------------------------------
  const camera = new ArcRotateCamera(
    "camera",
    // A higher angle than a ground-level camera: at campaign zoom the road network and
    // the town pins are the information, and a low angle hides them behind relief.
    -Math.PI / 2.4,
    0.78,
    30_000,
    new Vector3(projection.width / 2, 900, projection.depth / 2),
    scene,
  );
  camera.lowerRadiusLimit = 900;
  camera.upperRadiusLimit = 95_000;
  camera.upperBetaLimit = 1.45;
  camera.lowerBetaLimit = 0.2;
  camera.wheelDeltaPercentage = 0.02;
  camera.panningSensibility = 28;
  camera.inertia = 0.82;
  camera.minZ = 20;
  camera.maxZ = 260_000;
  camera.attachControl(canvas, true);

  // -- light ----------------------------------------------------------------
  // Cold, overcast key, so relief reads without drama. Hemispheric fill in the sky
  // colour, so shadowed slopes go cold rather than black (reference R6, R12).
  // Intensities are set against the ACES curve in the locked grade. The first pass at
  // 2.1 plus 0.62 blew the desaturated terrain ramp out to near-white, which is the
  // opposite of "under 25 percent saturation, no neon".
  const key = new DirectionalLight("key", new Vector3(-0.55, -0.78, 0.32), scene);
  key.intensity = 1.15;
  key.diffuse = new Color3(0.95, 0.93, 0.86);
  key.specular = new Color3(0.2, 0.2, 0.18);

  const fill = new HemisphericLight("fill", new Vector3(0.2, 1, -0.1), scene);
  fill.intensity = 0.4;
  fill.diffuse = Color3.FromHexString(mapColor.sky);
  fill.groundColor = new Color3(0.2, 0.19, 0.16);

  // -- world ----------------------------------------------------------------
  buildTerrain({ scene, heightfield: world.heightfield, projection });
  const terrainInfo = terrainSummary(world.heightfield);

  const network = buildNetwork(scene, world.roads, world.rail, projection, VERTICAL_SCALE);
  for (const m of network.roads) m.isPickable = false;
  if (network.rail) network.rail.isPickable = false;

  const towns: TownCluster[] = buildTowns(scene, world.settlements, projection, VERTICAL_SCALE, LIFT);

  const graph: RouteGraph = buildRouteGraph(world.roads, world.settlements, projection);

  // -- party marker ---------------------------------------------------------
  // A small convoy: two vehicles and a pennant. Enough to read as a party moving at
  // map scale without pretending to be a unit.
  const partyRoot = new Mesh("party", scene);
  const lead = MeshBuilder.CreateBox("party-lead", { width: 9, height: 4, depth: 5 }, scene);
  const second = MeshBuilder.CreateBox("party-second", { width: 7, height: 3.4, depth: 4.4 }, scene);
  const mast = MeshBuilder.CreateCylinder("party-mast", { height: 12, diameter: 0.6 }, scene);
  const pennant = MeshBuilder.CreatePlane("party-pennant", { width: 7, height: 4 }, scene);
  for (const [part, y, z] of [
    [lead, 3, 0],
    [second, 2.6, -14],
    [mast, 10, 0],
    [pennant, 14, 0],
  ] as const) {
    part.parent = partyRoot;
    part.position.set(0, y, z);
    part.isPickable = false;
  }
  const bodyMat = new StandardMaterial("party-body", scene);
  bodyMat.diffuseColor = Color3.FromHexString(tokens.accent.primary);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const flagMat = new StandardMaterial("party-flag", scene);
  flagMat.diffuseColor = Color3.FromHexString(tokens.accent.primaryDeep);
  flagMat.specularColor = new Color3(0, 0, 0);
  for (const part of [lead, second, mast]) part.material = bodyMat;
  pennant.material = flagMat;
  partyRoot.position.set(projection.width / 2, 0, projection.depth / 2);

  // -- the planned route ----------------------------------------------------
  let routeMesh: Mesh | null = null;

  // -- post-processing, from the locked recipe ------------------------------
  const settings = resolveGrade(options.quality, options.year);
  const pipeline = new DefaultRenderingPipeline("grade", true, scene, [camera]);
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = 1; // ACES
  pipeline.imageProcessing.contrast = settings.contrast;
  pipeline.imageProcessing.exposure = settings.exposure;
  pipeline.imageProcessing.vignetteEnabled = settings.vignette.weight > 0;
  pipeline.imageProcessing.vignetteWeight = settings.vignette.weight;
  pipeline.imageProcessing.vignetteStretch = settings.vignette.stretch;
  pipeline.imageProcessing.vignetteColor = Color4.FromHexString(`${settings.vignette.color}ff`);
  pipeline.fxaaEnabled = settings.fxaa;
  // Saturation, split-tone and grain all happen in one pass below. Grading in two
  // places is how a look drifts between machines.

  const grain =
    settings.grain.intensity > 0 ? new GradePass(camera, settings, options.year) : null;

  // -- picking --------------------------------------------------------------
  scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERPICK) return;
    const id = info.pickInfo?.pickedMesh?.metadata?.settlementId;
    if (typeof id === "string") options.onSelect(id);
  });

  engine.runRenderLoop(() => {
    if (grain) grain.tick(engine.getDeltaTime());
    scene.render();
  });

  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    scene,
    engine,
    towns,
    dispose() {
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      grain?.dispose();
      pipeline.dispose();
      scene.dispose();
      engine.dispose();
    },
    focus(x, z, radius) {
      camera.setTarget(new Vector3(x, projection.heightAt(x, z) * VERTICAL_SCALE, z));
      if (radius !== undefined) camera.radius = radius;
    },
    showRoute(points) {
      routeMesh?.dispose();
      routeMesh = null;
      if (points.length < 2) return;
      const lifted = points.map(
        (p) => new Vector3(p.x, projection.heightAt(p.x, p.z) * VERTICAL_SCALE + 45, p.z),
      );
      const line = MeshBuilder.CreateLines("route", { points: lifted }, scene);
      line.color = Color3.FromHexString(tokens.accent.influence);
      line.isPickable = false;
      line.renderingGroupId = 1;
      routeMesh = line;
    },
    setPartyPosition(x, z, heading) {
      partyRoot.position.x = x;
      partyRoot.position.z = z;
      partyRoot.position.y = projection.heightAt(x, z) * VERTICAL_SCALE + LIFT;
      partyRoot.rotation.y = heading;
    },
    setPartyVisible(visible) {
      partyRoot.setEnabled(visible);
    },
    summary() {
      return (
        `${world.settlements.length} settlements · terrain ${terrainInfo.min.toFixed(0)}–` +
        `${terrainInfo.max.toFixed(0)} m at ${terrainInfo.resolution.toFixed(0)} m/px · ` +
        `${graph.nodes.length.toLocaleString("en-US")} road nodes`
      );
    },
  };
}

const PASS_UNIFORMS = [
  "time",
  "saturation",
  "grain",
  "grainSize",
  "monochrome",
  "animated",
  "shadowLift",
  "shadowAmount",
  "highlightTint",
  "highlightAmount",
] as const;

/**
 * One pass for the whole look: saturation, split-tone, and film grain.
 *
 * Doing them together is deliberate. Three separate passes means three sets of
 * rounding, and a grade that looks slightly different depending on the GPU is not a
 * locked direction.
 */
class GradePass {
  readonly #process: PostProcess;
  #time = 0;
  readonly #settings: ReturnType<typeof resolveGrade>;
  readonly #warmth: number;

  constructor(camera: ArcRotateCamera, settings: ReturnType<typeof resolveGrade>, year: number) {
    this.#settings = settings;
    this.#warmth = eraWarmth(year);
    if (!Effect.ShadersStore["gradePassPixelShader"]) {
      Effect.ShadersStore["gradePassPixelShader"] = GRADE_FRAGMENT;
    }
    this.#process = new PostProcess(
      "gradePass",
      "gradePass",
      [...PASS_UNIFORMS],
      null,
      1,
      camera,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    const shadow = Color3.FromHexString(settings.shadowLift.color);
    const highlight = Color3.FromHexString(settings.highlightTint.color);
    this.#process.onApply = (effect) => {
      effect.setFloat("time", this.#time);
      effect.setFloat("saturation", this.#settings.saturation);
      effect.setFloat("grain", this.#settings.grain.intensity);
      effect.setFloat("grainSize", this.#settings.grain.size);
      effect.setFloat("monochrome", this.#settings.grain.monochrome ? 1 : 0);
      effect.setFloat("animated", this.#settings.grain.animated ? 1 : 0);
      effect.setColor3("shadowLift", shadow);
      effect.setFloat("shadowAmount", this.#settings.shadowLift.amount);
      effect.setColor3("highlightTint", highlight);
      effect.setFloat("highlightAmount", this.#settings.highlightTint.amount + this.#warmth);
    };
  }

  tick(deltaMs: number): void {
    this.#time += deltaMs / 1000;
  }

  dispose(): void {
    this.#process.dispose();
  }
}

function eraWarmth(year: number): number {
  if (year < 1960) return 0.05;
  if (year < 1980) return 0.03;
  if (year < 1990) return 0.01;
  return 0;
}

/**
 * Saturation, then a cold-shadow and warm-highlight split tone, then grain weighted
 * toward the midtones. Grain that is uniform in the highlights reads as a dirty
 * screen rather than as film, so it is damped at both ends.
 */
const GRADE_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform float saturation;
uniform float grain;
uniform float grainSize;
uniform float monochrome;
uniform float animated;
uniform vec3 shadowLift;
uniform float shadowAmount;
uniform vec3 highlightTint;
uniform float highlightAmount;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main(void) {
  vec2 uv = vUV;
  vec3 col = texture2D(textureSampler, uv).rgb;

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.0 + saturation);

  col += shadowLift * shadowAmount * (1.0 - smoothstep(0.0, 0.55, luma));
  col += (highlightTint - vec3(luma)) * highlightAmount * smoothstep(0.45, 1.0, luma);

  vec2 noiseUv = uv * (vec2(256.0) / grainSize);
  if (animated > 0.5) {
    noiseUv += vec2(time * 0.71, time * 0.43);
  }
  float n = hash(floor(noiseUv)) - 0.5;
  float weight = 1.0 - abs(luma - 0.5) * 0.9;
  if (monochrome > 0.5) {
    col += n * grain * weight;
  } else {
    vec3 chroma = vec3(hash(noiseUv + 11.3), hash(noiseUv + 27.1), hash(noiseUv + 41.7)) - 0.5;
    col += chroma * grain * weight;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export { buildRouteGraph, findRoute, type TownCluster };
