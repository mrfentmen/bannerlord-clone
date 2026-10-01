/**
 * @vitest-environment jsdom
 *
 * War memorial tests (MASTER_PLAN task 75).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemorial,
  epitaphFor,
  MEMORIAL_CAP,
  type FallenRecord,
} from "../memorial.js";
import { memorialPanel } from "../memorialPanel.js";
import { createBattleFeedback } from "../../feedback/index.js";
import type { FeedbackProjection, FeedbackSource, HeroKill } from "../../feedback/types.js";

const KILL: HeroKill = {
  killerName: "Rurik",
  killerSide: "enemy",
  victimName: "Mara Voss",
  victimSide: "ally",
  at: 42,
};

function stone(over: Partial<FallenRecord> = {}): Omit<FallenRecord, "epitaph"> & { epitaph?: string } {
  return { id: "test:1", name: "Mara Voss", side: "ally", ...over };
}

describe("epitaphFor", () => {
  it("is deterministic for the same name and side", () => {
    expect(epitaphFor("Mara Voss", "ally")).toBe(epitaphFor("Mara Voss", "ally"));
  });

  it("draws from a different pool for enemies than allies", () => {
    expect(epitaphFor("Mara Voss", "ally")).not.toBe(epitaphFor("Mara Voss", "enemy"));
  });

  it("gives clan dead their own pool", () => {
    expect(epitaphFor("Mara Voss", "clan")).not.toBe(epitaphFor("Mara Voss", "ally"));
  });
});

describe("createMemorial", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records a stone with a generated epitaph", () => {
    const m = createMemorial();
    expect(m.record(stone())).toBe(true);
    const rec = m.list()[0]!;
    expect(rec.name).toBe("Mara Voss");
    expect(rec.epitaph).toBe(epitaphFor("Mara Voss", "ally"));
    expect(m.count()).toBe(1);
  });

  it("keeps a supplied epitaph verbatim", () => {
    const m = createMemorial();
    m.record(stone({ epitaph: "Custom words." }));
    expect(m.list()[0]!.epitaph).toBe("Custom words.");
  });

  it("never double-counts the same death", () => {
    const m = createMemorial();
    expect(m.record(stone())).toBe(true);
    expect(m.record(stone())).toBe(false);
    expect(m.count()).toBe(1);
  });

  it("lists newest first", () => {
    const m = createMemorial();
    m.record(stone({ id: "a", name: "First" }));
    m.record(stone({ id: "b", name: "Second" }));
    expect(m.list().map((s) => s.name)).toEqual(["Second", "First"]);
  });

  it("caps the stones at MEMORIAL_CAP", () => {
    const m = createMemorial();
    for (let i = 0; i < MEMORIAL_CAP + 10; i++) {
      m.record(stone({ id: `s${i}`, name: `Fallen ${i}` }));
    }
    expect(m.count()).toBe(MEMORIAL_CAP);
  });

  it("records hero kills with battle label and killer", () => {
    const m = createMemorial();
    expect(m.recordHeroKill(KILL, "Redfield")).toBe(true);
    const rec = m.list()[0]!;
    expect(rec.name).toBe("Mara Voss");
    expect(rec.side).toBe("ally");
    expect(rec.battleLabel).toBe("Redfield");
    expect(rec.killerName).toBe("Rurik");
    // Same victim recorded twice (e.g. two panes) dedupes.
    expect(m.recordHeroKill(KILL, "Redfield")).toBe(false);
  });

  it("syncs clan deaths once and skips the living", () => {
    const m = createMemorial();
    const members = [
      { id: "c1", name: "Old Rurik", gender: "m" as const, birthYear: 1000, deathYear: 1042, traits: [], skills: {} },
      { id: "c2", name: "Young Rurik", gender: "m" as const, birthYear: 1040, traits: [], skills: {} },
    ];
    expect(m.syncClanDeaths(members)).toBe(1);
    expect(m.syncClanDeaths(members)).toBe(0); // idempotent
    expect(m.count()).toBe(1);
    expect(m.list()[0]!.name).toContain("Old Rurik");
    expect(m.list()[0]!.name).toContain("1000–1042");
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("campaign.memorial.v1", "not json{");
    const m = createMemorial();
    expect(m.count()).toBe(0);
    expect(m.record(stone())).toBe(true);
  });

  it("persists across instances", () => {
    const m = createMemorial();
    m.record(stone());
    const m2 = createMemorial();
    expect(m2.count()).toBe(1);
    expect(m2.list()[0]!.name).toBe("Mara Voss");
  });

  it("clears every stone", () => {
    const m = createMemorial();
    m.record(stone());
    m.clear();
    expect(m.count()).toBe(0);
  });
});

describe("memorialPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function mount(entries: FallenRecord[] = [stone({ epitaph: "Carved." }) as FallenRecord]) {
    const onClear = vi.fn();
    const onClose = vi.fn();
    const handle = memorialPanel({ entries: () => entries, onClear, onClose });
    document.body.appendChild(handle.root);
    return { handle, onClear, onClose };
  }

  it("lists every stone, newest first", () => {
    const entries = [
      { ...stone({ id: "b", name: "Second", epitaph: "E2" }) },
      { ...stone({ id: "a", name: "First", epitaph: "E1" }) },
    ] as FallenRecord[];
    const { handle } = mount(entries);
    const stones = handle.root.querySelectorAll('[data-testid="memorial-stone"]');
    expect(stones).toHaveLength(2);
    expect(stones[0]?.textContent).toContain("Second");
    expect(stones[1]?.textContent).toContain("First");
    expect(stones[0]?.textContent).toContain("E2");
    handle.dispose();
  });

  it("shows an empty state when no one has fallen", () => {
    const { handle } = mount([]);
    expect(handle.root.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    handle.dispose();
  });

  it("clears only after two-step confirm", () => {
    const { handle, onClear } = mount();
    const clearBtn = handle.root.querySelector('[data-testid="memorial-clear"]') as HTMLButtonElement;
    clearBtn.click();
    expect(onClear).not.toHaveBeenCalled();
    const confirm = handle.root.querySelector('[data-testid="memorial-clear-confirm"]') as HTMLButtonElement;
    confirm.click();
    expect(onClear).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it("closes on the panel close button", () => {
    const { handle, onClose } = mount();
    (handle.root.querySelector(".panel__close") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.dispose();
  });
});

describe("memorial + battle feedback", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function fakeSource(): FeedbackSource & { emitKill(k: HeroKill): void } {
    const kills: Array<(k: HeroKill) => void> = [];
    const noop = () => () => undefined;
    return {
      onHeroKill: (fn) => {
        kills.push(fn);
        return () => {
          const i = kills.indexOf(fn);
          if (i >= 0) kills.splice(i, 1);
        };
      },
      onDamage: noop,
      onThreat: noop,
      onMoment: noop,
      onPlayerHealth: noop,
      objectives: () => [],
      onObjectivesChanged: noop,
      units: () => [],
      onUnitsChanged: noop,
      emitKill: (k) => kills.forEach((fn) => fn(k)),
    };
  }

  const projection: FeedbackProjection = {
    fieldToScreen: () => ({ x: 0, y: 0 }),
    viewport: () => ({ w: 100, h: 100 }),
  };

  it("carves a stone for every hero kill while feedback is live", () => {
    const memorial = createMemorial();
    const source = fakeSource();
    const fb = createBattleFeedback(source, projection, { memorial, battleLabel: "Redfield" });
    source.emitKill(KILL);
    source.emitKill({ ...KILL, victimName: "Jorunn", killerName: "Sven" });
    expect(memorial.count()).toBe(2);
    expect(memorial.list().map((s) => s.battleLabel)).toEqual(["Redfield", "Redfield"]);
    fb.destroy();
  });

  it("stops recording after the feedback is destroyed", () => {
    const memorial = createMemorial();
    const source = fakeSource();
    const fb = createBattleFeedback(source, projection, { memorial });
    fb.destroy();
    source.emitKill(KILL);
    expect(memorial.count()).toBe(0);
  });
});
