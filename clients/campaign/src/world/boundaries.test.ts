/**
 * Loading the region's real settlement outlines.
 *
 * `boundaries.json` is the only geometry the client has for a town's actual shape: it
 * draws towns at a point, and the pipeline's own `place_boundaries` table throws the
 * polygon rings away. So the file is small but load-bearing, and the checks here are about
 * the ways it can be wrong in a way nothing downstream would report:
 *
 *  - **A boundary naming a settlement that is not there.** Both files would be internally
 *    valid and the region would look fine until you tried to join them. This is what a
 *    half-completed region change looks like, and it has happened once already in this
 *    repository with `region.json` and `settlements.json`.
 *  - **A ring that is not closed, or too short to enclose anything.** A tessellator handed
 *    either produces an empty mesh and no message, and an empty mesh is indistinguishable
 *    from a town that has no outline.
 *  - **A multipolygon collapsed to its largest piece.** Columbus is 29 polygons, and 26 of
 *    them are real land the Census Bureau published.
 *  - **The file being absent.** A region deployed before this build has none, and that is a
 *    fact about the data rather than a fault, so the load succeeds with no outlines.
 *
 * The last block reads the deployed files rather than a fixture, so the wire contract and
 * the client cannot drift apart without a test failing.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  projectBoundaries,
  settlementsWithoutBoundaries,
  WorldDataError,
} from "./load.js";
import type {
  BoundariesFile,
  Heightfield,
  PlaceBoundaryFile,
  RegionFile,
  WorldSettlement,
} from "./types.js";
import { makeProjection } from "./load.js";

/** The region's own projection, which needs a heightfield it never reads for boundaries. */
function regionProjection(): {
  projection: ReturnType<typeof makeProjection>;
  region: RegionFile;
} {
  const path = fileURLToPath(new URL("../../public/world/region.json", import.meta.url));
  const region = JSON.parse(readFileSync(path, "utf8")) as RegionFile;
  const heightfield: Heightfield = {
    width: 2,
    height: 2,
    metres: new Float32Array(4),
    resolutionMetres: 30,
    bounds: { ...region.bbox },
  };
  return { projection: makeProjection(region, heightfield), region };
}

function settlement(id: string, name: string, lat: number, lon: number): WorldSettlement {
  return {
    id,
    name,
    place: "city",
    lat,
    lon,
    population: 1000,
    populationSource: "test",
    state: null,
    stateCode: null,
    osmPopulation: null,
  };
}

/** A square ring in lat/lon, closed, and running clockwise. */
function ring(lat: number, lon: number, size = 0.1): [number, number][] {
  return [
    [lat, lon],
    [lat, lon - size],
    [lat - size, lon - size],
    [lat - size, lon],
    [lat, lon],
  ];
}

function entry(overrides: Partial<PlaceBoundaryFile> = {}): PlaceBoundaryFile {
  return {
    placeKey: "39-18000",
    name: "Columbus city",
    displayName: "Columbus",
    sizeClass: "city",
    lsadCode: "25",
    landAreaKm2: 571.6,
    centroid: { lat: 39.96, lon: -83.0 },
    polygonCount: 1,
    ringCount: 1,
    vertexCount: 5,
    polygons: [[ring(39.96, -83.0)]],
    ...overrides,
  };
}

function fileWith(entries: PlaceBoundaryFile[]): BoundariesFile {
  return {
    source: "us-census-carto-place-500k",
    licence: "public domain",
    retrieved: "2026-10-01",
    coordinateOrder: "[lat, lon]",
    ringOrder: "exterior rings clockwise (negative signed area), holes counter-clockwise",
    cartoYear: 2023,
    settlementCount: entries.length,
    polygonCount: 0,
    ringCount: 0,
    vertexCount: 0,
    note: "test",
    boundaries: entries,
  };
}

const COLUMBUS = settlement("39-18000", "Columbus", 39.96, -83.0);
const CINCINNATI = settlement("39-15000", "Cincinnati", 39.1, -84.51);

describe("projecting settlement outlines", () => {
  it("puts every vertex in world metres, on the region's own projection", () => {
    const { projection, region } = regionProjection();
    const [projected] = projectBoundaries(
      fileWith([entry()]),
      [COLUMBUS],
      projection,
    );

    expect(projected?.settlementId).toBe("39-18000");
    expect(projected?.polygonCount).toBe(1);
    expect(projected?.vertexCount).toBe(5);
    // X runs east, Z runs north, and the origin is the region's south-west corner.
    const xs = projected!.polygons[0]![0]!.map((p) => p.x);
    const zs = projected!.polygons[0]![0]!.map((p) => p.z);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(projection.width);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...zs)).toBeLessThanOrEqual(projection.depth);
    // Every vertex finite: a NaN here is what makes a mesh silently disappear.
    for (const p of projected!.polygons[0]![0]!) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
    // And the centroid is the pipeline's own interior point, so it lands where the
    // settlement itself does.
    const expected = projection.toWorld(COLUMBUS.lat, COLUMBUS.lon);
    expect(projected!.centroid.x).toBeCloseTo(expected.x, 3);
    expect(projected!.centroid.z).toBeCloseTo(expected.z, 3);
    expect(region.bbox.east).toBeGreaterThan(region.bbox.west);
  });

  it("keeps every polygon of a multipolygon place", () => {
    // Taking only the largest would delete Columbus's 26 sliver polygons, which is real
    // land the Census Bureau published, not noise to be tidied away.
    const { projection } = regionProjection();
    const polygons = [[ring(39.96, -83.0)], [ring(39.5, -82.5, 0.02)], [ring(40.2, -83.4, 0.01)]];
    const [projected] = projectBoundaries(
      fileWith([entry({ polygonCount: 3, polygons })]),
      [COLUMBUS],
      projection,
    );
    expect(projected?.polygonCount).toBe(3);
    expect(projected?.polygons.length).toBe(3);
    expect(projected?.vertexCount).toBe(15);
  });

  it("keeps a hole as a second ring of the same polygon", () => {
    const { projection } = regionProjection();
    const withHole = [ring(39.96, -83.0), ring(39.96, -83.0, 0.03)];
    const [projected] = projectBoundaries(
      fileWith([entry({ polygonCount: 1, ringCount: 2, vertexCount: 10, polygons: [withHole] })]),
      [COLUMBUS],
      projection,
    );
    expect(projected?.polygons[0]?.length).toBe(2);
  });

  it("falls back to the settlement's own name when the wire omits one", () => {
    const { projection } = regionProjection();
    const [projected] = projectBoundaries(
      fileWith([entry({ name: "", displayName: "" })]),
      [COLUMBUS],
      projection,
    );
    expect(projected?.name).toBe("Columbus");
    expect(projected?.displayName).toBe("Columbus");
  });

  it("treats a missing area or classification as absent rather than zero", () => {
    // A zero area is a claim about the world: it would read as "this town has no land".
    const { projection } = regionProjection();
    const [projected] = projectBoundaries(
      fileWith([entry({ landAreaKm2: null, sizeClass: null, lsadCode: null })]),
      [COLUMBUS],
      projection,
    );
    expect(projected?.landAreaKm2).toBeNull();
    expect(projected?.sizeClass).toBeNull();
    expect(projected?.lsadCode).toBeNull();
  });
});

/**
 * The `WorldDataError` a call raised, or a failure if it did not raise one.
 *
 * `toThrow` matches `error.message`, which is the developer detail. These checks care about
 * two different strings — what a player is told and what a developer is handed — so both
 * are read explicitly rather than pattern-matched against whichever one is the message.
 */
function refuses(fn: () => unknown): WorldDataError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(WorldDataError);
    return err as WorldDataError;
  }
  throw new Error("expected the call to be refused, and it was not");
}

describe("refusing a boundary file that cannot be drawn", () => {
  it("refuses a boundary naming a settlement the region does not ship", () => {
    // The failure this is for: two files deployed from different regions, each internally
    // valid. Nothing else in the client would notice until something tried to join them.
    const { projection } = regionProjection();
    const problem = refuses(() =>
      projectBoundaries(fileWith([entry({ placeKey: "39-99999" })]), [COLUMBUS], projection),
    );
    expect(problem.kind).toBe("decode");
    expect(problem.retryable).toBe(false);
    expect(problem.playerMessage).toMatch(/outlines and its town list disagree/);
    expect(problem.developerDetail).toContain("39-99999");
  });

  it("refuses the same outline listed twice", () => {
    const { projection } = regionProjection();
    const problem = refuses(() =>
      projectBoundaries(fileWith([entry(), entry()]), [COLUMBUS], projection),
    );
    expect(problem.playerMessage).toMatch(/same town outline twice/);
    expect(problem.developerDetail).toContain("39-18000");
  });

  it("refuses a ring that does not close", () => {
    const { projection } = regionProjection();
    const open = ring(39.96, -83.0).slice(0, 4);
    const problem = refuses(() =>
      projectBoundaries(
        fileWith([entry({ polygons: [[open]], vertexCount: 4 })]),
        [COLUMBUS],
        projection,
      ),
    );
    expect(problem.playerMessage).toMatch(/does not close/);
    // The detail names both ends, because "a ring is open" is not enough to find it.
    expect(problem.developerDetail).toMatch(/ending at \[.*\] that starts at \[/);
  });

  it("refuses a ring too short to enclose anything", () => {
    const { projection } = regionProjection();
    const tooShort: [number, number][] = [
      [39.96, -83.0],
      [39.96, -83.1],
    ];
    const problem = refuses(() =>
      projectBoundaries(
        fileWith([entry({ polygons: [[tooShort]], vertexCount: 2 })]),
        [COLUMBUS],
        projection,
      ),
    );
    expect(problem.playerMessage).toMatch(/too short to be a shape/);
    expect(problem.developerDetail).toContain("2 points");
  });

  it("refuses a point with no usable position", () => {
    const { projection } = regionProjection();
    const broken = [...ring(39.96, -83.0)];
    broken[2] = [Number.NaN, -83.1];
    const problem = refuses(() =>
      projectBoundaries(fileWith([entry({ polygons: [[broken]] })]), [COLUMBUS], projection),
    );
    expect(problem.playerMessage).toMatch(/no usable position/);
    expect(problem.developerDetail).toContain("malformed point");
  });

  it("refuses an entry with no polygons at all", () => {
    const { projection } = regionProjection();
    const problem = refuses(() =>
      projectBoundaries(fileWith([entry({ polygons: [] })]), [COLUMBUS], projection),
    );
    expect(problem.playerMessage).toMatch(/no outline in the survey/);
  });

  it("refuses a polygon with no ring in it", () => {
    const { projection } = regionProjection();
    const problem = refuses(() =>
      projectBoundaries(
        fileWith([entry({ polygons: [[]], vertexCount: 0, ringCount: 0 })]),
        [COLUMBUS],
        projection,
      ),
    );
    expect(problem.playerMessage).toMatch(/no shape in it/);
  });

  it("refuses a centroid that is not a position", () => {
    const { projection } = regionProjection();
    const problem = refuses(() =>
      projectBoundaries(
        fileWith([entry({ centroid: { lat: Number.NaN, lon: -83 } })]),
        [COLUMBUS],
        projection,
      ),
    );
    expect(problem.playerMessage).toMatch(/no usable position/);
    expect(problem.developerDetail).toContain("centroid");
  });

  it("refuses a file with no boundaries array at all", () => {
    const { projection } = regionProjection();
    const broken = { ...fileWith([]) } as unknown as BoundariesFile;
    (broken as { boundaries: unknown }).boundaries = "not an array";
    const problem = refuses(() => projectBoundaries(broken, [COLUMBUS], projection));
    expect(problem.playerMessage).toMatch(/outlines in the world survey are damaged/);
    expect(problem.developerDetail).toContain("no boundaries array");
  });
});

describe("settlements with no outline", () => {
  it("reports them rather than inventing a shape", () => {
    const { projection } = regionProjection();
    const boundaries = projectBoundaries(
      fileWith([entry()]),
      [COLUMBUS, CINCINNATI],
      projection,
    );
    const missing = settlementsWithoutBoundaries([COLUMBUS, CINCINNATI], boundaries);
    expect(missing.map((s) => s.name)).toEqual(["Cincinnati"]);
  });

  it("reports nothing when every settlement has one", () => {
    const { projection } = regionProjection();
    const boundaries = projectBoundaries(
      fileWith([entry(), entry({ placeKey: "39-15000", displayName: "Cincinnati" })]),
      [COLUMBUS, CINCINNATI],
      projection,
    );
    expect(settlementsWithoutBoundaries([COLUMBUS, CINCINNATI], boundaries)).toEqual([]);
  });
});

describe("the deployed boundary file", () => {
  const dir = fileURLToPath(new URL("../../public/world/", import.meta.url));

  it("covers every settlement the region ships, and names no others", () => {
    // Read from the deployed directory rather than a fixture, so the wire contract and the
    // loader cannot drift apart. If `boundaries.json` has not been deployed yet this fails
    // loudly rather than quietly testing nothing.
    const boundariesPath = `${dir}boundaries.json`;
    if (!existsSync(boundariesPath)) {
      throw new Error(
        "public/world/boundaries.json is missing. Build it with " +
          "`python tools/build-wire-place-boundaries.py` then `python tools/deploy-wire-to-client.py`.",
      );
    }
    const file = JSON.parse(readFileSync(boundariesPath, "utf8")) as BoundariesFile;
    const shipped = JSON.parse(readFileSync(`${dir}settlements.json`, "utf8")) as {
      settlements: { osmId: string }[];
    };

    const keys = file.boundaries.map((b) => b.placeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(shipped.settlements.map((s) => s.osmId).sort());
    expect(file.settlementCount).toBe(keys.length);
  });

  it("states its own coordinate and ring order, and obeys both", () => {
    const file = JSON.parse(readFileSync(`${dir}boundaries.json`, "utf8")) as BoundariesFile;
    expect(file.coordinateOrder).toBe("[lat, lon]");
    expect(file.ringOrder).toContain("exterior rings clockwise");
    expect(file.cartoYear).toBe(2023);

    // The ring-order claim is the one a renderer would act on without checking, so it is
    // checked against every ring in the file rather than a sample.
    const signed = (r: [number, number][]): number => {
      let total = 0;
      for (let i = 0; i < r.length; i += 1) {
        const [lat1, lon1] = r[i]!;
        const [lat2, lon2] = r[(i + 1) % r.length]!;
        total += lon1 * lat2 - lon2 * lat1;
      }
      return total / 2;
    };
    let exterior = 0;
    let holes = 0;
    for (const entry of file.boundaries) {
      for (const polygon of entry.polygons) {
        expect(polygon.length).toBeGreaterThan(0);
        if (signed(polygon[0]!) >= 0) exterior += 1;
        for (const hole of polygon.slice(1)) if (signed(hole) <= 0) holes += 1;
      }
    }
    expect(exterior).toBe(0);
    expect(holes).toBe(0);
  });

  it("has closed rings of at least four points, and counts that match the geometry", () => {
    // 48,612 vertices, so the checks accumulate and report once rather than asserting per
    // point: a quarter of a million `expect` calls is minutes of test time and says no more.
    const file = JSON.parse(readFileSync(`${dir}boundaries.json`, "utf8")) as BoundariesFile;
    const problems: string[] = [];
    for (const entry of file.boundaries) {
      const rings = entry.polygons.flat();
      if (rings.length !== entry.ringCount) {
        problems.push(`${entry.placeKey}: ringCount ${entry.ringCount}, ${rings.length} rings`);
      }
      const vertices = rings.reduce((n, r) => n + r.length, 0);
      if (vertices !== entry.vertexCount) {
        problems.push(`${entry.placeKey}: vertexCount ${entry.vertexCount}, ${vertices} vertices`);
      }
      if (entry.polygons.length !== entry.polygonCount) {
        problems.push(`${entry.placeKey}: polygonCount ${entry.polygonCount}, ${entry.polygons.length}`);
      }
      for (const ring of rings) {
        if (ring.length < 4) problems.push(`${entry.placeKey}: a ring of ${ring.length} points`);
        if (ring[0]![0] !== ring[ring.length - 1]![0] || ring[0]![1] !== ring[ring.length - 1]![1]) {
          problems.push(`${entry.placeKey}: a ring does not close`);
        }
        // Every point is a real lat/lon in this region, which also confirms the file
        // really is [lat, lon] and not silently the other way round.
        for (const [lat, lon] of ring) {
          if (!(lat > 36 && lat < 42 && lon > -88 && lon < -79)) {
            problems.push(`${entry.placeKey}: point [${lat}, ${lon}] is not in this region`);
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(problems.length).toBe(0);
  }, 60_000);

  it("agrees with settlements.json on where each place is", () => {
    const file = JSON.parse(readFileSync(`${dir}boundaries.json`, "utf8")) as BoundariesFile;
    const shipped = new Map(
      (
        JSON.parse(readFileSync(`${dir}settlements.json`, "utf8")) as {
          settlements: { osmId: string; name: string; lat: number; lon: number }[];
        }
      ).settlements.map((s) => [s.osmId, s]),
    );
    for (const entry of file.boundaries) {
      const settlement = shipped.get(entry.placeKey)!;
      expect(settlement).toBeDefined();
      // Six decimal places of rounding, so a tenth of a millimetre of drift is the most
      // this can show. The two files are produced from the same interior point, so more
      // than that would mean they were built from different sources.
      expect(entry.centroid.lat).toBeCloseTo(settlement.lat, 5);
      expect(entry.centroid.lon).toBeCloseTo(settlement.lon, 5);
      expect(entry.displayName).toBe(settlement.name);
    }
  });
});