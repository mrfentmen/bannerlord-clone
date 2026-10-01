/**
 * Settlement 3D upgrades: City Walls rings, prosperity district tinting, and
 * garrison banners in controlling-faction colours. MASTER_PLAN.md section 4C
 * (tasks 142-144).
 *
 * The caller owns the sim connection: it feeds one `SettlementUpgradeState`
 * per town through `update()` on campaign ticks, plus the faction colour map.
 * The module owns no fetch and never touches the baked cluster meshes from
 * `network.buildTowns` — walls, district tints, and banners are separate meshes
 * added to the scene, so upgrades appear, recolour, and swap without a town
 * rebuild. CampaignScene wires it with its `TownCluster` list, which satisfies
 * the `UpgradeCluster` shape structurally.
 *
 * Scale: 1 unit = 1 metre, same as the scenes (ART_DIRECTION.md section 7).
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import { prosperityScale, townColor } from "../design/tokens.js";

/** The slice of a town cluster the upgrades need. `TownCluster` satisfies this. */
export interface UpgradeCluster {
  settlementId: string;
  position: Vector3;
  mesh: Mesh;
}

export interface SettlementUpgradeState {
  settlementId: string;
  /** True once the town's City Walls project has completed (task 142). */
  wallsBuilt: boolean;
  /**
   * Sim prosperity, 0-1. `null` when the sim has no figure: no district tint is
   * drawn, rather than inventing one (task 143).
   */
  prosperity: number | null;
  /** Controlling faction id. `null` when the town is unheld: no banner (task 144). */
  factionId: string | null;
}

export interface SettlementUpgradesInput {
  settlements: SettlementUpgradeState[];
  /** Faction id -> hex colour for the garrison banner cloth (task 144). */
  factionColors: Record<string, string>;
}

export interface SettlementUpgradesOptions {
  scene: Scene;
  clusters: UpgradeCluster[];
}

export interface SettlementUpgradesHandle {
  /** Feed one sim tick. Only listed settlements are touched. */
  update(input: SettlementUpgradesInput): void;
  dispose(): void;
  /** Settlements currently showing a City Walls ring. */
  readonly walledCount: number;
  /** Settlements currently showing a prosperity district tint. */
  readonly tintedCount: number;
  /** Settlements currently flying a garrison banner. */
  readonly bannerCount: number;
}

/** Wall ring height in metres. */
export const WALL_HEIGHT = 12;
/** Wall ring thickness in metres. */
export const WALL_THICKNESS = 4;
/** Target length of one wall segment along the ring. */
export const WALL_SEGMENT_LENGTH = 24;
/** The wall ring sits just outside the cluster footprint. */
export const WALL_RING_FACTOR = 1.08;
/** Bearing (radians, east = 0) of the gate gap in the wall ring. */
export const WALL_GATE_BEARING = 0;
/** Angular half-width of the gate gap, in wall segments. */
export const WALL_GATE_HALF_SEGMENTS = 1;
/** Banner pole height in metres. */
export const BANNER_POLE_HEIGHT = 25;
/** Bearing (radians) of the garrison banner around the cluster. */
export const BANNER_BEARING = Math.PI / 4;
/** The banner stands outside the wall ring. */
export const BANNER_RADIUS_FACTOR = 1.3;
/** District tint disc radius relative to the cluster footprint. */
export const TINT_RADIUS_FACTOR = 1.18;
/** District tint disc lift above the cluster base, in metres. */
export const TINT_LIFT = 0.4;
/** District tint opacity. */
export const TINT_ALPHA = 0.45;
/** Fallback cluster radius when the cluster mesh has no usable bounds. */
export const FALLBACK_CLUSTER_RADIUS = 100;

/** Number of prosperity buckets in `prosperityScale`. */
export const PROSPERITY_LEVELS = prosperityScale.length;

/**
 * Bucket a 0-1 prosperity figure into 0..4. Out-of-range input is clamped, so a
 * sim that reports 1.2 does not index off the end of the scale.
 */
export function prosperityLevel(prosperity: number): number {
  if (Number.isNaN(prosperity)) return 0;
  const p = Math.min(1, Math.max(0, prosperity));
  return Math.min(PROSPERITY_LEVELS - 1, Math.floor(p * PROSPERITY_LEVELS));
}

/**
 * Hex colour for a prosperity figure, or `null` when the sim has no figure
 * (or the figure is NaN): the caller draws no tint rather than a fake one.
 */
export function prosperityColor(prosperity: number | null): string | null {
  if (prosperity === null || Number.isNaN(prosperity)) return null;
  return prosperityScale[prosperityLevel(prosperity)] ?? prosperityScale[PROSPERITY_LEVELS - 1]!;
}

/** Number of wall segments for a cluster of the given radius (task 142). */
export function wallSegmentCount(clusterRadius: number): number {
  const ringRadius = clusterRadius * WALL_RING_FACTOR;
  return Math.max(8, Math.round((2 * Math.PI * ringRadius) / WALL_SEGMENT_LENGTH));
}

interface SettlementOverlays {
  cluster: UpgradeCluster;
  radius: number;
  wall: Mesh | null;
  tint: Mesh | null;
  tintLevel: number;
  banner: Mesh | null;
  bannerCloth: StandardMaterial | null;
  bannerFaction: string | null;
  bannerHex: string | null;
}

export function createSettlementUpgrades(options: SettlementUpgradesOptions): SettlementUpgradesHandle {
  const { scene, clusters } = options;
  const overlays = new Map<string, SettlementOverlays>();

  // Shared materials, owned by this module and disposed with it.
  const wallMat = new StandardMaterial("settlement-wall-mat", scene);
  wallMat.diffuseColor = new Color3(1, 1, 1);
  wallMat.specularColor = new Color3(0, 0, 0);
  wallMat.backFaceCulling = false;

  const poleMat = new StandardMaterial("settlement-banner-pole-mat", scene);
  poleMat.diffuseColor = Color3.FromHexString(townColor.bannerPole);
  poleMat.specularColor = new Color3(0, 0, 0);

  const tintMats = prosperityScale.map((hex, i) => {
    const m = new StandardMaterial(`settlement-tint-mat-${i}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0, 0, 0);
    m.alpha = TINT_ALPHA;
    m.backFaceCulling = false;
    return m;
  });

  for (const cluster of clusters) {
    cluster.mesh.computeWorldMatrix(true);
    const sphere = cluster.mesh.getBoundingInfo().boundingSphere;
    const radius =
      Number.isFinite(sphere.radiusWorld) && sphere.radiusWorld > 0
        ? sphere.radiusWorld
        : FALLBACK_CLUSTER_RADIUS;
    overlays.set(cluster.settlementId, {
      cluster,
      radius,
      wall: null,
      tint: null,
      tintLevel: -1,
      banner: null,
      bannerCloth: null,
      bannerFaction: null,
      bannerHex: null,
    });
  }

  function buildWallRing(o: SettlementOverlays): Mesh {
    const ringRadius = o.radius * WALL_RING_FACTOR;
    const n = wallSegmentCount(o.radius);
    const segLen = ((2 * Math.PI * ringRadius) / n) * 0.96;
    const gateHalfAngle = (WALL_GATE_HALF_SEGMENTS * 2 * Math.PI) / n;
    const color = Color3.FromHexString(townColor.fortWall);

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let base = 0;

    // One box per ring segment, length axis on the tangent, thickness radial.
    const addBox = (cx: number, cz: number, len: number, thick: number, hgt: number, angle: number): void => {
      const tx = -Math.sin(angle);
      const tz = Math.cos(angle); // tangent: the length axis
      const rx = Math.cos(angle);
      const rz = Math.sin(angle); // radial: the thickness axis
      const hl = len / 2;
      const ht = thick / 2;
      const local: [number, number, number][] = [
        [-hl, 0, -ht], [hl, 0, -ht], [hl, 0, ht], [-hl, 0, ht],
        [-hl, hgt, -ht], [hl, hgt, -ht], [hl, hgt, ht], [-hl, hgt, ht],
      ];
      for (const [lx, y, lz] of local) {
        positions.push(cx + lx * tx + lz * rx, y, cz + lx * tz + lz * rz);
        normals.push(0, 0, 0);
        colors.push(color.r, color.g, color.b, 1);
      }
      // Faces, wound so the normal points outward (same order as network.ts).
      const faces: [number, number, number, number, number, number][] = [
        [4, 5, 6, 4, 6, 7], // top
        [0, 1, 5, 0, 5, 4], // -Z
        [1, 2, 6, 1, 6, 5], // +X
        [2, 3, 7, 2, 7, 6], // +Z
        [3, 0, 4, 3, 4, 7], // -X
      ];
      for (const f of faces) indices.push(base + f[0], base + f[1], base + f[2], base + f[3], base + f[4], base + f[5]);
      base += 8;
    };

    for (let i = 0; i < n; i += 1) {
      const angle = (i / n) * Math.PI * 2;
      // The gate gap: skip segments near the gate bearing (task 142).
      let d = Math.abs(angle - WALL_GATE_BEARING) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < gateHalfAngle) continue;
      addBox(
        Math.cos(angle) * ringRadius,
        Math.sin(angle) * ringRadius,
        segLen,
        WALL_THICKNESS,
        WALL_HEIGHT,
        angle,
      );
    }

    const mesh = new Mesh(`walls-${o.cluster.settlementId}`, scene);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.colors = colors;
    data.applyToMesh(mesh, false);
    // Flat shading: the hard normals are the art direction (ART_DIRECTION.md section 8).
    mesh.convertToFlatShadedMesh();
    mesh.material = wallMat;
    mesh.useVertexColors = true;
    mesh.position.copyFrom(o.cluster.position);
    mesh.isPickable = false;
    return mesh;
  }

  function buildTint(o: SettlementOverlays, level: number): Mesh {
    const disc = MeshBuilder.CreateDisc(
      `district-${o.cluster.settlementId}`,
      { radius: o.radius * TINT_RADIUS_FACTOR, tessellation: 48 },
      scene,
    );
    // CreateDisc lies in the XY plane; lay it flat on the ground.
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(o.cluster.position.x, o.cluster.position.y + TINT_LIFT, o.cluster.position.z);
    disc.material = tintMats[level]!;
    disc.isPickable = false;
    return disc;
  }

  function buildBanner(o: SettlementOverlays): { root: Mesh; clothMat: StandardMaterial } {
    const id = o.cluster.settlementId;
    const root = new Mesh(`banner-${id}`, scene);
    const pole = MeshBuilder.CreateCylinder(
      `banner-pole-${id}`,
      { diameter: 1.4, height: BANNER_POLE_HEIGHT },
      scene,
    );
    pole.parent = root;
    pole.position.y = BANNER_POLE_HEIGHT / 2;
    pole.material = poleMat;

    const clothMat = new StandardMaterial(`banner-cloth-mat-${id}`, scene);
    clothMat.specularColor = new Color3(0, 0, 0);
    const cloth = MeshBuilder.CreateBox(`banner-cloth-${id}`, { width: 7, height: 5, depth: 0.8 }, scene);
    cloth.parent = root;
    cloth.position.set(4.2, BANNER_POLE_HEIGHT - 3.5, 0);
    cloth.material = clothMat;

    root.position.set(
      o.cluster.position.x + Math.cos(BANNER_BEARING) * o.radius * BANNER_RADIUS_FACTOR,
      o.cluster.position.y,
      o.cluster.position.z + Math.sin(BANNER_BEARING) * o.radius * BANNER_RADIUS_FACTOR,
    );
    root.isPickable = false;
    pole.isPickable = false;
    cloth.isPickable = false;
    return { root, clothMat };
  }

  function updateWall(o: SettlementOverlays, wallsBuilt: boolean): void {
    if (wallsBuilt && o.wall === null) {
      o.wall = buildWallRing(o);
    } else if (!wallsBuilt && o.wall !== null) {
      o.wall.dispose();
      o.wall = null;
    }
  }

  function updateTint(o: SettlementOverlays, prosperity: number | null): void {
    const level = prosperity === null || Number.isNaN(prosperity) ? -1 : prosperityLevel(prosperity);
    if (level === o.tintLevel) return;
    if (o.tint !== null) {
      o.tint.dispose();
      o.tint = null;
    }
    o.tintLevel = level;
    if (level >= 0) o.tint = buildTint(o, level);
  }

  function updateBanner(o: SettlementOverlays, factionId: string | null, factionColors: Record<string, string>): void {
    const held = factionId !== null && factionId !== "";
    if (!held) {
      if (o.banner !== null) {
        o.banner.dispose();
        o.bannerCloth?.dispose();
        o.banner = null;
        o.bannerCloth = null;
        o.bannerFaction = null;
        o.bannerHex = null;
      }
      return;
    }
    if (o.banner === null) {
      const built = buildBanner(o);
      o.banner = built.root;
      o.bannerCloth = built.clothMat;
    }
    // Banners swap on ownership change (task 144); a faction with no colour
    // entry gets the documented neutral fallback rather than no banner.
    const hex = factionColors[factionId] ?? townColor.bannerUnknown;
    if (o.bannerHex !== hex) {
      o.bannerCloth!.diffuseColor = Color3.FromHexString(hex);
      o.bannerHex = hex;
    }
    o.bannerFaction = factionId;
  }

  const countWhere = (pick: (o: SettlementOverlays) => boolean): number => {
    let n = 0;
    for (const o of overlays.values()) if (pick(o)) n += 1;
    return n;
  };

  return {
    update(input: SettlementUpgradesInput): void {
      for (const s of input.settlements) {
        const o = overlays.get(s.settlementId);
        if (!o) continue; // Unknown settlement: ignore, never invent.
        updateWall(o, s.wallsBuilt);
        updateTint(o, s.prosperity);
        updateBanner(o, s.factionId, input.factionColors);
      }
    },

    dispose(): void {
      for (const o of overlays.values()) {
        o.wall?.dispose();
        o.tint?.dispose();
        o.banner?.dispose();
        o.bannerCloth?.dispose();
      }
      overlays.clear();
      for (const m of tintMats) m.dispose();
      wallMat.dispose();
      poleMat.dispose();
    },

    get walledCount(): number {
      return countWhere((o) => o.wall !== null);
    },
    get tintedCount(): number {
      return countWhere((o) => o.tint !== null);
    },
    get bannerCount(): number {
      return countWhere((o) => o.banner !== null);
    },
  };
}
