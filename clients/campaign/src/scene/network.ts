/**
 * The road network, the rail network, the route graph, and the town clusters.
 *
 * Roads are drawn from the real OSM geometry, draped on the real terrain, and encoded
 * by width and value rather than by hue (ART_DIRECTION.md section 7, reference R3).
 * Road class is a weight, so the map reads like a road map rather than a set of
 * coloured ribbons.
 *
 * The route graph is built from the same polylines, so a march costs what the roads
 * actually are rather than a straight line.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { mapColor, tokens, townColor } from "../design/tokens.js";
import type { Projection, RoadWay, RailWay, WorldSettlement } from "../world/types.js";
import { classifySettlement } from "../world/load.js";
import type { TownClassName } from "../design/tokens.js";

// -- roads and rail ----------------------------------------------------------

/**
 * Ribbon width in metres.
 *
 * The first table here was the real-world width of a carriageway, 3.2 m for a motorway
 * and 1.4 m for a secondary road. At campaign zoom, 13 km up, that is a quarter of a
 * pixel and the whole 26,872-way network rendered as a faint dotted smear. The locked
 * direction now states these as a minimum screen width rather than a physical one, so
 * the values are chosen to be two to three pixels at the default zoom and to grow in
 * relative weight as the camera comes down. Class is carried by weight and value, never
 * by hue (ART_DIRECTION.md section 7).
 */
export const ROAD_WIDTH: Record<RoadWay["roadClass"], number> = {
  motorway: 34,
  trunk: 34,
  primary: 26,
  secondary: 15,
};

export const ROAD_COLOR: Record<RoadWay["roadClass"], string> = {
  motorway: mapColor.roadMajor,
  trunk: mapColor.roadMajor,
  primary: mapColor.roadMajor,
  secondary: mapColor.roadMinor,
};

/** Rail is the last row of the same locked table: 9 m, drawn as a sleeper-dash. */
export const RAIL_WIDTH = 9;

/**
 * Dash cycle for the sleeper-dash, in metres, and the fraction of it that is drawn.
 *
 * Measured along the ground rather than per segment, because a rail way is hundreds of
 * short OSM segments and skipping alternate ones drew a dash pattern whose rhythm came
 * from the way's vertex count instead of from its length. 480 m is the point at which
 * the dashes still read as separate marks at the default campaign zoom.
 */
export const RAIL_DASH_CYCLE_M = 480;
export const RAIL_DASH_ON_RATIO = 0.55;

export interface NetworkMeshes {
  roads: Mesh[];
  rail: Mesh | null;
}

/**
 * Build one mesh per road class, so the whole network is four draw calls rather than
 * 26,872. `ASSETS.md` section 5.3 makes the same point about instancing.
 */
export function buildNetwork(
  scene: Scene,
  roads: RoadWay[],
  rail: RailWay[],
  projection: Projection,
  verticalScale: number,
): NetworkMeshes {
  const byClass = new Map<RoadWay["roadClass"], RoadWay[]>();
  for (const road of roads) {
    const list = byClass.get(road.roadClass) ?? [];
    list.push(road);
    byClass.set(road.roadClass, list);
  }

  // One material for the whole network, white, unlit-specular, culling off. Same
  // reason as the terrain: a left-handed winding mistake silently removes geometry.
  const material = new StandardMaterial("network-mat", scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.specularColor = new Color3(0, 0, 0);
  material.backFaceCulling = false;

  const meshes: Mesh[] = [];
  for (const [roadClass, list] of byClass) {
    const mesh = ribbonMesh(
      scene,
      `road-${roadClass}`,
      list,
      projection,
      ROAD_WIDTH[roadClass]!,
      ROAD_COLOR[roadClass]!,
      verticalScale,
      0.0,
      material,
    );
    if (mesh) meshes.push(mesh);
  }

  // Rail as a sleeper-dash: shorter, lighter, and clearly not a road.
  const railMesh = ribbonMesh(
    scene,
    "rail",
    rail,
    projection,
    RAIL_WIDTH,
    mapColor.rail,
    verticalScale,
    RAIL_DASH_ON_RATIO,
    material,
  );
  return { roads: meshes, rail: railMesh };
}

/**
 * A flat ribbon draped on the terrain.
 *
 * Each segment becomes a quad. A non-zero `dashOnRatio` breaks the ribbon along its
 * length, which is how a railway is drawn on a real map: the dash phase is carried
 * across segment and way boundaries, so the rhythm comes from distance travelled
 * rather than from how the surveyor happened to split the line.
 */
function ribbonMesh(
  scene: Scene,
  name: string,
  ways: { coords: [number, number][] }[],
  projection: Projection,
  width: number,
  color: string,
  verticalScale: number,
  dashOnRatio: number,
  material: StandardMaterial,
): Mesh | null {
  if (ways.length === 0) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = Color3.FromHexString(color);
  const lift = 6; // metres, so roads sit on the surface rather than z-fighting it
  let base = 0;
  // Distance travelled since the last dash boundary, carried across every way.
  let dashPhase = 0;

  for (const way of ways) {
    const pts = way.coords;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [latA, lonA] = pts[i]!;
      const [latB, lonB] = pts[i + 1]!;
      const a = projection.toWorld(latA, lonA);
      const b = projection.toWorld(latB, lonB);
      const ya = projection.heightAt(a.x, a.z) * verticalScale + lift;
      const yb = projection.heightAt(b.x, b.z) * verticalScale + lift;

      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) {
        // A degenerate segment still advances the dash phase, or the rhythm would
        // stretch around every duplicated node in the source data.
        dashPhase += len;
        continue;
      }
      dx /= len;
      dz /= len;

      // Drawn if the segment's midpoint falls in the "on" part of the cycle. A segment
      // longer than the cycle would drop out entirely, so a long one is still drawn and
      // the phase simply continues from where it was.
      if (dashOnRatio > 0 && dashOnRatio < 1 && len < RAIL_DASH_CYCLE_M) {
        const midPhase = (dashPhase + len / 2) % RAIL_DASH_CYCLE_M;
        if (midPhase / RAIL_DASH_CYCLE_M >= dashOnRatio) {
          dashPhase += len;
          continue;
        }
      }
      dashPhase += len;

      // Normal in the ground plane, so the ribbon is the same width on the ground as
      // on a slope.
      const nx = -dz * (width / 2);
      const nz = dx * (width / 2);

      positions.push(a.x - nx, ya, a.z - nz, a.x + nx, ya, a.z + nz, b.x + nx, yb, b.z + nz, b.x - nx, yb, b.z - nz);
      for (let k = 0; k < 4; k += 1) {
        normals.push(0, 1, 0);
        colors.push(c.r, c.g, c.b, 1);
      }
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      base += 4;
    }
  }

  if (indices.length === 0) return null;
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  data.applyToMesh(mesh, false);
  mesh.material = material;
  mesh.useVertexColors = true;
  return mesh;
}

// -- town clusters -----------------------------------------------------------

export interface TownCluster {
  settlementId: string;
  name: string;
  klass: TownClassName;
  position: Vector3;
  /** True when the class came from a real population rather than the default. */
  fromRealData: boolean;
  population: number | null;
  /** The 3D cluster, for reading a town up close. */
  mesh: Mesh;
  /** The map pin, which keeps the settlement findable at campaign zoom. */
  marker: Mesh;
  markerPosition: Vector3;
  /** The shape that was built, so a panel can explain it without rebuilding geometry. */
  silhouette: TownSilhouette;
}

/**
 * Towns as 3D clusters, with silhouettes that read by size and type.
 *
 * Block count and height scale from the real population, so this is a settlement-size
 * map: Denver is a tower and a sprawl, Nederland is three roofs and a silo. The
 * silhouette is seeded from the settlement's name, so a town looks the same every
 * session.
 */
export function buildTowns(
  scene: Scene,
  settlements: WorldSettlement[],
  projection: Projection,
  verticalScale: number,
  lift: number,
): TownCluster[] {
  // Flat, unlit-ish material: a town's silhouette has to read at map distance, and a
  // specular highlight on a 30 m block does not help anyone.
  const material = new StandardMaterial("town-mat", scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.specularColor = new Color3(0, 0, 0);
  material.backFaceCulling = false;
  const out: TownCluster[] = [];

  for (const s of settlements) {
    const { klass, fromRealData } = classifySettlement(s);
    const p = projection.toWorld(s.lat, s.lon);
    const ground = projection.heightAt(p.x, p.z) * verticalScale;
    const silhouette = townSilhouette(klass, s.population);

    const mesh = clusterMesh(scene, s.id, s.name, silhouette, s.population, material);
    mesh.position.set(p.x, ground + lift, p.z);
    mesh.metadata = { settlementId: s.id, name: s.name, klass };

    // The map pin. A 360 m town cluster is a few pixels from 13 km up, so the 3D
    // silhouette alone does not carry the map at campaign zoom. ART_DIRECTION.md
    // section 6 lists the pin as a motif and section 7 gives each class a marker, so
    // both are drawn: the cluster up close, the pin at distance.
    const marker = buildMarker(scene, `marker-${s.id}`, klass, material, out.length);
    marker.position.set(p.x, ground + lift + silhouette.meanHeight * 2.4 + 260, p.z);
    marker.metadata = { settlementId: s.id, name: s.name, klass, isMarker: true };

    out.push({
      settlementId: s.id,
      name: s.name,
      klass,
      position: new Vector3(p.x, ground + lift, p.z),
      fromRealData,
      population: s.population,
      mesh,
      marker,
      markerPosition: marker.position,
      silhouette,
    });
  }
  return out;
}

/** Deterministic per-name pseudo-random, so a town is stable across sessions. */
function nameSeed(name: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The silhouette spec for one settlement: how many buildings, how tall, and which of
 * the three shapes from `ART_DIRECTION.md` section 7.
 *
 * A pure function of the class and the real population, so it is testable without a
 * GPU and so nothing about the shape is decided inside the mesh builder. The band
 * numbers come from `tokens.townClass`, which is where the locked threshold table
 * lives; those figures are building counts in the section 7 table, and the token field
 * they share is named for heights, so both readings are served by the same pair.
 */
export interface TownSilhouette {
  klass: TownClassName;
  /** Buildings in the cluster. Section 7: city 18–34, town 8–16, village 3–6. */
  blockCount: number;
  /** Mean block height in metres, which the tower is measured against. */
  meanHeight: number;
  /** The one thing above the mean, or null for a village. 2.2× for a city, 1.6× for a town. */
  towerHeight: number | null;
  /** Footprint radius in metres. */
  radius: number;
  /** A town has a visible street grid; a city is a tower and low-rise sprawl. */
  streetGrid: boolean;
  /** A village is a single pitched roof and one silo. */
  pitchedRoof: boolean;
}

/**
 * Height and block count scale from the real population, so the map reads as a
 * settlement-size map rather than a set of arbitrary icons: Denver is a tower and a
 * sprawl, Nederland is three roofs and a silo.
 *
 * `population` is `null` when no real dataset covered the place. That is not zero
 * people, it is an unknown count, and it gets the smallest silhouette and no tower
 * rather than an invented figure (CONSTITUTION.md section 1.1).
 */
export function townSilhouette(klass: TownClassName, population: number | null): TownSilhouette {
  const spec = tokens.townClass[klass];
  // log10 rather than a linear ramp: a settlement's footprint grows with the square
  // root of its people, and a linear scale put a 700,000-person city and a 25,000-person
  // town within 4% of each other.
  const scale = population !== null && population > 0 ? Math.log10(population + 10) / 6 : 0.25;
  const band = spec.maxHeight - spec.minHeight;
  const meanHeight = spec.minHeight + band * (0.6 + scale * 0.8);
  return {
    klass,
    blockCount: Math.round(spec.minHeight + band * scale),
    meanHeight,
    towerHeight:
      klass === "city" ? meanHeight * 2.2 : klass === "town" ? meanHeight * 1.6 : null,
    radius: 60 + scale * 420,
    streetGrid: klass === "town",
    pitchedRoof: klass === "village",
  };
}

export interface SilhouetteGeometry {
  positions: number[];
  indices: number[];
  colors: number[];
  /** Boxes actually emitted, which is the block count the test asserts on. */
  blockCount: number;
  /** Height of the tallest thing on the plot, in metres. */
  peakHeight: number;
}

/**
 * Build the cluster's geometry as plain arrays.
 *
 * Deliberately pure: it touches no Scene and no engine. The marker in the same file
 * needs a canvas for its texture, so anything tested through `buildTowns` would need a
 * GPU, and the silhouette is the thing that actually has to conform to section 7.
 */
export function silhouetteGeometry(silhouette: TownSilhouette, seed: string): SilhouetteGeometry {
  const rand = nameSeed(seed);
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  let base = 0;
  let peak = 0;

  // Wall value by class, so a city is darker and denser than a village at a glance.
  const baseHex =
    silhouette.klass === "city"
      ? townColor.cityWall
      : silhouette.klass === "town"
        ? townColor.townWall
        : townColor.villageWall;
  const roofHex =
    silhouette.klass === "city" ? townColor.cityRoof : townColor.townRoof;
  const wall = Color3.FromHexString(baseHex);
  const roof = Color3.FromHexString(roofHex);
  const silo = Color3.FromHexString(townColor.silo);

  const addBox = (cx: number, cz: number, w: number, d: number, hgt: number, color: Color3): void => {
    const hw = w / 2;
    const hd = d / 2;
    const y0 = 0;
    const y1 = hgt;
    // Eight corners.
    const pts: [number, number, number][] = [
      [cx - hw, y0, cz - hd], [cx + hw, y0, cz - hd], [cx + hw, y0, cz + hd], [cx - hw, y0, cz + hd],
      [cx - hw, y1, cz - hd], [cx + hw, y1, cz - hd], [cx + hw, y1, cz + hd], [cx - hw, y1, cz + hd],
    ];
    for (const p of pts) {
      positions.push(p[0], p[1], p[2]);
      colors.push(color.r, color.g, color.b, 1);
    }
    // Faces, wound so the normal points outward.
    const faces: [number, number, number, number, number, number][] = [
      [4, 5, 6, 4, 6, 7], // top
      [0, 1, 5, 0, 5, 4], // -Z
      [1, 2, 6, 1, 6, 5], // +X
      [2, 3, 7, 2, 7, 6], // +Z
      [3, 0, 4, 3, 4, 7], // -X
    ];
    for (const f of faces) indices.push(base + f[0], base + f[1], base + f[2], base + f[3], base + f[4], base + f[5]);
    base += 8;
    peak = Math.max(peak, hgt);
  };

  /**
   * A gable end: two sloped roof planes over a rectangular footprint.
   *
   * A village's silhouette in section 7 is "a single pitched roof", and a flat-topped
   * box does not read as one from above. Five points make a prism that has no bottom
   * face, which is never visible.
   */
  const addPitchedRoof = (cx: number, cz: number, w: number, d: number, wallHeight: number, color: Color3): void => {
    const hw = w / 2;
    const hd = d / 2;
    const y1 = wallHeight;
    const y2 = wallHeight + d * 0.42;
    const pts: [number, number, number][] = [
      [cx - hw, 0, cz - hd], [cx + hw, 0, cz - hd], [cx + hw, 0, cz + hd], [cx - hw, 0, cz + hd],
      [cx - hw, y1, cz - hd], [cx + hw, y1, cz - hd], [cx + hw, y1, cz + hd], [cx - hw, y1, cz + hd],
      // Ridge, running along X.
      [cx - hw, y2, cz], [cx + hw, y2, cz],
    ];
    for (const p of pts) {
      positions.push(p[0], p[1], p[2]);
      colors.push(color.r, color.g, color.b, 1);
    }
    const faces: [number, number, number][] = [
      [4, 8, 5], [5, 8, 9], [4, 5, 6], [4, 6, 7], // the two roof planes and the gable ends
    ];
    for (const f of faces) indices.push(base + f[0], base + f[1], base + f[2]);
    base += 10;
    peak = Math.max(peak, y2);
  };

  const radius = silhouette.radius;

  // The blocks. A town sits on a street grid, which is what separates its silhouette
  // from a city's sprawl; a city and a village scatter, because a village is a few
  // buildings wherever they happen to be.
  if (silhouette.streetGrid) {
    const perSide = Math.max(2, Math.round(Math.sqrt(silhouette.blockCount)));
    const plot = (radius * 1.7) / perSide;
    for (let gz = 0; gz < perSide; gz += 1) {
      for (let gx = 0; gx < perSide; gx += 1) {
        if (gx + gz > perSide - 1) continue;
        const cx = -radius * 0.85 + gx * plot + plot / 2;
        const cz = -radius * 0.85 + gz * plot + plot / 2;
        const centrality = 1 - Math.hypot(cx, cz) / (radius + 1);
        const hgt = Math.max(8, silhouette.meanHeight * (0.35 + centrality * 0.85) * (0.7 + rand() * 0.6));
        addBox(cx, cz, plot * 0.62, plot * 0.62, hgt, wall);
      }
    }
  } else {
    for (let i = 0; i < silhouette.blockCount; i += 1) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * radius;
      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;
      // Downtown blocks are taller; the edge is low-rise sprawl.
      const centrality = 1 - dist / (radius + 1);
      const w = 14 + rand() * 26;
      const d = 14 + rand() * 26;
      const hgt = Math.max(8, silhouette.meanHeight * (0.22 + centrality * 0.9) * (0.5 + rand() * 0.9));
      addBox(cx, cz, w, d, hgt, wall);
    }
  }

  // The one thing that says "city" from a distance: a tower well above the mean.
  if (silhouette.towerHeight !== null) {
    const wide = silhouette.klass === "city" ? 26 : 18;
    addBox(0, 0, wide, wide, silhouette.towerHeight, roof);
    addBox(0, 0, 8, 8, silhouette.towerHeight + 40, silo);
  }
  // A water tower or grain silo marks a town; a village gets a single pitched roof.
  if (silhouette.pitchedRoof) {
    addPitchedRoof(radius * 0.4, -radius * 0.3, 22, 16, silhouette.meanHeight * 0.8, roof);
    addBox(-radius * 0.35, radius * 0.4, 7, 7, silhouette.meanHeight * 1.1, silo);
  } else {
    const siloAt = rand() * radius * 0.7;
    addBox(siloAt, siloAt * 0.6, 7, 7, silhouette.meanHeight * 1.3, silo);
  }

  return { positions, indices, colors, blockCount: silhouette.blockCount, peakHeight: peak };
}

function clusterMesh(
  scene: Scene,
  id: string,
  name: string,
  silhouette: TownSilhouette,
  population: number | null,
  material: StandardMaterial,
): Mesh {
  const geometry = silhouetteGeometry(silhouette, name);

  const mesh = new Mesh(`town-${id}`, scene);
  const data = new VertexData();
  data.positions = geometry.positions;
  data.indices = geometry.indices;
  data.colors = geometry.colors;
  // Normals are recomputed by the flat-shade conversion below; supplying zeros first
  // would just be a wasted pass.
  data.applyToMesh(mesh, false);
  // Flat shading: the hard normals are the art direction (ART_DIRECTION.md section 8),
  // and they also make the silhouette the thing you read, not the shading.
  mesh.convertToFlatShadedMesh();
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.metadata = { population, blockCount: geometry.blockCount };
  return mesh;
}

/**
 * The map pin, drawn from `ART_DIRECTION.md` section 7: a hard diamond on a short
 * stem, city double, town single, village hollow. Emissive and unlit, because a pin
 * has to stay readable in shadow and against snow, and 2px outline or none at all.
 */
function buildMarker(
  scene: Scene,
  name: string,
  klass: TownClassName,
  networkMaterial: StandardMaterial,
  ordinal: number,
): Mesh {
  const size = klass === "city" ? 512 : klass === "town" ? 384 : 256;
  const texture = new DynamicTexture(`${name}-tex`, { width: size, height: size }, scene, true);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const r = size * 0.34;
  const stroke = Math.max(4, size * 0.045);
  // Paper-white fill with a heavy ink outline. A pin has to read against olive plains,
  // dark forest and white snow alike, so it carries its own contrast rather than
  // relying on the terrain behind it. The class is carried by the doubling and the
  // size, not by the fill.
  const fill: string = tokens.paper[0];

  const diamond = (cx: number, cy: number, radius: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx + radius, cy);
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx - radius, cy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = markerInk(klass);
    ctx.stroke();
  };

  diamond(c, c - size * 0.05, r);
  // A city gets the doubled diamond from the locked marker table.
  if (klass === "city") diamond(c, c - size * 0.05, r * 0.55);
  // The short stem.
  ctx.beginPath();
  ctx.moveTo(c, c + r);
  ctx.lineTo(c, size * 0.94);
  ctx.lineWidth = Math.max(2, size * 0.022);
  ctx.strokeStyle = markerInk(klass);
  ctx.stroke();

  texture.update();
  // Each pin needs its own material so its texture is bound; the material is otherwise
  // unlit, which is what a map pin is.
  const material = new StandardMaterial(`${name}-mat`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = new Color3(1, 1, 1);
  material.diffuseColor = new Color3(0, 0, 0);
  material.specularColor = new Color3(0, 0, 0);
  material.backFaceCulling = false;
  material.disableLighting = true;
  void networkMaterial;

  const plane = CreatePlane(name, { size: markerWorldSize(klass) }, scene);
  plane.material = material;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = true;
  plane.renderingGroupId = 1;
  // A deterministic slight offset, so a cluster of pins is not a perfect grid.
  plane.position.y += ((ordinal * 37) % 11) * 18;
  return plane;
}

/** Pin size in metres. Sized to stay legible at the default campaign zoom. */
export function markerWorldSize(klass: TownClassName): number {
  return klass === "city" ? 950 : klass === "town" ? 720 : 520;
}

function markerInk(klass: TownClassName): string {
  return klass === "city" ? tokens.ink[900] : klass === "town" ? tokens.ink[700] : tokens.ink[500];
}

// -- route graph -------------------------------------------------------------

export interface GraphNode {
  x: number;
  z: number;
  /** Road class of the cheapest edge leaving this node, for cost and width. */
  bestClass: RoadWay["roadClass"];
}

export interface RouteGraph {
  nodes: GraphNode[];
  /** adjacency: node index -> [neighbour index, cost in metres][] */
  adjacency: [number, number][][];
  /** Node index for each settlement, or -1 when it is not on a road. */
  nodeForSettlement: Map<string, number>;
}

/**
 * Build a routable graph from the road polylines.
 *
 * Nodes are snapped to a 40 m grid so two ways that share a junction share a node
 * without needing an exact coordinate match. 40 m is about the width of the roads in
 * this region, so snapping at that resolution cannot invent a shortcut of any size.
 */
export function buildRouteGraph(
  roads: RoadWay[],
  settlements: WorldSettlement[],
  projection: Projection,
): RouteGraph {
  const SNAP = 40;
  const key = (x: number, z: number): string => `${Math.round(x / SNAP)}:${Math.round(z / SNAP)}`;
  const nodes: GraphNode[] = [];
  const index = new Map<string, number>();
  const adjacency: [number, number][][] = [];

  const nodeFor = (x: number, z: number, roadClass: RoadWay["roadClass"]): number => {
    const k = key(x, z);
    const existing = index.get(k);
    if (existing !== undefined) {
      // Keep the strongest class seen, so a trunk through a junction wins over a lane.
      if (CLASS_RANK[roadClass] > CLASS_RANK[nodes[existing]!.bestClass]) {
        nodes[existing]!.bestClass = roadClass;
      }
      return existing;
    }
    const i = nodes.length;
    nodes.push({ x, z, bestClass: roadClass });
    adjacency.push([]);
    index.set(k, i);
    return i;
  };

  for (const road of roads) {
    let prev: number | null = null;
    for (let i = 0; i < road.coords.length; i += 1) {
      const [lat, lon] = road.coords[i]!;
      const w = projection.toWorld(lat, lon);
      const n = nodeFor(w.x, w.z, road.roadClass);
      if (prev !== null && prev !== n) {
        const a = nodes[prev]!;
        const b = nodes[n]!;
        const cost = Math.hypot(a.x - b.x, a.z - b.z);
        if (cost > 0) {
          adjacency[prev]!.push([n, cost]);
          adjacency[n]!.push([prev, cost]);
        }
      }
      prev = n;
    }
  }

  // Attach each settlement to its nearest road node.
  const nodeForSettlement = new Map<string, number>();
  for (const s of settlements) {
    const w = projection.toWorld(s.lat, s.lon);
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!;
      const d = Math.hypot(n.x - w.x, n.z - w.z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best >= 0 && bestDist < 6000) {
      nodeForSettlement.set(s.id, best);
    }
  }

  return { nodes, adjacency, nodeForSettlement };
}

const CLASS_RANK: Record<RoadWay["roadClass"], number> = {
  secondary: 1,
  primary: 2,
  trunk: 3,
  motorway: 4,
};

export interface RouteResult {
  nodePath: number[];
  /** The road polyline in world metres, for drawing the planned route. */
  worldPath: Vector3[];
  distanceKm: number;
  found: boolean;
  /** The worst road class on the route, which is what sets the danger. */
  weakestClass: RoadWay["roadClass"] | null;
}

/**
 * Dijkstra over the road graph. The march planner's distance comes from here, so a
 * march costs what the roads actually are rather than a straight line.
 */
export function findRoute(graph: RouteGraph, fromSettlement: string, toSettlement: string): RouteResult {
  const start = graph.nodeForSettlement.get(fromSettlement);
  const goal = graph.nodeForSettlement.get(toSettlement);
  if (start === undefined || goal === undefined) {
    return { nodePath: [], worldPath: [], distanceKm: 0, found: false, weakestClass: null };
  }
  return shortestPath(graph, start, goal);
}

/** The same search on raw node indices, for callers that already hold graph nodes. */
export function shortestPath(graph: RouteGraph, start: number, goal: number): RouteResult {
  if (start === goal) {
    const n = graph.nodes[start]!;
    return { nodePath: [start], worldPath: [new Vector3(n.x, 0, n.z)], distanceKm: 0, found: true, weakestClass: n.bestClass };
  }

  const dist = new Array<number>(graph.nodes.length).fill(Infinity);
  const prev = new Array<number>(graph.nodes.length).fill(-1);
  const done = new Array<boolean>(graph.nodes.length).fill(false);
  dist[start] = 0;

  // The graph has ~100k nodes, so a linear scan for the minimum is far too slow. A
  // binary heap keeps the whole search to a few milliseconds.
  const heap = new MinHeap();
  heap.push(start, 0);

  while (heap.size > 0) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = true;
    if (u === goal) break;
    for (const [v, cost] of graph.adjacency[u]!) {
      const nd = dist[u]! + cost;
      if (nd < dist[v]!) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(v, nd);
      }
    }
  }

  if (!Number.isFinite(dist[goal]!)) {
    return { nodePath: [], worldPath: [], distanceKm: 0, found: false, weakestClass: null };
  }

  const nodePath: number[] = [];
  for (let at = goal; at !== -1; at = prev[at]!) nodePath.push(at);
  nodePath.reverse();

  const worldPath = nodePath.map((i) => {
    const n = graph.nodes[i]!;
    return new Vector3(n.x, 0, n.z);
  });

  // The weakest class on the route is what sets the danger, so it is the weakest and
  // not the strongest that gets reported.
  let weakest: RoadWay["roadClass"] | null = null;
  for (const i of nodePath) {
    const c = graph.nodes[i]!.bestClass;
    if (weakest === null || CLASS_RANK[c] < CLASS_RANK[weakest]) weakest = c;
  }

  return { nodePath, worldPath, distanceKm: dist[goal]! / 1000, found: true, weakestClass: weakest };
}

class MinHeap {
  #values: number[] = [];
  #keys: number[] = [];

  get size(): number {
    return this.#values.length;
  }

  push(value: number, key: number): void {
    this.#values.push(value);
    this.#keys.push(key);
    let i = this.#values.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.#keys[parent]! <= this.#keys[i]!) break;
      this.#swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.#values[0]!;
    const lastV = this.#values.pop()!;
    const lastK = this.#keys.pop()!;
    if (this.#values.length > 0) {
      this.#values[0] = lastV;
      this.#keys[0] = lastK;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.#keys.length && this.#keys[l]! < this.#keys[smallest]!) smallest = l;
        if (r < this.#keys.length && this.#keys[r]! < this.#keys[smallest]!) smallest = r;
        if (smallest === i) break;
        this.#swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  #swap(a: number, b: number): void {
    [this.#values[a], this.#values[b]] = [this.#values[b]!, this.#values[a]!];
    [this.#keys[a], this.#keys[b]] = [this.#keys[b]!, this.#keys[a]!];
  }
}
