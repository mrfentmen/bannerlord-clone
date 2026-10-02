/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createTerrainTooltip } from "../terrainTooltip.js";
import { BIOME_LABEL, type BiomeId } from "../../modes/types.js";

describe("map terrain tooltip (task 199)", () => {
  it("starts hidden, so there is never an empty box on the map", () => {
    const tooltip = createTerrainTooltip();
    expect(tooltip.root.hidden).toBe(true);
    expect(tooltip.visible()).toBe(false);
    expect(tooltip.root.textContent).toBe("");
    tooltip.destroy();
  });

  it("names the biome from the shared BIOME_LABEL table", () => {
    const tooltip = createTerrainTooltip();
    for (const biome of Object.keys(BIOME_LABEL) as BiomeId[]) {
      tooltip.show({ biome });
      expect(tooltip.root.querySelector('[data-testid="terrain-tooltip-name"]')!.textContent).toBe(
        BIOME_LABEL[biome],
      );
    }
    tooltip.destroy();
  });

  it("shows the place name with the biome underneath it", () => {
    const tooltip = createTerrainTooltip();
    tooltip.show({ biome: "forest", name: "Hocking Hills" });
    expect(tooltip.root.querySelector('[data-testid="terrain-tooltip-name"]')!.textContent).toBe(
      "Hocking Hills",
    );
    expect(tooltip.root.querySelector('[data-testid="terrain-tooltip-biome"]')!.textContent).toBe(
      "Forest",
    );
    tooltip.destroy();
  });

  it("carries the terrain in the accessible name, not only in the colour or the glyph", () => {
    const tooltip = createTerrainTooltip();
    tooltip.show({ biome: "hills", name: "Ridges" });
    expect(tooltip.root.getAttribute("aria-label")).toBe("Ridges, Hills");
    tooltip.show({ biome: "coast" });
    expect(tooltip.root.getAttribute("aria-label")).toBe("Coast");
    tooltip.destroy();
  });

  it("reveals itself only once it has something to say", () => {
    const tooltip = createTerrainTooltip();
    tooltip.show({ biome: "plains" });
    expect(tooltip.visible()).toBe(true);
    expect(tooltip.root.hidden).toBe(false);
    expect(tooltip.root.getAttribute("aria-hidden")).toBe("false");
    tooltip.destroy();
  });

  it("empties itself on hide rather than leaving the last thing it read", () => {
    const tooltip = createTerrainTooltip();
    tooltip.show({ biome: "urban", name: "Cleveland", detail: "410 m" });
    tooltip.hide();
    expect(tooltip.visible()).toBe(false);
    expect(tooltip.root.textContent).toBe("");
    expect(tooltip.root.getAttribute("aria-hidden")).toBe("true");
    tooltip.destroy();
  });

  it("hides rather than printing an id the client does not recognise", () => {
    const tooltip = createTerrainTooltip();
    tooltip.show({ biome: "swamp" as BiomeId, name: "Nowhere" });
    // Printing the caller's raw id would leak an internal name onto the screen.
    expect(tooltip.visible()).toBe(false);
    expect(tooltip.root.textContent).toBe("");
    tooltip.destroy();
  });

  it("prints a caller-supplied detail line and nothing invented", () => {
    const tooltip = createTerrainTooltip();
    tooltip.show({ biome: "plains", detail: "Road junction" });
    expect(tooltip.root.querySelector('[data-testid="terrain-tooltip-detail"]')!.textContent).toBe(
      "Road junction",
    );
    tooltip.show({ biome: "plains" });
    expect(tooltip.root.querySelector('[data-testid="terrain-tooltip-detail"]')!.textContent).toBe("");
    tooltip.destroy();
  });

  it("cannot steal the click meant for the ground under it", () => {
    const tooltip = createTerrainTooltip();
    expect(tooltip.root.getAttribute("role")).toBe("tooltip");
    // pointer-events: none lives in mapOverlay.css; the handle asserts the role
    // and the aria pairing, which is the part that has to be right in the markup.
    expect(tooltip.root.getAttribute("aria-hidden")).toBe("true");
    tooltip.destroy();
  });

  it("removes itself on destroy", () => {
    const tooltip = createTerrainTooltip();
    document.body.appendChild(tooltip.root);
    expect(document.body.contains(tooltip.root)).toBe(true);
    tooltip.destroy();
    expect(document.body.contains(tooltip.root)).toBe(false);
  });

  it("takes its own testid when asked", () => {
    const tooltip = createTerrainTooltip({ testId: "photo-terrain" });
    expect(tooltip.root.getAttribute("data-testid")).toBe("photo-terrain");
    tooltip.destroy();
  });
});