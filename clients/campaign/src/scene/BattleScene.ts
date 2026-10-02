/**
 * The battle scene: separate Babylon scene from the campaign map.
 *
 * Loads a biome template, initializes Havok physics for ragdolls and
 * projectiles, and provides the 3D battlefield where combat happens.
 *
 * The scene is created on demand when a battle starts and disposed when
 * the player returns to the campaign map.
 */
import {
  ArcRotateCamera,
  Color3,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { initPhysics, createGroundCollider } from "../physics/ragdoll.js";

export type BiomeType =
  | "plains" | "forest" | "urban" | "snow" | "river"
  | "desert" | "hills" | "swamp" | "coastal" | "industrial";

export interface BattleSceneOptions {
  biome: BiomeType;
  /** Size of the battlefield in meters (square). */
  size?: number;
  /** Enable physics (Havok). Disable for perf testing. */
  physics?: boolean;
}

export class BattleScene {
  readonly scene: Scene;
  readonly biome: BiomeType;
  readonly size: number;
  private physicsEnabled = false;

  private constructor(scene: Scene, biome: BiomeType, size: number) {
    this.scene = scene;
    this.biome = biome;
    this.size = size;
  }

  /**
   * Create and initialize a battle scene.
   * Must be called with a canvas that's already in the DOM.
   */
  static async create(engine: Engine, opts: BattleSceneOptions): Promise<BattleScene> {
    const size = opts.size ?? 400;
    const scene = new Scene(engine);
    // Right-handed for GLB model compatibility (ragdolls require this)
    scene.useRightHandedSystem = true;

    const battle = new BattleScene(scene, opts.biome, size);

    // Camera: start with an overview, battle UI will take control
    const camera = new ArcRotateCamera(
      "battleCam", Math.PI / 4, Math.PI / 3, size * 0.7,
      new Vector3(0, 0, 0), scene
    );
    camera.attachControl(engine.getRenderingCanvas()!, true);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = size;

    // Lighting: bright daylight by default (time-of-day overrides this)
    const sun = new DirectionalLight("sun", new Vector3(-1, -2, -1), scene);
    sun.intensity = 1.2;
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.6;

    // Physics (Havok) — required for ragdolls
    if (opts.physics !== false) {
      await initPhysics(scene);
      battle.physicsEnabled = true;
      // Invisible ground collider 12cm above visual ground
      // (ragdoll boxes are smaller than the visible mesh)
      const groundPhys = createGroundCollider(scene, size, size);
      groundPhys.position.y = 0.12;
    }

    // Load the biome template
    await battle.loadBiome(opts.biome);

    return battle;
  }

  /** Load terrain and props for the given biome. */
  private async loadBiome(biome: BiomeType): Promise<void> {
    const scene = this.scene;
    const size = this.size;

    // Base ground — each biome overrides the material
    const ground = MeshBuilder.CreateGround(
      "battleGround", { width: size, height: size, subdivisions: 32 }, scene
    );
    const mat = new StandardMaterial("groundMat", scene);

    switch (biome) {
      case "plains":
        mat.diffuseColor = new Color3(0.35, 0.55, 0.25);
        break;
      case "forest":
        mat.diffuseColor = new Color3(0.2, 0.4, 0.18);
        this.scatterTrees(60);
        break;
      case "snow":
        mat.diffuseColor = new Color3(0.9, 0.92, 0.95);
        break;
      case "desert":
        mat.diffuseColor = new Color3(0.85, 0.7, 0.45);
        break;
      case "urban":
        mat.diffuseColor = new Color3(0.4, 0.4, 0.42);
        this.buildCityBlocks();
        break;
      case "river":
        mat.diffuseColor = new Color3(0.35, 0.5, 0.25);
        this.buildRiver();
        break;
      case "hills":
        mat.diffuseColor = new Color3(0.4, 0.5, 0.3);
        this.buildHills();
        break;
      case "swamp":
        mat.diffuseColor = new Color3(0.25, 0.35, 0.2);
        this.buildSwamp();
        break;
      case "coastal":
        mat.diffuseColor = new Color3(0.7, 0.65, 0.5);
        this.buildCoast();
        break;
      case "industrial":
        mat.diffuseColor = new Color3(0.45, 0.45, 0.47);
        this.buildIndustrial();
        break;
      default:
        // plains fallback for unimplemented biomes
        mat.diffuseColor = new Color3(0.35, 0.55, 0.25);
        break;
    }

    ground.material = mat;
    ground.receiveShadows = true;
  }

  /** Scatter instanced trees for forest biome. */
  private scatterTrees(count: number): void {
    const scene = this.scene;
    const size = this.size;
    const trunkMat = new StandardMaterial("trunkMat", scene);
    trunkMat.diffuseColor = new Color3(0.35, 0.25, 0.15);
    const leafMat = new StandardMaterial("leafMat", scene);
    leafMat.diffuseColor = new Color3(0.15, 0.35, 0.15);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * size * 0.9;
      const z = (Math.random() - 0.5) * size * 0.9;
      const trunk = MeshBuilder.CreateCylinder(
        `tree${i}trunk`, { height: 3, diameterTop: 0.4, diameterBottom: 0.6 }, scene
      );
      trunk.position.set(x, 1.5, z);
      trunk.material = trunkMat;
      const leaves = MeshBuilder.CreateSphere(
        `tree${i}leaves`, { diameter: 4 }, scene
      );
      leaves.position.set(x, 4.5, z);
      leaves.material = leafMat;
    }
  }

  /** Simple city blocks for urban biome. */
  private buildCityBlocks(): void {
    const scene = this.scene;
    const size = this.size;
    const blockMat = new StandardMaterial("blockMat", scene);
    blockMat.diffuseColor = new Color3(0.5, 0.5, 0.52);

    const grid = 4;
    const blockSize = size / (grid * 2);
    for (let gx = 0; gx < grid; gx++) {
      for (let gz = 0; gz < grid; gz++) {
        if (Math.random() < 0.3) continue; // some empty lots
        const h = 8 + Math.random() * 20;
        const b = MeshBuilder.CreateBox(`block${gx}_${gz}`, {
          width: blockSize * 0.7, height: h, depth: blockSize * 0.7,
        }, scene);
        b.position.set(
          (gx - grid / 2 + 0.5) * blockSize * 2,
          h / 2,
          (gz - grid / 2 + 0.5) * blockSize * 2
        );
        b.material = blockMat;
      }
    }
  }

  /** Whether Havok physics is active in this scene. */
  get hasPhysics(): boolean {
    return this.physicsEnabled;
  }

  /** River crossing: water strip through middle with 2 bridges. */
  private buildRiver(): void {
    const scene = this.scene;
    const size = this.size;
    const waterMat = new StandardMaterial("waterMat", scene);
    waterMat.diffuseColor = new Color3(0.2, 0.4, 0.6);
    waterMat.alpha = 0.8;

    // River strip (20m wide)
    const river = MeshBuilder.CreateBox("river", {
      width: 20, height: 0.5, depth: size,
    }, scene);
    river.position.set(0, -0.25, 0);
    river.material = waterMat;

    // 2 bridges
    const bridgeMat = new StandardMaterial("bridgeMat", scene);
    bridgeMat.diffuseColor = new Color3(0.5, 0.4, 0.3);
    for (const z of [-size * 0.25, size * 0.25]) {
      const bridge = MeshBuilder.CreateBox(`bridge${z}`, {
        width: 30, height: 0.3, depth: 8,
      }, scene);
      bridge.position.set(0, 0.15, z);
      bridge.material = bridgeMat;
    }
  }

  /** Hills: elevated terrain bumps for high ground. */
  private buildHills(): void {
    const scene = this.scene;
    const size = this.size;
    const hillMat = new StandardMaterial("hillMat", scene);
    hillMat.diffuseColor = new Color3(0.35, 0.45, 0.25);

    for (let i = 0; i < 8; i++) {
      const h = 5 + Math.random() * 10;
      const hill = MeshBuilder.CreateSphere(`hill${i}`, {
        diameter: 30 + Math.random() * 40,
      }, scene);
      hill.position.set(
        (Math.random() - 0.5) * size * 0.8,
        -h * 0.3,
        (Math.random() - 0.5) * size * 0.8
      );
      hill.scaling.y = 0.4;
      hill.material = hillMat;
    }
  }

  /** Swamp: water patches that slow movement. */
  private buildSwamp(): void {
    const scene = this.scene;
    const size = this.size;
    const waterMat = new StandardMaterial("swampWaterMat", scene);
    waterMat.diffuseColor = new Color3(0.2, 0.3, 0.2);
    waterMat.alpha = 0.7;

    for (let i = 0; i < 12; i++) {
      const r = 8 + Math.random() * 15;
      const patch = MeshBuilder.CreateCylinder(`swamp${i}`, {
        height: 0.2, diameter: r * 2,
      }, scene);
      patch.position.set(
        (Math.random() - 0.5) * size * 0.8,
        0.1,
        (Math.random() - 0.5) * size * 0.8
      );
      patch.material = waterMat;
    }
    this.scatterTrees(20); // sparse trees
  }

  /** Coastal: beach + water plane on one edge. */
  private buildCoast(): void {
    const scene = this.scene;
    const size = this.size;
    const waterMat = new StandardMaterial("coastWaterMat", scene);
    waterMat.diffuseColor = new Color3(0.15, 0.35, 0.55);
    waterMat.alpha = 0.85;

    // Water on the +X edge (25% of map)
    const water = MeshBuilder.CreateBox("coastWater", {
      width: size * 0.25, height: 0.5, depth: size,
    }, scene);
    water.position.set(size * 0.375, -0.25, 0);
    water.material = waterMat;

    // Sand strip
    const sandMat = new StandardMaterial("sandMat", scene);
    sandMat.diffuseColor = new Color3(0.85, 0.78, 0.6);
    const sand = MeshBuilder.CreateBox("sand", {
      width: size * 0.15, height: 0.2, depth: size,
    }, scene);
    sand.position.set(size * 0.175, 0.1, 0);
    sand.material = sandMat;
  }

  /** Industrial: warehouses, fences, containers. */
  private buildIndustrial(): void {
    const scene = this.scene;
    const size = this.size;
    const wallMat = new StandardMaterial("warehouseMat", scene);
    wallMat.diffuseColor = new Color3(0.6, 0.6, 0.62);
    const contMat = new StandardMaterial("containerMat", scene);
    contMat.diffuseColor = new Color3(0.7, 0.3, 0.2);

    // Warehouses
    for (let i = 0; i < 4; i++) {
      const w = 20 + Math.random() * 15;
      const h = 8 + Math.random() * 6;
      const d = 15 + Math.random() * 10;
      const wh = MeshBuilder.CreateBox(`warehouse${i}`, {
        width: w, height: h, depth: d,
      }, scene);
      wh.position.set(
        (Math.random() - 0.5) * size * 0.7,
        h / 2,
        (Math.random() - 0.5) * size * 0.7
      );
      wh.material = wallMat;
    }

    // Shipping containers
    for (let i = 0; i < 10; i++) {
      const c = MeshBuilder.CreateBox(`container${i}`, {
        width: 6, height: 2.5, depth: 2.5,
      }, scene);
      c.position.set(
        (Math.random() - 0.5) * size * 0.8,
        1.25,
        (Math.random() - 0.5) * size * 0.8
      );
      c.rotation.y = Math.random() * Math.PI;
      c.material = contMat;
    }
  }

  /**
   * End the battle: dispose all soldiers (and their ragdolls),
   * then dispose the scene itself.
   */
  endBattle(soldiers: { dispose(): void }[]): void {
    for (const s of soldiers) {
      try { s.dispose(); } catch { /* best-effort cleanup */ }
    }
    this.dispose();
  }

  /**
   * Battle camera controls (Pax task 61).
   * Toggle between follow-player and free-look modes.
   */
  setCameraMode(mode: "follow" | "free"): void {
    // Camera mode switching is handled by the battle UI layer
    // which owns the ArcRotateCamera created in create()
    this.scene.metadata = this.scene.metadata || {};
    this.scene.metadata.cameraMode = mode;
  }

  /**
   * Get the battle camera for external control.
   */
  getCamera(): ArcRotateCamera | null {
    const cam = this.scene.getCameraByName("battleCam");
    return cam as ArcRotateCamera | null;
  }

  /** Dispose the scene and free resources. */
  dispose(): void {
    this.scene.dispose();
  }
}
