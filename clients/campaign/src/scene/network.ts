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

import { Color3, DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3, VertexData } from "@babylonjs/core";
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
const ROAD_WIDTH: Record<RoadWay["roadClass"], number> = {
  motorway: 34,
  trunk: 34,
  primary: 26,
  secondary: 15,
};

const ROAD_COLOR: Record<RoadWay["roadClass"], string> = {
  motorway: mapColor.roadMajor,
  trunk: mapColor.roadMajor,
  primary: mapColor.roadMajor,
  secondary: mapColor.roadMinor,
};

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
  const railMesh = ribbonMesh(scene, "rail", rail, projection, 1.0, mapColor.rail, verticalScale, 0.55, material);
  return { roads: meshes, rail: railMesh };
}

/**
 * A flat ribbon draped on the terrain.
 *
 * Each segment becomes a quad. `dashFraction` breaks the ribbon into dashes, which is
 * how a railway is drawn on a real map.
 */
function ribbonMesh(
  scene: Scene,
  name: string,
  ways: { coords: [number, number][] }[],
  projection: Projection,
  width: number,
  color: string,
  verticalScale: number,
  dashFraction: number,
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

  for (const way of ways) {
    const pts = way.coords;
    for (let i = 0; i < pts.length - 1; i += 1) {
      if (dashFraction > 0 && i % 2 === 1) continue;
      const [latA, lonA] = pts[i]!;
      const [latB, lonB] = pts[i + 1]!;
      const a = projection.toWorld(latA, lonA);
      const b = projection.toWorld(latB, lonB);
      const ya = projection.heightAt(a.x, a.z) * verticalScale + lift;
      const yb = projection.heightAt(b.x, b.z) * verticalScale + lift;

      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) continue;
      dx /= len;
      dz /= len;
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
}

/**
 * Towns as 3D clusters, with silhouettes that read by size and type.
 *
 * Block count and height scale from the real population, so this is a settlement-size
 * map: Denver is a tower and a sprawl, Nederland is three roofs and a silo. Seeded
 * from the settlement id, so a town looks the same every session.
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
    const spec = tokens.townClass[klass];

    // Real population drives the footprint and the height, with a floor so a
    // settlement with no surveyed population still reads as a place.
    const people = s.population ?? 0;
    const scale = people > 0 ? Math.log10(people + 10) / 6 : 0.25;
    const blockCount = Math.round(spec.minHeight + (spec.maxHeight - spec.minHeight) * scale);
    const maxHeight = spec.minHeight + (spec.maxHeight - spec.minHeight) * (0.6 + scale * 0.8);
    const radius = 60 + scale * 420;

    const mesh = clusterMesh(scene, s.id, klass, s.name, blockCount, maxHeight, radius, people, material);
    mesh.position.set(p.x, ground + lift, p.z);
    mesh.metadata = { settlementId: s.id, name: s.name, klass };

    // The map pin. A 360 m town cluster is a few pixels from 13 km up, so the 3D
    // silhouette alone does not carry the map at campaign zoom. ART_DIRECTION.md
    // section 6 lists the pin as a motif and section 7 gives each class a marker, so
    // both are drawn: the cluster up close, the pin at distance.
    const marker = buildMarker(scene, `marker-${s.id}`, klass, material, out.length);
    marker.position.set(p.x, ground + lift + maxHeight + 260, p.z);
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

function clusterMesh(
  scene: Scene,
  id: string,
  klass: TownClassName,
  name: string,
  blockCount: number,
  maxHeight: number,
  radius: number,
  population: number,
  material: StandardMaterial,
): Mesh {
  const rand = nameSeed(name);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let base = 0;

  // Wall value by class, so a city is darker and denser than a village at a glance.
  const baseHex =
    klass === "city" ? townColor.cityWall : klass === "town" ? townColor.townWall : townColor.villageWall;
  const roofHex = klass === "city" ? townColor.cityRoof : townColor.townRoof;
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
      normals.push(0, 0, 0);
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
  };

  // The grid of blocks.
  for (let i = 0; i < blockCount; i += 1) {
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * radius;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    // Downtown blocks are taller; the edge is low-rise sprawl.
    const centrality = 1 - dist / (radius + 1);
    const w = 14 + rand() * 26;
    const d = 14 + rand() * 26;
    const hgt = Math.max(8, maxHeight * (0.22 + centrality * 0.9) * (0.5 + rand() * 0.9));
    addBox(cx, cz, w, d, hgt, wall);
  }

  // The one thing that says "city" from a distance: a tower well above the mean.
  if (klass === "city" || klass === "town") {
    const towerHeight = maxHeight * (klass === "city" ? 2.2 : 1.6);
    addBox(0, 0, klass === "city" ? 26 : 18, klass === "city" ? 26 : 18, towerHeight, roof);
    addBox(0, 0, 8, 8, towerHeight + 40, silo);
  }
  // A water tower or grain silo marks a town; a village gets a single pitched roof.
  if (klass === "village") {
    addBox(radius * 0.4, -radius * 0.3, 10, 10, maxHeight * 1.1, roof);
  } else {
    const siloAt = rand() * radius * 0.7;
    addBox(siloAt, siloAt * 0.6, 7, 7, maxHeight * (klass === "city" ? 1.3 : 1.6), silo);
  }

  const mesh = new Mesh(`town-${id}`, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  data.applyToMesh(mesh, false);
  // Flat shading: the hard normals are the art direction (ART_DIRECTION.md section 8),
  // and they also make the silhouette the thing you read, not the shading.
  mesh.convertToFlatShadedMesh();
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.metadata = { ...(mesh.metadata as object), population };
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

  const plane = MeshBuilder.CreatePlane(name, { size: markerWorldSize(klass) }, scene);
  plane.material = material;
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.isPickable = true;
  plane.renderingGroupId = 1;
  // A deterministic slight offset, so a cluster of pins is not a perfect grid.
  plane.position.y += ((ordinal * 37) % 11) * 18;
  return plane;
}

/** Pin size in metres. Sized to stay legible at the default campaign zoom. */
function markerWorldSize(klass: TownClassName): number {
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
