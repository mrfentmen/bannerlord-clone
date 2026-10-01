/**
 * @vitest-environment jsdom
 *
 * Campaign timeline tests (MASTER_PLAN task 139): the date-plotted view
 * model over the clan chronicle's deeds, plus the panel's spine rendering,
 * kind filters, and empty state.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_KINDS,
  filterTimeline,
  groupTimeline,
  seasonLabel,
  seasonName,
  seasonYear,
  timelineStats,
} from "../timeline.js";
import { timelinePanel } from "../timelinePanel.js";
import type { ChronicleEvent } from "../../expression/chronicle.js";

function deed(season: number, kind: ChronicleEvent["kind"], text: string): ChronicleEvent {
  return { season, kind, text };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("season labels", () => {
  it("maps seasons to names and years (4 seasons per year)", () => {
    expect(seasonLabel(1)).toBe("Spring, Year 1");
    expect(seasonLabel(4)).toBe("Winter, Year 1");
    expect(seasonLabel(5)).toBe("Spring, Year 2");
    expect(seasonLabel(9)).toBe("Spring, Year 3");
  });

  it("clamps season 0 and below to season 1", () => {
    expect(seasonName(0)).toBe("Spring");
    expect(seasonYear(-3)).toBe(1);
  });
});

describe("groupTimeline", () => {
  it("sorts oldest-first and groups by season", () => {
    const groups = groupTimeline([
      deed(3, "battle", "third-season fight"),
      deed(1, "marriage", "first-season wedding"),
      deed(3, "edict", "third-season edict"),
    ]);
    expect(groups.map((g) => g.season)).toEqual([1, 3]);
    expect(groups[0]?.label).toBe("Spring, Year 1");
    expect(groups[1]?.entries.map((e) => e.text)).toEqual([
      "third-season fight",
      "third-season edict",
    ]);
  });

  it("keeps insertion order for ties within a season (stable)", () => {
    const groups = groupTimeline([
      deed(2, "battle", "a"),
      deed(2, "treaty", "b"),
      deed(2, "birth", "c"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((e) => e.text)).toEqual(["a", "b", "c"]);
  });

  it("drops malformed entries and normalizes unknowns", () => {
    const groups = groupTimeline([
      deed(1, "battle", "   "),
      { season: Number.NaN, kind: "battle", text: "no date" },
      { season: 0, kind: "party" as ChronicleEvent["kind"], text: "mystery" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.season).toBe(1);
    expect(groups[0]?.entries[0]?.kind).toBe("other");
  });

  it("returns no groups for an empty chronicle", () => {
    expect(groupTimeline([])).toEqual([]);
  });
});

describe("filterTimeline", () => {
  const events = [
    deed(1, "battle", "fought"),
    deed(1, "marriage", "wed"),
    deed(2, "battle", "fought again"),
  ];

  it("keeps only the selected kinds", () => {
    expect(filterTimeline(events, new Set(["battle"]))).toHaveLength(2);
    expect(filterTimeline(events, new Set(["marriage"]))).toHaveLength(1);
    expect(filterTimeline(events, new Set(ALL_KINDS))).toHaveLength(3);
  });
});

describe("timelineStats", () => {
  it("aggregates totals, per-kind counts, and the season range", () => {
    const stats = timelineStats([
      deed(5, "battle", "a"),
      deed(2, "battle", "b"),
      deed(9, "marriage", "c"),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.byKind.battle).toBe(2);
    expect(stats.byKind.marriage).toBe(1);
    expect(stats.firstSeason).toBe(2);
    expect(stats.lastSeason).toBe(9);
  });

  it("reports nulls and zeros for an empty chronicle", () => {
    const stats = timelineStats([]);
    expect(stats.total).toBe(0);
    expect(stats.firstSeason).toBeNull();
    expect(stats.lastSeason).toBeNull();
    expect(Object.values(stats.byKind).every((n) => n === 0)).toBe(true);
  });
});

describe("timelinePanel", () => {
  function open(events: ChronicleEvent[]) {
    const handle = timelinePanel({ events: () => events, onClose: () => undefined });
    document.body.appendChild(handle.root);
    return handle;
  }

  it("renders season ticks oldest-first with their events plotted", () => {
    open([
      deed(6, "battle", "summer campaign"),
      deed(1, "marriage", "alliance wedding"),
    ]);
    const seasons = [...document.querySelectorAll("[data-testid^='timeline-season-']")];
    expect(seasons.map((s) => s.getAttribute("data-testid"))).toEqual([
      "timeline-season-1",
      "timeline-season-6",
    ]);
    expect(seasons[0]?.textContent).toContain("Spring, Year 1");
    expect(seasons[1]?.textContent).toContain("Summer, Year 2");
    const cards = [...document.querySelectorAll("[data-testid='timeline-event']")];
    expect(cards).toHaveLength(2);
    expect(document.querySelector("[data-testid='timeline-stats']")?.textContent).toContain("2 deeds");
  });

  it("hides events whose kind filter is toggled off, then back on", () => {
    const handle = open([
      deed(1, "battle", "fought"),
      deed(1, "marriage", "wed"),
    ]);
    const battleChip = document.querySelector<HTMLButtonElement>("[data-testid='timeline-filter-battle']");
    expect(battleChip).not.toBeNull();
    battleChip!.click();
    let cards = [...document.querySelectorAll("[data-testid='timeline-event']")];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain("wed");
    battleChip!.click();
    cards = [...document.querySelectorAll("[data-testid='timeline-event']")];
    expect(cards).toHaveLength(2);
    handle.refresh();
  });

  it("shows the empty state when no deeds are recorded", () => {
    open([]);
    expect(document.querySelector("[data-testid='empty-state']")).not.toBeNull();
    expect(document.querySelector("[data-testid='timeline-stats']")?.textContent).toContain("No deeds");
  });

  it("refresh() re-reads the live event list", () => {
    const events: ChronicleEvent[] = [deed(1, "battle", "first")];
    const handle = open(events);
    events.push(deed(2, "treaty", "second"));
    handle.refresh();
    expect(document.querySelectorAll("[data-testid='timeline-event']")).toHaveLength(2);
  });
});
