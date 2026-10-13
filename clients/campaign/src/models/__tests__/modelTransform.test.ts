/**
 * Task 614: a model is scaled from its authored units to metres, and the scale
 * is decided from the bytes of the GLB rather than from a guess.
 *
 * The manifest's `targetLengthM` is checked against the POSITION accessor
 * bounds of every one of the 49 staged models, so a target that does not match
 * the geometry is a failing test instead of a model the wrong size in the
 * field. The boundary cases are pinned too: quantised positions report integer
 * grid indices rather than units, so a model in that form is refused rather
 * than scaled -- `tank-quaternius.glb` really does report bounds near 65534
 * units, and scaling by them would put a tank 65 km long.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  IMPLAUSIBLE_EXTENT,
  PIVOT_EPSILON_M,
  QUANTIZATION_EXTENSION,
  autoScaleToMeters,
  baseYOffset,
  boundsAfterCentring,
  centredPivotOffset,
  describeUprightness,
  extentsOf,
  longestAxisLength,
  longestAxisOf,
  readAuthoredBounds,
  rotatedExtentsAroundX,
  upAxisRotationFor,
  type AuthoredBounds,
} from "../ModelTransform.js";

const here = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(here, "..", "..", "..", "public", "models");

interface ManifestEntry {
  name: string;
  file: string;
  category: string;
  targetLengthM: number;
  rotateX?: number;
  estimated?: boolean;
}

function manifest(): ManifestEntry[] {
  const json = JSON.parse(
    readFileSync(join(modelsDir, "models.manifest.json"), "utf8"),
  ) as { models: ManifestEntry[] };
  return json.models;
}

function boundsOf(file: string): AuthoredBounds {
  return readAuthoredBounds(readFileSync(join(modelsDir, file)));
}

/** Bounds built by hand from an origin and a far corner. */
function corners(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): AuthoredBounds {
  const min = { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) };
  const max = { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) };
  return {
    min,
    max,
    extents: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    trustworthy: true,
    reason: null,
    accessorCount: 1,
  };
}

/** Bounds built by hand from an origin at zero, for the arithmetic cases. */
function bounds(x: number, y: number, z: number): AuthoredBounds {
  return corners(0, 0, 0, x, y, z);
}

describe("readAuthoredBounds (task 614)", () => {
  it("reads the POSITION accessor bounds out of a staged model", () => {
    const troop = boundsOf("troop-gunner.glb");
    expect(troop.accessorCount).toBeGreaterThan(0);
    expect(troop.trustworthy).toBe(true);
    expect(troop.reason).toBeNull();
    // Roughly a metre tall in its authored units, as the pack shipped it.
    expect(troop.extents.y).toBeGreaterThan(0.5);
    expect(troop.extents.y).toBeLessThan(2);
  });

  it("takes the union across every accessor that carries bounds", () => {
    const truck = boundsOf("humvee.glb");
    expect(truck.min.x).toBeLessThan(truck.max.x);
    expect(longestAxisLength(truck)).toBeCloseTo(Math.max(...Object.values(truck.extents)), 5);
    expect(extentsOf(truck)).toEqual(truck.extents);
  });

  it("returns nothing usable for bytes that are not a GLB", () => {
    const junk = readAuthoredBounds(new TextEncoder().encode('<!DOCTYPE html>'));
    expect(junk.accessorCount).toBe(0);
    expect(junk.trustworthy).toBe(false);
    expect(autoScaleToMeters(junk, 10).reason).toBe('no-accessor-bounds');
  });
});

describe("autoScaleToMeters (task 614)", () => {
  it("scales the longest axis to the target", () => {
    expect(autoScaleToMeters(bounds(1, 0.4, 0.5), 6).scale).toBeCloseTo(6);
    expect(autoScaleToMeters(bounds(1, 0.4, 0.5), 6).scaledLengthM).toBeCloseTo(6);
  });

  it("measures on whichever axis is longest", () => {
    const longInZ = bounds(0.3, 0.2, 4);
    expect(autoScaleToMeters(longInZ, 8).scale).toBeCloseTo(2);
    const longInY = bounds(0.3, 2, 0.4);
    expect(autoScaleToMeters(longInY, 8).scale).toBeCloseTo(4);
  });

  it("refuses bounds that are quantised grid indices", () => {
    const quantized: AuthoredBounds = {
      ...bounds(65_534, 46_468, 21_618),
      trustworthy: false,
      reason: 'quantized-positions',
    };
    const verdict = autoScaleToMeters(quantized, 7);
    expect(verdict.scale).toBeNull();
    expect(verdict.scaledLengthM).toBeNull();
    expect(verdict.reason).toBe('quantized-positions');
  });

  it("refuses an implausible extent even without the extension flag", () => {
    const bogus = bounds(0, 0, IMPLAUSIBLE_EXTENT + 1);
    expect(autoScaleToMeters(bogus, 5).reason).toBe('implausible-extent');
    expect(autoScaleToMeters(bounds(0, 0, IMPLAUSIBLE_EXTENT), 5).scale).toBeCloseTo(5 / IMPLAUSIBLE_EXTENT);
  });

  it("refuses a target of zero or a model with no extent", () => {
    expect(autoScaleToMeters(bounds(1, 1, 1), 0).reason).toBe('degenerate-target');
    expect(autoScaleToMeters(bounds(1, 1, 1), -3).reason).toBe('degenerate-target');
    expect(autoScaleToMeters(bounds(0, 0, 0), 5).reason).toBe('degenerate-target');
  });
});

describe("the staged batch against its manifest (task 614)", () => {
  const entries = manifest();

  it("has the manifest to check", () => {
    expect(entries).toHaveLength(461);
  });

  it("scales every trustworthy model to its target length", () => {
    const wrong: string[] = [];
    const refused: string[] = [];
    for (const entry of entries) {
      const verdict = autoScaleToMeters(boundsOf(entry.file), entry.targetLengthM);
      if (verdict.scale === null) {
        refused.push(`${entry.name}: ${verdict.reason}`);
        continue;
      }
      const scaled = verdict.scaledLengthM ?? Number.NaN;
      if (Math.abs(scaled - entry.targetLengthM) > 1e-9) {
        wrong.push(`${entry.name}: ${scaled} m vs target ${entry.targetLengthM}`);
      }
    }
    expect(wrong).toEqual([]);
    // The quantized tank is the only file allowed to be refused, and it must be
    // refused for the documented reason rather than silently scaled.
    expect(refused).toEqual(['tank-quaternius: quantized-positions']);
  });

  it("names the quantization extension the refused file actually uses", () => {
    const json = JSON.parse(
      (() => {
        const bytes = readFileSync(join(modelsDir, 'tank-quaternius.glb'));
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const chunkLength = view.getUint32(12, true);
        return new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength));
      })(),
    ) as { extensionsUsed?: string[]; extensionsRequired?: string[] };
    expect([
      ...(json.extensionsUsed ?? []),
      ...(json.extensionsRequired ?? []),
    ]).toContain(QUANTIZATION_EXTENSION);
  });

  it("gives every troop model a scale that puts it near human height", () => {
    const troops = entries.filter((e) => e.category === 'troop');
    expect(troops.length).toBeGreaterThanOrEqual(15);
    for (const entry of troops) {
      const verdict = autoScaleToMeters(boundsOf(entry.file), entry.targetLengthM);
      expect(verdict.scale, entry.name).not.toBeNull();
      expect(entry.targetLengthM).toBeGreaterThan(1.5);
      expect(entry.targetLengthM).toBeLessThan(2);
    }
  });

  it("scales every weapon to a hand-held length", () => {
    const weapons = entries.filter((e) => e.file.startsWith('weapons/'));
    expect(weapons.length).toBe(10);
    for (const entry of weapons) {
      const verdict = autoScaleToMeters(boundsOf(entry.file), entry.targetLengthM);
      expect(verdict.scale, entry.name).not.toBeNull();
      expect(entry.targetLengthM).toBeGreaterThan(0.15);
      expect(entry.targetLengthM).toBeLessThan(1.3);
    }
  });
});
describe("up-axis correction (task 615)", () => {
  it("rotates extents about X, swapping Y and Z on a quarter turn", () => {
    const flat = { x: 0.63, y: 0.44, z: 1 };
    const stood = rotatedExtentsAroundX(flat, -Math.PI / 2);
    expect(stood.x).toBeCloseTo(0.63);
    expect(stood.y).toBeCloseTo(1);
    expect(stood.z).toBeCloseTo(0.44);
    // A zero rotation changes nothing, and a bad angle is passed through.
    expect(rotatedExtentsAroundX(flat, 0)).toEqual(flat);
    expect(rotatedExtentsAroundX(flat, Number.NaN)).toEqual(flat);
  });

  it("names the longest axis, ties resolving in order", () => {
    const b = bounds(2, 2, 1);
    expect(longestAxisOf(b)).toBe('x');
    expect(longestAxisOf(bounds(1, 2, 2))).toBe('y');
    expect(longestAxisOf(bounds(1, 3, 2))).toBe('y');
    expect(longestAxisOf(bounds(1, 1, 3))).toBe('z');
  });

  it("uses the staging note for the rotation, not the geometry", () => {
    const officer = boundsOf('troop-officer.glb');
    expect(upAxisRotationFor({ name: 'troop-officer', rotateX: -Math.PI / 2 }, officer)).toBeCloseTo(
      -Math.PI / 2,
    );
    expect(upAxisRotationFor({ name: 'humvee' }, officer)).toBe(0);
  });

  it("refuses to guess an orientation for a quantised file", () => {
    const tank = boundsOf('tank-quaternius.glb');
    expect(tank.trustworthy).toBe(false);
    expect(upAxisRotationFor({ name: 'tank-quaternius', rotateX: -Math.PI / 2 }, tank)).toBe(0);
  });

  it("ignores a non-finite rotation from a bad manifest entry", () => {
    expect(upAxisRotationFor({ name: 'x', rotateX: Number.NaN }, bounds(1, 2, 3))).toBe(0);
  });

  it("reads the real staging note: one rotation, and it fixes the model", () => {
    const entries = manifest();
    const rotated = entries.filter((e) => e.rotateX !== undefined);
    expect(rotated.map((e) => e.name)).toEqual(['troop-officer']);

    const officer = boundsOf('troop-officer.glb');
    expect(describeUprightness(officer)).toBe('lying-down');
    const stood = rotatedExtentsAroundX(officer.extents, -Math.PI / 2);
    expect(longestAxisOf({ min: { x: 0, y: 0, z: 0 }, max: stood })).toBe('y');
    expect(stood.y).toBeCloseTo(1.0, 2);
  });

  it("would misfire a geometry-only rule, so the staging note stays authoritative", () => {
    // These are all long in X or Z and all correct as authored: a vehicle's
    // length runs along the ground, and sniper.glb is a prone figure.
    const vehicles = ['humvee', 'apc', 'tank', 'helicopter', 'patrol-boat'];
    for (const name of vehicles) {
      expect(describeUprightness(boundsOf(`${name}.glb`)), name).toBe('lying-down');
      expect(upAxisRotationFor({ name }, boundsOf(`${name}.glb`)), name).toBe(0);
    }
    // sniper.glb is authored lying down on purpose: 1.00 long, 0.04 tall.
    const sniper = boundsOf('sniper.glb');
    expect(sniper.extents.y).toBeLessThan(0.1);
    expect(upAxisRotationFor({ name: 'sniper' }, sniper)).toBe(0);
  });

  it("calls a file with no usable bounds upright rather than guessing", () => {
    expect(describeUprightness(readAuthoredBounds(new Uint8Array(4)))).toBe('upright');
  });
});

describe("centred pivot (task 626)", () => {
  it("moves the origin to the middle of the bounds", () => {
    const built = corners(0, 0, 0, 2, 4, 6);
    expect(centredPivotOffset(built)).toEqual({
      offset: { x: -1, y: -2, z: -3 },
      needed: true,
      extents: { x: 2, y: 4, z: 6 },
    });
  });

  it("applies the task 614 scale to the offset, not just to the extents", () => {
    const built = corners(0, 0, 0, 1, 1, 1);
    // A model authored at 1 m per unit, scaled to 1.8 m: the offset is 0.9 m.
    expect(centredPivotOffset(built, 1.8).offset).toEqual({ x: -0.9, y: -0.9, z: -0.9 });
    expect(centredPivotOffset(built, 1.8).extents.x).toBeCloseTo(1.8);
  });

  it("does nothing for a model that is already centred", () => {
    const centred = corners(-1, -1, -1, 1, 1, 1);
    const correction = centredPivotOffset(centred);
    expect(correction.offset).toEqual({ x: 0, y: 0, z: 0 });
    expect(correction.needed).toBe(false);
  });

  it("ignores a sub-centimetre offset instead of drifting the model", () => {
    const nearly = corners(-0.004, -0.004, -0.004, 0.004, 0.004, 0.004);
    expect(centredPivotOffset(nearly).needed).toBe(false);
    expect(PIVOT_EPSILON_M).toBe(0.01);
  });

  it("is idempotent: centring twice does not move it again", () => {
    const built = corners(0, 0, 0, 2, 4, 6);
    const once = boundsAfterCentring(built);
    const twice = boundsAfterCentring(once);
    expect(twice.min.x).toBeCloseTo(once.min.x);
    expect(twice.min.y).toBeCloseTo(once.min.y);
    expect(twice.max.z).toBeCloseTo(once.max.z);
  });

  it("really does put the centre on the origin", () => {
    const built = corners(3, 0, -5, 9, 8, 1);
    const centred = boundsAfterCentring(built);
    expect((centred.min.x + centred.max.x) / 2).toBeCloseTo(0);
    expect((centred.min.y + centred.max.y) / 2).toBeCloseTo(0);
    expect((centred.min.z + centred.max.z) / 2).toBeCloseTo(0);
  });

  it("re-centres a staged model and keeps its size", () => {
    const officer = boundsOf('troop-officer.glb');
    const scale = autoScaleToMeters(officer, 1.8).scale as number;
    const before = extentsOf(officer);
    const correction = centredPivotOffset(officer, scale);
    expect(correction.needed).toBe(true);
    expect(correction.extents.x).toBeCloseTo(before.x * scale);
    // Re-centred, the officer's bounds centre is on the origin -- which is the
    // property that matters, rather than the sign of the vertical offset: this
    // model is authored 0.0001 m below the ground plane, so its centre lands
    // fractionally above zero.
    const centred = boundsAfterCentring(officer, scale);
    expect((centred.min.y + centred.max.y) / 2).toBeCloseTo(0, 6);
    expect(correction.offset.y).toBeLessThan(0.01);
    // The officer is authored lying along Z, so its geometry straddles the
    // origin and it needs a lift before centring too -- by exactly half its
    // scaled height. After centring the lift is the same half-height, because
    // the origin is then the middle and the base is half a model below it.
    // 4 digits: the officer's bounds are not perfectly symmetric about the
    // origin (0.0001 m of it), and that asymmetry is the point being measured.
    expect(baseYOffset(officer, scale)).toBeCloseTo(officer.extents.y * scale * 0.5, 4);
    expect(baseYOffset(centred, scale)).toBeCloseTo(correction.extents.y * 0.5, 6);
    expect(baseYOffset(centred, scale)).toBeGreaterThan(0.3);
  });

  it("puts a ground-standing model's base back at zero", () => {
    const gunner = boundsOf('troop-gunner.glb');
    const scale = autoScaleToMeters(gunner, 1.8).scale as number;
    expect(baseYOffset(gunner, scale)).toBeGreaterThan(0);
    expect(baseYOffset({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 2, z: 1 } })).toBe(0);
  });

  it("rejects a broken scale rather than producing NaN metres", () => {
    const built = corners(0, 0, 0, 2, 2, 2);
    for (const bad of [0, -1, Number.NaN]) {
      expect(centredPivotOffset(built, bad).offset.x).toBeCloseTo(-1);
      expect(Number.isNaN(baseYOffset(built, bad))).toBe(false);
    }
  });

  it("handles bounds given in the other order", () => {
    const inverted = { min: { x: 2, y: 4, z: 6 }, max: { x: 0, y: 0, z: 0 } };
    expect(centredPivotOffset(inverted).offset).toEqual({ x: -1, y: -2, z: -3 });
    expect(baseYOffset(inverted)).toBe(-4);
  });
});
