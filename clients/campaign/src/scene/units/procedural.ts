/**
 * The procedural unit: the placeholder every vendored GLB eventually replaces.
 *
 * This is a clean-room reimplementation of what `CampaignScene.ts` builds inline for
 * the party marker today — flat-shaded primitives, a team-colour body, a mast and a
 * pennant so a moving thing reads as a moving thing (`ART_DIRECTION.md` section 6.5).
 * It exists so the scene has a factory to call before any asset has been vendored, and
 * so that when a GLB does arrive the swap is one constructor argument rather than a
 * scene rewrite.
 *
 * Nothing is invented here. Colours are token references only, per `CONSTITUTION.md`
 * section 3.4; the shapes are the smallest set of primitives that distinguish the four
 * kinds at map scale; and the silhouette spec is a pure function of the kind, which is
 * what makes it testable without a GPU.
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  VertexBuffer,
} from "@babylonjs/core";
import {
  isHexColour,
  normalizeAppearance,
  type UnitAppearance,
  type UnitFactory,
  type UnitKind,
  type UnitNodeMetadata,
  type UnitPalette,
  type UnitPaletteSlot,
} from "./types.js";
import { ink } from "../../design/tokens.js";

/** What an unusable palette slot falls back to. Ink-500, not a new grey. */
const NEUTRAL_GREY = ink[500];

/**
 * One primitive in a unit.
 *
 * `size` is metres and means different things per shape, which is stated per shape
 * rather than left to be guessed at: boxes are (width, height, depth), capsules and
 * cylinders are (diameter, height, diameter), planes are (width, height, 0).
 */
export interface UnitPart {
  readonly name: string;
  readonly shape: "capsule" | "box" | "cylinder" | "plane";
  readonly size: readonly [number, number, number];
  /** Centre of the part, metres from the unit's feet. */
  readonly offset: readonly [number, number, number];
  /** Euler radians. Only the mount's horizontal capsule and the wheels need it. */
  readonly rotation?: readonly [number, number, number];
  /** Flat polygons, low tessellation. The art style is stylized low-poly. */
  readonly tessellation?: number;
  /** Billboard about Y, so a pennant never turns edge-on to the camera. */
  readonly billboardY?: boolean;
  readonly slot: UnitPaletteSlot;
}

/** Everything needed to build a unit, as data. No Scene, no engine, no GPU. */
export interface UnitSilhouette {
  readonly kind: UnitKind;
  readonly parts: readonly UnitPart[];
  /** Top of the tallest part, metres. Used to place a unit on the ground. */
  readonly height: number;
  /** True when the unit carries a mast and a pennant. */
  readonly banner: boolean;
}

const HALF_PI = Math.PI / 2;

/**
 * The four silhouettes.
 *
 * Read as silhouettes first and as models second: `ART_DIRECTION.md` section 7 makes
 * that the rule for town markers and it is the same rule at unit scale. A foot patrol
 * is a thin upright with a mast, a horse is a long low body with a rider, a vehicle is
 * a box on wheels with the tallest mast on the map, and a civilian is a smaller
 * upright with a survey stake. The player finds their own units by shape, not by
 * colour, which is also what the status-glyph rule asks for at every other scale.
 */
export function unitSilhouette(kind: UnitKind): UnitSilhouette {
  return SILHOUETTES[kind];
}

/** The party mast. Tall enough to be found at a working zoom, short enough not to lie. */
const MAST_DIAMETER = 0.08;

function mast(height: number, slot: UnitPaletteSlot = "secondary"): UnitPart {
  return {
    name: "mast",
    shape: "cylinder",
    size: [MAST_DIAMETER, height, MAST_DIAMETER],
    offset: [0, height / 2, 0],
    tessellation: 6,
    slot,
  };
}

function pennant(width: number, height: number, y: number): UnitPart {
  return {
    name: "pennant",
    shape: "plane",
    size: [width, height, 0],
    offset: [width / 2 + MAST_DIAMETER, y, 0],
    billboardY: true,
    slot: "accent",
  };
}

const SILHOUETTES: Record<UnitKind, UnitSilhouette> = {
  /**
   * A foot patrol: legs, a webbing block, a torso, a head, and the party mast.
   * 1.8 m to the top of the head, which is the height the rest of the map assumes.
   */
  infantry: {
    kind: "infantry",
    height: 6.2,
    banner: true,
    parts: [
      { name: "legs", shape: "box", size: [0.46, 0.86, 0.32], offset: [0, 0.43, 0], slot: "secondary" },
      { name: "webbing", shape: "box", size: [0.4, 0.34, 0.2], offset: [0, 1.18, 0.22], slot: "secondary" },
      { name: "torso", shape: "capsule", size: [0.52, 0.74, 0.52], offset: [0, 1.2, 0], tessellation: 8, slot: "primary" },
      { name: "head", shape: "capsule", size: [0.24, 0.26, 0.24], offset: [0, 1.68, 0], tessellation: 6, slot: "secondary" },
      mast(5.6),
      pennant(1.7, 0.9, 5.3),
    ],
  },

  /**
   * A mounted unit. In this setting that reads as a horse rather than a war elephant:
   * the roster in `agents/asset-packs/characters.md` is modern American, and a long
   * low body with a rider above it is the shape the player already knows.
   */
  cavalry: {
    kind: "cavalry",
    height: 7.1,
    banner: true,
    parts: [
      // The body lies along Z, so the capsule is laid down rather than stood up.
      { name: "mount", shape: "capsule", size: [0.92, 2.4, 0.92], offset: [0, 1.15, 0], rotation: [HALF_PI, 0, 0], tessellation: 8, slot: "primary" },
      { name: "neck", shape: "capsule", size: [0.42, 1.1, 0.42], offset: [0, 1.72, -1.32], rotation: [HALF_PI * 0.62, 0, 0], tessellation: 6, slot: "primary" },
      { name: "rider", shape: "capsule", size: [0.5, 0.72, 0.5], offset: [0, 2.14, 0], tessellation: 8, slot: "primary" },
      { name: "rider-head", shape: "capsule", size: [0.24, 0.26, 0.24], offset: [0, 2.62, 0], tessellation: 6, slot: "secondary" },
      ...([[-0.34, -0.78], [0.34, -0.78], [-0.34, 0.78], [0.34, 0.78]] as const).map(
        ([x, z], i): UnitPart => ({
          name: `leg-${i}`,
          shape: "box",
          size: [0.18, 1.12, 0.18],
          offset: [x, 0.56, z],
          slot: "secondary",
        }),
      ),
      mast(6.6),
      pennant(2.0, 1.05, 6.3),
    ],
  },

  /**
   * A vehicle. The tallest mast on the map, because it is the unit the player most
   * often has to find: it is the shape a party marker already is in
   * `CampaignScene.ts`, at the same 12 m, with the pennant proportion to match.
   */
  vehicle: {
    kind: "vehicle",
    height: 12.2,
    banner: true,
    parts: [
      { name: "chassis", shape: "box", size: [2.4, 1.0, 6.2], offset: [0, 1.0, 0], slot: "primary" },
      { name: "cab", shape: "box", size: [2.2, 0.95, 2.0], offset: [0, 2.0, 0.6], slot: "primary" },
      { name: "stripe", shape: "box", size: [2.46, 0.26, 1.7], offset: [0, 1.36, -0.4], slot: "accent" },
      { name: "bumper", shape: "box", size: [2.5, 0.22, 0.24], offset: [0, 0.62, 3.2], slot: "metal" },
      ...([[-1.16, -2.0], [1.16, -2.0], [-1.16, 2.0], [1.16, 2.0]] as const).map(
        ([x, z], i): UnitPart => ({
          name: `wheel-${i}`,
          shape: "cylinder",
          size: [1.0, 0.34, 1.0],
          offset: [x, 0.5, z],
          // Wheels are cylinders about Y; a quarter turn lays them across the axle.
          rotation: [0, 0, HALF_PI],
          tessellation: 8,
          slot: "metal",
        }),
      ),
      mast(12, "secondary"),
      pennant(2.6, 1.5, 11.5),
    ],
  },

  /**
   * A civilian: the same upright as a foot patrol, smaller and unstamped, with a
   * survey stake instead of a war pennant. `agents/asset-packs/characters.md` puts
   * modern civilians on the Quaternius modular packs, and the direction's own framing
   * is a mid-century field survey — so the marker on a civilian is a surveyor's.
   */
  civilian: {
    kind: "civilian",
    height: 3.7,
    banner: true,
    parts: [
      { name: "legs", shape: "box", size: [0.4, 0.82, 0.3], offset: [0, 0.41, 0], slot: "secondary" },
      { name: "torso", shape: "capsule", size: [0.46, 0.68, 0.46], offset: [0, 1.14, 0], tessellation: 8, slot: "primary" },
      { name: "head", shape: "capsule", size: [0.23, 0.25, 0.23], offset: [0, 1.58, 0], tessellation: 6, slot: "secondary" },
      mast(3.2),
      pennant(0.9, 0.5, 2.95),
    ],
  },
};

export interface ProceduralUnitFactoryOptions {
  /**
   * Where the units go. Required, because the interface takes an appearance and
   * nothing else: the factory owns its scene, and the scene owns the factory.
   */
  readonly scene: Scene;
  /**
   * Report every field repaired in an incoming appearance. Full detail for
   * developers, per `CONSTITUTION.md` section 1.3.
   */
  readonly onIssue?: Parameters<typeof normalizeAppearance>[2];
  /** Node name prefix. Distinguishes units from towns and the party marker in a scene dump. */
  readonly namePrefix?: string;
}

/**
 * Builds units out of primitives, from the locked tokens, with no network and no
 * assets. Also the fallback every other factory degrades to.
 */
export class ProceduralUnitFactory implements UnitFactory {
  readonly #scene: Scene;
  readonly #onIssue: ProceduralUnitFactoryOptions["onIssue"];
  readonly #namePrefix: string;
  /**
   * One material for every unit, white with vertex colours on top.
   *
   * `SPEC.md` section 5.1 wants 300 units at 60 fps, and a crowd of individually
   * materialled meshes is a draw call and a shader binding each. Vertex colours carry
   * the palette instead, which is also the technique `agents/asset-packs/characters.md`
   * recommends for the Quaternius rigs: they ship with no textures at all.
   */
  readonly #material: StandardMaterial;
  #serial = 0;

  constructor(options: ProceduralUnitFactoryOptions) {
    this.#scene = options.scene;
    this.#onIssue = options.onIssue;
    this.#namePrefix = options.namePrefix ?? "unit";

    const material = new StandardMaterial("unit-shared-mat", this.#scene);
    material.diffuseColor = new Color3(1, 1, 1);
    // Same reasoning as the road ribbon in `network.ts`: a specular highlight on a
    // 12 m mast at 30 km is nothing, and a dull specular on a helmet is a lie.
    material.specularColor = new Color3(0, 0, 0);
    // A winding mistake in a hand-placed primitive silently deletes it rather than
    // showing inside-out, and a half-drawn unit is much harder to notice than a
    // slightly wrong one.
    material.backFaceCulling = false;
    this.#material = material;
  }

  /** The shared material, so a caller can fold units into another draw group. */
  get material(): StandardMaterial {
    return this.#material;
  }

  async create(appearance: UnitAppearance): Promise<TransformNode> {
    const { appearance: safe } = normalizeAppearance(appearance, "civilian", this.#onIssue);
    const silhouette = SILHOUETTES[safe.kind];
    const name = `${this.#namePrefix}-${safe.kind}-${this.#serial}`;
    this.#serial += 1;

    const root = new TransformNode(name, this.#scene);
    for (const part of silhouette.parts) {
      const mesh = this.#buildPart(part, name, safe.palette);
      mesh.parent = root;
    }
    // Scale on the root, so a caller can also scale it later without rebuilding.
    root.scaling.setAll(safe.scale);
    root.metadata = metadataFor(safe, "procedural", null);
    return root;
  }

  /** Disposes the shared material. Every unit's geometry belongs to the Scene. */
  dispose(): void {
    this.#material.dispose();
  }

  #buildPart(part: UnitPart, unitName: string, palette: UnitPalette): Mesh {
    const meshName = `${unitName}-${part.name}`;
    const [w, h, d] = part.size;
    const [x, y, z] = part.offset;

    const mesh =
      part.shape === "box"
        ? MeshBuilder.CreateBox(meshName, { width: w, height: h, depth: d }, this.#scene)
        : part.shape === "capsule"
          ? MeshBuilder.CreateCapsule(
              meshName,
              { height: h, radius: w / 2, tessellation: part.tessellation ?? 8, capSubdivisions: 1, subdivisions: 1 },
              this.#scene,
            )
          : part.shape === "cylinder"
            ? MeshBuilder.CreateCylinder(
                meshName,
                { height: h, diameter: w, diameterTop: w, tessellation: part.tessellation ?? 8 },
                this.#scene,
              )
            : MeshBuilder.CreatePlane(meshName, { width: w, height: h }, this.#scene);

    mesh.position.set(x, y, z);
    if (part.rotation) mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    if (part.billboardY) mesh.billboardMode = Mesh.BILLBOARDMODE_Y;
    // Units are scenery on a campaign map. A click that lands on one should find the
    // town under it, and the same rule `CampaignScene.ts` applies to roads and rails.
    mesh.isPickable = false;
    mesh.material = this.#material;

    // Hard normals, per `ART_DIRECTION.md` section 8. Applied before the colours,
    // because flat-shading unshares vertices and any colour written first is
    // interpolated away on the new seams.
    mesh.convertToFlatShadedMesh();
    paintMesh(mesh, part.slot, palette);
    return mesh;
  }
}

/**
 * Stamp a palette colour onto every vertex of a mesh.
 *
 * Written as vertex colours rather than as four shared materials because the palette
 * is per unit: two adjacent parties on the same road must not share a material if
 * they are not the same colour.
 */
export function paintMesh(mesh: Mesh, slot: UnitPaletteSlot, palette: UnitPalette): void {
  const colour = slotColour(slot, palette);
  mesh.setVerticesData(VertexBuffer.ColorKind, vertexColours(mesh, colour), false, 4);
  mesh.useVertexColors = true;
}

/** The metadata both factories write, so the scene cannot tell them apart. */
export function metadataFor(
  appearance: UnitAppearance,
  source: UnitNodeMetadata["source"],
  url: string | null,
): UnitNodeMetadata {
  return { unitKind: appearance.kind, source, appearance, url };
}

/**
 * Resolve one palette slot to a Babylon colour.
 *
 * The grey fallback is unreachable for an appearance that has been through
 * `normalizeAppearance`, which is what the factories do. It exists because the two
 * public helpers below are also for callers holding an appearance they built
 * themselves, and a `FromHexString` on a malformed string throws a message with a
 * Babylon stack in it, which is not a useful thing to hand a caller.
 */
export function slotColour(slot: UnitPaletteSlot, palette: UnitPalette): Color3 {
  const hex = palette[slot];
  return Color3.FromHexString(isHexColour(hex) ? hex : NEUTRAL_GREY);
}

/** Every vertex of a mesh, as a flat RGBA array the right length to write back. */
export function vertexColours(mesh: Mesh, colour: Color3): Float32Array {
  const count = mesh.getTotalVertices();
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    out[i * 4] = colour.r;
    out[i * 4 + 1] = colour.g;
    out[i * 4 + 2] = colour.b;
    out[i * 4 + 3] = 1;
  }
  return out;
}

/** Exported for the test: the colour actually written onto a mesh's vertex buffer. */
export function meshVertexColor(mesh: Mesh): readonly number[] {
  const data = mesh.getVerticesData(VertexBuffer.ColorKind);
  if (!data) return [];
  return [data[0]!, data[1]!, data[2]!];
}