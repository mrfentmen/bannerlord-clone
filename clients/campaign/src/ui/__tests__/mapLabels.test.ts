/**
 * Zoom-dependent settlement labels (mandate §17): gating, fog respect, and
 * prioritisation.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { MapLabels, LABEL_POOL_SIZE, type LabelCandidate } from "../mapLabels.js";
import { Vector3 } from "@babylonjs/core";

function candidate(id: string, name: string, klass: LabelCandidate["klass"]): LabelCandidate {
  return { settlementId: id, name, klass, anchor: new Vector3(0, 0, 0) };
}

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return { root, labels: new MapLabels(root) };
}

// Projects everything to the screen centre.
const centreToScreen = () => ({ x: 400, y: 300 });
const allVisible = () => "visible" as const;

describe("MapLabels", () => {
  it("shows nothing when the camera is far", () => {
    const { root, labels } = setup();
    labels.update([candidate("s1", "Denver", "city")], centreToScreen, 100_000, allVisible);
    const shown = [...root.querySelectorAll(".map-label")].filter((el) => !(el as HTMLElement).hidden);
    expect(shown).toHaveLength(0);
  });

  it("labels close settlements, cities first", () => {
    const { root, labels } = setup();
    const villages = Array.from({ length: 50 }, (_, i) => candidate(`v${i}`, `Village ${i}`, "village"));
    const city = candidate("c1", "Denver", "city");
    labels.update([...villages, city], centreToScreen, 10_000, allVisible);
    const shown = [...root.querySelectorAll<HTMLElement>(".map-label")].filter((el) => !el.hidden);
    expect(shown.length).toBeLessThanOrEqual(LABEL_POOL_SIZE);
    expect(shown.length).toBeGreaterThan(0);
    // The city outranks every village despite being last in the input.
    expect(shown[0]!.textContent).toBe("Denver");
  });

  it("never labels unseen-fog settlements", () => {
    const { root, labels } = setup();
    labels.update(
      [candidate("s1", "Hidden Town", "town")],
      centreToScreen,
      10_000,
      (id) => (id === "s1" ? "unseen" : "visible"),
    );
    const shown = [...root.querySelectorAll(".map-label")].filter((el) => !(el as HTMLElement).hidden);
    expect(shown).toHaveLength(0);
  });

  it("hides labels that project off-screen", () => {
    const { root, labels } = setup();
    labels.update([candidate("s1", "Far Town", "town")], () => ({ x: -5000, y: -5000 }), 10_000, allVisible);
    const shown = [...root.querySelectorAll(".map-label")].filter((el) => !(el as HTMLElement).hidden);
    expect(shown).toHaveLength(0);
  });
});
