/**
 * @vitest-environment jsdom
 *
 * Map name and biome in the report header (Buffy task 99).
 *
 * The biome label is checked against `modes/types.ts`'s own map rather than
 * against a word written here, so the report and the setup screens cannot drift.
 */

import { describe, expect, it } from "vitest";
import { buildReport, createReportScreen, siteLine, timeOfDayLabel } from "../index.js";
import { BIOME_LABEL, type BiomeId } from "../../modes/types.js";
import type { AfterActionData } from "../types.js";
import { WEATHER_KINDS, weatherFor } from "../../battleflow/weather.js";

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
describe("conditions on the site line (task 100)", () => {
  it("adds the sky and the light after the place", () => {
    expect(
      siteLine({ mapName: "Dry Fork", biome: "plains", weather: { kind: "rain", label: "Rain" }, timeOfDay: "dusk" }),
    ).toBe("Dry Fork — Plains · Rain · Dusk");
  });

  it("states conditions even when the flow could not place the battle", () => {
    expect(siteLine({ weather: { kind: "clear", label: "Clear skies" }, timeOfDay: "night" })).toBe(
      "Clear skies · Night",
    );
  });

  it("uses the sim's own weather label, never a word of its own", () => {
    for (const kind of WEATHER_KINDS) {
      const weather = weatherFor(`encounter-${kind}`);
      expect(siteLine({ weather })).toBe(weather.label);
      expect(siteLine({ weather }).length).toBeGreaterThan(0);
    }
  });

  it("words every time of day", () => {
    const times = ["dawn", "day", "dusk", "night"] as const;
    expect(times.map((t) => timeOfDayLabel(t))).toEqual([
      "Dawn",
      "Daylight",
      "Dusk",
      "Night",
    ]);
  });

  it("keeps each time of day distinct", () => {
    const labels = (["dawn", "day", "dusk", "night"] as const).map(timeOfDayLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("joins the place and the conditions without doubling separators", () => {
    expect(siteLine({ mapName: "Dry Fork", timeOfDay: "day" })).toBe("Dry Fork · Daylight");
    expect(siteLine({ biome: "forest", weather: { kind: "fog", label: "Fog" } })).toBe("Forest · Fog");
  });
});

describe("conditions on the report screen (task 100)", () => {
  it("prints the sky and the light in the header line", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {}, {
      site: {
        mapName: "Dry Fork",
        biome: "hills",
        weather: weatherFor("dry-fork"),
        timeOfDay: "dusk",
      },
    });
    document.body.appendChild(el);

    const sub = el.querySelector<HTMLElement>('[data-testid="afteraction-site"]');
    expect(sub?.hidden).toBe(false);
    expect(sub?.textContent).toBe(`Dry Fork — Hills · ${weatherFor("dry-fork").label} · Dusk`);
  });

  it("still shows the header line when there is no site at all", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {});
    document.body.appendChild(el);
    expect(el.querySelector<HTMLElement>('[data-testid="afteraction-site"]')?.hidden).toBe(true);
  });
});
