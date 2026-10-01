/**
 * Staged 3D model assets for the campaign scene: the 26 GLBs under `public/models/`.
 *
 * This is the file pax's lane ruling named: Rowan owns the campaign wiring, so the
 * models Milo's lane staged land here as data plus one loader. Nothing in this file
 * touches `CampaignScene.ts`; the scene calls `loadModelAsset` and gets a
 * `TransformNode` back, the same way it calls a `UnitFactory` for units.
 *
 * Every model carries a `targetLength`: the longest axis in metres the asset should
 * measure once placed. Forge exports come in arbitrary scales, so the loader measures
 * the model's own bounding box and scales it to the target rather than trusting the
 * file. A model that fails to load (no glTF plugin, 404, decode error, empty file)
 * resolves to null and reports why through `onError`; the scene must survive every
 * one of those without a fallback mesh, because a missing prop is not a missing unit.
 *
 * Licensing is UNVERIFIED for all 26 assets (see the manifest credits). Nothing here
 * decides what ships; that decision reads the same credits.
 */

import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { hasGlbLoader } from "./units/glb.js";

/** Where a model belongs on the map. */
export type ModelCategory = "vehicles" | "troops" | "structures" | "nyc";

export interface ModelAssetEntry {
  /** File under `baseUrl`. */
  readonly file: string;
  readonly category: ModelCategory;
  /**
   * Longest axis in metres once placed. The loader scales the model to this, so a
   * 120m skyscraper and a 3m food cart can share one code path.
   */
  readonly targetLength: number;
  /** Radians of X rotation applied before scaling. Fixes models exported lying down. */
  readonly rotateX?: number | undefined;
  /** "marginal" assets are fine at map scale but should not be the hero pick. */
  readonly quality?: "marginal" | undefined;
  /** True when the target length was estimated rather than staged with the asset. */
  readonly estimated?: boolean | undefined;
  readonly notes?: string | undefined;
}

export interface ModelManifest {
  readonly version: 1;
  /** Prepended to every relative file. */
  readonly baseUrl?: string | undefined;
  readonly models: Record<string, ModelAssetEntry>;
  readonly credits?: readonly string[] | undefined;
}

export interface LoadedModelAsset {
  /** The model's name in the manifest. */
  readonly name: string;
  /** Scene-graph root, scaled to the target length and grounded at y = 0. */
  readonly root: TransformNode;
  /** The model's own longest axis in metres before scaling. */
  readonly authoredLength: number;
  /** The multiplier applied. */
  readonly scale: number;
}

/** Why an asset did not land. Reported verbatim; the caller logs it. */
export type ModelAssetFailure =
  | "no-manifest-entry"
  | "no-glb-loader"
  | "load-failed"
  | "empty-model"
  | "degenerate-bounds";

export interface ModelAssetReport {
  readonly name: string;
  readonly failure: ModelAssetFailure;
  /** The URL that failed, or null when the manifest never had the entry. */
  readonly url: string | null;
  readonly message: string;
}

export type ModelMeshLoader = (url: string, scene: Scene) => Promise<AbstractMesh[]>;

const defaultMeshLoader: ModelMeshLoader = async (url, scene) => {
  const result = await SceneLoader.ImportMeshAsync(null, url, undefined, scene);
  return result?.meshes ?? [];
};

export interface LoadModelAssetOptions {
  readonly scene: Scene;
  readonly manifest: ModelManifest;
  readonly loadMeshes?: ModelMeshLoader;
  /** Every failure, with the reason. The scene logs these; it does not crash on them. */
  readonly onError?: (report: ModelAssetReport) => void;
  /** Prefix for node names, so a staged asset is distinguishable in a scene dump. */
  readonly namePrefix?: string;
}

/**
 * Fetch and validate a model manifest.
 *
 * Throws a descriptive error for a missing file, a non-JSON body, or a body that is
 * not a version-1 model manifest. A corrupt manifest is a content problem the boot
 * path should report, not a shape this loader should guess at.
 */
export async function fetchModelManifest(url: string): Promise<ModelManifest> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`fetch(${url}) threw: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`fetch(${url}) returned HTTP ${response.status}: the model manifest is missing.`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`fetch(${url}) returned a body that is not JSON.`);
  }
  return parseModelManifest(body, url);
}

export function parseModelManifest(body: unknown, url: string): ModelManifest {
  if (typeof body !== "object" || body === null) {
    throw new Error(`Model manifest at ${url} is not an object.`);
  }
  const record = body as Record<string, unknown>;
  if (record["version"] !== 1) {
    throw new Error(`Model manifest at ${url} has unsupported version ${String(record["version"])}.`);
  }
  if (typeof record["models"] !== "object" || record["models"] === null) {
    throw new Error(`Model manifest at ${url} has no "models" object.`);
  }
  const models: Record<string, ModelAssetEntry> = {};
  for (const [name, raw] of Object.entries(record["models"] as Record<string, unknown>)) {
    models[name] = parseModelAssetEntry(name, raw, url);
  }
  return {
    version: 1,
    baseUrl: typeof record["baseUrl"] === "string" ? record["baseUrl"] : undefined,
    models,
    credits: Array.isArray(record["credits"])
      ? (record["credits"] as unknown[]).filter((c): c is string => typeof c === "string")
      : undefined,
  };
}

function parseModelAssetEntry(name: string, raw: unknown, url: string): ModelAssetEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Model manifest at ${url}: entry "${name}" is not an object.`);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record["file"] !== "string" || record["file"].length === 0) {
    throw new Error(`Model manifest at ${url}: entry "${name}" has no file.`);
  }
  const targetLength = record["targetLength"];
  if (typeof targetLength !== "number" || !Number.isFinite(targetLength) || targetLength <= 0) {
    throw new Error(`Model manifest at ${url}: entry "${name}" has no positive targetLength.`);
  }
  const category = record["category"];
  if (category !== "vehicles" && category !== "troops" && category !== "structures" && category !== "nyc") {
    throw new Error(`Model manifest at ${url}: entry "${name}" has unknown category ${String(category)}.`);
  }
  return {
    file: record["file"],
    category,
    targetLength,
    rotateX: typeof record["rotateX"] === "number" ? record["rotateX"] : undefined,
    quality: record["quality"] === "marginal" ? "marginal" : undefined,
    estimated: record["estimated"] === true ? true : undefined,
    notes: typeof record["notes"] === "string" ? record["notes"] : undefined,
  };
}

/** The resolved URL for a named asset, or null when the manifest has no such entry. */
export function modelAssetUrl(manifest: ModelManifest, name: string): string | null {
  const entry = manifest.models[name];
  if (!entry) return null;
  const file = entry.file;
  if (/^(?:https?:)?\/\//i.test(file) || file.startsWith("./") || file.startsWith("../") || file.startsWith("/")) {
    return file;
  }
  const base = manifest.baseUrl;
  if (!base) return file;
  return `${base.endsWith("/") ? base : `${base}/`}${file}`;
}

/**
 * Load one staged model and hand back its root, scaled to the manifest target.
 *
 * Resolves to null on every failure mode, and each one reports through `onError` so
 * the log says which asset and why. A null is not an error for the caller: the map
 * simply has one fewer prop, the way a missing elevation tile is a flat spot.
 */
export async function loadModelAsset(
  name: string,
  options: LoadModelAssetOptions,
): Promise<LoadedModelAsset | null> {
  const { scene, manifest, onError, namePrefix = "asset" } = options;
  const entry = manifest.models[name];
  if (!entry) {
    onError?.({
      name,
      failure: "no-manifest-entry",
      url: null,
      message: `The model manifest has no asset named "${name}".`,
    });
    return null;
  }
  const url = modelAssetUrl(manifest, name) ?? entry.file;
  const loadMeshes = options.loadMeshes ?? defaultMeshLoader;
  if (loadMeshes === defaultMeshLoader && !hasGlbLoader()) {
    onError?.({
      name,
      failure: "no-glb-loader",
      url,
      message: "No glTF loader is registered for .glb in this build.",
    });
    return null;
  }

  let imported: AbstractMesh[];
  try {
    imported = await loadMeshes(url, scene);
  } catch (error) {
    onError?.({
      name,
      failure: "load-failed",
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  if (imported.length === 0) {
    onError?.({ name, failure: "empty-model", url, message: "The asset loaded but carried no mesh." });
    return null;
  }

  const root = new TransformNode(`${namePrefix}-${name}`, scene);
  for (const mesh of imported) {
    mesh.parent = root;
    mesh.isPickable = false;
  }
  if (entry.rotateX) root.rotation.x = entry.rotateX;

  // Measure after the rotation fix: a model lying flat along Z measures its length
  // on the wrong axis, and scaling to the target from the pre-rotation box would
  // shrink the thing that was already the right size.
  root.computeWorldMatrix(true);
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const mesh of root.getChildMeshes(false)) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    minX = Math.min(minX, box.minimumWorld.x);
    minY = Math.min(minY, box.minimumWorld.y);
    minZ = Math.min(minZ, box.minimumWorld.z);
    maxX = Math.max(maxX, box.maximumWorld.x);
    maxY = Math.max(maxY, box.maximumWorld.y);
    maxZ = Math.max(maxZ, box.maximumWorld.z);
  }
  const longest = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (!Number.isFinite(longest) || longest <= 0) {
    root.dispose(false, true);
    onError?.({ name, failure: "degenerate-bounds", url, message: "The asset's bounding box has no extent." });
    return null;
  }

  const scale = entry.targetLength / longest;
  root.scaling.setAll(scale);
  // Ground the model: after scaling, the lowest point sits on y = 0.
  root.computeWorldMatrix(true);
  let lowest = Infinity;
  for (const mesh of root.getChildMeshes(false)) {
    mesh.computeWorldMatrix(true);
    lowest = Math.min(lowest, mesh.getBoundingInfo().boundingBox.minimumWorld.y);
  }
  if (Number.isFinite(lowest)) root.position.y -= lowest;

  return { name, root, authoredLength: longest, scale };
}
