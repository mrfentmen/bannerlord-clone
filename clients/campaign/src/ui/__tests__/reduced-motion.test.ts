/**
 * MASTER_PLAN task 20: the in-app reduced-motion switch kills animation.
 *
 * The `data-reduce-motion` attribute (set by main.ts from the setting) must
 * map to a CSS rule that disables every animation and transition. The 3D
 * side — freezing the animated film grain — is verified at compile time:
 * main.ts calls `scene.setReduceMotion`, which only typechecks because the
 * SceneHandle interface and CampaignScene implementation both define it.
 * (No shake, hit-stop, or camera sway systems exist to disable; the scene
 * module documents that explicitly.)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("../ui.css", import.meta.url), "utf8");

describe("reduced motion (task 20)", () => {
  it("the data-reduce-motion rule kills animations and transitions globally", () => {
    expect(CSS).toContain("html[data-reduce-motion]");
    const start = CSS.indexOf("html[data-reduce-motion]");
    const block = CSS.slice(start, CSS.indexOf("}", CSS.indexOf("{", start)) + 1);
    expect(block).toContain("animation: none");
    expect(block).toContain("transition: none");
    // Pseudo-elements too, or decorative animation leaks through.
    expect(CSS).toContain("html[data-reduce-motion] *::before");
    expect(CSS).toContain("html[data-reduce-motion] *::after");
  });

  it("the scene exposes setReduceMotion for the grain freeze", () => {
    const scene = readFileSync(new URL("../../scene/CampaignScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("setReduceMotion(on: boolean): void;");
    expect(scene).toContain("setReduceMotion(on) {");
  });
});
