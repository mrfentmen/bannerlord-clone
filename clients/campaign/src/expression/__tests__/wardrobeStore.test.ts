/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createWardrobe } from "../wardrobe.js";
import { applyWarPaintPreset } from "../warPaintPresets.js";

beforeEach(() => localStorage.clear());

describe("wardrobe persistence + war paint design (integration)", () => {
  it("persists unlocks, equipment, pose, and design", () => {
    const w1 = createWardrobe();
    w1.unlock("paint-ash");
    w1.equip("war-paint", "paint-ash");
    w1.unlock("pose-fist");
    w1.setVictoryPose("pose-fist");
    w1.setWarPaint(applyWarPaintPreset("blood-eagle"));

    const w2 = createWardrobe();
    expect(w2.unlocked()).toContain("paint-ash");
    expect(w2.equipped()["war-paint"]).toBe("paint-ash");
    expect(w2.victoryPose()).toBe("pose-fist");
    expect(w2.warPaint().layers.marking).toBe("eagle-wings");
  });

  it("applies war paint presets one click", () => {
    const w = createWardrobe();
    w.setWarPaint(applyWarPaintPreset("ghost"));
    const design = w.warPaint();
    expect(design.layers.base).toBe("bone-white");
    expect(design.opacity.base).toBe(0.9);
  });

  it("returns copies, not live references", () => {
    const w = createWardrobe();
    const d = w.warPaint();
    d.layers.base = "hacked";
    expect(w.warPaint().layers.base).not.toBe("hacked");
  });
});
