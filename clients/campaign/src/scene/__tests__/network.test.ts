/**
 * The road network and the town clusters.
 *
 * Two things here are load-bearing and were previously untested because they could not
 * be reached without a GPU: the ribbon widths and the town silhouettes.
 *
 * `buildTowns` needs a canvas for its marker texture, and Babylon's `DynamicTexture`
 * throws `OffscreenCanvas is not defined` under the null engine. So the silhouette is
 * split out as a pure function of class and real population, and these tests drive that.
 * The ribbons need no canvas, so they are measured on the real mesh.
 */

import { describe, expect, it } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import {
  RAIL_DASH_CYCLE_M,
  RAIL_DASH_ON_RATIO,
  RAIL_WIDTH,
  ROAD_COLOR,
  ROAD_WIDTH,
  buildNetwork,
  buildRouteGraph,
  findRoute,
  silhouetteGeometry,
  townSilhouette,
} from "../network.js";
import { mapColor, tokens, townColor } from "../../design/tokens.js";
import { makeProjection } from "../../world/load.js";
import { metresPerDegreeLat } from "../../world/types.js";
import type {
  Heightfield,
  Projection,
  RegionFile,
  RoadClass,
  RoadWay,
  WorldSettlement,
} from "../../world/types.js";

const region: RegionFile = {
  name: "test",
  bbox: { south: 39.6, west: -105.6, north: 40.1, east: -104.8 },
  elevation: { encoding: "terrarium", formula: "", zoom: 12, tileSize: 256, tiles: [] },
  retrieved: "2026-09-30",
};

function flatHeightfield(): Heightfield {
  return {
    width: 8,
    height: 8,
    metres: new Float32Array(64).fill(1700),
    resolutionMetres: 30,
    bounds: region.bbox,
  };
}

function makeTestProjection(): Projection {
  return makeProjection(region, flatHeightfield());
}

function newScene(): Scene {
  return new Scene(
    new NullEngine({
      renderWidth: 64,
      renderHeight: 64,
      deterministicLockstep: false,
      textureSize: 64,
      lockstepMaxSteps: 4,
    }),
  );
}

/** One straight way along +X, so the ribbon's cross-section is measurable. */
function straightWay(id: string, roadClass: RoadClass): RoadWay {
  return {
    id,
    roadClass,
    name: null,
    ref: null,
    surface: null,
    lanes: null,
    coords: [
      [39.7, -105.2],
      [39.7, -104.9],
    ],
  };
}

/** A way built from a lat/lon list, with the unused OSM fields explicitly null. */
function way(id: string, roadClass: RoadClass, coords: [number, number][]): RoadWay {
  return { id, roadClass, name: null, ref: null, surface: null, lanes: null, coords };
}

/** The perpendicular spread of a ribbon laid along +X, which is its drawn width. */
function measuredWidth(mesh: Mesh): number {
  const positions = mesh.getVerticesData("position")!;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    minZ = Math.min(minZ, positions[i]!);
    maxZ = Math.max(maxZ, positions[i]!);
  }
  return maxZ - minZ;
}

describe("road ribbon widths", () => {
  it("uses the locked screen-legibility widths, not carriageway widths", () => {
    // ART_DIRECTION.md section 7. A real motorway is 3.2 m across; at campaign zoom that
    // is a quarter of a pixel and the network vanishes.
    expect(ROAD_WIDTH.motorway).toBe(34);
    expect(ROAD_WIDTH.trunk).toBe(34);
    expect(ROAD_WIDTH.primary).toBe(26);
    expect(ROAD_WIDTH.secondary).toBe(15);
    expect(RAIL_WIDTH).toBe(9);
  });

  it("keeps class ordered by weight, motorway down to rail", () => {
    expect(ROAD_WIDTH.motorway).toBeGreaterThan(ROAD_WIDTH.primary);
    expect(ROAD_WIDTH.primary).toBeGreaterThan(ROAD_WIDTH.secondary);
    expect(ROAD_WIDTH.secondary).toBeGreaterThan(RAIL_WIDTH);
  });

  it("draws each class at its own width on the mesh, not just in the table", () => {
    // The table is only worth having if the geometry reads it. Measured off the mesh.
    const scene = newScene();
    const projection = makeTestProjection();
    const classes: RoadClass[] = ["motorway", "trunk", "primary", "secondary"];
    const net = buildNetwork(
      scene,
      classes.map((c) => straightWay(`w-${c}`, c)),
      [],
      projection,
      1.6,
    );
    expect(net.roads.length).toBe(classes.length);
    for (const roadClass of classes) {
      const mesh = net.roads.find((m) => m.name === `road-${roadClass}`);
      expect(mesh, `no mesh for ${roadClass}`).toBeDefined();
      expect(measuredWidth(mesh!), `${roadClass} ribbon width`).toBeCloseTo(ROAD_WIDTH[roadClass], 3);
    }
  });

  it("carries road class by weight and value, never by hue", () => {
    // Reference R3. Three classes share the major-road value and the fourth takes the
    // minor value; if class were carried by hue there would be a colour per class.
    expect(ROAD_COLOR.motorway).toBe(mapColor.roadMajor);
    expect(ROAD_COLOR.trunk).toBe(mapColor.roadMajor);
    expect(ROAD_COLOR.primary).toBe(mapColor.roadMajor);
    expect(ROAD_COLOR.secondary).toBe(mapColor.roadMinor);
    // Rail is its own value again, lighter than both.
    expect(mapColor.rail).not.toBe(mapColor.roadMajor);
    expect(mapColor.rail).not.toBe(mapColor.roadMinor);
    // And the values are distinct enough to read as different inks.
    const lum = (hex: string): number => Color3.FromHexString(hex).r;
    expect(lum(mapColor.roadMajor)).toBeLessThan(lum(mapColor.roadMinor));
    expect(lum(mapColor.roadMinor)).toBeLessThan(lum(mapColor.rail));
  });
});

describe("the rail sleeper-dash", () => {
  it("dashes along its length rather than by vertex count", () => {
    // 40 short segments, about 8 km. A dash that followed segment index rather than
    // distance would alternate on every node and read as a solid line with holes.
    const coords: [number, number][] = [];
    for (let i = 0; i <= 40; i += 1) coords.push([39.7 + i * 0.0018, -105.2]);

    const scene = newScene();
    const net = buildNetwork(scene, [], [{ id: "r1", name: null, coords }], makeTestProjection(), 1.6);
    expect(net.rail).not.toBeNull();
    // Four vertices per drawn segment, so vertex count tells us how many drew.
    const drawn = net.rail!.getTotalVertices() / 4;
    expect(drawn).toBeLessThan(40);
    // Roughly the on-ratio, give or take where the segment midpoints land in the cycle.
    expect(drawn).toBeGreaterThan(40 * RAIL_DASH_ON_RATIO * 0.5);
    expect(drawn).toBeLessThanOrEqual(40 * RAIL_DASH_ON_RATIO + 6);
    // The cycle has to be longer than one segment or there is nothing to dash between.
    const segmentLength = 0.0018 * metresPerDegreeLat();
    expect(segmentLength, `a segment is ${segmentLength.toFixed(0)} m`).toBeLessThan(RAIL_DASH_CYCLE_M);
  });

  it("keeps the dash phase across way boundaries", () => {
    // The same line, once as one way and once split in two at the midpoint. If the
    // phase reset per way, the split version would restart its sleeper rhythm at the
    // seam and draw a different number of segments.
    const whole: [number, number][] = [];
    for (let i = 0; i <= 40; i += 1) whole.push([39.7 + i * 0.0018, -105.2]);
    const first = whole.slice(0, 21);
    const second = whole.slice(20);

    const scene = newScene();
    const single = buildNetwork(scene, [], [{ id: "a", name: null, coords: whole }], makeTestProjection(), 1.6);
    const split = buildNetwork(
      scene,
      [],
      [
        { id: "a", name: null, coords: first },
        { id: "b", name: null, coords: second },
      ],
      makeTestProjection(),
      1.6,
    );
    expect(split.rail!.getTotalVertices()).toBe(single.rail!.getTotalVertices());
  });

  it("draws rail at the locked width", () => {
    const scene = newScene();
    const net = buildNetwork(
      scene,
      [],
      [{ id: "r1", name: null, coords: [[39.7, -105.2], [39.7, -105.15]] }],
      makeTestProjection(),
      1.6,
    );
    expect(net.rail).not.toBeNull();
    expect(measuredWidth(net.rail!)).toBeCloseTo(RAIL_WIDTH, 3);
  });
});

describe("town classification drives the silhouette", () => {
  it("counts buildings in the locked bands, from the real population", () => {
    // ART_DIRECTION.md section 7: city 18–34, town 8–16, village 3–6.
    const city = townSilhouette("city", 715_513);
    const town = townSilhouette("town", 25_000);
    const village = townSilhouette("village", 1_470);
    for (const [label, s] of [["city", city], ["town", town], ["village", village]] as const) {
      const band = tokens.townClass[s.klass];
      expect(s.blockCount, `${label} has ${s.blockCount} buildings`).toBeGreaterThanOrEqual(band.minHeight);
      expect(s.blockCount, `${label} has ${s.blockCount} buildings`).toBeLessThanOrEqual(band.maxHeight);
    }
  });

  it("grows the cluster with population, not with the OSM place tag", () => {
    // Longmont is a town and Boulder is a city, but the band comes from the Census
    // figure, which is what the section 7 table is written against.
    const small = townSilhouette("city", 100_000);
    const large = townSilhouette("city", 700_000);
    expect(large.blockCount).toBeGreaterThan(small.blockCount);
    expect(large.radius).toBeGreaterThan(small.radius);
    expect(large.meanHeight).toBeGreaterThan(small.meanHeight);
  });

  it("gives an unknown population the smallest silhouette and no invented count", () => {
    // Eleven of the 48 mapped places have no Census figure. They are not zero people,
    // they are an unknown count, and CONSTITUTION.md section 1.1 forbids substituting a
    // number for a missing one.
    const unknown = townSilhouette("village", null);
    const known = townSilhouette("village", 400);
    expect(unknown.blockCount).toBeLessThanOrEqual(known.blockCount);
    expect(unknown.radius).toBeLessThanOrEqual(known.radius);
    expect(unknown.towerHeight).toBeNull();
  });

  it("raises the tower at the locked ratio, and gives a village none", () => {
    expect(townSilhouette("city", 700_000).towerHeight).toBeCloseTo(
      townSilhouette("city", 700_000).meanHeight * 2.2,
      6,
    );
    expect(townSilhouette("town", 40_000).towerHeight).toBeCloseTo(
      townSilhouette("town", 40_000).meanHeight * 1.6,
      6,
    );
    expect(townSilhouette("village", 900).towerHeight).toBeNull();
  });

  it("puts a town on a street grid and leaves a city as sprawl", () => {
    expect(townSilhouette("town", 40_000).streetGrid).toBe(true);
    expect(townSilhouette("city", 700_000).streetGrid).toBe(false);
    expect(townSilhouette("village", 900).streetGrid).toBe(false);
  });

  it("gives a village its single pitched roof", () => {
    expect(townSilhouette("village", 900).pitchedRoof).toBe(true);
    expect(townSilhouette("town", 40_000).pitchedRoof).toBe(false);
  });
});

describe("town cluster geometry", () => {
  it("emits geometry for every building it claims", () => {
    const spec = townSilhouette("city", 715_513);
    const geometry = silhouetteGeometry(spec, "Denver");
    expect(geometry.positions.length).toBeGreaterThan(0);
    expect(geometry.indices.length).toBeGreaterThan(0);
    // Positions are three floats per vertex, colours four, so the counts differ by that
    // ratio and not at all.
    expect(geometry.positions.length % 3).toBe(0);
    expect(geometry.colors.length).toBe((geometry.positions.length / 3) * 4);
    // Every index lands inside the position buffer.
    const vertices = geometry.positions.length / 3;
    for (const i of geometry.indices) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(vertices);
    }
  });

  it("stays under the locked palette, with no invented colours", () => {
    const allowed = new Set(
      [townColor.cityWall, townColor.townWall, townColor.villageWall, townColor.cityRoof, townColor.townRoof, townColor.silo].map(
        (hex) => Color3.FromHexString(hex).toHexString(),
      ),
    );
    for (const klass of ["city", "town", "village"] as const) {
      const geometry = silhouetteGeometry(townSilhouette(klass, 50_000), `probe-${klass}`);
      for (let i = 0; i < geometry.colors.length; i += 4) {
        const hex = new Color3(
          geometry.colors[i]!,
          geometry.colors[i + 1]!,
          geometry.colors[i + 2]!,
        ).toHexString();
        expect(allowed.has(hex), `${klass} used an off-palette colour ${hex}`).toBe(true);
        expect(geometry.colors[i + 3]).toBe(1);
      }
    }
  });

  it("puts the city's tower above the mean block height", () => {
    const spec = townSilhouette("city", 715_513);
    const geometry = silhouetteGeometry(spec, "Denver");
    let tallest = 0;
    for (let i = 1; i < geometry.positions.length; i += 3) {
      tallest = Math.max(tallest, geometry.positions[i]!);
    }
    expect(geometry.peakHeight).toBe(tallest);
    // The tower plus its mast, so it clears the 2.2x ratio rather than sitting on it.
    expect(tallest).toBeGreaterThan(spec.meanHeight * 2.2);
  });

  it("is deterministic, so a town looks the same every session", () => {
    const a = silhouetteGeometry(townSilhouette("town", 40_000), "Longmont");
    const b = silhouetteGeometry(townSilhouette("town", 40_000), "Longmont");
    expect(a.positions).toEqual(b.positions);
    expect(a.colors).toEqual(b.colors);
  });

  it("makes two settlements of the same class differ, so the map is not a stamp", () => {
    const a = silhouetteGeometry(townSilhouette("town", 40_000), "Longmont");
    const b = silhouetteGeometry(townSilhouette("town", 40_000), "Boulder");
    expect(a.positions).not.toEqual(b.positions);
  });
});

describe("the route graph", () => {
  const roads: RoadWay[] = [
    way("a", "trunk", [
      [39.7, -105.2],
      [39.7, -105.1],
    ]),
    way("b", "primary", [
      [39.7, -105.1],
      [39.7, -105.0],
    ]),
    way("c", "secondary", [
      [39.75, -105.1],
      [39.7, -105.1],
    ]),
  ];
  const settlement = (id: string, name: string, lat: number, lon: number): WorldSettlement => ({
    id,
    name,
    place: "town",
    lat,
    lon,
    population: 40_000,
    populationSource: "test",
    state: "Colorado",
    stateCode: "CO",
    osmPopulation: null,
  });

  it("connects settlements over the real road polylines", () => {
    const projection = makeTestProjection();
    const settlements = [settlement("1", "West", 39.7, -105.2), settlement("2", "East", 39.7, -105.0)];
    const graph = buildRouteGraph(roads, settlements, projection);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.nodeForSettlement.has("1")).toBe(true);
    expect(graph.nodeForSettlement.has("2")).toBe(true);

    const route = findRoute(graph, "1", "2");
    expect(route.found).toBe(true);
    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.nodePath.length).toBeGreaterThanOrEqual(2);
  });

  it("reports no route rather than a straight line when nothing is surveyed", () => {
    // ART_DIRECTION.md section 10.2 has the copy for this case, so the search has to be
    // able to return it.
    const projection = makeTestProjection();
    const settlements = [settlement("1", "West", 39.7, -105.2), settlement("3", "Nowhere", 39.95, -104.85)];
    const graph = buildRouteGraph(roads, settlements, projection);
    const route = findRoute(graph, "1", "3");
    expect(route.found).toBe(false);
    expect(route.distanceKm).toBe(0);
    expect(route.weakestClass).toBeNull();
  });

  it("reports the weakest class on the route, which is what sets the danger", () => {
    const projection = makeTestProjection();
    const settlements = [settlement("1", "West", 39.7, -105.2), settlement("2", "East", 39.7, -105.0)];
    const graph = buildRouteGraph(roads, settlements, projection);
    // The trunk and the primary reach East, so the weakest of the two is the primary.
    expect(findRoute(graph, "1", "2").weakestClass).toBe("primary");
  });
});