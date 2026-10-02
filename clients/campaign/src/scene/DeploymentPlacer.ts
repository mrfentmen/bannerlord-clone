/**
 * Deployment placement interaction for the battle scene (Buffy task 3).
 *
 * During deployment a semi-transparent soldier ghost follows the cursor over
 * the battlefield, so the player sees where a unit is about to stand before
 * clicking. The placer owns the pointer subscription and the ghost visuals;
 * later deployment tasks (click to place, cancel, grid snap, undo) build on
 * the same handle.
 *
 * The ghost starts as a primitive proxy so it is there the moment deployment
 * begins, and upgrades to a translucent clone of the soldier GLB once the
 * file loads. On any load failure the proxy stays — the same fallback pattern
 * the party convoy uses (`models.ts`), so a missing file never blocks the
 * deployment phase.
 */

import "@babylonjs/loaders";
import {
  Color3,
  Mesh,
  MeshBuilder,
  type Observer,
  PointerEventTypes,
  type PointerInfo,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

/** Only the battle ground is a valid ghost surface; props and zones are ignored. */
const GROUND_MESH_NAME = "battleGround";
const GHOST_ROOT_NAME = "deployGhost";
/** Same default soldier as `BattleSoldier.create()` — the ghost matches the troops. */
const GHOST_MODEL_FILE = "operator-viper.glb";
/** Ghosts are see-through: solid enough to read, faint enough not to occlude. */
const GHOST_ALPHA = 0.45;

export interface DeploymentPlacerOptions {
  /** Soldier GLB for the ghost; defaults to the BattleSoldier model. */
  modelFile?: string;
}

export class DeploymentPlacer {
  private readonly scene: Scene;
  private readonly modelFile: string;
  private readonly ghostRoot: TransformNode;
  private readonly ghostMaterial: StandardMaterial;
  private readonly proxyMeshes: Mesh[] = [];
  private observer: Observer<PointerInfo> | null = null;
  private lastPoint: Vector3 | null = null;
  private proxyRetired = false;
  private disposed = false;

  constructor(scene: Scene, options: DeploymentPlacerOptions = {}) {
    this.scene = scene;
    this.modelFile = options.modelFile ?? GHOST_MODEL_FILE;

    this.ghostRoot = new TransformNode(GHOST_ROOT_NAME, scene);

    this.ghostMaterial = new StandardMaterial("deployGhostMat", scene);
    this.ghostMaterial.diffuseColor = new Color3(0.2, 0.85, 0.3);
    this.ghostMaterial.emissiveColor = new Color3(0.06, 0.22, 0.1);
    this.ghostMaterial.alpha = GHOST_ALPHA;
    this.ghostMaterial.backFaceCulling = false;

    // Primitive proxy soldier: capsule body, sphere head, feet on the ground.
    const body = MeshBuilder.CreateCapsule(
      "deployGhostBody", { height: 1.55, radius: 0.32 }, scene,
    );
    body.position.y = 0.78;
    body.material = this.ghostMaterial;
    body.isPickable = false;
    body.parent = this.ghostRoot;

    const head = MeshBuilder.CreateSphere(
      "deployGhostHead", { diameter: 0.34, segments: 8 }, scene,
    );
    head.position.y = 1.72;
    head.material = this.ghostMaterial;
    head.isPickable = false;
    head.parent = this.ghostRoot;

    this.proxyMeshes.push(body, head);
    this.ghostRoot.setEnabled(false);

    void this.upgradeToModel();
  }

  /**
   * Start the preview: show the ghost and follow the cursor. Idempotent —
   * calling it twice is a no-op, so re-entering deployment never stacks
   * pointer observers.
   */
  start(initialPoint?: Vector3): void {
    if (this.disposed || this.observer) return;
    this.observer = this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERMOVE) return;
      this.followCursor();
    });
    this.ghostRoot.setEnabled(true);
    this.moveGhostTo(initialPoint ?? this.lastPoint ?? Vector3.Zero());
  }

  /** Stop following the cursor and hide the ghost. Idempotent. */
  stop(): void {
    if (this.observer) {
      this.scene.onPointerObservable.remove(this.observer);
      this.observer = null;
    }
    this.ghostRoot.setEnabled(false);
  }

  /** Stand the ghost at a battlefield point (y is always ground level). */
  moveGhostTo(point: Vector3): void {
    this.lastPoint = new Vector3(point.x, 0, point.z);
    this.ghostRoot.position.set(point.x, 0, point.z);
  }

  /** Where the ghost is standing, or null before the first move. */
  getPreviewPoint(): Vector3 | null {
    return this.lastPoint ? this.lastPoint.clone() : null;
  }

  private followCursor(): void {
    // Predicate-filtered pick: only the ground is a candidate, so the ghost
    // keeps tracking it even when the cursor passes over a tree or a wall.
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh.name === GROUND_MESH_NAME,
    );
    const point = pick?.hit ? pick.pickedPoint : null;
    if (point) this.moveGhostTo(point);
    // No ground under the cursor (sky, off-map edge): keep the last valid spot.
  }

  /**
   * Swap the proxy for a translucent clone of the soldier GLB once it loads.
   * Runs in the background; a failure is not an error — the proxy remains.
   */
  private async upgradeToModel(): Promise<void> {
    try {
      const result = await SceneLoader.ImportMeshAsync("", "/models/", this.modelFile, this.scene);
      if (this.disposed) {
        for (const mesh of result.meshes) mesh.dispose();
        return;
      }
      let parented = false;
      for (const mesh of result.meshes) {
        mesh.isPickable = false;
        const material = mesh.material;
        if (material) {
          material.alpha = GHOST_ALPHA;
          material.backFaceCulling = false;
        }
        if (!mesh.parent) {
          mesh.parent = this.ghostRoot;
          parented = true;
        }
      }
      if (!parented) return; // nothing usable in the file; keep the proxy
      for (const mesh of this.proxyMeshes) mesh.dispose(false, false);
      this.proxyMeshes.length = 0;
      this.ghostMaterial.dispose();
      this.proxyRetired = true;
    } catch (err) {
      console.warn(
        `[deployment] ghost model ${this.modelFile} failed to load; keeping the proxy`,
        err,
      );
    }
  }

  /** Remove the ghost, its pointer subscription, and its materials. */
  dispose(): void {
    this.disposed = true;
    this.stop();
    for (const mesh of this.proxyMeshes) mesh.dispose(false, false);
    this.proxyMeshes.length = 0;
    if (!this.proxyRetired) this.ghostMaterial.dispose();
    this.ghostRoot.dispose();
  }
}
