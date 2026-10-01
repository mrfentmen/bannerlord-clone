/**
 * @vitest-environment jsdom
 *
 * Battle heatmap panel tests (MASTER_PLAN task 140). jsdom has no canvas 2d
 * context, so the overlay render no-ops here; these tests cover the card UI,
 * the two-step clear flow, and overlay lifecycle.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { heatmapPanel } from "../heatmapPanel.js";
import { boundsForWorld, type BattleSite } from "../heatmap.js";

function site(x: number, z: number, won = true): BattleSite {
  return { x, z, won, season: 1, label: "Test battle" };
}

const created: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const p of created.splice(0)) p.dispose();
  document.body.innerHTML = "";
});

function open(sites: BattleSite[], onClear = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const handle = heatmapPanel({
    sites: () => sites,
    bounds: boundsForWorld(1000, 1000),
    toScreen: () => ({ x: 10, y: 10 }),
    overlayHost: host,
    renderSize: () => ({ width: 800, height: 600 }),
    onClear,
    onClose: () => {},
  });
  document.body.appendChild(handle.root);
  created.push(handle);
  return { handle, host, onClear };
}

describe("heatmapPanel", () => {
  it("shows stats and the legend when sites exist", () => {
    open([site(10, 10, true), site(20, 20, false)]);
    const stats = document.querySelector('[data-testid="heatmap-stats"]');
    expect(stats?.textContent).toContain("2 battles");
    expect(stats?.textContent).toContain("1 won");
    expect(stats?.textContent).toContain("1 lost");
    expect(document.querySelector(".heatmap__legend")).not.toBeNull();
  });

  it("shows an empty state with no recorded battles", () => {
    open([]);
    expect(document.querySelector('[data-testid="heatmap-stats"]')?.textContent).toContain(
      "No battles recorded",
    );
  });

  it("pins a pointer-transparent overlay canvas over the map", () => {
    const { host } = open([site(10, 10)]);
    const overlay = host.querySelector("canvas.heatmap__overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
  });

  it("clears history only after the two-step confirm", () => {
    const { onClear } = open([site(10, 10)]);
    const clearBtn = document.querySelector('[data-testid="heatmap-clear"]') as HTMLButtonElement;
    const confirmBox = document.querySelector(".heatmap__confirm") as HTMLElement;
    expect(confirmBox.hidden).toBe(true);
    clearBtn.click();
    expect(confirmBox.hidden).toBe(false);
    expect(onClear).not.toHaveBeenCalled();
    (document.querySelector('[data-testid="heatmap-clear-confirm"]') as HTMLButtonElement).click();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(confirmBox.hidden).toBe(true);
  });

  it("dispose removes the overlay canvas", () => {
    const { handle, host } = open([site(10, 10)]);
    expect(host.querySelector("canvas")).not.toBeNull();
    handle.dispose();
    expect(host.querySelector("canvas")).toBeNull();
  });
});
