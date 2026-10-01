/**
 * The rules that keep the client from becoming generic.
 *
 * `CONSTITUTION.md` section 3.4 says components do not introduce their own palette or
 * fonts, and section 3.2 bans spinners, and section 3.3 bans placeholder text. Each of
 * those is only enforceable if something checks, so this file checks them by reading
 * the source rather than by trusting review.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tokens, status, paper, ink, accent } from "../index.js";
import { grade, eraGrades, resolveGrade } from "../grade.js";
import { tokensCss } from "../tokens-css.js";

// fileURLToPath, not `.pathname`: the repo path contains a space, which the
// URL form percent-encodes and readdirSync cannot resolve.
const SRC = fileURLToPath(new URL("../../../", import.meta.url));
const UI = join(SRC, "src");

function sourceFiles(dir: string, extensions = [".ts", ".css"]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip nothing: the fixture is in src/data/fixture and the test files are too.
      out.push(...sourceFiles(full, extensions));
    } else if (extensions.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

describe("no invented design system", () => {
  it("has no hex colour literal in any component", () => {
    // tokens.ts holds the palette. grade.ts holds the locked colour grade, which
    // ART_DIRECTION.md section 9 specifies as numbers rather than as token names, so it
    // is part of the direction rather than a component inventing its own. tokens.css is
    // generated from both. factions.ts holds the locked faction palettes (task 18)
    // and highContrast.ts the locked high-contrast theme (task 19): both are
    // palettes in their own right, verified by their own contrast tests.
    // Everything else must use a token. src/clan/bannerPalette.ts holds the
    // locked heraldic palette for the clan banner designer (task 81): a
    // palette in its own right, like factions.ts. src/economy/goodsPalette.ts
    // holds the locked categorical palette for trade-good route colours
    // (task 102): data colours for the map layer, likewise a palette in its
    // own right.
    const allowed = new Set([
      "src/design/tokens.ts",
      "src/design/tokens-css.ts",
      "src/design/grade.ts",
      "src/design/factions.ts",
      "src/design/highContrast.ts",
      "src/design/tokens.css",
      "src/data/fixture/fixtureProvider.ts",
      "src/clan/bannerPalette.ts",
      "src/economy/goodsPalette.ts",
    ]);
    const offenders: string[] = [];
    for (const file of sourceFiles(UI)) {
      const rel = file.slice(SRC.length);
      if (allowed.has(rel)) continue;
      if (file.endsWith(".test.ts")) continue;
      const hex = read(file).match(/#[0-9A-Fa-f]{6}\b/g);
      if (hex) offenders.push(`${rel}: ${[...new Set(hex)].join(", ")}`);
    }
    expect(offenders, `hex colours outside the token file:\n${offenders.join("\n")}`).toHaveLength(0);
  });

  it("has no font-family declaration outside the token file", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(UI, [".ts", ".css"])) {
      const rel = file.slice(SRC.length);
      if (rel === "src/design/tokens.ts" || rel === "src/design/tokens-css.ts") continue;
      if (file.endsWith(".test.ts")) continue;
      const text = read(file);
      if (/font-family\s*[:=]/.test(text) && !/var\(--font-/.test(text)) {
        offenders.push(rel);
      }
    }
    expect(offenders, `font-family declared outside tokens:\n${offenders.join("\n")}`).toHaveLength(0);
  });

  it("uses the CSS variables, not raw values, for colour in the component stylesheet", () => {
    const css = read(join(UI, "ui", "ui.css"));
    // The only hex values permitted are inside the tokens import, which ui.css does not
    // contain at all. Everything must be var(--...).
    const hex = css.match(/#[0-9A-Fa-f]{3,8}\b/g);
    expect(hex, `ui.css contains literal colours: ${hex?.join(", ")}`).toBeNull();
    expect(css).toContain("var(--paper-100)");
    expect(css).toContain("var(--ink-900)");
  });
});

describe("no spinners (CONSTITUTION.md section 3.2)", () => {
  // Checked as animation constructs, not as the word "spinner": the word appears in
  // comments explaining the ban, and a comment is not a spinner. The rendered-output
  // check lives in src/ui/__tests__/rendered.test.ts.
  const banned = /@keyframes\s+spin\b|animation-iteration-count\s*:\s*infinite[\s\S]{0,200}?rotate\(|\bprogressRing\b|\bspinnerElement\b/i;

  it("has no spinning animation construct anywhere in the client", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(UI)) {
      if (file.endsWith(".test.ts")) continue;
      if (banned.test(read(file))) offenders.push(file.slice(SRC.length));
    }
    expect(offenders, `a spinning animation construct is in:\n${offenders.join("\n")}`).toHaveLength(0);
  });

  it("has no rule that rotates a UI element", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(UI, [".css"])) {
      const text = read(file);
      // A rotate() inside a keyframe body is the only way CSS spins something.
      for (const m of text.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
        if (/rotate\s*\(/.test(m[2]!)) offenders.push(`${file.slice(SRC.length)} @keyframes ${m[1]}`);
      }
    }
    expect(offenders, `keyframes that rotate:\n${offenders.join("\n")}`).toHaveLength(0);
  });

  it("animates the skeleton wash by opacity only", () => {
    const css = read(join(UI, "ui", "ui.css"));
    expect(css).toContain("@keyframes skeleton-wash");
    const body = css.slice(css.indexOf("@keyframes skeleton-wash"));
    const block = body.slice(0, body.indexOf("}"));
    expect(block).toContain("opacity");
    expect(block).not.toContain("rotate");
    expect(block).not.toContain("transform");
  });
});

describe("status is readable without colour vision (UI_UX.md section 12)", () => {
  it("gives every status a distinct glyph", () => {
    const glyphs = Object.values(status).map((s) => s.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("keeps the four status colours distinguishable in the common dichromacies", () => {
    // Brettel-style simulation of deuteranopia, protanopia and tritanopia, applied to
    // the status colours. Distinct lightness is what survives all three.
    const simulate = (hex: string, kind: "deut" | "prot" | "trit"): number[] => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      // Linearise, transform, then back to relative luminance.
      const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const [R, G, B] = [lin(r), lin(g), lin(b)];
      let o: [number, number, number];
      if (kind === "deut") o = [0.625 * R + 0.375 * G, 0.7 * R + 0.3 * G, 0.3 * R + 0.7 * G];
      else if (kind === "prot") o = [0.567 * R + 0.433 * G, 0.558 * R + 0.442 * G, 0.242 * R + 0.758 * G];
      else o = [0.95 * R + 0.05 * G, 0, 0.433 * G + 0.567 * B];
      const lum = (c: number): number =>
        c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
      return [lum(o[0]), lum(o[1]), lum(o[2])];
    };

    const entries = Object.entries(status);
    const pairs: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    for (const kind of ["deut", "prot", "trit"] as const) {
      for (const [a, b] of pairs) {
        const ca = entries[a]![1].mark;
        const cb = entries[b]![1].mark;
        const la = simulate(ca, kind);
        const lb = simulate(cb, kind);
        const delta =
          0.2126 * Math.abs(la[0]! - lb[0]!) +
          0.7152 * Math.abs(la[1]! - lb[1]!) +
          0.0722 * Math.abs(la[2]! - lb[2]!);
        // A pair that collapses to the same luminance would be indistinguishable. The
        // glyph is the primary defence and this is the secondary one, so the bar is set
        // where the four marks stay apart without a hue that fights the palette.
        expect(delta, `${ca} and ${cb} collapse under ${kind} vision`).toBeGreaterThan(0.03);
      }
    }
  });
});

describe("contrast on paper", () => {
  const luminance = (hex: string): number => {
    const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const r = lin(parseInt(hex.slice(1, 3), 16) / 255);
    const g = lin(parseInt(hex.slice(3, 5), 16) / 255);
    const b = lin(parseInt(hex.slice(5, 7), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  it("clears WCAG AA for every text colour used on the panel surface", () => {
    // ink-900 and ink-700 carry body copy; ink-500 carries captions at 12px, which is
    // "normal text" under AA and needs 4.5:1.
    expect(contrast(ink[900], paper[100])).toBeGreaterThanOrEqual(7);
    expect(contrast(ink[700], paper[100])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink[500], paper[100])).toBeGreaterThanOrEqual(4.5);
    // ink-300 is decorative only; the test below pins that.
    expect(contrast(ink[300], paper[100])).toBeLessThan(4.5);
  });

  it("clears the non-text bar for every status mark on the panel surface", () => {
    // WCAG 1.4.11: a glyph, a gauge fill or a rule is a graphical object and needs 3:1.
    for (const s of Object.values(status)) {
      expect(contrast(s.mark, paper[100]), `${s.mark} on paper`).toBeGreaterThanOrEqual(3);
    }
  });

  it("clears AA for paper ink on every status fill", () => {
    for (const s of Object.values(status)) {
      expect(contrast(s.fill, s.ink), `${s.fill} with ${s.ink}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(accent.primary, accent.primaryInk)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent.influence, accent.influenceInk)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent.info, accent.infoInk)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the grade is the locked one (ART_DIRECTION.md section 9)", () => {
  it("desaturates, because SPEC.md section 7 says not neon", () => {
    expect(grade.saturation).toBeLessThan(0);
    expect(grade.saturation).toBe(-0.22);
  });

  it("uses ACES tone mapping, a vignette and animated monochrome grain", () => {
    expect(grade.toneMapping).toBe("ACES");
    expect(grade.vignette.weight).toBeGreaterThan(0);
    expect(grade.grain.animated).toBe(true);
    expect(grade.grain.monochrome).toBe(true);
  });

  it("scales the era grades rather than replacing them", () => {
    for (const era of eraGrades) {
      const resolved = resolveGrade("high", 2005);
      expect(resolved.contrast).toBeCloseTo(grade.contrast * resolvedEra().contrast, 5);
      void era;
    }
    function resolvedEra() {
      return eraGrades[3]!;
    }
  });

  it("drops grain and vignette at low quality, but keeps the grade", () => {
    const low = resolveGrade("low", 2005);
    expect(low.grain.intensity).toBe(0);
    expect(low.vignette.weight).toBe(0);
    expect(low.fxaa).toBe(false);
    // The grade is the art direction; the effects are decoration.
    expect(low.saturation).toBeCloseTo(grade.saturation * eraGrades[3]!.saturation, 5);
  });
});

describe("the stylesheet cannot drift from the tokens", () => {
  it("matches what the generator produces, character for character", () => {
    const onDisk = read(join(UI, "design", "tokens.css"));
    expect(onDisk, "src/design/tokens.css is stale. Run `npm run tokens:build`.").toBe(tokensCss());
  });

  it("emits every token as a CSS custom property", () => {
    const css = tokensCss();
    for (const key of Object.keys(tokens.paper)) expect(css).toContain(`--paper-${key}:`);
    for (const key of Object.keys(tokens.ink)) expect(css).toContain(`--ink-${key}:`);
    for (const key of Object.keys(tokens.space)) expect(css).toContain(`--space-${key}:`);
    for (const key of Object.keys(tokens.status)) expect(css).toContain(`--status-${key}:`);
    for (const key of Object.keys(tokens.type)) {
      const kebab = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      expect(css, `--type-${kebab}-size is missing`).toContain(`--type-${kebab}-size:`);
    }
  });

  it("declares every type step in tabular mono, so a column of numbers does not jitter", () => {
    const css = tokensCss();
    for (const key of ["data", "data-lg", "data-sm"]) {
      expect(css).toMatch(new RegExp(`--type-${key}-family: var\\(--font-mono\\)`));
    }
  });
});
