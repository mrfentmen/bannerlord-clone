/**
 * MASTER_PLAN task 24: photosensitivity guard.
 *
 * WCAG 2.3.1: no content flashes more than 3 times per second. This test
 * parses ui.css for repeating animations and fails if any infinite animation
 * has a period shorter than 1/3s. It also documents the current inventory:
 * the two infinite animations (skeleton wash, key-capture pulse) both run at
 * or below 1 Hz and animate opacity only — no strobing, no full-screen
 * flashing, and the WebGL scene has no flashing light sources.
 *
 * Node fs reads the stylesheet; no CSS parser dependency needed for a
 * duration scan.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("../ui.css", import.meta.url), "utf8");

/** Max flash rate: 3 Hz -> minimum safe period 1/3 s. */
const MIN_PERIOD_S = 1 / 3;

function durationSeconds(token: string): number | null {
  const m = token.match(/^(\d+(?:\.\d+)?)(m?s)$/);
  if (!m) return null;
  const v = parseFloat(m[1]!);
  return m[2] === "ms" ? v / 1000 : v;
}

interface RepeatingAnimation {
  selector: string;
  declaration: string;
  period: number;
}

function repeatingAnimations(css: string): RepeatingAnimation[] {
  const out: RepeatingAnimation[] = [];
  // Match each rule block, then animation shorthands inside it.
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = ruleRe.exec(css)) !== null) {
    const selector = rule[1]!.trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    const animRe = /(?:^|;)\s*animation\s*:\s*([^;]+);/g;
    let anim: RegExpExecArray | null;
    while ((anim = animRe.exec(rule[2]!)) !== null) {
      const decl = anim[1]!.trim();
      if (!/\binfinite\b/.test(decl)) continue;
      if (/none/.test(decl)) continue;
      const tokens = decl.split(/\s+/);
      const period = tokens.map(durationSeconds).find((d) => d !== null) ?? null;
      if (period !== null) out.push({ selector, declaration: decl, period });
    }
  }
  return out;
}

describe("photosensitivity guard (task 24)", () => {
  it("no infinite animation flashes faster than 3 Hz", () => {
    const bad = repeatingAnimations(CSS).filter((a) => a.period < MIN_PERIOD_S);
    expect(
      bad.map((a) => `${a.selector}: ${a.declaration} (${(1 / a.period).toFixed(1)} Hz)`),
    ).toEqual([]);
  });

  it("documents the repeating-animation inventory", () => {
    const found = repeatingAnimations(CSS);
    // Exactly the two known low-frequency animations; a new strobing
    // animation fails the rate test above, and an unexpected addition here
    // forces a human to acknowledge it.
    const names = found.map((a) => a.declaration.split(/\s+/)[0]).sort();
    expect(names).toEqual(["chord-pulse", "skeleton-wash"]);
    for (const a of found) {
      expect(a.period, a.declaration).toBeGreaterThanOrEqual(1); // <= 1 Hz
    }
  });
});
