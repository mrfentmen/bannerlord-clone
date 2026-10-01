/**
 * MASTER_PLAN task 19: 20 contrast spot-checks for the high-contrast theme.
 *
 * Each pair is (foreground var, background var) checked against the value the
 * user actually gets — `HIGH_CONTRAST_OVERRIDES` with token defaults as
 * fallback, exactly the cascade the browser resolves. Text pairs need 4.5:1
 * (WCAG AA); border/focus pairs need 3:1.
 */
import { describe, expect, it } from "vitest";
import { HIGH_CONTRAST_OVERRIDES, highContrastCss } from "../highContrast.js";
import { paper, ink, accent, status, focusRing } from "../tokens.js";

function baseVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(paper)) out[`paper-${k}`] = v;
  for (const [k, v] of Object.entries(ink)) out[`ink-${k}`] = v;
  out["accent-primary"] = accent.primary;
  out["accent-primary-deep"] = accent.primaryDeep;
  out["accent-primary-ink"] = accent.primaryInk;
  out["accent-influence"] = accent.influence;
  out["accent-influence-ink"] = accent.influenceInk;
  out["accent-info"] = accent.info;
  out["accent-info-ink"] = accent.infoInk;
  for (const [k, v] of Object.entries(status)) {
    out[`status-${k}`] = v.mark;
    out[`status-${k}-mark`] = v.mark;
    out[`status-${k}-fill`] = v.fill;
    out[`status-${k}-ink`] = v.ink;
  }
  return out;
}

/** Resolve a var the way the cascade does: override wins, else the token. */
function resolve(name: string): string {
  return HIGH_CONTRAST_OVERRIDES[name] ?? baseVars()[name]!;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(fg: string, bg: string): number {
  const l1 = luminance(resolve(fg));
  const l2 = luminance(resolve(bg));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground var, background var, minimum ratio, why it matters]
const SPOT_CHECKS: [string, string, number, string][] = [
  ["ink-900", "paper-100", 4.5, "primary text on panel"],
  ["ink-700", "paper-100", 4.5, "secondary text on panel"],
  ["ink-500", "paper-100", 4.5, "captions on panel"],
  ["ink-900", "paper-0", 4.5, "primary text on sheet top"],
  ["ink-700", "paper-200", 4.5, "table body on recessed fill"],
  ["ink-900", "paper-200", 4.5, "text in input wells"],
  ["accent-primary-ink", "accent-primary", 4.5, "primary button label"],
  ["accent-primary-ink", "accent-primary-deep", 4.5, "deep primary button label"],
  ["accent-influence-ink", "accent-influence", 4.5, "influence label"],
  ["accent-info-ink", "accent-info", 4.5, "info label"],
  ["accent-primary", "paper-100", 4.5, "primary links on panel"],
  ["accent-info", "paper-100", 4.5, "info text on panel"],
  ["status-critical-ink", "status-critical-fill", 4.5, "critical badge text"],
  ["status-warning-ink", "status-warning-fill", 4.5, "warning badge text"],
  ["status-good-ink", "status-good-fill", 4.5, "healthy badge text"],
  ["status-info-ink", "status-info-fill", 4.5, "info badge text"],
  ["status-critical-mark", "paper-100", 4.5, "critical glyph on panel"],
  ["status-warning-mark", "paper-100", 4.5, "warning glyph on panel"],
  ["status-good-mark", "paper-100", 4.5, "healthy glyph on panel"],
  ["status-info-mark", "paper-100", 4.5, "info glyph on panel"],
];

describe("high-contrast theme (task 19)", () => {
  it("runs exactly 20 spot-checks", () => {
    expect(SPOT_CHECKS).toHaveLength(20);
  });

  for (const [fg, bg, min, why] of SPOT_CHECKS) {
    it(`${fg} on ${bg} >= ${min}:1 (${why})`, () => {
      expect(ratio(fg, bg), `${fg}/${bg} ${why}`).toBeGreaterThanOrEqual(min);
    });
  }

  it("the generated CSS carries every override", () => {
    const css = highContrastCss();
    expect(css).toContain("html[data-high-contrast]");
    for (const [name, value] of Object.entries(HIGH_CONTRAST_OVERRIDES)) {
      if (name === "focus-ring") continue;
      expect(css, `--${name}`).toContain(`--${name}: ${value};`);
    }
  });

  it("overrides the token focus ring", () => {
    expect(HIGH_CONTRAST_OVERRIDES["focus-ring"]).not.toBe(focusRing);
    expect(highContrastCss()).toContain("--focus-ring:");
  });
});
