import { describe, expect, it } from "vitest";
import { ALL_CODEX_ENTRIES } from "../corpus.js";
import { auditCodexCoverage, GAME_SYSTEMS } from "../audit.js";

describe("codex missing-entries audit (solo task 93)", () => {
  it("every game system has a codex entry", () => {
    const result = auditCodexCoverage(ALL_CODEX_ENTRIES);
    expect(result.missing).toEqual([]);
    expect(result.covered).toBe(GAME_SYSTEMS.length);
    expect(result.line).toContain("Codex complete");
  });

  it("detects missing entries", () => {
    const result = auditCodexCoverage([]);
    expect(result.missing).toEqual([...GAME_SYSTEMS]);
    expect(result.line).toContain("missing");
  });

  it("detects a single gap", () => {
    const partial = ALL_CODEX_ENTRIES.filter((e) => !e.tags.includes("mechanic:loans"));
    const result = auditCodexCoverage(partial);
    expect(result.missing).toEqual(["loans"]);
  });
});
