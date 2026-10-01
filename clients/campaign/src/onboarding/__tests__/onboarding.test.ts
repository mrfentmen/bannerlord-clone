/**
 * @vitest-environment jsdom
 *
 * Onboarding tests (MASTER_PLAN 3F, tasks 116-122).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  canDeclareWar,
  createBattleGuide,
  createTooltipRegistry,
  createTutorial,
  createVideoPlayer,
  DEFAULT_HINTS,
  GRACE_SEASONS,
  helpFor,
  REQUIRED_TOOLTIPS,
  searchGlossary,
  VIDEO_GUIDES,
} from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("tutorial (task 116)", () => {
  it("shows contextual hints and never repeats dismissed ones", () => {
    const tut = createTutorial(DEFAULT_HINTS);
    const mapHints = tut.hintsFor("map", 10);
    expect(mapHints.length).toBeGreaterThan(0);
    tut.dismiss(mapHints[0]!.id);
    const again = tut.hintsFor("map", 10);
    expect(again.find((h) => h.id === mapHints[0]!.id)).toBeUndefined();
    // After the first hour, no hints.
    expect(tut.hintsFor("map", 61)).toEqual([]);
  });
});

describe("guided first battle (task 117)", () => {
  it("plays advisor lines per trigger without repeating", () => {
    const guide = createBattleGuide();
    const first = guide.onTrigger("battle-started");
    expect(first!.advisor.length).toBeGreaterThan(0);
    expect(first!.objective.length).toBeGreaterThan(0);
    expect(guide.onTrigger("battle-started")).toBeNull();
    expect(guide.onTrigger("unknown-trigger")).toBeNull();
    expect(guide.steps().length).toBeGreaterThanOrEqual(5);
  });
});

describe("tooltips (task 118)", () => {
  it("coverage check catches missing tooltips", () => {
    const reg = createTooltipRegistry();
    expect(reg.missing(REQUIRED_TOOLTIPS)).toHaveLength(REQUIRED_TOOLTIPS.length);
    for (const id of REQUIRED_TOOLTIPS) reg.register(id, `Tooltip for ${id}`);
    expect(reg.missing(REQUIRED_TOOLTIPS)).toEqual([]);
    expect(reg.textFor("tax-rate")).toContain("tax-rate");
  });
});

describe("help overlay (task 119)", () => {
  it("has help for every major screen", () => {
    for (const screen of ["map", "battle", "clan", "court", "economy", "diplomacy", "espionage"]) {
      expect(helpFor(screen).length).toBeGreaterThan(0);
    }
    expect(helpFor("nope")).toEqual([]);
  });
});

describe("glossary (task 120)", () => {
  it("searches terms, definitions, and tags", () => {
    expect(searchGlossary("").length).toBeGreaterThanOrEqual(10);
    expect(searchGlossary("dowry")).toHaveLength(1);
    expect(searchGlossary("battle").length).toBeGreaterThanOrEqual(2);
    expect(searchGlossary("zzz")).toEqual([]);
  });
});

describe("video guides (task 121)", () => {
  it("lists guides and renders a placeholder player", () => {
    expect(VIDEO_GUIDES.length).toBeGreaterThanOrEqual(3);
    const player = createVideoPlayer(VIDEO_GUIDES[0]!);
    document.body.appendChild(player);
    expect(player.querySelector(".video-guide-title")!.textContent).toBe(VIDEO_GUIDES[0]!.title);
    expect(player.querySelector(".video-guide-frame")!.textContent).toContain("coming soon");
    expect((player.querySelector(".video-guide-link") as HTMLAnchorElement).href).toBe(
      VIDEO_GUIDES[0]!.url,
    );
  });
});

describe("new-player protection (task 122)", () => {
  it("blocks stronger neighbors during the grace period", () => {
    expect(GRACE_SEASONS).toBe(10);
    const blocked = canDeclareWar(5000, 500, 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("protection");
    // Equal strength is fine even during grace.
    expect(canDeclareWar(500, 500, 3).allowed).toBe(true);
    // After grace, anything goes.
    expect(canDeclareWar(5000, 500, 11).allowed).toBe(true);
  });
});
