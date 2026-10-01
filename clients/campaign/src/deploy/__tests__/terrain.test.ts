/**
 * Deployment terrain logic: transforms, placement validation, rendering math.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  cellColor,
  cellIndexAt,
  patchToPixel,
  pixelToPatch,
  samplePatch,
  validatePlacement,
} from "../terrain.js";
import type { BattlePatch } from "../types.js";

function makePatch(overrides: Partial<BattlePatch> = {}): BattlePatch {
  const base = samplePatch("test");
  return { ...base, ...overrides };
}

describe("coordinate transforms", () => {
  it("maps patch corners to canvas corners, north up", () => {
    const S = 800;
    // NW corner of the patch (x=-1000 west, y=+1000 north) -> top-left.
    expect(patchToPixel(-1000, 1000, S)).toEqual({ px: 0, py: 0 });
    // SE corner -> bottom-right.
    expect(patchToPixel(1000, -1000, S)).toEqual({ px: S, py: S });
    // Centre -> centre.
    expect(patchToPixel(0, 0, S)).toEqual({ px: S / 2, py: S / 2 });
  });

  it("round-trips pixel -> patch -> pixel", () => {
    const S = 640;
    const pts: [number, number][] = [[0, 0], [320, 200], [639, 639], [100, 511]];
    for (const [px, py] of pts) {
      const { x, y } = pixelToPatch(px, py, S);
      const back = patchToPixel(x, y, S);
      expect(back.px).toBeCloseTo(px, 6);
      expect(back.py).toBeCloseTo(py, 6);
    }
  });

  it("indexes cells row-major with row 0 at the north edge", () => {
    expect(cellIndexAt(-1000, 1000)).toBe(0);
    expect(cellIndexAt(999, -999)).toBe(4095);
    expect(cellIndexAt(0, 0)).toBe(32 * 64 + 32);
  });
});

describe("placement validation", () => {
  const patch = makePatch();

  it("accepts the middle of the attacker deployment zone", () => {
    // Attacker zone: x -500..500, y -950..-650.
    expect(validatePlacement(patch, 0, -800, 30)).toEqual({ ok: true });
  });

  it("rejects positions off the map first", () => {
    expect(validatePlacement(patch, 1500, -800, 30)).toEqual({ ok: false, reason: "off the map" });
  });

  it("rejects positions outside the deployment zone", () => {
    expect(validatePlacement(patch, 0, 0, 30)).toEqual({ ok: false, reason: "outside the deployment zone" });
    // Defender zone is not ours either.
    expect(validatePlacement(patch, 0, 800, 30)).toEqual({ ok: false, reason: "outside the deployment zone" });
  });

  it("rejects water inside the zone", () => {
    const watery = makePatch({
      water_mask: samplePatch("w").water_mask.map((_, i) => i === cellIndexAt(0, -800)),
    });
    expect(validatePlacement(watery, 0, -800, 30)).toEqual({ ok: false, reason: "in water" });
  });

  it("rejects cover footprints inside the zone", () => {
    const blocked = makePatch({
      water_mask: new Array(4096).fill(false),
      cover_objects: [{ type: "building", x: 100, y: -800, height_m: 10, radius_m: 40, rotation_deg: 0 }],
    });
    expect(validatePlacement(blocked, 100, -800, 30)).toEqual({ ok: false, reason: "blocked by cover" });
    // Just outside the footprint + unit radius is fine.
    expect(validatePlacement(blocked, 200, -800, 30)).toEqual({ ok: true });
  });

  it("checks failures in order: map, zone, water, cover", () => {
    // Off-map AND in what would be water: map wins.
    const watery = makePatch({ water_mask: new Array(4096).fill(true) });
    expect(validatePlacement(watery, 5000, 5000, 30).reason).toBe("off the map");
  });
});

describe("terrain colour", () => {
  it("paints water cells blue regardless of elevation", () => {
    const patch = makePatch({ water_mask: new Array(4096).fill(true) });
    expect(cellColor(patch, 0)).toEqual([52, 102, 158]);
    expect(cellColor(patch, 4095)).toEqual([52, 102, 158]);
  });

  it("is deterministic and varies with elevation", () => {
    const patch = samplePatch("det");
    const a = cellColor(patch, 100);
    const b = cellColor(patch, 100);
    expect(a).toEqual(b);
    // Ridge cell vs lowland cell should not shade identically.
    const ridge = cellColor(patch, 20 * 64 + 40);
    const low = cellColor(patch, 50 * 64 + 50);
    expect(ridge).not.toEqual(low);
    for (const c of [...a, ...ridge, ...low]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(255);
    }
  });
});

describe("sample preview patch", () => {
  it("matches the contract shape and is labelled preview", () => {
    const p = samplePatch();
    expect(p.contract_version).toBe(1);
    expect(p.preview).toBe(true);
    expect(p.heightfield).toHaveLength(4096);
    expect(p.water_mask).toHaveLength(4096);
    expect(p.heightfield.every((h) => Number.isFinite(h))).toBe(true);
  });

  it("keeps attacker and defender zones disjoint with the reinforcement edge by the attacker", () => {
    const p = samplePatch();
    const a = p.spawn_zones.attacker;
    const d = p.spawn_zones.defender;
    const overlap = a.x < d.x + d.width_m && d.x < a.x + a.width_m && a.y < d.y + d.height_m && d.y < a.y + a.height_m;
    expect(overlap).toBe(false);
    // Attacker zone sits on the south half; reinforcement edge is south.
    expect(a.y + a.height_m).toBeLessThan(0);
    expect(p.spawn_zones.reinforcement_edge).toBe("south");
  });
});
