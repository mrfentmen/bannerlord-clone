/**
 * MASTER_PLAN task 140: battle heatmap — where you've fought, on the world map.
 *
 * Pure logic plus canvas rendering in world coordinates. The DOM panel lives
 * in heatmapPanel.ts; the world→screen projector lives in
 * heatmapProjector.ts so this module stays Babylon-free and unit-testable.
 */

/** One recorded battle site, in world-map metres. */
export interface BattleSite {
  x: number;
  z: number;
  won: boolean;
  season: number;
  label: string;
}

/** History cap: 2000 sites is plenty for the 500+ density acceptance. */
export const MAX_BATTLE_SITES = 2000;

/** Storage key for the persisted battle-site history. Exported so the
 * per-campaign reset (meta/campaignReset.ts) can clear it by name. */
export const HEATMAP_STORAGE_KEY = "fentmen.battleSites.v1";
const STORAGE_KEY = HEATMAP_STORAGE_KEY;

function sanitizeSite(site: BattleSite): BattleSite {
  return {
    x: Number.isFinite(site.x) ? site.x : 0,
    z: Number.isFinite(site.z) ? site.z : 0,
    won: site.won === true,
    season: Number.isFinite(site.season) ? Math.floor(site.season) : 0,
    label: String(site.label ?? "").slice(0, 80),
  };
}

function isBattleSite(value: unknown): value is BattleSite {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.x === "number" &&
    typeof v.z === "number" &&
    typeof v.won === "boolean" &&
    typeof v.season === "number" &&
    typeof v.label === "string"
  );
}

/** Pure append; the oldest sites drop off past the cap. */
export function recordBattleSite(sites: BattleSite[], site: BattleSite): BattleSite[] {
  const next = [...sites, sanitizeSite(site)];
  return next.length > MAX_BATTLE_SITES ? next.slice(next.length - MAX_BATTLE_SITES) : next;
}

/** World bounds in metres, matching the client's Projection (0..width, 0..depth). */
export interface HeatBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function boundsForWorld(width: number, depth: number): HeatBounds {
  return { minX: 0, maxX: Math.max(1, width), minZ: 0, maxZ: Math.max(1, depth) };
}

/** One non-empty density cell, centred on (cx, cz) in world metres. */
export interface HeatCell {
  cx: number;
  cz: number;
  count: number;
  wins: number;
}

/**
 * Bin sites into a square-cell grid. Out-of-bounds sites are skipped, so a
 * world-resize never corrupts the layer. Returns only non-empty cells.
 */
export function binBattleSites(
  sites: BattleSite[],
  bounds: HeatBounds,
  cellWorldSize: number,
): HeatCell[] {
  const size = Math.max(1, cellWorldSize);
  const cells = new Map<string, HeatCell>();
  for (const site of sites) {
    if (site.x < bounds.minX || site.x > bounds.maxX || site.z < bounds.minZ || site.z > bounds.maxZ) {
      continue;
    }
    const ix = Math.floor((site.x - bounds.minX) / size);
    const iz = Math.floor((site.z - bounds.minZ) / size);
    const key = `${ix}:${iz}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        cx: bounds.minX + (ix + 0.5) * size,
        cz: bounds.minZ + (iz + 0.5) * size,
        count: 0,
        wins: 0,
      };
      cells.set(key, cell);
    }
    cell.count += 1;
    if (site.won) cell.wins += 1;
  }
  return [...cells.values()];
}

/** Density stops: calm blue → contested yellow → bloodied red. */
const HEAT_STOPS: Array<[number, [number, number, number]]> = [
  [0, [43, 108, 176]],
  [0.5, [236, 201, 75]],
  [1, [197, 48, 48]],
];

/** Density 0..1 → [r, g, b]. */
export function heatRgb(t: number): [number, number, number] {
  const c = Math.min(1, Math.max(0, t));
  let prev = HEAT_STOPS[0] as [number, [number, number, number]];
  for (let i = 1; i < HEAT_STOPS.length; i += 1) {
    const next = HEAT_STOPS[i] as [number, [number, number, number]];
    if (c <= next[0]) {
      const f = (c - prev[0]) / (next[0] - prev[0]);
      const [r1, g1, b1] = prev[1];
      const [r2, g2, b2] = next[1];
      return [Math.round(r1 + (r2 - r1) * f), Math.round(g1 + (g2 - g1) * f), Math.round(b1 + (b2 - b1) * f)];
    }
    prev = next;
  }
  const [r, g, b] = prev[1];
  return [r, g, b];
}

export function rgba(rgb: [number, number, number], alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a.toFixed(3)})`;
}

/** Summary for the panel header. */
export interface HeatStats {
  total: number;
  wins: number;
  losses: number;
  hottest: HeatCell | null;
}

export function heatmapStats(sites: BattleSite[], bounds: HeatBounds, cellWorldSize: number): HeatStats {
  let wins = 0;
  for (const s of sites) if (s.won) wins += 1;
  let hottest: HeatCell | null = null;
  for (const cell of binBattleSites(sites, bounds, cellWorldSize)) {
    if (!hottest || cell.count > hottest.count) hottest = cell;
  }
  return { total: sites.length, wins, losses: sites.length - wins, hottest };
}

/** World metres → CSS pixels on the overlay canvas. Null = behind/off camera. */
export type ScreenProjector = (x: number, z: number) => { x: number; y: number } | null;

export interface HeatRenderOptions {
  /** Blob radius in CSS pixels. */
  radiusPx?: number;
  /** Peak blob opacity. */
  alpha?: number;
}

/**
 * Draw the density layer. Each cell becomes a radial blob whose colour and
 * opacity scale with its density relative to the hottest cell. No-op when the
 * 2D context is unavailable.
 */
export function renderHeatLayer(
  canvas: HTMLCanvasElement,
  cells: HeatCell[],
  maxCount: number,
  toScreen: ScreenProjector,
  opts: HeatRenderOptions = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const radius = Math.max(4, opts.radiusPx ?? 30);
  const alpha = opts.alpha ?? 0.55;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (cells.length === 0 || maxCount <= 0) return;
  for (const cell of cells) {
    const p = toScreen(cell.cx, cell.cz);
    if (!p) continue;
    const t = cell.count / maxCount;
    const color = heatRgb(t);
    const peak = alpha * (0.35 + 0.65 * t);
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    gradient.addColorStop(0, rgba(color, peak));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Load persisted sites; corrupt or foreign data yields an empty history. */
export function loadBattleSites(
  storage: Pick<Storage, "getItem"> = localStorage,
): BattleSite[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBattleSite).map(sanitizeSite).slice(-MAX_BATTLE_SITES);
  } catch {
    return [];
  }
}

/** Persist sites; storage failures degrade to session-only history. */
export function saveBattleSites(
  sites: BattleSite[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sites.slice(-MAX_BATTLE_SITES)));
  } catch {
    // Storage full or blocked: the heatmap still works for this session.
  }
}

/** Remove persisted history (the panel's Clear action). */
export function clearBattleSites(storage: Pick<Storage, "removeItem"> = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: clearing is best-effort.
  }
}
