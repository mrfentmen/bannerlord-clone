/**
 * Real-building renderer for city maps.
 *
 * Takes OpenStreetMap building footprints (polygon + optional floor count) and
 * emits them as one merged, flat-shaded mesh: a single draw call no matter how
 * many buildings, so a whole downtown renders as cheaply as one town cluster.
 *
 * The geometry builder is pure (no Scene, no engine) so it is testable without
 * a GPU, following the same split `network.ts` uses for town silhouettes. The
 * scene builder wraps it in a Mesh the same way `clusterMesh` does.
 */

import { Mesh, StandardMaterial, VertexData, type Scene } from "@babylonjs/core";
import type { Projection } from "../world/types.js";

/** One OSM building: a footprint polygon plus whatever tags came with it. */
export interface BuildingFootprint {
  id: number;
  /** [lon, lat] pairs, in order around the polygon. */
  coords: [number, number][];
  /** OSM `building:levels` tag, when the mapper recorded one. */
  levels?: string;
  /** OSM `building` tag value (yes, apartments, commercial, ...). */
  type?: string;
}

export interface BuildingsGeometry {
  positions: number[];
  indices: number[];
  colors: number[];
  /** Footprints that survived validation and were actually emitted. */
  buildingCount: number;
  /** Height of the tallest emitted building, in metres. */
  peakHeight: number;
}

/** 3 m per floor: the standard storey height the silhouette code assumes. */
export const METRES_PER_LEVEL = 3;
/** Footprints without a levels tag read as two-storey walkups, not towers. */
export const DEFAULT_LEVELS = 2;

/**
 * Height in metres for one footprint. Garbage in the levels tag (empty string,
 * "abc", zero) falls back to the default rather than a zero-height pancake.
 */
export function buildingHeight(fp: BuildingFootprint): number {
  const parsed = fp.levels !== undefined ? Number.parseInt(fp.levels, 10) : NaN;
  const levels =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LEVELS;
  return levels * METRES_PER_LEVEL;
}

/** Deterministic 0..1 from a building id, for per-building colour variation. */
function hash01(id: number): number {
  let h = (id * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Extrude every footprint into a walled prism with a flat roof, merged into one
 * vertex stream.
 *
 * Ring orientation is normalised to positive signed area first, so the wall and
 * roof winding below is always correct regardless of which way OSM wound the
 * polygon. Degenerate footprints (fewer than 3 distinct points, zero area) are
 * skipped and do not count toward `buildingCount`.
 *
 * Each building sits on the terrain: the base ring is baked at
 * `heightAt(centroid) * verticalScale`, so the one merged mesh needs no
 * per-building transform.
 */
export function buildingsGeometry(
  footprints: BuildingFootprint[],
  projection: Projection,
  verticalScale = 1,
): BuildingsGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  let base = 0;
  let buildingCount = 0;
  let peakHeight = 0;

  for (const fp of footprints) {
    // Project to world metres and drop duplicate consecutive points (OSM rings
    // often repeat the first point at the end, which we handle separately).
    const ring: [number, number][] = [];
    for (const [lon, lat] of fp.coords) {
      const p = projection.toWorld(lat, lon);
      const last = ring[ring.length - 1];
      if (!last || Math.abs(last[0] - p.x) > 1e-6 || Math.abs(last[1] - p.z) > 1e-6) {
        ring.push([p.x, p.z]);
      }
    }
    // Closed ring repeats the first point: drop the duplicate.
    if (ring.length > 1) {
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) {
        ring.pop();
      }
    }
    if (ring.length < 3) continue;

    // Signed area in the XZ plane; normalise to counter-clockwise so the
    // winding below always faces outward/up.
    let area = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const [x0, z0] = ring[i]!;
      const [x1, z1] = ring[(i + 1) % ring.length]!;
      area += x0 * z1 - x1 * z0;
    }
    if (Math.abs(area) < 1e-9) continue;
    if (area < 0) ring.reverse();

    const height = buildingHeight(fp);
    peakHeight = Math.max(peakHeight, height);

    // Centroid for the roof fan and for the ground-height sample.
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    cx /= ring.length;
    cz /= ring.length;
    const groundY = projection.heightAt(cx, cz) * verticalScale;
    const y0 = groundY;
    const y1 = groundY + height;

    // Wall colour: warm grey with a deterministic per-building jitter so a
    // downtown does not read as one flat slab. Roof is the same hue darkened.
    const jitter = (hash01(fp.id) - 0.5) * 0.14;
    const wr = 0.52 + jitter;
    const wg = 0.49 + jitter;
    const wb = 0.44 + jitter;
    const rr = wr * 0.55;
    const rg = wg * 0.55;
    const rb = wb * 0.55;

    const n = ring.length;
    // Walls: one quad per edge. Triangles (B_i, T_i, B_{i+1}) and
    // (B_{i+1}, T_i, T_{i+1}) face outward for a CCW ring (verified by cross
    // product against the right-of-travel direction).
    for (let i = 0; i < n; i += 1) {
      const [x0, z0] = ring[i]!;
      const [x1, z1] = ring[(i + 1) % n]!;
      positions.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0);
      for (let k = 0; k < 4; k += 1) colors.push(wr, wg, wb, 1);
      indices.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
      base += 4;
    }
    // Roof: triangle fan from the centroid. (C, P_{i+1}, P_i) faces up for a
    // CCW ring. No bottom face: it is never visible.
    const centroidIndex = base;
    positions.push(cx, y1, cz);
    colors.push(rr, rg, rb, 1);
    base += 1;
    for (let i = 0; i < n; i += 1) {
      const [x0, z0] = ring[i]!;
      const [x1, z1] = ring[(i + 1) % n]!;
      positions.push(x0, y1, z0, x1, y1, z1);
      colors.push(rr, rg, rb, 1, rr, rg, rb, 1);
      indices.push(centroidIndex, base + 1, base);
      base += 2;
    }

    buildingCount += 1;
  }

  return { positions, indices, colors, buildingCount, peakHeight };
}

/**
 * One merged mesh for a set of real building footprints.
 *
 * Same material recipe as the town clusters: flat white diffuse, no specular,
 * double-sided, vertex colours carrying the actual tint, flat-shaded for the
 * hard-normal art direction. Returns null when nothing valid was emitted, so
 * callers can skip empty neighbourhoods.
 */
export function buildCityBlocks(
  scene: Scene,
  id: string,
  footprints: BuildingFootprint[],
  projection: Projection,
  verticalScale = 1,
): Mesh | null {
  const geometry = buildingsGeometry(footprints, projection, verticalScale);
  if (geometry.buildingCount === 0) return null;

  const material = new StandardMaterial(`city-blocks-${id}-mat`, scene);
  material.diffuseColor.set(1, 1, 1);
  material.specularColor.set(0, 0, 0);
  material.backFaceCulling = false;

  const mesh = new Mesh(`city-blocks-${id}`, scene);
  const data = new VertexData();
  data.positions = geometry.positions;
  data.indices = geometry.indices;
  data.colors = geometry.colors;
  data.applyToMesh(mesh, false);
  mesh.convertToFlatShadedMesh();
  mesh.material = material;
  mesh.useVertexColors = true;
  mesh.metadata = {
    buildingCount: geometry.buildingCount,
    peakHeight: geometry.peakHeight,
  };
  return mesh;
}
