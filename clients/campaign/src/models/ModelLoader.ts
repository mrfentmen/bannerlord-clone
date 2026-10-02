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
 */

/** Attempts per model, including the first. Task 601. */
export const DEFAULT_ATTEMPTS = 3;
/** Wait between attempts, ms. Task 601. */
export const DEFAULT_RETRY_DELAY_MS = 250;
/** Time budget per attempt, ms. Task 602. */
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface ModelInfo {
  id: string;
  path: string;
  category: 'vehicle' | 'troop' | 'structure' | 'nyc' | 'prop';
  scale?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ModelLoaderOptions {
  /** Attempts per model, including the first; defaults to 3 (task 601). */
  attempts?: number;
  /** Wait between attempts, ms; defaults to 250 (task 601). */
  retryDelayMs?: number;
  /** Time budget per attempt, ms; defaults to 30000 (task 602). 0 disables it. */
  timeoutMs?: number;
  /**
   * Loads one model. Defaults to Babylon's `SceneLoader`; tests inject a fake
   * so retry behaviour is observable without a scene (task 601).
   */
  load?: (info: ModelInfo) => Promise<unknown>;
}

export class ModelLoader {
  private scene: any; // Babylon.js Scene
  private cache = new Map<string, any>(); // id -> loaded container
  private loading = new Map<string, Promise<any>>();
  private manifest = new Map<string, ModelInfo>();
  private attempts: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  private loadImpl: (info: ModelInfo) => Promise<unknown>;

  constructor(scene: any, options: ModelLoaderOptions = {}) {
    this.scene = scene;
    this.attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    this.timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.loadImpl = options.load ?? ((info) => this.loadModel(info));
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
   * Attempt the loader until it succeeds or the attempts run out (task 601).
   * The error from the last attempt is what the caller reports.
   */
  private async loadWithRetry(info: ModelInfo): Promise<any> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        return await this.loadWithTimeout(info);
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
  private loadWithTimeout(info: ModelInfo): Promise<unknown> {
    if (this.timeoutMs <= 0) return this.loadImpl(info);
    const budget = this.timeoutMs;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`ModelLoader: "${info.id}" did not load within ${budget} ms`)),
        budget,
      );
      this.loadImpl(info).then(
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
  private async loadModel(info: ModelInfo): Promise<any> {
    // Dynamic import to avoid hard dependency
    // The client should have @babylonjs/core and @babylonjs/loaders
    const { SceneLoader } = await import('@babylonjs/core/Loading/sceneLoader');
    await import('@babylonjs/loaders/glTF');

    return new Promise((resolve, reject) => {
      const pathParts = info.path.split('/');
      const fileName = pathParts.pop()!;
      const rootUrl = pathParts.join('/') + '/';

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
        undefined, // onProgress
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
