/**
 * @vitest-environment jsdom
 *
 * Captured equipment list (Buffy task 85).
 *
 * The list has to accept what the quartermaster actually produces, so one of the
 * tests hands it a real `appraiseLoot()` result rather than a hand-written stand-in.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createEquipmentPanel, equipmentSummary, type CapturedEquipment } from "../index.js";
import { appraiseLoot, type LootLot } from "../../battleflow/loot.js";

const LOTS: LootLot[] = [
  { id: "l1", description: "Lancer javelins", category: "weapons", quantity: 40, unitValue: 12 },
  { id: "l2", description: "Tower shields", category: "armor", quantity: 18, unitValue: 25 },
  { id: "l3", description: "Riding horses", category: "horses", quantity: 6, unitValue: 300 },
  { id: "l4", description: "Iron ring", category: "valuables", quantity: 1, unitValue: 500 },
];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("equipment summary (task 85)", () => {
  it("groups the lots by category, biggest first inside a category", () => {
    const s = equipmentSummary([
      { id: "a", description: "Short bows", category: "weapons", quantity: 12 },
      { id: "b", description: "Long pikes", category: "weapons", quantity: 40 },
      { id: "c", description: "Coats", category: "armor", quantity: 9 },
    ]);
    expect(s.rollup.map((r) => r.category)).toEqual(["weapons", "armor"]);
    expect(s.rollup[0]?.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(s.rollup[0]?.quantity).toBe(52);
    expect(s.totalQuantity).toBe(61);
  });

  it("drops empty lots rather than listing nothing", () => {
    const s = equipmentSummary([
      { id: "a", description: "Broken lances", category: "weapons", quantity: 0 },
      { id: "b", description: "Intact lances", category: "weapons", quantity: 2 },
    ]);
    expect(s.items.map((i) => i.id)).toEqual(["b"]);
    expect(s.totalQuantity).toBe(2);
  });

  it("totals the appraisal, and says so only when there is one", () => {
    const appraised = equipmentSummary([
      { id: "a", description: "Lances", category: "weapons", quantity: 10, estimatedValue: 250 },
      { id: "b", description: "Shields", category: "armor", quantity: 4, estimatedValue: 100 },
    ]);
    expect(appraised.appraised).toBe(true);
    expect(appraised.estimatedValue).toBe(350);
    expect(appraised.line).toBe("2 lots captured, 14 in all — estimated 350¤.");

    const bare = equipmentSummary([{ id: "a", description: "Lances", category: "weapons", quantity: 10 }]);
    expect(bare.appraised).toBe(false);
    // Not appraised is not worth zero: nothing is claimed about the value.
    expect(bare.line).toBe("1 lot captured, 10 in all.");
  });

  it("uses the singular for a single lot", () => {
    expect(equipmentSummary([{ id: "a", description: "Lances", category: "weapons", quantity: 10 }]).line).toContain(
      "1 lot captured",
    );
  });

  it("takes the quartermaster's appraised lots as they come", () => {
    const appraisal = appraiseLoot(LOTS);
    const s = equipmentSummary(appraisal.lots as CapturedEquipment[]);
    expect(s.estimatedValue).toBe(appraisal.total);
    expect(s.totalQuantity).toBe(65);
    expect(s.appraised).toBe(true);
    // Appraisal sorts by value, so the ring leads its own category either way.
    expect(s.rollup.map((r) => r.category)).toEqual(["weapons", "armor", "horses", "valuables"]);
  });
});

describe("equipment panel (task 85)", () => {
  it("lists each category with its lots and quantities", () => {
    const panel = createEquipmentPanel(appraiseLoot(LOTS).lots as CapturedEquipment[]);
    document.body.appendChild(panel.root);

    expect(panel.root.hidden).toBe(false);
    expect(panel.root.getAttribute("aria-label")).toBe("Captured equipment");
    expect(panel.root.querySelectorAll(".aa-equipment__group")).toHaveLength(4);
    expect(panel.root.textContent).toContain("Weapons");
    expect(panel.root.textContent).toContain("Lancer javelins");
    expect(panel.root.textContent).toContain("40");
    expect(panel.root.querySelector(".aa-equipment__line")?.textContent).toContain("4 lots captured");
  });

  it("marks each lot so the campaign layer can claim it by id", () => {
    const panel = createEquipmentPanel(LOTS);
    document.body.appendChild(panel.root);
    const ids = [...panel.root.querySelectorAll(".aa-equipment__item")].map((el) => el.getAttribute("data-equipment-id"));
    expect(ids.sort()).toEqual(["l1", "l2", "l3", "l4"]);
  });

  it("omits the value for a lot that was never appraised", () => {
    const panel = createEquipmentPanel([{ id: "a", description: "Lances", category: "weapons", quantity: 10 }]);
    document.body.appendChild(panel.root);
    expect(panel.root.querySelector(".aa-equipment__value")).toBeNull();
    expect(panel.root.querySelector(".aa-equipment__qty")?.textContent).toBe("10");
  });

  it("hides itself when the field gave nothing up", () => {
    const panel = createEquipmentPanel([]);
    document.body.appendChild(panel.root);
    expect(panel.root.hidden).toBe(true);
    expect(panel.root.textContent).toBe("");
    expect(panel.summary().items).toEqual([]);
  });

  it("detaches cleanly", () => {
    const panel = createEquipmentPanel(LOTS);
    document.body.appendChild(panel.root);
    panel.destroy();
    expect(document.querySelector('[data-testid="aa-equipment"]')).toBeNull();
  });
});