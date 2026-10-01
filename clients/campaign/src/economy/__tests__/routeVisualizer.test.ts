/**
 * Trade route visualizer tests (MASTER_PLAN task 102). Node environment: the
 * painter takes a stub 2D context, so the animation math is verified without
 * a browser.
 */

import { describe, expect, it } from "vitest";
import {
  buildRouteModels,
  drawRoutes,
  goodColor,
  routeLineWidth,
  type RouteDrawContext,
  type RouteModel,
} from "../routeVisualizer.js";
import type { TradeCaravan } from "../routeRegistry.js";

function caravan(overrides: Partial<TradeCaravan> = {}): TradeCaravan {
  return {
    id: "c1",
    name: "Amber Run",
    stops: [
      { settlementId: "a", name: "Alpha" },
      { settlementId: "b", name: "Beta" },
    ],
    goodId: "textiles",
    goodName: "Textiles",
    units: 60,
    guards: 4,
    foundedDay: 0,
    legDays: [2, 2],
    legKm: [80, 80],
    lastSettledDay: 0,
    weeks: [],
    ...overrides,
  };
}

function fakeCanvas(): { width: number; height: number; getContext: (k: "2d") => RouteDrawContext | null; ctx: RouteDrawContext & { calls: string[]; texts: string[] } } {
  const ctx = fakeCtx();
  return { width: 800, height: 600, getContext: () => ctx, ctx };
}

function fakeCtx(): RouteDrawContext & { calls: string[]; texts: string[] } {
  const calls: string[] = [];
  const texts: string[] = [];
  const ctx = {
    calls,
    texts,
    lineWidth: 1,
    strokeStyle: "",
    fillStyle: "",
    lineDashOffset: 0,
    font: "",
    textBaseline: "",
    save: () => void calls.push("save"),
    restore: () => void calls.push("restore"),
    beginPath: () => void calls.push("beginPath"),
    moveTo: (x: number, y: number) => void calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => void calls.push(`lineTo(${x},${y})`),
    stroke: () => void calls.push("stroke"),
    fill: () => void calls.push("fill"),
    arc: () => void calls.push("arc"),
    fillRect: () => void calls.push("fillRect"),
    fillText: (t: string) => void (calls.push("fillText"), texts.push(t)),
    strokeText: (t: string) => void (calls.push("strokeText"), texts.push(t)),
    measureText: () => ({ width: 50 }),
    setLineDash: (s: number[]) => void calls.push(`dash(${s.join(",")})`),
    clearRect: () => void calls.push("clearRect"),
  };
  return ctx;
}

const PROJECT = (x: number, z: number) => ({ x: x / 10, y: z / 10 });

describe("buildRouteModels", () => {
  it("closes the circuit: legs equal stops", () => {
    const [model] = buildRouteModels([caravan()], (id) =>
      id === "a" ? { x: 0, z: 0 } : { x: 100, z: 0 },
    );
    expect(model!.legs).toHaveLength(2);
    expect(model!.legs[1]!.toName).toBe("Alpha");
  });

  it("skips a caravan with an unplaceable stop", () => {
    const models = buildRouteModels([caravan()], (id) =>
      id === "a" ? { x: 0, z: 0 } : null,
    );
    expect(models).toEqual([]);
  });
});

describe("goodColor / routeLineWidth", () => {
  it("maps known goods and falls back for unknown ones", () => {
    expect(goodColor("grain")).toMatch(/^#[0-9a-f]{6}$/);
    expect(goodColor("nope")).toBe("#cbb98a");
  });

  it("grows with volume and caps", () => {
    expect(routeLineWidth(0)).toBe(2);
    expect(routeLineWidth(500)).toBeLessThanOrEqual(8);
    expect(routeLineWidth(500)).toBeGreaterThan(routeLineWidth(20));
  });
});

describe("drawRoutes", () => {
  function painted(models: RouteModel[], toScreen: (x: number, z: number) => { x: number; y: number } | null, nowMs: number, reducedMotion = false) {
    const fake = fakeCanvas();
    drawRoutes(fake, models, toScreen, nowMs, { reducedMotion });
    return fake.ctx;
  }
  function model(): RouteModel {
    const [m] = buildRouteModels([caravan()], (id) =>
      id === "a" ? { x: 0, z: 0 } : { x: 200, z: 0 },
    );
    return m!;
  }

  it("clears the canvas and paints animated dashes", () => {
    const ctx = painted([model()], PROJECT, 1000);
    expect(ctx.calls[0]).toBe("clearRect");
    expect(ctx.calls).toContain("dash(13,8)");
    expect(ctx.lineDashOffset).not.toBe(0);
    expect(ctx.calls.filter((c) => c === "stroke").length).toBeGreaterThanOrEqual(2);
  });

  it("freezes the march animation under reduced motion", () => {
    const ctx = painted([model()], PROJECT, 1000, true);
    expect(ctx.lineDashOffset).toBe(0);
  });

  it("labels the route with good and volume", () => {
    const ctx = painted([model()], PROJECT, 0, true);
    expect(ctx.texts).toContain("Textiles · 60u");
    expect(ctx.texts).toContain("Amber Run");
  });

  it("skips legs with an off-camera endpoint without throwing", () => {
    const toScreen = (x: number, z: number) => (x > 100 ? null : { x, y: z });
    const fake = fakeCanvas();
    expect(() => drawRoutes(fake, [model()], toScreen, 0)).not.toThrow();
  });

  it("paints nothing for no models", () => {
    const ctx = painted([], PROJECT, 0);
    expect(ctx.calls).toEqual(["clearRect"]);
  });
});
