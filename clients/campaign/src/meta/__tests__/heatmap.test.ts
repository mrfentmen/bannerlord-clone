/**
 * Battle heatmap tests (MASTER_PLAN task 140). Node environment: the pure
 * logic and the canvas renderer (via a stub context) need no DOM.
 */

import { describe, expect, it } from "vitest";
import {
  binBattleSites,
  boundsForWorld,
  clearBattleSites,
  heatRgb,
  heatmapStats,
  loadBattleSites,
  MAX_BATTLE_SITES,
  recordBattleSite,
  renderHeatLayer,
  saveBattleSites,
  rgba,
  type BattleSite,
  type HeatCell,
} from "../heatmap.js";

function site(x: number, z: number, won = true, season = 1): BattleSite {
  return { x, z, won, season, label: "Test battle" };
}

function fakeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("recordBattleSite", () => {
  it("appends without mutating the input", () => {
    const before: BattleSite[] = [site(1, 2)];
    const after = recordBattleSite(before, site(3, 4));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(2);
  });

  it("caps history at MAX_BATTLE_SITES, dropping the oldest", () => {
    let sites: BattleSite[] = [];
    for (let i = 0; i < MAX_BATTLE_SITES + 50; i += 1) {
      sites = recordBattleSite(sites, site(i, i));
    }
    expect(sites).toHaveLength(MAX_BATTLE_SITES);
    expect(sites[0]?.x).toBe(50);
    expect(sites[sites.length - 1]?.x).toBe(MAX_BATTLE_SITES + 49);
  });

  it("sanitizes non-finite coordinates and clamps labels", () => {
    const [s] = recordBattleSite([], {
      x: Number.NaN,
      z: Number.POSITIVE_INFINITY,
      won: true,
      season: 1.7,
      label: "x".repeat(200),
    });
    expect(s?.x).toBe(0);
    expect(s?.z).toBe(0);
    expect(s?.season).toBe(1);
    expect(s?.label).toHaveLength(80);
  });
});

describe("binBattleSites", () => {
  const bounds = boundsForWorld(1000, 1000);

  it("bins neighbouring sites into one cell with win counts", () => {
    const cells = binBattleSites([site(10, 10, true), site(20, 20, false), site(30, 30, true)], bounds, 100);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.count).toBe(3);
    expect(cells[0]?.wins).toBe(2);
  });

  it("separates distant sites and skips out-of-bounds ones", () => {
    const cells = binBattleSites([site(10, 10), site(900, 900), site(5000, 5000)], bounds, 100);
    expect(cells).toHaveLength(2);
  });

  it("centres cells on the grid", () => {
    const [cell] = binBattleSites([site(10, 10)], bounds, 100);
    expect(cell?.cx).toBe(50);
    expect(cell?.cz).toBe(50);
  });
});

describe("heatRgb", () => {
  it("hits the blue/yellow/red stops and clamps", () => {
    expect(heatRgb(0)).toEqual([43, 108, 176]);
    expect(heatRgb(0.5)).toEqual([236, 201, 75]);
    expect(heatRgb(1)).toEqual([197, 48, 48]);
    expect(heatRgb(-2)).toEqual([43, 108, 176]);
    expect(heatRgb(9)).toEqual([197, 48, 48]);
  });

  it("formats rgba with clamped alpha", () => {
    expect(rgba([1, 2, 3], 0.5)).toBe("rgba(1, 2, 3, 0.500)");
    expect(rgba([1, 2, 3], 99)).toBe("rgba(1, 2, 3, 1.000)");
  });
});

describe("heatmapStats", () => {
  it("summarises wins, losses and the hottest cell", () => {
    const bounds = boundsForWorld(1000, 1000);
    const sites = [
      site(10, 10, true),
      site(20, 20, true),
      site(30, 30, false),
      site(900, 900, false),
    ];
    const stats = heatmapStats(sites, bounds, 100);
    expect(stats.total).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(2);
    expect(stats.hottest?.count).toBe(3);
  });

  it("reports null hottest ground with no sites", () => {
    const stats = heatmapStats([], boundsForWorld(1000, 1000), 100);
    expect(stats.total).toBe(0);
    expect(stats.hottest).toBeNull();
  });
});

describe("battle site persistence", () => {
  it("round-trips through storage and rejects corrupt data", () => {
    const storage = fakeStorage();
    saveBattleSites([site(1, 2, true, 3)], storage);
    expect(loadBattleSites(storage)).toHaveLength(1);

    const bad = fakeStorage();
    bad.setItem("fentmen.battleSites.v1", "not json{");
    expect(loadBattleSites(bad)).toEqual([]);

    const foreign = fakeStorage();
    foreign.setItem("fentmen.battleSites.v1", JSON.stringify([{ nope: 1 }]));
    expect(loadBattleSites(foreign)).toEqual([]);
  });

  it("clearBattleSites wipes history", () => {
    const storage = fakeStorage();
    saveBattleSites([site(1, 2)], storage);
    clearBattleSites(storage);
    expect(loadBattleSites(storage)).toEqual([]);
  });

  it("degrades to session-only when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveBattleSites([site(1, 2)], throwing)).not.toThrow();
    expect(loadBattleSites(throwing)).toEqual([]);
    expect(() => clearBattleSites(throwing)).not.toThrow();
  });
});

describe("renderHeatLayer", () => {
  function stubCanvas() {
    const calls: string[] = [];
    const gradient = { addColorStop: (o: number, c: string) => void calls.push(`stop:${o}:${c}`) };
    const ctx = {
      clearRect: () => void calls.push("clear"),
      createRadialGradient: () => {
        calls.push("gradient");
        return gradient;
      },
      beginPath: () => void calls.push("begin"),
      arc: () => void calls.push("arc"),
      fill: () => void calls.push("fill"),
      set fillStyle(_v: string) {},
    };
    const canvas = {
      width: 800,
      height: 600,
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
    } as unknown as HTMLCanvasElement;
    return { canvas, calls };
  }

  it("draws one blob per projected cell and skips off-screen cells", () => {
    const { canvas, calls } = stubCanvas();
    const cells: HeatCell[] = [
      { cx: 10, cz: 10, count: 5, wins: 5 },
      { cx: 900, cz: 900, count: 1, wins: 0 },
    ];
    renderHeatLayer(canvas, cells, 5, (x) => (x < 100 ? { x, y: 50 } : null));
    expect(calls.filter((c) => c === "fill")).toHaveLength(1);
  });

  it("renders 500+ battles without error (acceptance: density at scale)", () => {
    const { canvas, calls } = stubCanvas();
    const cells: HeatCell[] = [];
    for (let i = 0; i < 600; i += 1) {
      cells.push({ cx: (i * 37) % 1000, cz: (i * 91) % 1000, count: 1 + (i % 9), wins: 1 });
    }
    renderHeatLayer(canvas, cells, 10, (x, z) => ({ x, y: z }));
    expect(calls.filter((c) => c === "fill")).toHaveLength(600);
  });

  it("clears the canvas and draws nothing for empty cells", () => {
    const { canvas, calls } = stubCanvas();
    renderHeatLayer(canvas, [], 0, () => ({ x: 1, y: 1 }));
    expect(calls).toEqual(["clear"]);
  });

  it("no-ops when the 2d context is unavailable", () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() =>
      renderHeatLayer(canvas, [{ cx: 1, cz: 1, count: 1, wins: 1 }], 1, () => ({ x: 1, y: 1 })),
    ).not.toThrow();
  });
});
