/**
 * Pure deployment-map logic: coordinate transforms, terrain rendering math,
 * and placement validation. No DOM here — the view in `DeploymentMap.ts`
 * calls these. Everything is deterministic and unit-tested.
 */

import {
  PATCH_CELLS,
  PATCH_RES,
  PATCH_SIZE_M,
  type BattlePatch,
  type Biome,
  type CoverObject,
  type InvalidReason,
  type SpawnRect,
  type ValidationResult,
} from "./types.js";

/** Patch-local metres -> canvas pixel. North is up (row 0 = canvas top). */
export function patchToPixel(x: number, y: number, size: number): { px: number; py: number } {
  return {
    px: ((x + PATCH_SIZE_M / 2) / PATCH_SIZE_M) * size,
    py: ((PATCH_SIZE_M / 2 - y) / PATCH_SIZE_M) * size,
  };
}

/** Canvas pixel -> patch-local metres. */
export function pixelToPatch(px: number, py: number, size: number): { x: number; y: number } {
  return {
    x: (px / size) * PATCH_SIZE_M - PATCH_SIZE_M / 2,
    y: PATCH_SIZE_M / 2 - (py / size) * PATCH_SIZE_M,
  };
}

/** Heightfield cell index for a patch-local position. Clamped into range. */
export function cellIndexAt(x: number, y: number): number {
  const col = Math.max(0, Math.min(PATCH_RES - 1, Math.floor(((x + PATCH_SIZE_M / 2) / PATCH_SIZE_M) * PATCH_RES)));
  // Row 0 is the north edge; north = +y.
  const row = Math.max(0, Math.min(PATCH_RES - 1, Math.floor(((PATCH_SIZE_M / 2 - y) / PATCH_SIZE_M) * PATCH_RES)));
  return row * PATCH_RES + col;
}

export function inRect(x: number, y: number, r: SpawnRect): boolean {
  return x >= r.x && x <= r.x + r.width_m && y >= r.y && y <= r.y + r.height_m;
}

function coverAt(patch: BattlePatch, x: number, y: number, unitRadius: number): CoverObject | null {
  for (const c of patch.cover_objects) {
    const dx = x - c.x;
    const dy = y - c.y;
    if (Math.hypot(dx, dy) < c.radius_m + unitRadius) return c;
  }
  return null;
}

/**
 * Is (x, y) a legal placement for a unit of the given footprint radius?
 * Order of checks is deliberate: the reason reported is the first failure,
 * from most basic (off the map) to most specific (blocked by cover).
 */
export function validatePlacement(
  patch: BattlePatch,
  x: number,
  y: number,
  unitRadius: number,
): ValidationResult {
  const half = PATCH_SIZE_M / 2;
  if (x < -half || x > half || y < -half || y > half) {
    return { ok: false, reason: "off the map" };
  }
  if (!inRect(x, y, patch.spawn_zones.attacker)) {
    const reason: InvalidReason = "outside the deployment zone";
    return { ok: false, reason };
  }
  if (patch.water_mask[cellIndexAt(x, y)]) {
    return { ok: false, reason: "in water" };
  }
  if (coverAt(patch, x, y, unitRadius)) {
    return { ok: false, reason: "blocked by cover" };
  }
  return { ok: true };
}

// -- terrain colour -----------------------------------------------------------

const BIOME_TINT: Record<Biome, [number, number, number]> = {
  city: [176, 176, 178],
  forest: [74, 124, 72],
  plains: [126, 148, 88],
  snow: [232, 236, 240],
  river: [96, 138, 150],
  desert: [216, 186, 128],
  hills: [128, 132, 96],
  swamp: [88, 118, 96],
  coastal: [150, 168, 150],
  industrial: [150, 148, 142],
};

/**
 * Hillshaded terrain colour for one cell, as [r, g, b].
 * Light comes from the north-west; steeper sun-facing slopes are brighter.
 * Deterministic — the same patch always renders the same map.
 */
export function cellColor(patch: BattlePatch, index: number): [number, number, number] {
  if (patch.water_mask[index]) return [52, 102, 158];
  const row = Math.floor(index / PATCH_RES);
  const col = index % PATCH_RES;
  const at = (r: number, c: number): number => {
    const rr = Math.max(0, Math.min(PATCH_RES - 1, r));
    const cc = Math.max(0, Math.min(PATCH_RES - 1, c));
    return patch.heightfield[rr * PATCH_RES + cc] ?? 0;
  };
  const h = patch.heightfield[index] ?? 0;
  // Central differences, metres of elevation per cell.
  const dzdx = (at(row, col + 1) - at(row, col - 1)) / 2;
  const dzdy = (at(row + 1, col) - at(row - 1, col)) / 2; // +row = south
  // Surface normal, then Lambert with a NW light.
  const inv = 1 / Math.hypot(dzdx, dzdy, 1);
  const nx = -dzdx * inv;
  const ny = dzdy * inv; // north-facing slopes catch the NW light
  const nz = inv;
  const light = Math.max(0, (nx * -0.5 + ny * 0.5 + nz * 0.7071) / 1.2071);
  const shade = 0.45 + 0.55 * light;
  // Elevation ramp: lowland dark -> highland light, blended with biome tint.
  const all = patch.heightfield;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < all.length; i += 16) {
    const v = all[i] ?? 0;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const t = max > min ? (h - min) / (max - min) : 0.5;
  const tint = BIOME_TINT[patch.biome];
  const r = ((60 + t * 120) * 0.35 + tint[0] * 0.65) * shade;
  const g = ((62 + t * 118) * 0.35 + tint[1] * 0.65) * shade;
  const b = ((58 + t * 110) * 0.35 + tint[2] * 0.65) * shade;
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}

// -- wire loading --------------------------------------------------------------

/** Fetch a real wire patch; throws with a plain message on any problem. */
export async function fetchPatch(settlementId: string, base = "."): Promise<BattlePatch> {
  const res = await fetch(`${base}/wire/battle/${settlementId}.json`);
  if (!res.ok) throw new Error(`no battle patch for ${settlementId} (HTTP ${res.status})`);
  const raw = (await res.json()) as Partial<BattlePatch>;
  if (raw.contract_version !== 1) throw new Error(`unsupported battle patch version ${String(raw.contract_version)}`);
  if (!Array.isArray(raw.heightfield) || raw.heightfield.length !== PATCH_CELLS) {
    throw new Error("battle patch heightfield is not 64x64");
  }
  if (!Array.isArray(raw.water_mask) || raw.water_mask.length !== PATCH_CELLS) {
    throw new Error("battle patch water_mask is not 64x64");
  }
  return raw as BattlePatch;
}

// -- deterministic preview patch ------------------------------------------------

/** Tiny deterministic PRNG so the preview patch is stable across loads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A clearly-labelled stand-in patch for development and tests, used only
 * when no wire file exists. Never mistaken for real data: `preview: true`
 * and the view renders a "PREVIEW TERRAIN" banner.
 */
export function samplePatch(settlementId = "preview"): BattlePatch {
  const rand = mulberry32(1234567);
  const heightfield = new Array<number>(PATCH_CELLS);
  const water_mask = new Array<boolean>(PATCH_CELLS);
  for (let row = 0; row < PATCH_RES; row++) {
    for (let col = 0; col < PATCH_RES; col++) {
      const i = row * PATCH_RES + col;
      // A ridge running north-south, higher in the east, plus noise.
      const ridge = 40 * Math.exp(-Math.pow((col - 40) / 10, 2));
      const hill = 25 * Math.exp(-(Math.pow(row - 20, 2) + Math.pow(col - 18, 2)) / 200);
      const h = 100 + ridge + hill + rand() * 6;
      heightfield[i] = Math.round(h * 10) / 10;
      // A river band along the west.
      water_mask[i] = col < 6 && row > 8 && row < 56;
    }
  }
  const cover_objects: CoverObject[] = [];
  for (let k = 0; k < 40; k++) {
    const x = -900 + rand() * 1800;
    const y = -900 + rand() * 1800;
    if (water_mask[cellIndexAt(x, y)]) continue;
    cover_objects.push({
      type: rand() < 0.7 ? "tree" : "rock",
      x: Math.round(x),
      y: Math.round(y),
      height_m: 8,
      radius_m: 12,
      rotation_deg: Math.round(rand() * 360),
    });
  }
  return {
    contract_version: 1,
    settlement_id: settlementId,
    biome: "forest",
    heightfield,
    water_mask,
    cover_objects,
    spawn_zones: {
      attacker: { x: -500, y: -950, width_m: 1000, height_m: 300 },
      defender: { x: -500, y: 650, width_m: 1000, height_m: 300 },
      reinforcement_edge: "south",
    },
    preview: true,
  };
}
