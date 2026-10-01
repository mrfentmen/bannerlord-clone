/**
 * The battle scene: a self-contained tactical 3D view, separate from the campaign
 * scene. MASTER_PLAN.md section 2A (tasks 44-51, adopted from Rowan's lane).
 *
 * It owns its own engine, camera, lighting, and meshes, so it can mount and unmount
 * without touching campaign resources. The caller feeds it the encounter context
 * (centre, roster data, time of day) and per-tick unit positions from the sim.
 *
 * Scale: 1 unit = 1 metre, same as the campaign scene (ART_DIRECTION.md section 7).
 */

import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import { mapColor } from "../design/tokens.js";
import { bandFor } from "../world/load.js";
import type { Projection } from "../world/types.js";

/** Who a deployed unit fights for. */
export type BattleSide = "attacker" | "defender";

/** One combatant to render. Positions are world metres, y is ground height. */
export interface BattleUnit {
  id: string;
  side: BattleSide;
  x: number;
  z: number;
  /** Troop tier 1-3, affects the marker size slightly. */
  tier: number;
  alive: boolean;
}

/** Biome of the battle patch, drives the scatter template. */
export type BattleBiome = "urban" | "forest" | "open" | "hills";

export interface BattleSceneOptions {
  /** Real canvas for production. Omitted in tests, where `scene` is injected. */
  canvas?: HTMLCanvasElement;
  /** Injected scene for NullEngine tests. When set, no engine is created. */
  scene?: Scene;
  projection: Projection;
  /** Battle centre in world metres. */
  centreX: number;
  centreZ: number;
  /** Patch width in metres. The sim's battle maps are ~2 km across. */
  size?: number;
  /** Hour of day, 0-24. Drives lighting. */
  timeOfDay?: number;
  /** Optional seed for scatter placement; defaults to a hash of the centre. */
  seed?: number;
}

export interface OutOfBoundsState {
  /** True once the player marker is outside the boundary ring. */
  outside: boolean;
  /** Seconds left to return before the warning escalates. 5 at first exit. */
  countdown: number;
}

export interface BattleSceneHandle {
  scene: Scene;
  dispose(): void;
  /** The biome the patch was classified as. */
  biome: BattleBiome;
  /** Spawn both armies. Must render 1,000 units in under 2 seconds. */
  spawnArmies(units: BattleUnit[]): void;
  /** Move unit instances to new positions; hides the dead. */
  updateUnits(units: BattleUnit[]): void;
  /** Advance the out-of-bounds countdown. Call once per frame. */
  tickBounds(deltaSeconds: number, playerX: number, playerZ: number): OutOfBoundsState;
  /** Re-aim lighting for a new hour of day. */
  setTimeOfDay(hour: number): void;
  /** Number of scatter objects placed. */
  scatterCount: number;
  /** Number of unit instances currently in the scene. */
  unitCount: number;
  /** The extracted height patch, for tests and debugging. */
  heightPatch(): { samples: number; min: number; max: number };
}

const DEFAULT_SIZE = 2000;
const BOUND_MARGIN = 120; // metres inside the patch edge where the ring sits
const BOUNDS_WARNING_SECONDS = 5;

/**
 * Sample the campaign projection over a square patch. Returned heights are exact
 * copies of `projection.heightAt`, so they match the campaign map by construction.
 */
export function extractHeightPatch(
  projection: Projection,
  centreX: number,
  centreZ: number,
  size: number,
  samples: number,
): { heights: Float32Array; samples: number; min: number; max: number; originX: number; originZ: number } {
  const heights = new Float32Array(samples * samples);
  let min = Infinity;
  let max = -Infinity;
  const originX = centreX - size / 2;
  const originZ = centreZ - size / 2;
  for (let r = 0; r < samples; r += 1) {
    for (let c = 0; c < samples; c += 1) {
      const x = originX + (c / (samples - 1)) * size;
      const z = originZ + (r / (samples - 1)) * size;
      const h = projection.heightAt(x, z);
      heights[r * samples + c] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { heights, samples, min, max, originX, originZ };
}

function classifyBiome(patch: { min: number; max: number }, bandName: string): BattleBiome {
  if (bandName === "forest" || bandName === "scrub") return "forest";
  if (patch.max - patch.min > 120) return "hills";
  if (bandName === "dry prairie" || bandName === "steppe") return "urban";
  return "open";
}

/** A tiny deterministic RNG so scatter placement is stable per battle. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTICAL_SCALE = 1.6;

export function createBattleScene(options: BattleSceneOptions): BattleSceneHandle {
  const { canvas, projection } = options;
  const size = options.size ?? DEFAULT_SIZE;
  const samples = 128;

  // Production owns a real engine; tests inject a NullEngine scene. Either way the
  // battle scene never shares GPU resources with the campaign scene.
  const shim = options.scene ? null : new EngineShim(options.canvas!);
  const scene = options.scene ?? shim!.scene;

  scene.clearColor = Color4.FromHexString(`${mapColor.sky}ff`);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.00012;
  scene.fogColor = Color3.FromHexString(mapColor.fog);

  // -- height patch ---------------------------------------------------------
  const patch = extractHeightPatch(projection, options.centreX, options.centreZ, size, samples);
  const band = bandFor((patch.min + patch.max) / 2);
  const biome: BattleBiome = classifyBiome(patch, band.name);

  // -- ground mesh, tactical colouring --------------------------------------
  const ground = buildBattleGround(scene, patch, size);
  ground.name = "battle-ground";

  // -- camera ---------------------------------------------------------------
  const camera = new ArcRotateCamera(
    "battle-camera",
    -Math.PI / 2.4,
    0.9,
    size * 1.4,
    new Vector3(options.centreX, sampleGroundY(patch, size, options.centreX, options.centreZ) * VERTICAL_SCALE, options.centreZ),
    scene,
  );
  camera.lowerRadiusLimit = 60;
  camera.upperRadiusLimit = size * 2.2;
  camera.upperBetaLimit = 1.5;
  camera.lowerBetaLimit = 0.15;
  camera.wheelDeltaPercentage = 0.02;
  if (canvas) camera.attachControl(canvas, true);

  // -- lighting -------------------------------------------------------------
  const key = new DirectionalLight("battle-key", new Vector3(-0.55, -0.78, 0.32), scene);
  const fill = new HemisphericLight("battle-fill", new Vector3(0.2, 1, -0.1), scene);
  fill.intensity = 0.4;
  fill.groundColor = new Color3(0.2, 0.19, 0.16);
  const setTimeOfDay = (hour: number): void => {
    const t = ((hour % 24) + 24) % 24;
    const dayFactor = Math.max(0, Math.sin(((t - 6) / 12) * Math.PI)); // 1 at noon, 0 at night
    const angle = ((t - 6) / 12) * Math.PI;
    key.direction = new Vector3(-Math.cos(angle) * 0.6, -Math.max(0.12, Math.sin(angle)), 0.32);
    key.intensity = 0.08 + dayFactor * 1.1;
    if (dayFactor < 0.15) {
      // Night: cold blue key, dim.
      key.diffuse = new Color3(0.35, 0.42, 0.6);
      fill.diffuse = new Color3(0.12, 0.14, 0.2);
    } else if (t < 8 || t > 17) {
      // Dawn/dusk: warm low key.
      key.diffuse = new Color3(1.0, 0.75, 0.55);
      fill.diffuse = Color3.FromHexString(mapColor.sky);
    } else {
      key.diffuse = new Color3(0.95, 0.93, 0.86);
      fill.diffuse = Color3.FromHexString(mapColor.sky);
    }
  };
  setTimeOfDay(options.timeOfDay ?? 12);

  // -- scatter --------------------------------------------------------------
  const rng = mulberry32(options.seed ?? hashCentre(options.centreX, options.centreZ));
  const scatterCount = buildScatter(scene, patch, size, biome, rng);

  // -- deployment zones -----------------------------------------------------
  buildDeploymentZone(scene, patch, size, "attacker");
  buildDeploymentZone(scene, patch, size, "defender");

  // -- boundary ring --------------------------------------------------------
  const ringRadius = size / 2 - BOUND_MARGIN;
  buildBoundaryRing(scene, options.centreX, sampleGroundY(patch, size, options.centreX, options.centreZ) * VERTICAL_SCALE, options.centreZ, ringRadius);

  // -- armies ---------------------------------------------------------------
  const troopRoot = new Mesh("troops", scene);
  let instances: InstancedMesh[] = [];
  let byId = new Map<string, InstancedMesh>();

  const attackerMat = new StandardMaterial("troop-attacker", scene);
  attackerMat.diffuseColor = new Color3(0.55, 0.16, 0.12); // rust red
  attackerMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const defenderMat = new StandardMaterial("troop-defender", scene);
  defenderMat.diffuseColor = new Color3(0.16, 0.28, 0.45); // steel blue
  defenderMat.specularColor = new Color3(0.05, 0.05, 0.05);

  // One box per unit is honest at this scale; 1,000 instances is two draw calls
  // (one per side). Instanced meshes inherit their source's material, so each side
  // gets its own template carrying its colour.
  const attackerTemplate = MeshBuilder.CreateBox("troop-attacker-t", { width: 1.1, height: 1.8, depth: 0.9 }, scene);
  attackerTemplate.material = attackerMat;
  const defenderTemplate = MeshBuilder.CreateBox("troop-defender-t", { width: 1.1, height: 1.8, depth: 0.9 }, scene);
  defenderTemplate.material = defenderMat;
  for (const t of [attackerTemplate, defenderTemplate]) {
    t.isVisible = false;
    t.isPickable = false;
  }

  const groundY = (x: number, z: number): number => sampleGroundY(patch, size, x, z) * VERTICAL_SCALE;

  function spawnArmies(units: BattleUnit[]): void {
    for (const inst of instances) inst.dispose();
    instances = [];
    byId = new Map();
    for (const u of units) {
      const template = u.side === "attacker" ? attackerTemplate : defenderTemplate;
      const inst = template.createInstance(`troop-${u.id}`);
      const s = 0.9 + u.tier * 0.12;
      inst.scaling.set(s, s, s);
      inst.position.set(u.x, groundY(u.x, u.z) + 0.9 * s, u.z);
      inst.isVisible = u.alive;
      inst.isPickable = false;
      inst.parent = troopRoot;
      instances.push(inst);
      byId.set(u.id, inst);
    }
  }

  function updateUnits(units: BattleUnit[]): void {
    for (const u of units) {
      const inst = byId.get(u.id);
      if (!inst) continue;
      inst.position.x = u.x;
      inst.position.z = u.z;
      inst.position.y = groundY(u.x, u.z) + 0.9;
      inst.isVisible = u.alive;
    }
  }

  // -- out-of-bounds --------------------------------------------------------
  let outside = false;
  let countdown = BOUNDS_WARNING_SECONDS;
  function tickBounds(deltaSeconds: number, playerX: number, playerZ: number): OutOfBoundsState {
    const dx = playerX - options.centreX;
    const dz = playerZ - options.centreZ;
    const dist = Math.hypot(dx, dz);
    if (dist > ringRadius) {
      if (!outside) {
        outside = true;
        countdown = BOUNDS_WARNING_SECONDS;
      } else {
        countdown = Math.max(0, countdown - deltaSeconds);
      }
    } else {
      outside = false;
      countdown = BOUNDS_WARNING_SECONDS;
    }
    return { outside, countdown };
  }

  shim?.runRenderLoop();

  const onResize = (): void => shim?.resize();
  if (typeof window !== "undefined") window.addEventListener("resize", onResize);

  return {
    scene,
    biome,
    scatterCount,
    spawnArmies,
    updateUnits,
    tickBounds,
    setTimeOfDay,
    get unitCount() {
      return instances.length;
    },
    heightPatch() {
      return { samples: patch.samples, min: patch.min, max: patch.max };
    },
    dispose() {
      if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
      shim?.dispose();
      if (!shim) scene.dispose();
    },
  };
}

function hashCentre(x: number, z: number): number {
  let h = 2166136261;
  for (const n of [Math.floor(x), Math.floor(z)]) {
    h ^= n;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The ground: a vertex grid over the extracted patch with tactical colouring.
 * Hills read as rock on steep faces, forest patches read dark green, and anything
 * below the water line reads as water. Flat shading keeps the low-poly look honest.
 */
function buildBattleGround(
  scene: Scene,
  patch: { heights: Float32Array; samples: number; min: number; max: number; originX: number; originZ: number },
  size: number,
): Mesh {
  const s = patch.samples;
  const positions = new Float32Array(s * s * 3);
  const normals = new Float32Array(s * s * 3);
  const colors = new Float32Array(s * s * 4);
  const indices = new Uint32Array((s - 1) * (s - 1) * 6);

  const waterLine = patch.min + (patch.max - patch.min) * 0.06;
  const water = Color3.FromHexString(mapColor.water);
  const forestTint = new Color3(0.16, 0.24, 0.13);
  const rockTint = new Color3(0.32, 0.3, 0.27);
  const tmp = new Color3();

  for (let r = 0; r < s; r += 1) {
    for (let c = 0; c < s; c += 1) {
      const i = r * s + c;
      const h = patch.heights[i]!;
      const x = patch.originX + (c / (s - 1)) * size;
      const z = patch.originZ + (r / (s - 1)) * size;
      positions[i * 3] = x;
      positions[i * 3 + 1] = h * VERTICAL_SCALE;
      positions[i * 3 + 2] = z;

      const band = bandFor(h);
      tmp.set(...hexToRgb(band.color));
      // Steep faces are rock whatever their altitude (USGS convention, same as terrain.ts).
      const hx = patch.heights[r * s + Math.min(s - 1, c + 1)]! - patch.heights[r * s + Math.max(0, c - 1)]!;
      const hz = patch.heights[Math.min(s - 1, r + 1) * s + c]! - patch.heights[Math.max(0, r - 1) * s + c]!;
      const cell = size / (s - 1);
      const slope = Math.hypot(hx / (2 * cell), hz / (2 * cell));
      const slopeMix = Math.min(1, Math.max(0, (slope - 0.35) / 0.9));
      Color3.LerpToRef(tmp, rockTint, slopeMix, tmp);
      // Forest bands get the dark tactical tint.
      if (band.name === "forest" || band.name === "scrub") {
        Color3.LerpToRef(tmp, forestTint, 0.55, tmp);
      }
      // Water: below the line, flat blue.
      if (h <= waterLine && patch.max - patch.min > 4) {
        tmp.copyFrom(water);
      }
      colors[i * 4] = tmp.r;
      colors[i * 4 + 1] = tmp.g;
      colors[i * 4 + 2] = tmp.b;
      colors[i * 4 + 3] = 1;
    }
  }

  let t = 0;
  for (let r = 0; r < s - 1; r += 1) {
    for (let c = 0; c < s - 1; c += 1) {
      const a = r * s + c;
      const b = a + 1;
      const d = a + s;
      const e = d + 1;
      indices[t] = a;
      indices[t + 1] = b;
      indices[t + 2] = d;
      indices[t + 3] = b;
      indices[t + 4] = e;
      indices[t + 5] = d;
      t += 6;
    }
  }
  VertexData.ComputeNormals(positions, indices, normals);

  const mesh = new Mesh("battle-ground-mesh", scene);
  const data = new VertexData();
  data.positions = positions as unknown as number[];
  data.indices = indices as unknown as number[];
  data.normals = normals;
  data.colors = colors as unknown as number[];
  data.applyToMesh(mesh, false);
  const material = new StandardMaterial("battle-ground-mat", scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.specularColor = new Color3(0, 0, 0);
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.isPickable = false;
  return mesh;
}

interface ScatterKind {
  name: string;
  min: number;
  max: number;
}

/** Biome templates: kind, min count, max count. 50-200 objects per battle. */
const SCATTER_TEMPLATES: Record<BattleBiome, ScatterKind[]> = {
  urban: [
    { name: "building", min: 40, max: 90 },
    { name: "rubble", min: 20, max: 50 },
    { name: "tree", min: 5, max: 15 },
  ],
  forest: [
    { name: "tree", min: 90, max: 150 },
    { name: "rock", min: 10, max: 30 },
    { name: "building", min: 0, max: 8 },
  ],
  open: [
    { name: "tree", min: 20, max: 45 },
    { name: "rock", min: 20, max: 45 },
    { name: "building", min: 2, max: 12 },
  ],
  hills: [
    { name: "rock", min: 60, max: 110 },
    { name: "tree", min: 25, max: 60 },
    { name: "building", min: 0, max: 6 },
  ],
};

/**
 * Scatter from the biome template. Trees are cones, rocks are squashed boxes,
 * buildings are boxes. All instanced, so 200 objects cost almost nothing.
 */
function buildScatter(
  scene: Scene,
  patch: { heights: Float32Array; samples: number; originX: number; originZ: number },
  size: number,
  biome: BattleBiome,
  rng: () => number,
): number {
  const root = new Mesh("scatter", scene);
  root.isPickable = false;

  const treeMat = new StandardMaterial("scatter-tree", scene);
  treeMat.diffuseColor = new Color3(0.14, 0.22, 0.12);
  treeMat.specularColor = new Color3(0, 0, 0);
  const rockMat = new StandardMaterial("scatter-rock", scene);
  rockMat.diffuseColor = new Color3(0.35, 0.33, 0.3);
  rockMat.specularColor = new Color3(0, 0, 0);
  const buildingMat = new StandardMaterial("scatter-building", scene);
  buildingMat.diffuseColor = new Color3(0.42, 0.4, 0.36);
  buildingMat.specularColor = new Color3(0.02, 0.02, 0.02);

  const treeTemplate = MeshBuilder.CreateCylinder("scatter-tree-t", { height: 9, diameterTop: 0.5, diameterBottom: 3.2, tessellation: 6 }, scene);
  treeTemplate.material = treeMat;
  const rockTemplate = MeshBuilder.CreateBox("scatter-rock-t", { width: 2.4, height: 1.6, depth: 2 }, scene);
  rockTemplate.material = rockMat;
  const buildingTemplate = MeshBuilder.CreateBox("scatter-building-t", { width: 8, height: 6, depth: 7 }, scene);
  buildingTemplate.material = buildingMat;
  for (const t of [treeTemplate, rockTemplate, buildingTemplate]) {
    t.isVisible = false;
    t.isPickable = false;
  }

  let count = 0;
  const place = (kind: "tree" | "rock" | "building"): void => {
    const margin = size * 0.06;
    const x = patch.originX + margin + rng() * (size - margin * 2);
    const z = patch.originZ + margin + rng() * (size - margin * 2);
    const y = sampleGroundY(patch, size, x, z);
    const template = kind === "tree" ? treeTemplate : kind === "rock" ? rockTemplate : buildingTemplate;
    const inst = template.createInstance(`scatter-${kind}-${count}`);
    inst.parent = root;
    inst.isPickable = false;
    if (kind === "tree") {
      const s = 0.7 + rng() * 0.9;
      inst.scaling.set(s, s, s);
      inst.position.set(x, y * VERTICAL_SCALE + 4.5 * s, z);
    } else if (kind === "rock") {
      const s = 0.6 + rng() * 1.6;
      inst.scaling.set(s, 0.5 + rng() * 0.5, s * (0.7 + rng() * 0.6));
      inst.rotation.y = rng() * Math.PI * 2;
      inst.position.set(x, y * VERTICAL_SCALE + 0.4, z);
    } else {
      const w = 0.7 + rng() * 1.1;
      const hgt = 0.6 + rng() * 1.4;
      inst.scaling.set(w, hgt, 0.7 + rng() * 0.8);
      inst.rotation.y = rng() * Math.PI * 2;
      inst.position.set(x, y * VERTICAL_SCALE + 3 * hgt, z);
    }
    count += 1;
  };

  for (const kind of SCATTER_TEMPLATES[biome]) {
    const n = kind.min + Math.floor(rng() * (kind.max - kind.min + 1));
    for (let i = 0; i < n; i += 1) place(kind.name as "tree" | "rock" | "building");
  }
  return count;
}

/** Bilinear sample of the patch heights, absolute metres. */
function sampleGroundY(
  patch: { heights: Float32Array; samples: number; originX: number; originZ: number },
  size: number,
  x: number,
  z: number,
): number {
  const s = patch.samples;
  const fx = Math.max(0, Math.min(s - 1.001, ((x - patch.originX) / size) * (s - 1)));
  const fz = Math.max(0, Math.min(s - 1.001, ((z - patch.originZ) / size) * (s - 1)));
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fz);
  const tx = fx - c0;
  const tz = fz - r0;
  const h00 = patch.heights[r0 * s + c0]!;
  const h10 = patch.heights[r0 * s + c0 + 1]!;
  const h01 = patch.heights[(r0 + 1) * s + c0]!;
  const h11 = patch.heights[(r0 + 1) * s + c0 + 1]!;
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

/**
 * Deployment zones: translucent ground overlays. Attackers deploy on the west
 * strip, defenders on the east strip, each 15% of the patch width.
 */
function buildDeploymentZone(
  scene: Scene,
  patch: { heights: Float32Array; samples: number; originX: number; originZ: number },
  size: number,
  side: BattleSide,
): void {
  const stripW = size * 0.15;
  const x0 = side === "attacker" ? patch.originX + size * 0.08 : patch.originX + size * 0.77;
  const cx = x0 + stripW / 2;
  const cz = patch.originZ + size / 2;
  const y = sampleGroundY(patch, size, cx, cz) * VERTICAL_SCALE + 1.5;
  const zone = MeshBuilder.CreatePlane(
    `deploy-${side}`,
    { width: stripW, height: size * 0.7 },
    scene,
  );
  zone.rotation.x = Math.PI / 2;
  zone.position.set(cx, y, cz);
  zone.isPickable = false;
  const mat = new StandardMaterial(`deploy-${side}-mat`, scene);
  mat.diffuseColor = side === "attacker" ? new Color3(0.6, 0.18, 0.12) : new Color3(0.16, 0.3, 0.5);
  mat.alpha = 0.28;
  mat.backFaceCulling = false;
  zone.material = mat;
}

/** A thin glowing ring marking the playable boundary. */
function buildBoundaryRing(
  scene: Scene,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): void {
  const points: Vector3[] = [];
  const segs = 128;
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    points.push(new Vector3(cx + Math.cos(a) * radius, cy + 2, cz + Math.sin(a) * radius));
  }
  const ring = MeshBuilder.CreateLines("boundary-ring", { points }, scene);
  ring.color = new Color3(0.85, 0.6, 0.2);
  ring.isPickable = false;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = Color3.FromHexString(hex);
  return [c.r, c.g, c.b];
}

/**
 * Engine ownership, isolated from the campaign scene. The campaign scene builds its
 * own engine in `createCampaignScene`; the battle scene does the same here without
 * importing campaign code, so the two scenes never share GPU resources.
 */
class EngineShim {
  readonly scene: Scene;
  readonly #engine: Engine;
  #renderLoop: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.#engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
    this.scene = new Scene(this.#engine);
  }

  runRenderLoop(): void {
    this.#renderLoop = () => this.scene.render();
    this.#engine.runRenderLoop(this.#renderLoop);
  }

  resize(): void {
    this.#engine.resize();
  }

  dispose(): void {
    if (this.#renderLoop) this.#engine.stopRenderLoop(this.#renderLoop);
    this.scene.dispose();
    this.#engine.dispose();
  }
}
