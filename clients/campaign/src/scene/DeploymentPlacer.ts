/**
 * Deployment placement interaction for the battle scene
 * (Buffy tasks 3-5, 10, 18-20).
 *
 * During deployment a semi-transparent soldier ghost follows the cursor over
 * the battlefield, and a click inside the player's deployment zone drops a
 * solid marker where the unit will stand. The placer owns the pointer
 * subscription, the ghost visuals, and the placement list.
 *
 * The primary button places; the secondary button cancels the preview, which
 * hides the ghost and hands the unit back to the caller (`onCancel`). A click
 * that lands outside the zone flashes the ghost red for a moment instead of
 * dropping a marker. Grid snap (`setGridSnap`) puts the ghost and every marker
 * on a 2 m grid so a deployment comes out in tidy ranks, Ctrl+Z / Cmd+Z
 * (`undoLastPlacement`) walks placements back one at a time, and
 * `clearPlacements` empties the deployment for a fresh start.
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
  type Material,
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
/** How long the ghost stays red after a click outside the zone (Buffy task 10). */
const INVALID_FLASH_MS = 300;
/** Warning red, against the ghost's normal green. */
const INVALID_FLASH_COLOR = new Color3(0.95, 0.15, 0.12);
/**
 * Grid-snap step in metres (Buffy task 18). 2 m is about one infantry
 * shoulder-to-shoulder slot, so a snapped deployment lines ranks up without
 * crowding them — a 1 m grid packs tighter than troops can actually stand,
 * and a 4 m grid spreads a squad across too much depth.
 */
const GRID_STEP_M = 2;

/** A ghost material and the emissive colour it wore before the flash. */
interface SavedEmissive {
  material: Material;
  emissive: Color3;
}

/**
 * The emissive colour of a ghost material, or null when it has none. The
 * proxy ghost is a StandardMaterial and a loaded soldier GLB brings its own
 * PBR materials, so the flash reads the colour off the base Material type.
 */
function emissiveOf(material: Material): Color3 | null {
  const emissive = (material as { emissiveColor?: Color3 }).emissiveColor;
  return emissive instanceof Color3 ? emissive : null;
}

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
  /** Start with grid snap on; otherwise placements follow the cursor exactly. */
  gridSnap?: boolean;
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

/**
 * Pure: snap a battlefield point to the deployment grid (Buffy task 18).
 * Rounds to the nearest multiple of `step`, so the grid is anchored on the
 * world origin and covers negative coordinates the same way as positive ones.
 */
export function snapToGrid(
  point: { x: number; z: number },
  step: number,
): { x: number; z: number } {
  return {
    x: Math.round(point.x / step) * step,
    z: Math.round(point.z / step) * step,
  };
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
  /** Marker meshes per placement, so the newest one can be undone alone. */
  private readonly placementGroups: Mesh[][] = [];
  private placementMaterial: StandardMaterial | null = null;
  private placementCounter = 0;
  private observer: Observer<PointerInfo> | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private lastPoint: Vector3 | null = null;
  private proxyRetired = false;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly savedEmissive: SavedEmissive[] = [];
  private gridSnap: boolean;
  private disposed = false;

  constructor(scene: Scene, options: DeploymentPlacerOptions = {}) {
    this.scene = scene;
    this.modelFile = options.modelFile ?? GHOST_MODEL_FILE;
    this.zones = options.zones ? [...options.zones] : [];
    this.onPlace = options.onPlace ?? null;
    this.onCancel = options.onCancel ?? null;
    this.gridSnap = options.gridSnap ?? false;

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
    this.listenForUndo();
    this.ghostRoot.setEnabled(true);
    this.moveGhostTo(initialPoint ?? this.lastPoint ?? Vector3.Zero());
  }

  /** Stop following the cursor and hide the ghost. Idempotent. */
  stop(): void {
    this.endFlash();
    this.stopListeningForUndo();
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

  /**
   * Undo the newest placement (Buffy task 19): its marker meshes are disposed
   * and the placement is popped. Returns false when there is nothing to undo.
   * Callers that keep their own roster can diff `getPlacements()` to see which
   * unit went back.
   */
  undoLastPlacement(): boolean {
    if (this.disposed) return false;
    const group = this.placementGroups.pop();
    if (!group) return false;
    this.placements.pop();
    this.disposeMarkers([group]);
    return true;
  }

  /**
   * Clear every placement (Buffy task 20): all marker meshes go and the list
   * empties, leaving the preview running so the player can place again
   * straight away. Returns how many placements were removed, 0 when there was
   * nothing to clear. The clear-all button is `BattleUI`'s — this is the
   * scene-side action it calls.
   */
  clearPlacements(): number {
    if (this.disposed) return 0;
    const cleared = this.placements.length;
    this.clearMarkers();
    return cleared;
  }

  /** Drop every marker mesh and the placement list. */
  private clearMarkers(): void {
    this.disposeMarkers(this.placementGroups);
    this.placementGroups.length = 0;
    this.placements.length = 0;
  }

  /**
   * Take the undo shortcut while deployment is live. The window is the target
   * because the canvas only holds focus sometimes; a headless engine has no
   * window, and there the shortcut is simply absent.
   */
  private listenForUndo(): void {
    if (this.keyHandler || typeof window === "undefined") return;
    this.keyHandler = (event: KeyboardEvent) => this.handleKey(event);
    window.addEventListener("keydown", this.keyHandler);
  }

  private stopListeningForUndo(): void {
    if (!this.keyHandler) return;
    window.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = null;
  }

  /**
   * Ctrl+Z / Cmd+Z undoes the last placement (Buffy task 19). Shift is left
   * alone — Ctrl+Shift+Z is redo elsewhere and must not silently undo here.
   */
  private handleKey(event: KeyboardEvent): void {
    if (event.shiftKey) return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    this.undoLastPlacement();
  }

  /** Stand the ghost at a battlefield point (y is always ground level). */
  moveGhostTo(point: Vector3): void {
    const at = this.resolvePoint(point);
    this.lastPoint = at;
    this.ghostRoot.position.copyFrom(at);
  }

  /**
   * Turn grid snap on or off (Buffy task 18). With it on, the ghost and every
   * marker land on the 2 m deployment grid; with it off, placements follow the
   * cursor exactly. Enabling snaps the ghost where it currently stands, so the
   * preview never shows a spot the unit cannot actually take.
   */
  setGridSnap(enabled: boolean): void {
    if (this.gridSnap === enabled) return;
    this.gridSnap = enabled;
    if (enabled && this.lastPoint) this.moveGhostTo(this.lastPoint);
  }

  /** Whether placements are snapped to the deployment grid. */
  getGridSnap(): boolean {
    return this.gridSnap;
  }

  /**
   * Where a placement actually lands: the pick point, snapped to the grid when
   * snapping is on. Zone validation runs on this, so a unit is never accepted
   * or rejected based on where the cursor was rather than where it will stand.
   */
  private resolvePoint(point: Vector3): Vector3 {
    const ground = new Vector3(point.x, 0, point.z);
    if (!this.gridSnap) return ground;
    const snapped = snapToGrid(ground, GRID_STEP_M);
    return new Vector3(snapped.x, 0, snapped.z);
  }

  /** Where the ghost is standing, or null before the first move. */
  getPreviewPoint(): Vector3 | null {
    return this.lastPoint ? this.lastPoint.clone() : null;
  }

  /**
   * Place a unit marker at a battlefield point. Only points inside one of the
   * player zones are accepted; an invalid point is returned as `false` with no
   * marker added, and the ghost flashes red to say so (Buffy task 10).
   */
  placeAt(point: Vector3): boolean {
    if (this.disposed) return false;
    const at = this.resolvePoint(point);
    const inPlayerZone = this.zones.some(
      (zone) => zone.faction === "player" && pointInDeploymentZone(at, zone),
    );
    if (!inPlayerZone) {
      this.flashInvalid();
      return false;
    }

    const placement: DeploymentPlacement = { x: at.x, z: at.z };
    this.placements.push(placement);
    this.addPlacementMarker(placement);
    this.onPlace?.(placement);
    return true;
  }

  /** Every placement so far, in order — read by count, undo, and clear. */
  getPlacements(): DeploymentPlacement[] {
    return this.placements.map((p) => ({ ...p }));
  }

  /**
   * Flash the ghost red (Buffy task 10) — the feedback for a click outside the
   * player's deployment zone. Every material on the ghost is flashed and each
   * one's previous emissive colour is restored afterwards, so both the
   * primitive proxy and a loaded GLB clone return to exactly what they showed.
   */
  flashInvalid(): void {
    if (this.disposed) return;
    this.endFlash(); // a second invalid click restarts the window
    const seen = new Set<Material>();
    for (const node of this.ghostRoot.getChildMeshes(false)) {
      const material = node.material;
      if (!material || seen.has(material)) continue;
      seen.add(material);
      const emissive = emissiveOf(material);
      if (!emissive) continue;
      this.savedEmissive.push({ material, emissive: emissive.clone() });
      emissive.copyFrom(INVALID_FLASH_COLOR);
    }
    this.flashTimer = setTimeout(() => this.endFlash(), INVALID_FLASH_MS);
  }

  /**
   * End the red flash: drop the pending timer and put the saved emissive
   * colours back. Runs when the flash elapses and from `stop()`/`dispose()`,
   * so neither a red ghost nor a live timer outlives the preview.
   */
  private endFlash(): void {
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    for (const saved of this.savedEmissive) {
      const emissive = emissiveOf(saved.material);
      if (emissive) emissive.copyFrom(saved.emissive);
    }
    this.savedEmissive.length = 0;
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
    this.placementGroups.push([body, head]);
  }

  /** Free marker meshes, leaving the shared placement material in place. */
  private disposeMarkers(groups: Mesh[][]): void {
    for (const group of groups) {
      for (const mesh of group) mesh.dispose(false, false);
    }
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

  /**
   * Remove the ghost, the placed markers, the pointer subscription, and materials.
   */
  dispose(): void {
    this.disposed = true;
    this.stop();
    for (const mesh of this.proxyMeshes) mesh.dispose(false, false);
    this.proxyMeshes.length = 0;
    if (!this.proxyRetired) this.ghostMaterial.dispose();
    this.clearMarkers();
    this.placementMaterial?.dispose();
    this.placementMaterial = null;
    this.ghostRoot.dispose();
  }
}
