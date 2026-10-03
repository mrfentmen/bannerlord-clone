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
import type { TownVisibility } from "../data/types.js";
import type { TownRecency } from "../data/fog.js";
import { routeStrength } from "../data/fogView.js";

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

/**
 * The fog states the scene is actually drawing, counted from the clusters.
 *
 * A tally rather than the caller's states, because the scene is the thing that knows
 * what reached the screen. Three states, no `unsighted` bucket: that distinction is
 * about the settlement-to-town join, which happens above the scene and is reported by
 * `MapFogCensus` in `src/data/fog.ts`. This is "what is on the map".
 */
export interface SceneFogTally {
  visible: number;
  remembered: number;
  unseen: number;
  total: number;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  world: WorldData;
  projection: Projection;
  year: number;
  quality: QualityLevel;
  onSelect: (settlementId: string) => void;
  /**
   * Called when the settlement under the pointer changes, with the pointer's client
   * coordinates for tooltip placement — or `null` when the pointer leaves every
   * settlement. The scene owns picking (it owns the meshes); the caller owns the data
   * and the tooltip DOM. Fires only on change, never per mousemove.
   */
  onHoverSettlement?: (hit: { settlementId: string; x: number; y: number } | null) => void;
}

export interface SceneHandle {
  scene: Scene;
  engine: Engine;
  dispose(): void;
  focus(x: number, z: number, radius?: number): void;
  /**
   * Draw the planned march route. An empty array clears it.
   *
   * `state` is the fog state of the destination, and it only changes how loudly the line
   * is drawn — never whether it is drawn. The player ordered this march, so the route
   * stays on screen even when its destination is somewhere the side has never been;
   * hiding it would leave them watching a party walk into nothing. See
   * `routeStrength` in `src/data/fogView.ts` for why the unseen case is a ghost line
   * rather than nothing or full strength.
   */
  showRoute(points: Vector3[], state?: TownVisibility): void;
  setPartyPosition(x: number, z: number, heading: number): void;
  setPartyVisible(visible: boolean): void;
  /** One line about what the map is showing, for the data-source panel. */
  summary(): string;
  /**
   * How many settlements the map is actually drawing in each fog state.
   *
   * Counted from the clusters rather than taken from the caller's map, so this is what
   * the screen shows and not what was asked for. The distinction matters: a caller that
   * passes a map keyed by a different vocabulary than the clusters use would report its
   * own numbers, and the scene's would silently disagree. A cluster missing from the map
   * falls back to `visible`, matching `setTownVisibility`.
   */
  fogTally(): SceneFogTally;
  /**
   * Put the map into a fog state, keyed by the client's settlement id.
   *
   * Every settlement is stated, not just the ones being hidden, so the map is a function
   * of this call and a settlement missing from the map is one the caller has not decided
   * about rather than one left over from the last snapshot. A settlement the map draws
   * and the call does not name is treated as `visible`, which is the same reading the
   * rest of the client gives a place the simulation has no town for.
   *
   * `recency` is the fourth dimension, optional and defaulting to `unknown` — which fades
   * nothing, so a caller with no ages gets exactly the map this drew before recency
   * existed. It is a separate map rather than a field on the states because it answers a
   * different question, and folding the two together would mean inventing a state per
   * band, which is a category the simulation never published.
   */
  setTownVisibility(
    states: ReadonlyMap<string, TownVisibility>,
    recency?: ReadonlyMap<string, TownRecency>,
  ): void;
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

  // Settlements currently drawn, and of those how many the side is watching. Both are
  // mutable because fog moves: the data-source panel reads them on every open, and a
  // count frozen at boot would claim a map that is no longer the one on screen.
  let drawnSettlements = towns.length;
  let watchedSettlements = towns.length;

  // The state each cluster was last put into, so `setTownVisibility` can skip the ones
  // that did not move. Fog changes on every snapshot but only for a handful of
  // settlements, and re-swapping materials and re-running `setEnabled` over every cluster
  // in the region to change three of them is the shape of work task 74 is about. Held per
  // cluster rather than diffed against the incoming map, because the incoming map is
  // keyed by settlement id and the arrays here are indexed to match.
  const appliedStates: TownVisibility[] = towns.map(() => "visible");
  // The band each cluster was last drawn at. Held beside `appliedStates` and for the same
  // reason: a town that ages from `recent` to `old` has not changed *state*, so a skip
  // keyed on the state alone would leave it drawn as fresh news for the rest of the
  // session.
  const appliedRecency: TownRecency[] = towns.map(() => "unknown");
  // Whether every cluster has had `setTownVisibility` run at least once. Before the first
  // call, "last applied" is unknowable rather than `visible`, so a map that says
  // everything is already visible must still do the work once.
  let statesApplied = false;

  // The last fog map the scene was given. Held so `fogTally` can report the states the
  // scene is drawing without the caller having to keep them, and so `fogTally` cannot
  // drift from `setTownVisibility` — one source, read two ways.
  let states: ReadonlyMap<string, TownVisibility> = new Map();

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

  // Hover picking for the map tooltip. Throttled: a raycast against every town mesh on
  // every mousemove is the shape of work the render loop does not need, and the tooltip
  // only has to keep up with a hand, not with the pointer hardware. The callback fires
  // only when the hovered settlement changes (including to null), so the caller never
  // rebuilds a tooltip it is already showing.
  let lastHoverId: string | null = null;
  let lastHoverPick = 0;
  const HOVER_PICK_MS = 90;
  scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERMOVE || !options.onHoverSettlement) return;
    const now = performance.now();
    if (now - lastHoverPick < HOVER_PICK_MS) return;
    lastHoverPick = now;
    const pick = scene.pick(scene.pointerX, scene.pointerY);
    const id = pick?.pickedMesh?.metadata?.settlementId;
    const hitId = typeof id === "string" ? id : null;
    const evt = info.event as PointerEvent | undefined;
    const hit = hitId && evt ? { settlementId: hitId, x: evt.clientX, y: evt.clientY } : null;
    // Change detection is on the delivered value, not the picked one: a pick with no
    // pointer coordinates delivers null, and the next move must still get its chance to
    // deliver the real hover rather than being swallowed as "unchanged".
    const deliveredId = hit?.settlementId ?? null;
    if (deliveredId === lastHoverId) return;
    lastHoverId = deliveredId;
    options.onHoverSettlement!(hit);
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
      grain?.dispose();
      pipeline.dispose();
      scene.dispose();
      engine.dispose();
    },
    focus(x, z, radius) {
      camera.setTarget(new Vector3(x, projection.heightAt(x, z) * VERTICAL_SCALE, z));
      if (radius !== undefined) camera.radius = radius;
    },
    showRoute(points, state = "visible") {
      routeMesh?.dispose();
      routeMesh = null;
      if (points.length < 2) return;
      const lifted = points.map(
        (p) => new Vector3(p.x, projection.heightAt(p.x, p.z) * VERTICAL_SCALE + 45, p.z),
      );
      const line = MeshBuilder.CreateLines("route", { points: lifted }, scene);
      line.color = Color3.FromHexString(tokens.accent.influence);
      // Fading rather than recolouring: the route keeps the one accent colour the map
      // uses for it, and alpha is the control that reads as "less certain" without
      // introducing a second colour that means something else elsewhere.
      line.alpha = routeStrength(state);
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
    setTownVisibility(next, recency) {
      states = next;
      let drawn = 0;
      let watched = 0;
      for (let i = 0; i < towns.length; i += 1) {
        const cluster = towns[i]!;
        const state = states.get(cluster.settlementId) ?? "visible";
        const band = recency?.get(cluster.settlementId) ?? "unknown";
        // The skip is keyed on the *applied* state and band rather than on a diff, so the
        // counts below are still computed for every cluster. Counting is arithmetic;
        // `setEnabled` and a material swap are GPU state, and those are what the skip
        // avoids. See `townNeedsRedraw` for why the band is part of the key.
        if (statesApplied && !townNeedsRedraw(appliedStates[i]!, appliedRecency[i]!, state, band)) {
          if (state !== "unseen") drawn += 1;
          if (state === "visible") watched += 1;
          continue;
        }
        cluster.applyVisibility(state, band);
        appliedStates[i] = state;
        appliedRecency[i] = band;
        if (state !== "unseen") drawn += 1;
        if (state === "visible") watched += 1;
      }
      statesApplied = true;
      drawnSettlements = drawn;
      watchedSettlements = watched;
    },
    fogTally() {
      // Recounted from the clusters rather than served from the counters above, because
      // `drawnSettlements` and `watchedSettlements` deliberately collapse `visible` and
      // `remembered` into one figure for the summary sentence, and a caller asking for
      // the three states separately needs all three.
      return tallyFogStates(states, towns.map((cluster) => cluster.settlementId));
    },
    summary() {
      // The settlement count is the map's, and it moves with fog: saying 48 when 41 are
      // drawn would be a claim about the screen that the screen does not support.
      const shown =
        drawnSettlements === towns.length
          ? `${towns.length} settlements`
          : `${drawnSettlements} of ${towns.length} settlements shown (${watchedSettlements} in sight)`;
      return (
        `${shown} · terrain ${terrainInfo.min.toFixed(0)}–` +
        `${terrainInfo.max.toFixed(0)} m at ${terrainInfo.resolution.toFixed(0)} m/px · ` +
        `${graph.nodes.length.toLocaleString("en-US")} road nodes`
      );
    },
  };
}

/**
 * Whether a cluster has to be redrawn for this reading.
 *
 * Split out as a pure function for the same reason `tallyFogStates` is: the scene needs a
 * canvas and a real engine, and this is the decision that decides whether a change ever
 * reaches the screen. A skip that is wrong here is invisible in every other test.
 *
 * Recency is part of the key rather than a detail of it, and that is the whole reason it
 * exists as a function. A town that ages from `recent` to `old` has not changed *state*,
 * so a comparison on the state alone would skip it — and the town would then be drawn as
 * fresh news for the rest of the session, which is the one failure a staleness feature
 * cannot have, because the player is being shown current information about a place
 * nobody is looking at.
 */
export function townNeedsRedraw(
  appliedState: TownVisibility,
  appliedRecency: TownRecency,
  state: TownVisibility,
  recency: TownRecency,
): boolean {
  return appliedState !== state || appliedRecency !== recency;
}

/**
 * Count the fog states the scene is drawing, keyed over the ids that are actually on the
 * map.
 *
 * Split out as a pure function so the tally can be tested without a GPU — the scene needs
 * a canvas and a real engine, and this is the arithmetic `fogTally` exists to get right.
 *
 * Ids drive the count rather than the map's own entries, so the total is the number of
 * clusters on screen and cannot drift when the caller sends states for settlements this
 * region does not hold. A cluster missing from the map falls back to `visible`, matching
 * `setTownVisibility`, so the tally can never report fewer towns than were drawn.
 */
export function tallyFogStates(
  states: ReadonlyMap<string, TownVisibility>,
  drawnIds: readonly string[],
): SceneFogTally {
  const tally: SceneFogTally = { visible: 0, remembered: 0, unseen: 0, total: drawnIds.length };
  for (const id of drawnIds) {
    tally[states.get(id) ?? "visible"] += 1;
  }
  return tally;
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
