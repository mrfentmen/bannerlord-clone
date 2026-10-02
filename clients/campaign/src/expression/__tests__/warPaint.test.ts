/** Task 135: the war paint editor — 3 layers, opacity control. */

import { describe, expect, it } from "vitest";
import { createWarPaintDesign, setWarPaintLayer, WAR_PAINT_LAYERS } from "../wardrobe.js";

describe("war paint editor (task 135)", () => {
  it("has 3 layers", () => {
    expect(WAR_PAINT_LAYERS).toEqual(["base", "marking", "accent"]);
    const d = createWarPaintDesign();
    expect(Object.keys(d.layers)).toHaveLength(3);
  });

  it("paints layers with opacity", () => {
    let d = createWarPaintDesign();
    d = setWarPaintLayer(d, "marking", "ash-stripes", 0.5);
    expect(d.layers.marking).toBe("ash-stripes");
    expect(d.opacity.marking).toBe(0.5);
  });

  it("clamps opacity and resets on clear", () => {
    let d = createWarPaintDesign();
    d = setWarPaintLayer(d, "base", "blood-hand", 2);
    expect(d.opacity.base).toBe(1);
    d = setWarPaintLayer(d, "base", null);
    expect(d.layers.base).toBeNull();
    expect(d.opacity.base).toBe(1);
  });
});
