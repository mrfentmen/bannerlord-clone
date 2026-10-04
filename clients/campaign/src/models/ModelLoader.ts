/**
 * ModelLoader for bannerlord-clone.
 *
 * Loads GLB models with caching, pooling, and LOD support.
 * Integrates with Babylon.js SceneLoader.
 *
 * Usage:
 *   const loader = new ModelLoader(scene);
 *   await loader.preload(['troop-gunner', 'humvee']);
 *   const mesh = await loader.get('troop-gunner');
 *
 * Task 601: a failed load is retried, up to {@link DEFAULT_ATTEMPTS} times. The
 * retry lives around the loader call, not inside the Babylon callback, so a
 * network blip and a parse error take the same path. `attempts` and the delay
 * are constructor options so tests (and a caller on a slow link) can override
 * them; the injected `load` is the seam the tests use instead of Babylon.
 *
 * Task 602: each attempt is bounded by {@link DEFAULT_TIMEOUT_MS}. A request
 * that never settles would otherwise hold its `loading` entry forever, and
 * every later call for that model would wait on a promise that cannot finish.
 *
 * Task 603: the byte counts SceneLoader already reports are forwarded to the
 * caller's `onProgress`, tagged with the model id, so a loading screen can show
 * real transfer progress instead of a spinner that means nothing.
 *
 * Task 604 (cache) was already in place and is covered by the retry tests:
 * `load` serves the cache first, an in-flight promise is shared, and `dispose`
 * drops the entries. No second cache layer was added.
 *
 * Task 605: {@link ModelLoader.preloadBattle} loads the battlefield categories
 * in one pass and reports which ids arrived and which failed.
 *
 * Task 606: {@link ModelLoader.beginLoad} hands back something to draw right
 * now — a placeholder mesh — while the real model streams; the placeholder is
 * disposed when the model lands. The scene owner decides what the stand-in
 * looks like through `createPlaceholder` (default: a 1 m Babylon box).
 *
 * Task 630 (base URL): `baseUrl` prefixes the directory part of a manifest path,
 * so an asset in a subdirectory -- the ten weapons under models/weapons/ -- is
 * reachable from a server that is not the document root. Unset, the old
 * resolve-relative-to-the-page behaviour is unchanged.
 *
 * Task 607: when the load finally fails, the placeholder is swapped for a red
 * fallback box rather than leaving a stand-in that looks like a real model or
 * a hole where a unit should be. The box is named `<id>__error` so it is never
 * mistaken for content, and `ready` resolves with it — the caller always has
 * something drawable.
 */

/** Attempts per model, including the first. Task 601. */
export const DEFAULT_ATTEMPTS = 3;
/** Wait between attempts, ms. Task 601. */
export const DEFAULT_RETRY_DELAY_MS = 250;
/** Time budget per attempt, ms. Task 602. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Categories that belong on a battlefield (task 605). `structure`, `nyc` and
 * `prop` are map dressing and are loaded on approach, not before a fight.
 */
export const BATTLE_CATEGORIES: readonly ModelInfo["category"][] = ["troop", "vehicle"];

export interface ModelInfo {
  id: string;
  path: string;
  category: 'vehicle' | 'troop' | 'structure' | 'nyc' | 'prop';
  scale?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Removes a mesh if it knows how; a placeholder may be any drawable (task 606). */
function disposeMesh(mesh: unknown): void {
  (mesh as { dispose?: () => void } | null)?.dispose?.();
}

/** One progress reading for one model (task 603). */
export interface LoadProgress {
  /** The model these bytes belong to. */
  id: string;
  /** Bytes fetched so far. */
  loaded: number;
  /** Total bytes, or 0 when the server does not send a length. */
  total: number;
}

/** How a loader reports bytes; `(loaded, total)` (task 603). */
export type ProgressReporter = (loaded: number, total: number) => void;

/** A load in flight, plus what to draw until it lands (task 606). */
export interface PlaceholderLoad {
  /** Draw this now; null when the model is cached or unknown. */
  placeholder: unknown;
  /**
   * The real model, or the red fallback box when the load failed (task 607).
   */
  ready: Promise<unknown>;
}

/** What a preload pass managed to fetch (task 605). */
export interface PreloadReport {
  /** Ids that came back with a model (from the network or the cache). */
  loaded: string[];
  /** Ids whose load failed and are therefore not on the field. */
  failed: string[];
}

export interface ModelLoaderOptions {
  /** Attempts per model, including the first; defaults to 3 (task 601). */
  attempts?: number;
  /** Wait between attempts, ms; defaults to 250 (task 601). */
  retryDelayMs?: number;
  /** Time budget per attempt, ms; defaults to 30000 (task 602). 0 disables it. */
  timeoutMs?: number;
  /**
   * Receives byte counts while a model loads (task 603). Never called for a
   * model that is already cached.
   */
  onProgress?: (progress: LoadProgress) => void;
  /**
   * Builds the stand-in shown while a model loads (task 606). Defaults to a
   * 1 m Babylon box named `<id>__placeholder`.
   */
  createPlaceholder?: (id: string) => unknown | Promise<unknown>;
  /**
   * Builds the mesh shown in place of a model that failed to load (task 607).
   * Defaults to a red Babylon box named `<id>__error`.
   */
  createErrorBox?: (id: string) => unknown | Promise<unknown>;
  /**
   * Loads one model. Defaults to Babylon's `SceneLoader`; tests inject a fake
   * so retry behaviour is observable without a scene (task 601).
   */
  load?: (info: ModelInfo, report: ProgressReporter) => Promise<unknown>;
  /**
   * Prefix for `info.path`, e.g. `/models/`. Set it when the manifest's paths
   * are relative and the app serves the assets from somewhere other than the
   * document root -- task 630 loads the whole staged batch against a loopback
   * server this way. Unset, the path is split into a root and a file name and
   * resolved relative to the page, which is what the client does.
   */
  baseUrl?: string;
}

export class ModelLoader {
  private scene: any; // Babylon.js Scene
  private cache = new Map<string, any>(); // id -> loaded container
  private loading = new Map<string, Promise<any>>();
  private manifest = new Map<string, ModelInfo>();
  private attempts: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  private onProgress: ((progress: LoadProgress) => void) | null;
  private createPlaceholder: (id: string) => unknown | Promise<unknown>;
  private createErrorBox: (id: string) => unknown | Promise<unknown>;
  private loadImpl: (info: ModelInfo, report: ProgressReporter) => Promise<unknown>;
  private baseUrl: string;

  constructor(scene: any, options: ModelLoaderOptions = {}) {
    this.scene = scene;
    this.attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    this.timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.onProgress = options.onProgress ?? null;
    this.createPlaceholder =
      options.createPlaceholder ?? ((id) => this.defaultPlaceholder(id));
    this.createErrorBox = options.createErrorBox ?? ((id) => this.defaultErrorBox(id));
    this.loadImpl = options.load ?? ((info, report) => this.loadModel(info, report));
    this.baseUrl = options.baseUrl ?? '';
  }

  /**
   * Load the model manifest.
   */
  async loadManifest(manifestUrl: string): Promise<void> {
    const resp = await fetch(manifestUrl);
    const data = await resp.json();
    const models: ModelInfo[] = data.models || [];
    for (const model of models) {
      this.manifest.set(model.id, model);
    }
    console.log(`ModelLoader: loaded ${models.length} models from manifest`);
  }

  /**
   * Preload models by ID.
   */
  async preload(ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => this.load(id)));
  }

  /**
   * Task 605: load every battlefield model in the manifest before the field is
   * drawn. The pass never rejects — a model that fails is listed in `failed`,
   * because the caller still has a battle to run.
   */
  async preloadBattle(): Promise<PreloadReport> {
    return this.preloadCategories(BATTLE_CATEGORIES);
  }

  /** Loads every manifest model in the given categories (task 605). */
  async preloadCategories(categories: readonly ModelInfo["category"][]): Promise<PreloadReport> {
    const wanted = new Set(categories);
    const ids = [...this.manifest.values()].filter((m) => wanted.has(m.category)).map((m) => m.id);
    const results = await Promise.all(ids.map(async (id) => ({ id, model: await this.load(id) })));
    return {
      loaded: results.filter((r) => r.model !== null).map((r) => r.id),
      failed: results.filter((r) => r.model === null).map((r) => r.id),
    };
  }

  /**
   * Load a model by ID. Returns cached instance if already loaded.
   */
  async load(id: string): Promise<any> {
    // Return cached
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }

    // Return in-flight load
    if (this.loading.has(id)) {
      return this.loading.get(id);
    }

    const info = this.manifest.get(id);
    if (!info) {
      console.warn(`ModelLoader: unknown model "${id}"`);
      return null;
    }

    const promise = this.loadWithRetry(info);
    this.loading.set(id, promise);

    try {
      const result = await promise;
      this.tagForRaycast(result, info);
      this.cache.set(id, result);
      this.loading.delete(id);
      return result;
    } catch (err) {
      this.loading.delete(id);
      console.error(`ModelLoader: failed to load "${id}":`, err);
      return null;
    }
  }

  /**
   * Task 617: tag every mesh of a loaded model for raycast. Hit handlers read
   * `mesh.metadata.modelId` / `modelCategory` to know what the ray hit without
   * parsing mesh names. Existing metadata is preserved — the tags merge in.
   */
  private tagForRaycast(container: any, info: ModelInfo): void {
    const meshes: any[] = container?.meshes ?? [];
    for (const mesh of meshes) {
      mesh.metadata = {
        ...(mesh.metadata ?? {}),
        modelId: info.id,
        modelCategory: info.category,
      };
    }
  }

  /**
   * Attempt the loader until it succeeds or the attempts run out (task 601).
   * The error from the last attempt is what the caller reports.
   */
  private async loadWithRetry(info: ModelInfo): Promise<any> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        return await this.loadWithTimeout(info, this.reporterFor(info));
      } catch (err) {
        lastError = err;
        if (attempt >= this.attempts) break;
        console.warn(`ModelLoader: "${info.id}" attempt ${attempt}/${this.attempts} failed, retrying`);
        if (this.retryDelayMs > 0) await delay(this.retryDelayMs);
      }
    }
    throw lastError;
  }

  /**
   * One attempt, bounded by the time budget (task 602). The timer is always
   * cleared when the attempt settles, so a fast load leaves nothing pending.
   */
  private loadWithTimeout(info: ModelInfo, report: ProgressReporter): Promise<unknown> {
    if (this.timeoutMs <= 0) return this.loadImpl(info, report);
    const budget = this.timeoutMs;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`ModelLoader: "${info.id}" did not load within ${budget} ms`)),
        budget,
      );
      this.loadImpl(info, report).then(
        (mesh) => {
          clearTimeout(timer);
          resolve(mesh);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  /** Turns a loader's byte counts into this loader's progress events (task 603). */
  private reporterFor(info: ModelInfo): ProgressReporter {
    return (loaded, total) => this.onProgress?.({ id: info.id, loaded, total });
  }

  /**
   * Task 606/607: start a load and get something to draw right away.
   * `placeholder` is the stand-in for the field, or null when the model was
   * already cached or is not in the manifest. `ready` resolves with the real
   * model; when the load fails it resolves with the red fallback box instead,
   * never null, so the caller always has something to put down.
   */
  async beginLoad(id: string): Promise<PlaceholderLoad> {
    if (this.cache.has(id) || !this.manifest.has(id)) {
      return { placeholder: null, ready: this.load(id) };
    }

    const placeholder = await this.createPlaceholder(id);
    const ready = this.load(id).then(async (model) => {
      disposeMesh(placeholder);
      return model ?? (await this.createErrorBox(id));
    });
    return { placeholder, ready };
  }

  /** A plain box, named so a screenshot or a scene dump says what it is (task 606). */
  private async defaultPlaceholder(id: string): Promise<unknown> {
    const { MeshBuilder } = await import("@babylonjs/core/Meshes/meshBuilder");
    return MeshBuilder.CreateBox(`${id}__placeholder`, { size: 1 }, this.scene);
  }

  /**
   * The last resort for a model that will not load: a red box where the unit
   * or prop should stand (task 607). Deliberately ugly — a missing model has to
   * be visible, not hidden. Colour is a plain Babylon Color3: this runs in the
   * 3D scene, where the CSS tokens do not reach.
   */
  private async defaultErrorBox(id: string): Promise<unknown> {
    const { MeshBuilder } = await import("@babylonjs/core/Meshes/meshBuilder");
    const { StandardMaterial } = await import("@babylonjs/core/Materials/standardMaterial");
    const { Color3 } = await import("@babylonjs/core/Maths/math.color");
    const box = MeshBuilder.CreateBox(`${id}__error`, { size: 1 }, this.scene);
    const material = new StandardMaterial(`${id}__errorMat`, this.scene);
    material.diffuseColor = new Color3(0.72, 0.16, 0.12);
    box.material = material;
    return box;
  }

  /**
   * Get a clone/instance of a loaded model for placement in the scene.
   * Uses thin instances or clones for performance.
   */
  async getInstance(id: string): Promise<any> {
    const template = await this.load(id);
    if (!template) return null;

    // Clone the mesh hierarchy
    // In Babylon.js, use .clone() or .createInstance() for meshes
    if (template.clone) {
      return template.clone(`${id}_instance_${Date.now()}`);
    }

    // Fallback: return the template (caller must handle sharing)
    console.warn(`ModelLoader: cannot clone "${id}", returning template`);
    return template;
  }

  /**
   * Internal: load a GLB file via Babylon.js SceneLoader.
   */
  private async loadModel(info: ModelInfo, report: ProgressReporter): Promise<any> {
    // Dynamic import to avoid hard dependency
    // The client should have @babylonjs/core and @babylonjs/loaders
    const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader');
    await import('@babylonjs/loaders/glTF');

    return new Promise((resolve, reject) => {
      // Babylon's ImportMesh takes a root URL and a file name separately, so
      // the path is split either way. With a base URL the directory part of the
      // manifest path is appended to it -- that is what keeps the weapons under
      // models/weapons/ reachable from a server that is not the document root.
      const pathParts = info.path.split('/');
      const fileName = pathParts.pop()!;
      const dir = pathParts.join('/');
      const rootUrl = this.baseUrl
        ? this.baseUrl + (dir ? dir + '/' : '')
        : dir + '/';

      SceneLoader.ImportMesh(
        '',
        rootUrl,
        fileName,
        this.scene,
        (meshes) => {
          // Apply scale if specified
          if (info.scale && info.scale !== 1) {
            for (const mesh of meshes) {
              mesh.scaling.scaleInPlace(info.scale);
            }
          }
          // Return the root mesh (first mesh, or create a parent)
          resolve(meshes[0] || null);
        },
        (event: { loaded: number; total: number }) => report(event.loaded, event.total), // task 603
        (_scene, message) => {
          reject(new Error(`Failed to load ${info.path}: ${message}`));
        },
      );
    });
  }

  /**
   * Clear the cache and dispose loaded models.
   */
  dispose(): void {
    for (const model of this.cache.values()) {
      if (model && model.dispose) {
        model.dispose();
      }
    }
    this.cache.clear();
    this.loading.clear();
  }

  /**
   * Get model info by ID.
   */
  getInfo(id: string): ModelInfo | undefined {
    return this.manifest.get(id);
  }

  /**
   * List all loaded model IDs.
   */
  getLoadedIds(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Singleton
let instance: ModelLoader | null = null;

export function getModelLoader(scene?: any): ModelLoader {
  if (!instance && scene) {
    instance = new ModelLoader(scene);
  }
  if (!instance) {
    throw new Error('ModelLoader not initialized. Call getModelLoader(scene) first.');
  }
  return instance;
}
