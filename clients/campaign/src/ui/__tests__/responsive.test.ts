/**
 * Mobile responsive CSS tests. MASTER_PLAN.md section 4F task 153.
 *
 * @vitest-environment jsdom
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS_PATH = join(__dirname, "..", "ui.css");
const css = readFileSync(CSS_PATH, "utf8");

/** The contents of the 480px media query block. */
function mobileBlock(): string {
  const start = css.indexOf("@media (max-width: 480px)");
  expect(start).toBeGreaterThan(-1);
  // The mobile block is the last block in the file, so everything after it is it.
  return css.slice(start);
}

describe("mobile layout (task 153)", () => {
  it("has a media query covering the 390px iPhone SE class of viewport", () => {
    const block = mobileBlock();
    expect(block).toContain("@media (max-width: 480px)");
  });

  it("collapses the two-column HUD to one column with no horizontal scroll", () => {
    const block = mobileBlock();
    expect(block).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(block).toContain("overflow-x: hidden");
    expect(block).toContain(".hud__right");
  });

  it("makes panels go edge to edge", () => {
    expect(mobileBlock()).toContain("max-width: 100%");
  });

  it("wraps the time controls so the speed buttons never overflow", () => {
    expect(mobileBlock()).toContain(".time-controls");
    expect(mobileBlock()).toContain("flex-wrap: wrap");
  });

  it("gives the 3D canvas touch-action: none so gestures reach the scene", () => {
    expect(css).toMatch(/canvas\s*\{\s*touch-action:\s*none/);
  });

  it("uses no hex colour literals in the mobile block", () => {
    const block = mobileBlock();
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
