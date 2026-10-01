/**
 * @vitest-environment jsdom
 *
 * Meta tests (MASTER_PLAN 3H, tasks 132-150).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  auditAccessibility,
  buildFeedback,
  challengeFor,
  CHEATS,
  colorblindPresets,
  createAchievements,
  createDebugConsole,
  createIronmanRun,
  createLeaderboard,
  createModManager,
  createProfiler,
  createSaveManager,
  createScalePreview,
  createScenarioEditor,
  creditsList,
  describeCheat,
  emptyStats,
  mergeStats,
  patchNotes,
  searchSettings,
  syncStatus,
  type SaveTarget,
  type SyncTarget,
} from "../index.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("achievements (task 132)", () => {
  it("has 50+ achievements and queues unlock toasts", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(50);
    const a = createAchievements();
    const fresh = a.report("win-10-battles");
    expect(fresh.map((x) => x.id)).toEqual(["unbroken-10"]);
    expect(a.report("win-10-battles")).toEqual([]); // no double unlock
    expect(a.progress().total).toBe(ACHIEVEMENTS.length);
    expect(a.progress().unlocked).toBe(1);
  });
});

describe("statistics and leaderboards (tasks 133-134)", () => {
  it("aggregates lifetime stats across campaigns", () => {
    const total = mergeStats(
      { ...emptyStats(), battlesWon: 3, coinEarned: 1000 },
      { ...emptyStats(), battlesWon: 2, treatiesSigned: 1 },
    );
    expect(total.battlesWon).toBe(5);
    expect(total.treatiesSigned).toBe(1);
  });

  it("keeps local bests per board", () => {
    const lb = createLeaderboard();
    expect(lb.best("wins")).toBeNull();
    lb.submit("wins", { name: "Aldric", score: 30, season: 12 });
    lb.submit("wins", { name: "Bram", score: 45, season: 20 });
    expect(lb.best("wins")!.name).toBe("Bram");
    expect(lb.entries("wins")).toHaveLength(2);
    expect(lb.entries("wins")[0]!.score).toBe(45);
  });
});

describe("modes (tasks 135-137)", () => {
  it("weekly challenges are deterministic per week", () => {
    const a = challengeFor(new Date(2026, 8, 29)); // Tue, ISO week 40
    const b = challengeFor(new Date(2026, 9, 1)); // Thu, same week
    expect(a.id).toBe(b.id); // same ISO week
    expect(a.modifiers).toEqual(b.modifiers);
    expect(a.modifiers.length).toBeGreaterThanOrEqual(2);
    const next = challengeFor(new Date(2026, 9, 6)); // Tue, ISO week 41
    expect(next.id).not.toBe(a.id);
  });

  it("ironman runs die without an heir", () => {
    const run = createIronmanRun();
    run.seasonTick();
    expect(run.alive(true, false)).toBe(true);
    expect(run.alive(false, true)).toBe(true); // heir continues
    expect(run.alive(false, false)).toBe(false); // permadeath
    run.end();
    expect(run.alive(true, true)).toBe(false);
  });

  it("cheats describe themselves", () => {
    expect(CHEATS.length).toBeGreaterThanOrEqual(4);
    expect(describeCheat({ kind: "grant-coin", amount: 10000 })).toContain("10000");
  });
});

describe("scenario editor and mods (tasks 138-139)", () => {
  it("builds and validates scenarios", () => {
    const ed = createScenarioEditor("Riverlands");
    expect(ed.validate().length).toBeGreaterThan(0);
    ed.addSettlement("Harbor", 10, 20);
    ed.addSettlement("Mill", 30, 40);
    ed.addFaction("Harbor Compact", "Harbor");
    ed.addFaction("Rust Horde", "Mill");
    expect(ed.validate()).toEqual([]);
    const s = ed.scenario();
    expect(s.settlements).toHaveLength(2);
    expect(s.factions).toHaveLength(2);
  });

  it("lists and toggles mods as data packs", () => {
    const mods = createModManager();
    mods.install({ id: "m1", name: "Hard mode", version: "1.0" });
    expect(mods.enabled()).toEqual([]);
    mods.setEnabled("m1", true);
    expect(mods.enabled().map((m) => m.id)).toEqual(["m1"]);
    expect(() => mods.setEnabled("nope", true)).toThrow();
  });
});

describe("community (tasks 140-142)", () => {
  it("credits, patch notes, and feedback reports", () => {
    expect(creditsList().length).toBeGreaterThanOrEqual(4);
    expect(patchNotes()[0]!.notes.length).toBeGreaterThan(0);
    const r = buildFeedback("bug", "Crash on save", "The game crashes when I save during a siege.", "map");
    expect(r.kind).toBe("bug");
    expect(() => buildFeedback("bug", "", "long enough body here", "map")).toThrow();
    expect(() => buildFeedback("bug", "title", "short", "map")).toThrow();
  });
});

describe("devtools (tasks 143-144)", () => {
  it("profiles frame times", () => {
    const p = createProfiler(10);
    expect(p.stats()).toBeNull();
    for (let i = 1; i <= 10; i++) p.push(i);
    const s = p.stats()!;
    expect(s.avg).toBeCloseTo(5.5, 5);
    expect(s.p50).toBeLessThanOrEqual(s.p95);
    expect(s.worst).toBe(10);
    p.push(99);
    expect(p.samples()).toHaveLength(10); // ring buffer capped
  });

  it("debug console stays behind its flag", () => {
    const c = createDebugConsole();
    expect(c.run("ping")).toBe("debug console is disabled");
    c.enable();
    expect(c.run("ping")).toBe("pong");
    expect(c.run("nope")).toContain("unknown command");
    c.register("echo", (args) => args.join(" "));
    expect(c.run("echo hi")).toBe("hi");
  });
});

describe("saves and sync (tasks 145-146)", () => {
  const target: SaveTarget = {
    async list() {
      return [{ id: "s1", name: "Campaign", season: 12, updatedAt: "today" }];
    },
    async copy(_id, name) {
      return { id: "s2", name, season: 12, updatedAt: "today" };
    },
    async remove() {},
  };

  it("manages saves through PAX's target", async () => {
    const m = createSaveManager();
    await m.refresh(target);
    expect(m.saves()).toHaveLength(1);
    m.select("s1");
    expect(m.selected()!.name).toBe("Campaign");
    const copy = await m.copySelected(target, "s1", "Backup");
    expect(copy.name).toBe("Backup");
    await m.deleteSelected(target, "s1");
    expect(m.saves().map((s) => s.id)).toEqual(["s2"]);
  });

  it("reports sync status honestly", () => {
    const syncing: SyncTarget = { state: () => "syncing", lastSyncedAt: () => null, pendingCount: () => 3 };
    expect(syncStatus(syncing).summary).toContain("3 changes");
    const offline: SyncTarget = { state: () => "offline", lastSyncedAt: () => null, pendingCount: () => 0 };
    expect(syncStatus(offline).summary).toContain("Offline");
    const idle: SyncTarget = { state: () => "idle", lastSyncedAt: () => "yesterday", pendingCount: () => 0 };
    expect(syncStatus(idle).summary).toContain("yesterday");
  });
});

describe("a11y tooling (tasks 147-150)", () => {
  it("audits the DOM for basic issues", () => {
    document.body.innerHTML = `<img src="x.png"><button></button><input id="q">`;
    const findings = auditAccessibility();
    expect(findings.map((f) => f.rule).sort()).toEqual(["button-label", "img-alt", "input-label"]);
    document.body.innerHTML = `<img src="x.png" alt="map"><button aria-label="close">x</button><label for="q">Q</label><input id="q">`;
    expect(auditAccessibility()).toEqual([]);
  });

  it("offers colorblind presets", () => {
    const presets = colorblindPresets();
    expect(presets.length).toBeGreaterThanOrEqual(4);
    expect(presets.map((p) => p.id)).toContain("deuteranopia");
  });

  it("previews UI scale without committing", () => {
    const preview = createScalePreview();
    preview.preview(1.25);
    expect(preview.current()).toBe(1.25);
    preview.revert();
    preview.commit(1.1);
    expect(preview.current()).toBeCloseTo(1.1, 5);
    expect(() => preview.preview(3)).toThrow();
  });

  it("searches all settings panels at once", () => {
    const entries = [
      { panel: "Graphics", label: "Render scale", description: "Resolution scaling" },
      { panel: "Audio", label: "Master volume", description: "Overall loudness" },
      { panel: "Gameplay", label: "Tax rate", description: "Fief taxation" },
    ];
    expect(searchSettings(entries, "volume")).toHaveLength(1);
    expect(searchSettings(entries, "graphics")).toHaveLength(1);
    expect(searchSettings(entries, "")).toHaveLength(3);
    expect(searchSettings(entries, "zzz")).toEqual([]);
  });
});
