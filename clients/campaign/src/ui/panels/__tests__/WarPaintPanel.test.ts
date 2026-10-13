/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { warPaintPanel } from "../WarPaintPanel.js";
import { createWardrobe } from "../../../expression/wardrobe.js";

beforeEach(() => localStorage.clear());

describe("war paint panel (integration)", () => {
  it("lists the eight presets and applies one to the wardrobe", () => {
    const root = warPaintPanel();
    document.body.innerHTML = "";
    document.body.appendChild(root);

    const table = root.querySelector('[data-testid="warpaint-presets"]')!;
    expect(table.textContent).toContain("Blood Eagle");
    expect(table.textContent).toContain("Ghost");

    (root.querySelector('[data-testid="warpaint-apply-blood-eagle"]') as HTMLButtonElement).click();

    const design = createWardrobe().warPaint();
    expect(design.layers.marking).toBe("eagle-wings");

    const current = document.body.querySelector('[data-testid="warpaint-current"]');
    expect(current).not.toBeNull();
    expect(current!.textContent).toContain("eagle-wings");
    document.body.innerHTML = "";
  });
});
