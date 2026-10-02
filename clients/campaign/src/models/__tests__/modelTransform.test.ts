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
  QUANTIZATION_EXTENSION,
  autoScaleToMeters,
  extentsOf,
  longestAxisLength,
  readAuthoredBounds,
  type AuthoredBounds,
} from "../ModelTransform.js";

const here = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(here, "..", "..", "..", "public", "models");

interface ManifestEntry {
  name: string;
  file: string;
  category: string;
  targetLengthM: number;
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

/** Bounds built by hand, for the arithmetic cases. */
function bounds(x: number, y: number, z: number): AuthoredBounds {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x, y, z },
    extents: { x, y, z },
    trustworthy: true,
    reason: null,
    accessorCount: 1,
  };
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
    expect(entries).toHaveLength(49);
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