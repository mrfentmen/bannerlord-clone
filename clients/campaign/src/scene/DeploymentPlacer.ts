/**
 * Deployment placement interaction for the battle scene (Buffy tasks 3-5).
 *
 * During deployment a semi-transparent soldier ghost follows the cursor over
 * the battlefield, and a click inside the player's deployment zone drops a
 * solid marker where the unit will stand. The placer owns the pointer
 * subscription, the ghost visuals, and the placement list; later deployment
 * tasks (grid snap, undo, clear) build on the same handle.
 *
 * The primary button places; the secondary button cancels the preview, which
 * hides the ghost and hands the unit back to the caller (`onCancel`).
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
import type { DeploymentZone } from "./BattleUI.js";

/** Only the battle ground is a valid ghost surface; props and zones are ignored. */
const GROUND_MESH_NAME = "battleGround";
const GHOST_ROOT_NAME = "deployGhost";
/** Same default soldier as `BattleSoldier.create()` — the ghost matches the troops. */
const GHOST_MODEL_FILE = "operator-viper.glb";
/** Ghosts are see-through: solid enough to read, faint enough not to occlude. */
const GHOST_ALPHA = 0.45;
/** Right mouse button — cancels the placement preview (Buffy task 5). */
const SECONDARY_BUTTON = 2;

/** A placed unit's footprint on the battlefield, in world metres. */
export interface DeploymentPlacement {
  x: number;
  z: number;
}

export interface DeploymentPlacerOptions {
  /** Soldier GLB for the ghost; defaults to the BattleSoldier model. */
  modelFile?: string;
  /** Zones placements are validated against — only `player` zones accept units. */
  zones?: DeploymentZone[];
  /** Fired after every successful placement, in order. */
  onPlace?: (placement: DeploymentPlacement) => void;
  /** Fired once when the preview is cancelled, so the caller can return the unit. */
  onCancel?: () => void;
}

/**
 * Pure: is a battlefield point inside a zone? Zones are centred rectangles
 * (the boxes `showDeploymentZone` builds), in world metres.
 */
export function pointInDeploymentZone(
  point: { x: number; z: number },
  zone: DeploymentZone,
): boolean {
  return (
    Math.abs(point.x - zone.x) <= zone.width / 2 &&
    Math.abs(point.z - zone.z) <= zone.depth / 2
  );
}

export class DeploymentPlacer {
  private readonly scene: Scene;
  private readonly modelFile: string;
  private readonly zones: DeploymentZone[];
  private readonly onPlace: ((placement: DeploymentPlacement) => void) | null;
  private readonly onCancel: (() => void) | null;
  private readonly ghostRoot: TransformNode;
  private readonly ghostMaterial: StandardMaterial;
  private readonly proxyMeshes: Mesh[] = [];
  private readonly placements: DeploymentPlacement[] = [];
  private readonly placementMeshes: Mesh[] = [];
  private placementMaterial: StandardMaterial | null = null;
  private placementCounter = 0;
  private observer: Observer<PointerInfo> | null = null;
  private lastPoint: Vector3 | null = null;
  private proxyRetired = false;
  private disposed = false;

  constructor(scene: Scene, options: DeploymentPlacerOptions = {}) {
    this.scene = scene;
    this.modelFile = options.modelFile ?? GHOST_MODEL_FILE;
    this.zones = options.zones ? [...options.zones] : [];
    this.onPlace = options.onPlace ?? null;
    this.onCancel = options.onCancel ?? null;

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
   * Start the preview: show the ghost, follow the cursor, and accept clicks.
   * Idempotent — calling it twice is a no-op, so re-entering deployment never
   * stacks pointer observers.
   */
  start(initialPoint?: Vector3): void {
    if (this.disposed || this.observer) return;
    this.observer = this.scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERMOVE) {
        this.followCursor();
      } else if (info.type === PointerEventTypes.POINTERPICK) {
        this.handlePick(info);
      } else if (info.type === PointerEventTypes.POINTERTAP) {
        this.handleSecondaryTap(info);
      }
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

  /**
   * Cancel the running preview (Buffy task 5): hide the ghost, stop tracking
   * the cursor, and fire `onCancel` so the caller can send the unit back to
   * its roster. Returns false when no preview was running — with the
   * placement list untouched, since cancelling backs out the ghost, not the
   * markers already dropped.
   */
  cancelPreview(): boolean {
    if (this.disposed || !this.observer) return false;
    this.stop();
    this.onCancel?.();
    return true;
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

  /**
   * Place a unit marker at a battlefield point. Only points inside one of the
   * player zones are accepted; an invalid point is returned as `false` with no
   * side effect (the invalid-flash feedback is a later task).
   */
  placeAt(point: Vector3): boolean {
    if (this.disposed) return false;
    const inPlayerZone = this.zones.some(
      (zone) => zone.faction === "player" && pointInDeploymentZone(point, zone),
    );
    if (!inPlayerZone) return false;

    const placement: DeploymentPlacement = { x: point.x, z: point.z };
    this.placements.push(placement);
    this.addPlacementMarker(placement);
    this.onPlace?.(placement);
    return true;
  }

  /** Every placement so far, in order — read by count, undo, and clear. */
  getPlacements(): DeploymentPlacement[] {
    return this.placements.map((p) => ({ ...p }));
  }

  /** A click that is not a camera drag: try to place at the picked ground point. */
  private handlePick(info: PointerInfo): void {
    // Only the primary button places; button 2 is reserved for cancel.
    if (info.event.button > 0) return;
    const point = this.pickGround();
    if (point) this.placeAt(point);
  }

  /**
   * A secondary-button tap cancels the preview (Buffy task 5). Taps arrive
   * whether or not the click landed on a mesh, and Babylon suppresses them
   * after a drag, so panning the camera does not cancel the preview.
   */
  private handleSecondaryTap(info: PointerInfo): void {
    if (info.event.button !== SECONDARY_BUTTON) return;
    this.cancelPreview();
  }

  /** Ground point under the cursor, or null when it is off the battlefield. */
  private pickGround(): Vector3 | null {
    // Predicate-filtered pick: only the ground is a candidate, so props and
    // zone boxes are ignored and the ground still answers under a tree or wall.
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh.name === GROUND_MESH_NAME,
    );
    return pick?.hit && pick.pickedPoint ? pick.pickedPoint : null;
  }

  private followCursor(): void {
    const point = this.pickGround();
    if (point) this.moveGhostTo(point);
    // No ground under the cursor (sky, off-map edge): keep the last valid spot.
  }

  /** A solid standing figure marks each placed unit until units spawn for real. */
  private addPlacementMarker(placement: DeploymentPlacement): void {
    const material = this.ensurePlacementMaterial();
    const n = this.placementCounter++;
    const body = MeshBuilder.CreateCapsule(
      `deployPlaced${n}Body`, { height: 1.55, radius: 0.32 }, this.scene,
    );
    body.position.set(placement.x, 0.78, placement.z);
    body.material = material;
    body.isPickable = false;
    const head = MeshBuilder.CreateSphere(
      `deployPlaced${n}Head`, { diameter: 0.34, segments: 8 }, this.scene,
    );
    head.position.set(placement.x, 1.72, placement.z);
    head.material = material;
    head.isPickable = false;
    this.placementMeshes.push(body, head);
  }

  private ensurePlacementMaterial(): StandardMaterial {
    if (!this.placementMaterial) {
      const material = new StandardMaterial("deployPlacedMat", this.scene);
      material.diffuseColor = new Color3(0.2, 0.85, 0.3);
      material.emissiveColor = new Color3(0.04, 0.16, 0.06);
      this.placementMaterial = material;
    }
    return this.placementMaterial;
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

  /** Remove the ghost, the placed markers, the pointer subscription, and materials. */
  dispose(): void {
    this.disposed = true;
    this.stop();
    for (const mesh of this.proxyMeshes) mesh.dispose(false, false);
    this.proxyMeshes.length = 0;
    if (!this.proxyRetired) this.ghostMaterial.dispose();
    for (const mesh of this.placementMeshes) mesh.dispose(false, false);
    this.placementMeshes.length = 0;
    this.placements.length = 0;
    this.placementMaterial?.dispose();
    this.placementMaterial = null;
    this.ghostRoot.dispose();
  }
}
