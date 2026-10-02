/** Task 132: the armor preview rotates and shows stats. */

import { describe, expect, it } from "vitest";
import { armorStats, previewArmor, rotatePreview } from "../armorPreview.js";

const piece = { id: "a1", name: "Mail shirt", slot: "body" as const, armor: 12, weight: 8, value: 140 };

describe("armor preview (task 132)", () => {
  it("rotates and wraps", () => {
    let p = previewArmor(piece);
    p = rotatePreview(p, 90);
    expect(p.rotation).toBe(90);
    p = rotatePreview(p, 300);
    expect(p.rotation).toBe(30);
    p = rotatePreview(p, -60);
    expect(p.rotation).toBe(330);
  });

  it("shows the stats", () => {
    expect(armorStats(piece)).toContain("Armor 12");
    expect(armorStats(piece)).toContain("Weight 8");
  });
});
