/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { dailySeedPanel, dailySeedString } from "../dailySeedPanel.js";
import { dailySeed } from "../rng.js";

describe("daily seed display (solo task 40)", () => {
  it("matches the daily challenge seed", () => {
    const date = new Date(2026, 9, 2);
    expect(dailySeedString(date)).toBe(dailySeed(date).toString(36));
  });

  it("renders the seed value", () => {
    const date = new Date(2026, 9, 2);
    const el = dailySeedPanel(date);
    const value = el.querySelector('[data-testid="daily-seed-value"]');
    expect(value?.textContent).toContain(String(dailySeed(date)));
  });

  it("has a copy button", () => {
    const el = dailySeedPanel(new Date(2026, 9, 2));
    const btn = el.querySelector('[data-testid="daily-seed-copy"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe("Copy");
  });

  it("is deterministic for the same date", () => {
    const date = new Date(2026, 9, 2);
    expect(dailySeedString(date)).toBe(dailySeedString(new Date(date)));
  });
});
