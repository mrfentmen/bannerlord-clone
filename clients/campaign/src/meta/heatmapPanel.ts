/**
 * Battle heatmap panel + map overlay (MASTER_PLAN task 140).
 *
 * The side card (stats, legend, clear) mounts in the HUD context area like
 * every other panel; the density layer is a pointer-transparent canvas pinned
 * over the map canvas, re-projected every frame while visible so blobs track
 * the camera.
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import {
  binBattleSites,
  heatmapStats,
  renderHeatLayer,
  type BattleSite,
  type HeatBounds,
  type ScreenProjector,
} from "./heatmap.js";
import "./heatmap.css";

export interface HeatmapPanelOptions {
  /** Live accessor: the overlay re-reads it every frame. */
  sites: () => BattleSite[];
  bounds: HeatBounds;
  /** World metres → render pixels. Null = off-camera. */
  toScreen: ScreenProjector;
  /** Element the overlay canvas is pinned inside (the map stage). */
  overlayHost: HTMLElement;
  /** Render-buffer size for the overlay canvas, in pixels. */
  renderSize: () => { width: number; height: number };
  onClear: () => void;
  onClose: () => void;
}

/** Density cell edge in world metres. */
export const HEATMAP_CELL_SIZE = 400;

export interface HeatmapPanelHandle {
  root: HTMLElement;
  /** Re-render stats and the overlay once (the overlay also self-refreshes). */
  refresh(): void;
  dispose(): void;
}

export function heatmapPanel(options: HeatmapPanelOptions): HeatmapPanelHandle {
  const { root, body } = panel({
    title: "Battle heatmap",
    testId: "heatmap-panel",
    onClose: options.onClose,
  });

  const statsLine = h("p", { class: "heatmap__stats", "data-testid": "heatmap-stats" });
  const legend = h(
    "div",
    { class: "heatmap__legend", role: "img", "aria-label": "Density legend: blue is a skirmish, yellow is contested, red is bloodied" },
    h("span", { class: "heatmap__key" }, h("span", { class: "heatmap__swatch heatmap__swatch--low" }), "Skirmish"),
    h("span", { class: "heatmap__key" }, h("span", { class: "heatmap__swatch heatmap__swatch--mid" }), "Contested"),
    h("span", { class: "heatmap__key" }, h("span", { class: "heatmap__swatch heatmap__swatch--high" }), "Bloodied"),
  );

  const clearConfirm = h("div", { class: "heatmap__confirm", hidden: true },
    h("p", { class: "label" }, "Clear every recorded battle site? This cannot be undone."),
    h("button", { type: "button", class: "btn btn--danger", "data-testid": "heatmap-clear-confirm" }, "Clear history"),
  );
  const clearBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "heatmap-clear" },
    "Clear history",
  );
  clearBtn.addEventListener("click", () => {
    clearConfirm.hidden = false;
  });
  clearConfirm
    .querySelector('[data-testid="heatmap-clear-confirm"]')
    ?.addEventListener("click", () => {
      options.onClear();
      clearConfirm.hidden = true;
      renderStats();
    });

  body.append(statsLine, legend, clearBtn, clearConfirm);

  function renderStats(): void {
    const sites = options.sites();
    const stats = heatmapStats(sites, options.bounds, HEATMAP_CELL_SIZE);
    if (stats.total === 0) {
      statsLine.textContent = "";
      statsLine.appendChild(emptyState("No battles recorded", "Fight a battle and its site will appear here."));
      return;
    }
    const hot = stats.hottest;
    statsLine.textContent =
      `${stats.total} battles · ${stats.wins} won · ${stats.losses} lost` +
      (hot ? ` · hottest ground: ${hot.count} battles` : "");
  }
  renderStats();

  // -- Overlay canvas ---------------------------------------------------------
  const overlay = document.createElement("canvas");
  overlay.className = "heatmap__overlay";
  overlay.setAttribute("aria-hidden", "true");
  options.overlayHost.appendChild(overlay);

  let disposed = false;
  let raf = 0;

  function draw(): void {
    if (disposed) return;
    const { width, height } = options.renderSize();
    if (width > 0 && height > 0 && (overlay.width !== width || overlay.height !== height)) {
      overlay.width = width;
      overlay.height = height;
    }
    if (overlay.width === 0 || overlay.height === 0) return;
    const cells = binBattleSites(options.sites(), options.bounds, HEATMAP_CELL_SIZE);
    const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
    renderHeatLayer(overlay, cells, max, options.toScreen, {
      radiusPx: Math.max(18, Math.min(overlay.width, overlay.height) / 24),
    });
  }

  function frame(): void {
    if (disposed) return;
    draw();
    raf = requestAnimationFrame(frame);
  }

  if (typeof requestAnimationFrame === "function") {
    raf = requestAnimationFrame(frame);
  } else {
    // Non-browser test runtimes: one synchronous paint so refresh() works.
    draw();
  }

  return {
    root,
    refresh() {
      renderStats();
      draw();
    },
    dispose() {
      disposed = true;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      overlay.remove();
    },
  };
}
