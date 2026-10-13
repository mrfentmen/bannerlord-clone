import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  HELP_EXEMPT_PANELS,
  helpCoveredPanels,
  PANEL_HELP_MAP,
  panelHelp,
} from "../panelHelp.js";

const PANELS_DIR = join(__dirname, "..", "..", "ui", "panels");

describe("every-panel help coverage (solo task 94)", () => {
  it("every panel file has a help mapping", () => {
    const panels = readdirSync(PANELS_DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .filter((p) => !HELP_EXEMPT_PANELS.includes(p));
    const missing = panels.filter((p) => !(p in PANEL_HELP_MAP));
    expect(missing).toEqual([]);
  });

  it("help buttons open a relevant topic", () => {
    expect(panelHelp("MarketPanel")[0]!.title).toBe("Economy");
    expect(panelHelp("LedgerPanel")[0]!.title).toBe("Economy");
    expect(panelHelp("RulerPanel")[0]!.title).toBe("Clan");
  });

  it("unknown panels fall back to the map topic", () => {
    expect(panelHelp("NopePanel")[0]!.title).toBe("Campaign map");
  });

  it("covered panels list matches the map", () => {
    expect(helpCoveredPanels().sort()).toEqual(Object.keys(PANEL_HELP_MAP).sort());
  });
});
