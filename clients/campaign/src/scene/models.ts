/**
 * Model registry + loader for the campaign client's staged GLB batch.
 *
 * The 26 GLBs in `public/models/` were staged by milo's lane (see
 * `public/models/MANIFEST.md`; per PAX's lane ruling milo's agents are out of
 * clients/campaign scene wiring, so the wiring lives here). The manifest at
 * `public/models/models.manifest.json` is the machine-readable form of that
 * staging note: name, file, category, target longest-axis length in metres,
 * and any model-space fix (troop-officer.glb lies flat along Z — verified
 * from its accessor bounds — and is rotated upright on load).
 *
 * All models are authored near unit scale, so every instance is auto-scaled:
 * longest axis becomes `targetLengthM`, and the root is lifted so its base
 * sits at y = 0. Loads are fire-and-forget from the scene's point of view:
 * `spawn()` returns `null` when a file fails, and callers keep their
 * procedural fallback.
 */

import "@babylonjs/loaders";
import { LoadTimer } from "../models/LoadTiming.js";
import {
  SceneLoader,
  TransformNode,
  Vector3,
  type AssetContainer,
  type Mesh,
  type Scene,
} from "@babylonjs/core";

export type ModelCategory = "vehicle" | "troop" | "structure" | "nyc" | "prop";

export interface ModelEntry {
  name: string;
  file: string;
  category: ModelCategory;
  /** Longest-axis length in metres the model is scaled to. */
  targetLengthM: number;
  /** Radians of model-space X rotation applied right after load (orientation fix). */
  rotateX?: number;
  /** True when the target length was estimated from geometry, not the staging note. */
  estimated?: boolean;
  notes?: string;
}

export interface ModelsManifest {
  version: number;
  source?: string;
  models: ModelEntry[];
}

export const MODELS_MANIFEST_URL = "/models/models.manifest.json";
export const MODELS_BASE_URL = "/models/";

/**
 * Pure: scale factor that makes the longest axis of `extents` equal `targetM`.
 * Returns 1 for degenerate input rather than producing NaN/Infinity scale.
 */
export function longestAxisScale(
  extents: { x: number; y: number; z: number },
  targetM: number,
): number {
  const longest = Math.max(extents.x, extents.y, extents.z);
  if (!(longest > 0) || !(targetM > 0)) return 1;
  return targetM / longest;
}

/**
 * Pure: validate a manifest against the `.glb` files actually on disk.
 * Returns human-readable errors; empty means consistent.
 */
export function validateModelsManifest(
  manifest: ModelsManifest,
  filesOnDisk: string[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of manifest.models) {
    if (seen.has(entry.name)) errors.push(`duplicate model name: ${entry.name}`);
    seen.add(entry.name);
    if (!filesOnDisk.includes(entry.file)) {
      errors.push(`manifest entry ${entry.name} -> missing file ${entry.file}`);
    }
    if (!(entry.targetLengthM > 0)) {
      errors.push(`manifest entry ${entry.name} has non-positive targetLengthM`);
    }
    if (entry.rotateX !== undefined && !Number.isFinite(entry.rotateX)) {
      errors.push(`manifest entry ${entry.name} has non-finite rotateX`);
    }
  }
  for (const file of filesOnDisk) {
    if (file.endsWith(".glb") && !manifest.models.some((m) => m.file === file)) {
      errors.push(`on-disk ${file} has no manifest entry`);
    }
  }
  return errors;
}

export function modelByName(
  manifest: ModelsManifest,
  name: string,
): ModelEntry | undefined {
  return manifest.models.find((m) => m.name === name);
}

export async function loadModelsManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<ModelsManifest> {
  const res = await fetchImpl(MODELS_MANIFEST_URL);
  if (!res.ok) {
    throw new Error(`models manifest HTTP ${res.status} at ${MODELS_MANIFEST_URL}`);
  }
  return (await res.json()) as ModelsManifest;
}

/** World-space AABB of a transform hierarchy, in metres of model-local scale. */
function hierarchyBounds(root: TransformNode): { min: Vector3; max: Vector3 } {
  return root.getHierarchyBoundingVectors();
}

/**
 * Cached per-scene loader. Containers are loaded once, stripped from the
 * scene (template only), and cloned per `spawn()`. A failed load is evicted
 * from the cache so a retry is possible.
 */
export class ModelLibrary {
  private readonly cache = new Map<string, Promise<AssetContainer>>();

  constructor(
    private readonly scene: Scene,
    private readonly baseUrl: string = MODELS_BASE_URL,
    private readonly loadTimer: LoadTimer = new LoadTimer(),
  ) {}

  container(entry: ModelEntry): Promise<AssetContainer> {
    let pending = this.cache.get(entry.name);
    if (!pending) {
      const timedLoad = this.loadTimer.begin(entry.name);
      pending = Promise.resolve()
        .then(() => SceneLoader.LoadAssetContainerAsync(this.baseUrl, entry.file, this.scene))
        .then(
          (c) => {
            timedLoad.end();
            // The template must not render; instances are spawned from it.
            c.removeAllFromScene();
            if (entry.rotateX) {
              for (const root of c.rootNodes) {
                if (root instanceof TransformNode) root.rotation.x += entry.rotateX;
              }
            }
            return c;
          },
          (error: unknown) => {
            timedLoad.end();
            throw error;
          },
        );
      pending.catch(() => {
        this.cache.delete(entry.name);
      });
      this.cache.set(entry.name, pending);
    }
    return pending;
  }

  /**
   * Instantiate one auto-scaled copy: longest axis becomes
   * `entry.targetLengthM` and the base sits at y = 0. Returns `null` when the
   * file cannot be loaded or contains no root node — the caller keeps its
   * procedural fallback.
   */
  async spawn(entry: ModelEntry, namePrefix: string): Promise<TransformNode | null> {
    let c: AssetContainer;
    try {
      c = await this.container(entry);
    } catch (err) {
      console.warn(`[models] could not load ${entry.file}:`, err);
      return null;
    }
    const inst = c.instantiateModelsToScene((n) => `${namePrefix}_${n}`);
    const root = inst.rootNodes[0] as TransformNode | undefined;
    if (!root) return null;
    const { min, max } = hierarchyBounds(root);
    const extents = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
    const s = longestAxisScale(extents, entry.targetLengthM);
    root.scaling.setAll(s);
    root.position.y = -min.y * s;
    root.setEnabled(true);
    return root;
  }
}

/**
 * Swap the procedural box convoy in the party marker for staged GLB
 * vehicles (humvee lead, pickup-truck second). The boxes stay in place until
 * both GLBs load; on any failure the party keeps its boxes.
 */
export async function upgradeConvoyToGlb(
  partyRoot: TransformNode,
  lead: Mesh,
  second: Mesh,
  library: ModelLibrary,
  manifest: ModelsManifest,
): Promise<void> {
  const leadEntry = modelByName(manifest, "humvee");
  const secondEntry = modelByName(manifest, "pickup-truck");
  if (!leadEntry || !secondEntry) {
    console.warn("[models] convoy entries missing from manifest; keeping boxes");
    return;
  }
  const [leadRoot, secondRoot] = await Promise.all([
    library.spawn(leadEntry, "party-lead"),
    library.spawn(secondEntry, "party-second"),
  ]);
  if (!leadRoot || !secondRoot) return; // boxes remain as the fallback
  const swaps: Array<[TransformNode, Mesh]> = [
    [leadRoot, lead],
    [secondRoot, second],
  ];
  for (const [glb, box] of swaps) {
    glb.parent = partyRoot;
    // GLB bases sit at y = 0 after spawn(); keep the procedural convoy offsets.
    glb.position.set(0, 0, box.position.z);
    for (const mesh of glb.getChildMeshes()) mesh.isPickable = false;
    box.dispose();
  }
}
