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
 */

export interface ModelInfo {
  id: string;
  path: string;
  category: 'vehicle' | 'troop' | 'structure' | 'nyc' | 'prop';
  scale?: number;
}

export class ModelLoader {
  private scene: any; // Babylon.js Scene
  private cache = new Map<string, any>(); // id -> loaded container
  private loading = new Map<string, Promise<any>>();
  private manifest = new Map<string, ModelInfo>();

  constructor(scene: any) {
    this.scene = scene;
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

    const promise = this.loadModel(info);
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
        (scene, message) => {
          reject(new Error(`Failed to load ${info.path}: ${message}`));
        },
      );
    });
  }

  /**
   * Clear the cache and dispose loaded models.
   */
  dispose(): void {
    for (const [id, model] of this.cache) {
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
