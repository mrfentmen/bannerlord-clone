/**
 * High-contrast UI theme (MASTER_PLAN task 19).
 *
 * The single source of truth for the high-contrast overrides: `main.ts`
 * injects `highContrastCss()` as a `<style>` block, and
 * `__tests__/high-contrast.test.ts` computes WCAG contrast ratios from
 * `HIGH_CONTRAST_OVERRIDES` directly, so the values the test checks are the
 * values the user sees — no duplicated hexes.
 *
 * Direction: pure black on pure white, the one place the art direction's
 * "never pure black on pure white" rule is overruled — the user asked for it.
 * Statuses keep their glyph shapes as the primary signal; the colors below
 * just need to clear AA against their surfaces.
 */

/** CSS variable (without the leading `--`) -> high-contrast value. */
export const HIGH_CONTRAST_OVERRIDES: Record<string, string> = {
  // Surfaces: white, with grays reserved for borders and disabled fills.
  "paper-0": "#ffffff",
  "paper-100": "#ffffff",
  "paper-200": "#e8e8e8",
  "paper-300": "#767676",
  "paper-400": "#595959",
  // Ink: black, stepped only for hierarchy, never below AA on white.
  "ink-900": "#000000",
  "ink-700": "#1a1a1a",
  "ink-500": "#333333",
  "ink-300": "#595959",
  // Accents: saturated enough to clear AA as text on white.
  "accent-primary": "#0033cc",
  "accent-primary-deep": "#002288",
  "accent-primary-ink": "#ffffff",
  "accent-influence": "#5b1a8f",
  "accent-influence-ink": "#ffffff",
  "accent-info": "#00444d",
  "accent-info-ink": "#ffffff",
  // Statuses: dark marks on light surfaces, white ink on dark fills.
  "status-critical": "#a31212",
  "status-critical-mark": "#a31212",
  "status-critical-fill": "#7a0e0e",
  "status-critical-ink": "#ffffff",
  "status-warning": "#7a5200",
  "status-warning-mark": "#7a5200",
  "status-warning-fill": "#5c3d00",
  "status-warning-ink": "#ffffff",
  "status-good": "#006400",
  "status-good-mark": "#006400",
  "status-good-fill": "#004d00",
  "status-good-ink": "#ffffff",
  "status-info": "#005a9c",
  "status-info-mark": "#005a9c",
  "status-info-fill": "#004578",
  "status-info-ink": "#ffffff",
  // Focus ring: thicker and black-on-white so keyboard focus is unmissable.
  "focus-ring": "0 0 0 3px #ffffff, 0 0 0 6px #000000",
};

/** The `html[data-high-contrast]` block main.ts injects. */
export function highContrastCss(): string {
  const lines = Object.entries(HIGH_CONTRAST_OVERRIDES).map(
    ([name, value]) => `  --${name}: ${value};`,
  );
  return `html[data-high-contrast] {\n${lines.join("\n")}\n}`;
}
