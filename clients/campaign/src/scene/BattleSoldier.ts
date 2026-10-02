/**
 * A soldier entity in the battle scene.
 *
 * Loads the operator GLB, plays animations while alive, and triggers
 * the ragdoll physics on death.
 */
import {
  Scene,
  TransformNode,
  Vector3,
  AbstractMesh,
  Skeleton,
  SceneLoader,
} from "@babylonjs/core";
import "@babylonjs/loaders";
import { createRagdoll, type RagdollHandle } from "../physics/ragdoll.js";

export interface SoldierOptions {
  /** Which operator model to use. */
  model?: string;
  /** Starting health. */
  health?: number;
  /** Position on the battlefield. */
  position?: Vector3;
}

export class BattleSoldier {
  readonly root: TransformNode;
  readonly scene: Scene;
  private skeleton: Skeleton | null = null;
  private meshes: AbstractMesh[] = [];
  private ragdoll: RagdollHandle | null = null;
  private _health: number;
  private _alive = true;

  private constructor(scene: Scene, root: TransformNode, health: number) {
    this.scene = scene;
    this.root = root;
    this._health = health;
  }

  /**
   * Load a soldier model and create the entity.
   * The model is expected to be a GLB with a skeleton.
   */
  static async create(scene: Scene, opts: SoldierOptions = {}): Promise<BattleSoldier> {
    const model = opts.model ?? "operator-viper.glb";
    const health = opts.health ?? 100;

    const root = new TransformNode("soldierRoot", scene);
    if (opts.position) root.position.copyFrom(opts.position);

    const soldier = new BattleSoldier(scene, root, health);

    // Load the GLB
    const result = await SceneLoader.ImportMeshAsync(
      "", "/models/", model, scene
    );

    // Parent all meshes to our root
    for (const mesh of result.meshes) {
      if (mesh !== result.meshes[0]) { // skip the auto-created root
        mesh.parent = root;
        soldier.meshes.push(mesh as AbstractMesh);
      }
    }

    // Find the skeleton
    if (result.skeletons.length > 0) {
      soldier.skeleton = result.skeletons[0] ?? null;
    }

    return soldier;
  }

  get health(): number { return this._health; }
  get alive(): boolean { return this._alive; }

  /**
   * Deal damage to the soldier. Triggers death (and ragdoll) at 0 HP.
   * @param amount Damage amount
   * @param direction Optional direction of the killing blow (for impulse)
   */
  damage(amount: number, direction?: Vector3): void {
    if (!this._alive) return;
    this._health -= amount;
    if (this._health <= 0) {
      this._health = 0;
      this.die(direction);
    }
  }

  /**
   * Kill the soldier and trigger the ragdoll.
   */
  private die(direction?: Vector3): void {
    if (!this._alive) return;
    this._alive = false;

    if (this.skeleton) {
      // Create and trigger the ragdoll
      this.ragdoll = createRagdoll(this.scene, this.skeleton, this.root);

      // Apply impulse in the damage direction (or random if none)
      const impulse = direction
        ? direction.normalize().scale(15)
        : new Vector3(
            (Math.random() - 0.5) * 10,
            5,
            (Math.random() - 0.5) * 10
          );

      this.ragdoll.trigger(impulse);
    }
  }

  /** Clean up the soldier (meshes, skeleton, ragdoll). */
  dispose(): void {
    this.ragdoll?.dispose();
    for (const mesh of this.meshes) mesh.dispose();
    this.skeleton?.dispose();
    this.root.dispose();
  }
}
