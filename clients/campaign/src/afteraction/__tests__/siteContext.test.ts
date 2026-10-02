/**
 * @vitest-environment jsdom
 *
 * Map name and biome in the report header (Buffy task 99).
 *
 * The biome label is checked against `modes/types.ts`'s own map rather than
 * against a word written here, so the report and the setup screens cannot drift.
 */

import { describe, expect, it } from "vitest";
import { buildReport, createReportScreen, siteLine } from "../index.js";
import { BIOME_LABEL, type BiomeId } from "../../modes/types.js";
import type { AfterActionData } from "../types.js";

const DATA: AfterActionData = {
  battleLabel: "Dry Fork",
  playerWon: true,
  durationS: 600,
  playerLosses: [{ unitKind: "infantry", started: 60, lost: 5 }],
  enemyLosses: [{ unitKind: "infantry", started: 100, lost: 70 }],
  playerKills: 70,
  enemyKills: 9,
  captures: [],
  timeline: [],
};

const BIOMES = Object.keys(BIOME_LABEL) as BiomeId[];

describe("site line (task 99)", () => {
  it("names the place and its ground", () => {
    expect(siteLine({ mapName: "Dry Fork", biome: "plains" })).toBe("Dry Fork — Plains");
  });

  it("uses the setup screens' own biome labels", () => {
    for (const biome of BIOMES) {
      expect(siteLine({ mapName: "Somewhere", biome })).toBe(`Somewhere — ${BIOME_LABEL[biome]}`);
    }
  });

  it("says what it has when it has only part of it", () => {
    expect(siteLine({ biome: "forest" })).toBe("Forest");
    expect(siteLine({ mapName: "Dry Fork" })).toBe("Dry Fork");
  });

  it("says nothing when the flow placed the battle nowhere", () => {
    expect(siteLine({})).toBe("");
    expect(siteLine({ mapName: "", biome: undefined })).toBe("");
  });
});

describe("site line on the report screen (task 99)", () => {
  it("prints the place under the title", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {}, { site: { mapName: "Dry Fork", biome: "hills" } });
    document.body.appendChild(el);

    const sub = el.querySelector<HTMLElement>('[data-testid="afteraction-site"]');
    expect(sub?.textContent).toBe("Dry Fork — Hills");
    expect(sub?.hidden).toBe(false);
    expect(el.querySelector(".afteraction-heading")?.contains(sub ?? null)).toBe(true);
  });

  it("hides the line when there is no site, leaving the rest of the header", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {});
    document.body.appendChild(el);

    const sub = el.querySelector<HTMLElement>('[data-testid="afteraction-site"]');
    expect(sub?.hidden).toBe(true);
    expect(sub?.textContent).toBe("");
    expect(el.querySelector(".afteraction-title")?.textContent).toBe("Victory — Dry Fork");
    expect(el.querySelector('[data-testid="afteraction-rating"]')).not.toBeNull();
  });

  it("does not disturb the four report sections", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {}, { site: { mapName: "Dry Fork", biome: "hills" } });
    document.body.appendChild(el);
    for (const heading of ["Kills", "Casualties", "MVP unit", "Timeline"]) {
      expect(el.textContent).toContain(heading);
    }
  });
});