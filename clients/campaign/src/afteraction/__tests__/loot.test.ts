/**
 * Task 70: loot distribution — taking loot moves it out of the pool and
 * reports through onTakeLoot (the inventory seam).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  createLoot,
  createLootPanel,
  lootTotal,
  takeAllLoot,
  takeLoot,
  type LootItem,
} from "../loot.js";

const items: LootItem[] = [
  { id: "l1", label: "Strongbox", kind: "coin", value: 250 },
  { id: "l2", label: "Grain sacks", kind: "goods", value: 60 },
  { id: "l3", label: "Mail shirts", kind: "arms", value: 140 },
];

describe("loot state (task 70)", () => {
  it("takes named items and leaves the rest", () => {
    const s = createLoot(items);
    const got = takeLoot(s, ["l1", "nope"]);
    expect(got.map((i) => i.id)).toEqual(["l1"]);
    expect(s.items.map((i) => i.id)).toEqual(["l2", "l3"]);
    expect(s.taken.map((i) => i.id)).toEqual(["l1"]);
    expect(lootTotal(s)).toBe(200);
  });

  it("take-all empties the pool", () => {
    const s = createLoot(items);
    const got = takeAllLoot(s);
    expect(got).toHaveLength(3);
    expect(s.items).toHaveLength(0);
    expect(lootTotal(s)).toBe(0);
  });

  it("taking twice does not double-take", () => {
    const s = createLoot(items);
    takeLoot(s, ["l1"]);
    expect(takeLoot(s, ["l1"])).toHaveLength(0);
  });
});

describe("loot panel (task 70)", () => {
  it("take buttons report through onTakeLoot", () => {
    const s = createLoot(items);
    const reported: LootItem[][] = [];
    const panel = createLootPanel(s, { onTakeLoot: (got) => reported.push(got) });
    document.body.append(panel.root);
    try {
      const btn = panel.root.querySelector('[data-loot-id="l2"] button') as HTMLButtonElement;
      btn.click();
      expect(reported).toHaveLength(1);
      expect(reported[0]!.map((i) => i.id)).toEqual(["l2"]);
      expect(s.items.map((i) => i.id)).toEqual(["l1", "l3"]);
      expect(panel.root.querySelector('[data-loot-id="l2"]')).toBeNull();
    } finally {
      panel.destroy();
    }
  });

  it("take-all reports every remaining item once", () => {
    const s = createLoot(items);
    const reported: LootItem[] = [];
    const panel = createLootPanel(s, { onTakeLoot: (got) => reported.push(...got) });
    document.body.append(panel.root);
    try {
      (panel.root.querySelector(".aa-loot > .btn") as HTMLButtonElement).click();
      expect(reported.map((i) => i.id).sort()).toEqual(["l1", "l2", "l3"]);
      expect(s.items).toHaveLength(0);
    } finally {
      panel.destroy();
    }
  });
});
