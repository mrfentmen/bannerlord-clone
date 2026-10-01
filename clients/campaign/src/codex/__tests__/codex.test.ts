/**
 * Codex tests (MASTER_PLAN task 123).
 *
 * Accept: every mechanic has an entry. The coverage test below ties the
 * corpus to the real sources of mechanics: every input action id and every
 * settings key must be tagged on at least one entry. Add a new action or
 * setting and this test fails until you document it.
 */

import { describe, expect, it } from "vitest";
import { ACTION_DEFS } from "../../input/actions.js";
import { DEFAULT_SETTINGS } from "../../settings/schema.js";
import { ALL_CODEX_ENTRIES, getEntry, searchCodex } from "../index.js";
import { CODEX_CATEGORIES } from "../types.js";

describe("codex corpus", () => {
  it("has unique ids", () => {
    const ids = ALL_CODEX_ENTRIES.map((en) => en.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every category", () => {
    const present = new Set(ALL_CODEX_ENTRIES.map((en) => en.category));
    expect([...CODEX_CATEGORIES].every((c) => present.has(c))).toBe(true);
  });

  it("documents every input action (accept: every mechanic has an entry)", () => {
    const tagged = new Set(
      ALL_CODEX_ENTRIES.flatMap((en) =>
        en.tags.filter((t) => t.startsWith("action:")).map((t) => t.slice("action:".length)),
      ),
    );
    const missing = ACTION_DEFS.map((a) => a.id).filter((id) => !tagged.has(id));
    expect(missing).toEqual([]);
  });

  it("documents every settings key (accept: every mechanic has an entry)", () => {
    const tagged = new Set(
      ALL_CODEX_ENTRIES.flatMap((en) =>
        en.tags.filter((t) => t.startsWith("setting:")).map((t) => t.slice("setting:".length)),
      ),
    );
    const missing = Object.keys(DEFAULT_SETTINGS)
      .filter((k) => k !== "version")
      .filter((k) => !tagged.has(k));
    expect(missing).toEqual([]);
  });

  it("has no dangling related links", () => {
    const ids = new Set(ALL_CODEX_ENTRIES.map((en) => en.id));
    const dangling = ALL_CODEX_ENTRIES.flatMap((en) =>
      en.related.filter((r) => !ids.has(r)).map((r) => `${en.id} -> ${r}`),
    );
    expect(dangling).toEqual([]);
  });

  it("has non-empty summaries and bodies", () => {
    for (const en of ALL_CODEX_ENTRIES) {
      expect(en.summary.trim().length).toBeGreaterThan(0);
      expect(en.body.length).toBeGreaterThan(0);
      expect(en.body.every((p) => p.trim().length > 0)).toBe(true);
    }
  });
});

describe("searchCodex", () => {
  it("finds entries by title token", () => {
    const hits = searchCodex(ALL_CODEX_ENTRIES, "deployment");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.id).toBe("mechanic-deployment");
  });

  it("finds entries by tag", () => {
    const hits = searchCodex(ALL_CODEX_ENTRIES, "action:map.zoomIn");
    expect(hits.map((h) => h.id)).toContain("action-map-zoom-in");
  });

  it("finds entries by body text", () => {
    const hits = searchCodex(ALL_CODEX_ENTRIES, "wages owed");
    expect(hits.map((h) => h.id)).toContain("mechanic-upkeep");
  });

  it("requires every token to match", () => {
    const hits = searchCodex(ALL_CODEX_ENTRIES, "deployment zzz-no-such-token");
    expect(hits).toHaveLength(0);
  });

  it("returns everything, category-ordered, on an empty query", () => {
    const all = searchCodex(ALL_CODEX_ENTRIES, "");
    expect(all).toHaveLength(ALL_CODEX_ENTRIES.length);
    const firstCategory = all[0]!.category;
    expect(firstCategory).toBe(CODEX_CATEGORIES[0]);
  });

  it("ranks title hits above body hits", () => {
    const hits = searchCodex(ALL_CODEX_ENTRIES, "taxes");
    expect(hits[0]!.id).toBe("mechanic-taxes");
  });
});

describe("getEntry", () => {
  it("resolves by id and returns undefined for unknown ids", () => {
    expect(getEntry(ALL_CODEX_ENTRIES, "lore-miami")?.title).toBe("Miami");
    expect(getEntry(ALL_CODEX_ENTRIES, "nope")).toBeUndefined();
  });
});
