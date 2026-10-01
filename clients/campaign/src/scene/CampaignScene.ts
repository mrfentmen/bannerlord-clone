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
  DynamicTexture,
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
import { attachMapGestures } from "../input/touch/gestures.js";
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

/**
 * The party pin, in screen pixels and world metres.
 *
 * The convoy below is about 12 m tall. At the default campaign zoom, 30 km out on a
 * 68 km wide region, one pixel is roughly 35 m, so the convoy covers a third of a pixel
 * and the player cannot find their own party. The pin holds a legible size at that
 * distance instead of having a fixed world size, and it is capped below a city marker
 * so it never shouts louder than a settlement.
 */
const PARTY_PIN_PIXELS = 20;
const PARTY_PIN_MIN_M = 30;
const PARTY_PIN_MAX_M = 900;

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
  /**
   * Twin-stick camera deltas, applied immediately (task 2). The scene owns the
   * camera, so limits live here next to the ArcRotateCamera they constrain.
   */
  cameraControl(delta: CameraDelta): void;
  /** Draw the planned march route. An empty array clears it. */
  showRoute(points: Vector3[]): void;
  setPartyPosition(x: number, z: number, heading: number): void;
  setPartyVisible(visible: boolean): void;
  /** One line about what the map is showing, for the data-source panel. */
  summary(): string;
  towns: TownCluster[];
}

/** Per-frame camera deltas for the twin-stick driver (task 2). */
export interface CameraDelta {
  /** Pan the target in world units. */
  panX?: number;
  panZ?: number;
  /** Orbit deltas in radians: dAlpha = azimuth, dBeta = polar tilt. */
  dAlpha?: number;
  dBeta?: number;
  /** Multiply the radius by this (>1 zooms out). */
  zoomFactor?: number;
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

  // Touch gestures (MASTER_PLAN task 4): one-finger drag pans the map,
  // pinch zooms, two-finger drag pans. Babylon's own one-finger orbit is
  // intercepted by the gesture layer, so mouse keeps the default behaviour.
  const mapGestures = attachMapGestures(canvas, {
    screenToWorld(dxPx, dyPx) {
      const wpp = (2 * camera.radius * Math.tan(camera.fov / 2)) / engine.getRenderHeight();
      // Camera-space axes in world space, projected onto the ground plane.
      // beta never reaches 0 (lowerBetaLimit 0.2), so screen-up's ground
      // projection never degenerates; guarded anyway.
      const right = camera.getDirection(new Vector3(1, 0, 0));
      right.y = 0;
      const up = camera.getDirection(new Vector3(0, 1, 0));
      up.y = 0;
      const rl = right.length() || 1;
      const ul = up.length() || 1;
      return {
        dx: ((right.x / rl) * dxPx + (up.x / ul) * dyPx) * wpp,
        dz: ((right.z / rl) * dxPx + (up.z / ul) * dyPx) * wpp,
      };
    },
    panByWorld(dx, dz) {
      const tx = camera.target.x + dx;
      const tz = camera.target.z + dz;
      camera.setTarget(new Vector3(tx, projection.heightAt(tx, tz) * VERTICAL_SCALE, tz));
    },
    zoomBy(factor) {
      const lo = camera.lowerRadiusLimit ?? 900;
      const hi = camera.upperRadiusLimit ?? 95_000;
      camera.radius = Math.min(hi, Math.max(lo, camera.radius * factor));
    },
  });

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

  // The campaign-zoom pin: a pennant in the player's stamp-blue, drawn on its own
  // texture and billboarded, so it reads as the player's party from any angle and at
  // any zoom. Shape rather than colour carries it, since the party is not a status.
  const pin = buildPartyPin(scene);
  pin.parent = partyRoot;
  pin.position.set(0, 26, 0);
  pin.isPickable = false;

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
    sizePartyPin(pin, camera.radius, engine.getRenderHeight());
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
      mapGestures.dispose();
      grain?.dispose();
      pipeline.dispose();
      scene.dispose();
      engine.dispose();
    },
    focus(x, z, radius) {
      camera.setTarget(new Vector3(x, projection.heightAt(x, z) * VERTICAL_SCALE, z));
      if (radius !== undefined) camera.radius = radius;
    },
    cameraControl(delta) {
      if (delta.panX || delta.panZ) {
        const tx = camera.target.x + (delta.panX ?? 0);
        const tz = camera.target.z + (delta.panZ ?? 0);
        camera.setTarget(new Vector3(tx, projection.heightAt(tx, tz) * VERTICAL_SCALE, tz));
      }
      if (delta.dAlpha) camera.alpha += delta.dAlpha;
      if (delta.dBeta) {
        // ArcRotateCamera enforces its beta limits on the next render; clamp
        // here too so a hard stick flick can't park it past the stops.
        const lo = camera.lowerBetaLimit ?? 0.2;
        const hi = camera.upperBetaLimit ?? 1.45;
        camera.beta = Math.min(hi, Math.max(lo, camera.beta + delta.dBeta));
      }
      if (delta.zoomFactor && delta.zoomFactor !== 1) {
        const lo = camera.lowerRadiusLimit ?? 900;
        const hi = camera.upperRadiusLimit ?? 95_000;
        camera.radius = Math.min(hi, Math.max(lo, camera.radius * delta.zoomFactor));
      }
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
 * The player's own marker, as a pennant rather than a town diamond.
 *
 * A town marker is a diamond on a stem because that is a settlement; the party is a
 * moving thing, so it is a pennant. Both are drawn from `ART_DIRECTION.md` section 6's
 * motif list and use only locked tokens.
 */
function buildPartyPin(scene: Scene): Mesh {
  const size = 256;
  const texture = new DynamicTexture("party-pin-tex", { width: size, height: size }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);

  const ink = tokens.paper[0];
  const body = tokens.accent.primary;
  const stroke = Math.max(4, size * 0.05);
  const cx = size * 0.46;
  const top = size * 0.2;
  const bottom = size * 0.72;

  // Pennant: a swallow-tailed flag on a short staff, so it reads as something moving.
  ctx.beginPath();
  ctx.moveTo(size * 0.24, top);
  ctx.lineTo(size * 0.74, top + size * 0.09);
  ctx.lineTo(size * 0.74, bottom - size * 0.09);
  ctx.lineTo(cx, bottom);
  ctx.lineTo(size * 0.24, bottom);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = stroke;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // The staff, down to the ground of the marker.
  ctx.beginPath();
  ctx.moveTo(size * 0.24, top - size * 0.04);
  ctx.lineTo(size * 0.24, size * 0.92);
  ctx.lineWidth = stroke;
  ctx.strokeStyle = ink;
  ctx.stroke();

  texture.update();

  const material = new StandardMaterial("party-pin-mat", scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = new Color3(1, 1, 1);
  material.diffuseColor = new Color3(0, 0, 0);
  material.specularColor = new Color3(0, 0, 0);
  material.backFaceCulling = false;
  material.disableLighting = true;

  // A unit plane, scaled per frame to the metres that hold PARTY_PIN_PIXELS at the
  // current camera distance.
  const plane = MeshBuilder.CreatePlane("party-pin", { size: 1 }, scene);
  plane.material = material;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.renderingGroupId = 1;
  return plane;
}

/**
 * Size the pin so it holds a fixed apparent size, the way a map symbol should.
 *
 * The conversion is the same one the projection itself rests on: world metres visible
 * across the viewport is `2 * radius * tan(fov / 2)`, so metres-per-pixel follows and
 * the pin can be solved for directly. Clamped at both ends, because at the closest zoom
 * a fixed-width pin swallows the convoy, and without a ceiling it would out-shout a city.
 */
export function sizePartyPin(pin: Mesh, radius: number, viewportHeightPx: number, fov = 0.8): number {
  const metresPerPixel = (2 * radius * Math.tan(fov / 2)) / Math.max(1, viewportHeightPx);
  const metres = Math.min(PARTY_PIN_MAX_M, Math.max(PARTY_PIN_MIN_M, PARTY_PIN_PIXELS * metresPerPixel));
  pin.scaling.setAll(metres);
  return metres;
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
