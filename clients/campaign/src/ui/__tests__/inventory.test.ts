/**
 * Inventory and equipment UI tests. MASTER_PLAN.md section 3C (tasks 110-114).
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInventoryPanel,
  createLootClaim,
  deriveStats,
  type InventoryCallbacks,
  type InventoryItem,
  type InventoryState,
} from "../inventory.js";

function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    name: "Service rifle",
    icon: "R",
    tier: 3,
    condition: 85,
    kind: "weapon",
    stats: { damage: 12, armor: 0, weight: 3 },
    ...over,
  };
}

function rifle(): InventoryItem {
  return item({ id: "rifle", name: "Service rifle", kind: "weapon", stats: { damage: 12, armor: 0, weight: 3 } });
}

function vest(): InventoryItem {
  return item({ id: "vest", name: "Plate carrier", icon: "V", tier: 2, condition: 60, kind: "armor", stats: { damage: 0, armor: 8, weight: 6 } });
}

function state(): InventoryState {
  return { items: [rifle(), vest()], equipment: {} };
}

let callbacks: InventoryCallbacks;
let panelEl: ReturnType<typeof createInventoryPanel>;

beforeEach(() => {
  document.body.innerHTML = "";
  callbacks = { onEquip: vi.fn(), onUnequip: vi.fn() };
  panelEl = createInventoryPanel(state(), callbacks);
  document.body.append(panelEl.root);
});

function gridCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="inventory-grid"] .inventory-card'));
}

function statValue(label: string): string {
  const rows = Array.from(document.querySelectorAll('[data-testid="character-stats"] [class*="row"]'));
  const found = rows.find((r) => r.textContent?.includes(label));
  return found?.textContent ?? "";
}

describe("inventory grid (110)", () => {
  it("shows icon, name, tier and condition on each card", () => {
    const cards = gridCards();
    expect(cards).toHaveLength(2);
    const first = cards[0]!;
    expect(first.querySelector(".inventory-card__icon")?.textContent).toBe("R");
    expect(first.querySelector(".inventory-card__name")?.textContent).toBe("Service rifle");
    expect(first.querySelector(".inventory-card__tier")?.textContent).toContain("3");
    expect(first.querySelector(".inventory-card__condition")?.textContent).toBe("Pristine");
  });

  it("labels worn condition honestly", () => {
    panelEl.update({ items: [item({ condition: 10 })], equipment: {} });
    expect(gridCards()[0]!.querySelector(".inventory-card__condition")?.textContent).toBe("Ruined");
  });
});

describe("equipment slots (111)", () => {
  it("renders weapon 1/2, armor, clothing and mount slots", () => {
    const labels = Array.from(document.querySelectorAll(".inventory-slot__label")).map((el) => el.textContent);
    expect(labels).toEqual(["Weapon 1", "Weapon 2", "Armor", "Clothing", "Mount"]);
  });

  it("derives character stats from equipped items", () => {
    panelEl.update({ items: [], equipment: { weapon1: rifle(), armor: vest() } });
    expect(statValue("Attack")).toContain("12");
    expect(statValue("Defense")).toContain("8");
    expect(statValue("Carry weight")).toContain("9");
  });

  it("deriveStats is a pure function of the equipment", () => {
    expect(deriveStats({ weapon1: rifle(), armor: vest() })).toEqual({ attack: 12, defense: 8, carryWeight: 9 });
    expect(deriveStats({})).toEqual({ attack: 0, defense: 0, carryWeight: 0 });
  });
});

describe("click-to-equip (112)", () => {
  it("fires onEquip and the item leaves the grid when the sim state comes back", () => {
    (callbacks.onEquip as ReturnType<typeof vi.fn>).mockImplementation((itemId: string) => {
      panelEl.update({ items: [vest()], equipment: { weapon1: rifle() } });
      void itemId;
    });
    const before = gridCards();
    expect(before.map((c) => c.getAttribute("data-item-id"))).toContain("rifle");
    before.find((c) => c.getAttribute("data-item-id") === "rifle")!.click();
    expect(callbacks.onEquip).toHaveBeenCalledWith("rifle");
    const after = gridCards();
    expect(after.map((c) => c.getAttribute("data-item-id"))).not.toContain("rifle");
    expect(statValue("Attack")).toContain("12");
  });

  it("clicking an equipped item fires onUnequip", () => {
    panelEl.update({ items: [], equipment: { weapon1: rifle() } });
    const equipped = document.querySelector<HTMLElement>('[data-slot="weapon1"] .inventory-card');
    expect(equipped).not.toBeNull();
    equipped!.click();
    expect(callbacks.onUnequip).toHaveBeenCalledWith("weapon1");
  });
});

describe("item tooltip (113)", () => {
  it("shows damage, armor and weight on hover", () => {
    const card = gridCards()[0]!;
    const tip = card.querySelector<HTMLElement>(".inventory-card__tooltip");
    expect(tip).not.toBeNull();
    expect(tip!.hidden).toBe(true);
    card.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    expect(tip!.hidden).toBe(false);
    expect(tip!.textContent).toContain("Damage 12");
    expect(tip!.textContent).toContain("Armor 0");
    expect(tip!.textContent).toContain("Weight 3 kg");
    card.dispatchEvent(new Event("mouseleave", { bubbles: true }));
    expect(tip!.hidden).toBe(true);
  });

  it("keeps the numbers in the title for touch and keyboard users", () => {
    const card = gridCards()[0]!;
    expect(card.getAttribute("title")).toContain("Damage 12");
    expect(card.getAttribute("aria-label")).toContain("Service rifle");
  });
});

describe("loot to inventory (114)", () => {
  it("claims loot once and the claimed loot appears in the grid", () => {
    const onClaimLoot = vi.fn((items: InventoryItem[]) => {
      panelEl.addItems(items);
    });
    const loot = createLootClaim([item({ id: "loot-1", name: "Captured pistol" })], { onClaimLoot });
    document.body.append(loot);
    const claimBtn = Array.from(loot.querySelectorAll("button")).find((b) => b.textContent?.includes("Claim"));
    expect(claimBtn).not.toBeUndefined();
    claimBtn!.click();
    expect(onClaimLoot).toHaveBeenCalledTimes(1);
    expect(claimBtn!.disabled).toBe(true);
    const ids = gridCards().map((c) => c.getAttribute("data-item-id"));
    expect(ids).toContain("loot-1");
    claimBtn!.click();
    expect(onClaimLoot).toHaveBeenCalledTimes(1);
  });

  it("renders an empty state when there is no loot", () => {
    const loot = createLootClaim([], { onClaimLoot: vi.fn() });
    expect(loot.textContent).toContain("No loot");
  });
});
