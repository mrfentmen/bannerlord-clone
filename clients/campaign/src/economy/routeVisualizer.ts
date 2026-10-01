/**
 * Trade route visualizer (MASTER_PLAN task 102): animated routes on the
 * campaign map, each labelled with its good and volume.
 *
 * The render model is pure (caravans + a settlement position lookup -> line
 * segments). The canvas painter takes a minimal 2D-context interface so the
 * animation math is testable without a browser. The live overlay canvas lives
 * in routePanel.ts, pinned over the map like the battle heatmap overlay.
 */

import type { TradeCaravan } from "./routeRegistry.js";
import { goodColor } from "./goodsPalette.js";
import { paper } from "../design/tokens.js";

export interface RoutePoint {
  x: number;
  z: number;
}

export interface RouteLeg {
  from: RoutePoint;
  to: RoutePoint;
  fromName: string;
  toName: string;
}

export interface RouteModel {
  caravanId: string;
  name: string;
  goodId: string;
  goodName: string;
  units: number;
  guards: number;
  stops: { name: string; point: RoutePoint }[];
  legs: RouteLeg[];
}

/**
 * Build one render model per caravan. A caravan whose stops cannot all be
 * placed is skipped outright — a half-drawn circuit would lie about the
 * route.
 */
export function buildRouteModels(
  caravans: TradeCaravan[],
  positionOf: (settlementId: string) => RoutePoint | null,
): RouteModel[] {
  const models: RouteModel[] = [];
  for (const caravan of caravans) {
    const stops: { name: string; point: RoutePoint }[] = [];
    let complete = true;
    for (const stop of caravan.stops) {
      const point = positionOf(stop.settlementId);
      if (!point) {
        complete = false;
        break;
      }
      stops.push({ name: stop.name, point });
    }
    if (!complete || stops.length < 2) continue;
    const legs: RouteLeg[] = stops.map((stop, i) => {
      const next = stops[(i + 1) % stops.length]!;
      return { from: stop.point, to: next.point, fromName: stop.name, toName: next.name };
    });
    models.push({
      caravanId: caravan.id,
      name: caravan.name,
      goodId: caravan.goodId,
      goodName: caravan.goodName,
      units: caravan.units,
      guards: caravan.guards,
      stops,
      legs,
    });
  }
  return models;
}

export { goodColor };
export { GOOD_COLORS, UNKNOWN_GOOD_COLOR } from "./goodsPalette.js";

/** Line width grows with volume, log-scaled so a 500-unit haul does not eat the map. */
export function routeLineWidth(units: number): number {
  return Math.min(8, 2 + 3 * Math.log10(1 + Math.max(units, 0) / 20));
}

/** Screen point, or null when the world point is off-camera. */
export type ScreenProjector = (x: number, z: number) => { x: number; y: number } | null;

/** The slice of CanvasRenderingContext2D the painter needs. */
export interface RouteDrawContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  setLineDash(segments: number[]): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineDashOffset: number;
  font: string;
  textBaseline: string;
}

export interface DrawRouteOptions {
  /** Freeze the march animation (prefers-reduced-motion). */
  reducedMotion?: boolean;
}

/** The slice of HTMLCanvasElement the painter needs. */
export interface RouteCanvas {
  width: number;
  height: number;
  getContext(kind: "2d"): RouteDrawContext | null;
}

/**
 * Paint every route: an animated dashed circuit per caravan, stop dots, and a
 * label per route reading "<good> · <units>u" at the longest visible leg.
 * Legs with an off-camera endpoint are skipped individually so a route stays
 * visible while its far end is out of frame. No-ops when the canvas has no
 * 2D context (e.g. jsdom).
 */
export function drawRoutes(
  canvas: RouteCanvas,
  models: RouteModel[],
  toScreen: ScreenProjector,
  nowMs: number,
  options: DrawRouteOptions = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (models.length === 0) return;
  const dashOffset = options.reducedMotion ? 0 : -((nowMs / 45) % 21);

  for (const model of models) {
    const color = goodColor(model.goodId);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = routeLineWidth(model.units);
    ctx.setLineDash([13, 8]);
    ctx.lineDashOffset = dashOffset;

    let longest: { ax: number; ay: number; bx: number; by: number; len: number } | null = null;
    for (const leg of model.legs) {
      const a = toScreen(leg.from.x, leg.from.z);
      const b = toScreen(leg.to.x, leg.to.z);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!longest || len > longest.len) longest = { ax: a.x, ay: a.y, bx: b.x, by: b.y, len };
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Stop dots on top of the dashed line.
    ctx.save();
    ctx.fillStyle = color;
    for (const stop of model.stops) {
      const p = toScreen(stop.point.x, stop.point.z);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (longest) {
      const mx = (longest.ax + longest.bx) / 2;
      const my = (longest.ay + longest.by) / 2;
      drawLabel(ctx, `${model.goodName} · ${model.units}u`, mx, my - 12, color);
    }
    // Caravan name at the first stop, so overlapping routes stay attributable.
    const first = model.stops[0] ? toScreen(model.stops[0].point.x, model.stops[0].point.z) : null;
    if (first) drawLabel(ctx, model.name, first.x, first.y - 12, paper[0]);
  }
}

function drawLabel(
  ctx: RouteDrawContext,
  text: string,
  x: number,
  y: number,
  accent: string,
): void {
  ctx.save();
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width;
  const padX = 7;
  const padY = 4;
  ctx.fillStyle = "rgba(12, 10, 8, 0.82)";
  ctx.fillRect(x - w / 2 - padX, y - 11 - padY, w + padX * 2, 22 + padY * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - padX, y - 11 - padY);
  ctx.lineTo(x - w / 2 - padX, y + 11 + padY);
  ctx.stroke();
  ctx.fillStyle = paper[0];
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.lineWidth = 3;
  ctx.strokeText(text, x - w / 2, y);
  ctx.fillText(text, x - w / 2, y);
  ctx.restore();
}
