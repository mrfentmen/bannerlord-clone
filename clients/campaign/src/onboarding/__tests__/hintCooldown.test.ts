/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  HINT_COOLDOWN_MS,
  hintCooldownRemaining,
  markHintShown,
  shouldShowHint,
} from "../hintCooldown.js";

beforeEach(() => localStorage.clear());

describe("hint cooldown system (solo task 92)", () => {
  it("new hints may show", () => {
    expect(shouldShowHint("h1", 1000)).toBe(true);
  });

  it("hints don't repeat within 10 minutes", () => {
    expect(HINT_COOLDOWN_MS).toBe(10 * 60 * 1000);
    markHintShown("h1", 1000);
    expect(shouldShowHint("h1", 1000 + 9 * 60 * 1000)).toBe(false);
    expect(shouldShowHint("h1", 1000 + 10 * 60 * 1000)).toBe(true);
  });

  it("cooldowns are per-hint", () => {
    markHintShown("h1", 1000);
    expect(shouldShowHint("h2", 2000)).toBe(true);
  });

  it("reports remaining cooldown", () => {
    markHintShown("h1", 1000);
    expect(hintCooldownRemaining("h1", 1000 + 4 * 60 * 1000)).toBe(6 * 60 * 1000);
    expect(hintCooldownRemaining("h1", 1000 + 20 * 60 * 1000)).toBe(0);
    expect(hintCooldownRemaining("never", 1000)).toBe(0);
  });

  it("survives reload", () => {
    markHintShown("h1", 1000);
    expect(shouldShowHint("h1", 2000)).toBe(false);
  });
});
