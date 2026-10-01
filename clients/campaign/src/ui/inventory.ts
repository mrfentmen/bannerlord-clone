/**
 * Inventory and equipment UI. MASTER_PLAN.md section 3C (tasks 110-114).
 *
 *  - Inventory grid: item cards with icon, name, tier and condition
 *    (task 110).
 *  - Equipment slots: weapon 1, weapon 2, armor, clothing, mount.
 *    Equipping updates the character stats summary, which is derived
 *    from the equipped items (task 111).
 *  - Click-to-equip: clicking an inventory card calls the caller's
 *    `onEquip` and the caller feeds the fresh sim state back through
 *    `update()` in the same frame; the equipped item leaves the
 *    inventory grid and the stats update in that same render
 *    (task 112).
 *  - Item-stats tooltip on hover: damage, armor and weight. A visible
 *    tooltip element is shown on mouse enter as well as a `title`
 *    attribute, so keyboard and touch users see the same numbers
 *    (task 113).
 *  - Loot-to-inventory: `createLootClaim` renders the loot the battle
 *    result screen reports (see battle-result.ts) with a Claim button.
 *    Claiming fires `onClaimLoot` once; the caller then feeds the
 *    items into the inventory panel via `addItems()`, and the claimed
 *    loot appears in the grid (task 114).
 *
 * Same pattern as the other UI modules: this module owns no sim
 * connection and no fetch. The caller (Rowan's campaign client)
 * injects the action callbacks, wires them to the sim API, and feeds
 * state via `update()`; this module renders.
 */

import { announce, button, h, liveRegion, replace, row, sectionHeader } from "./dom.js";
import { emptyState, panel, statusChip } from "./kit.js";

/** Where a piece of equipment goes. */
export type EquipmentSlot = "weapon1" | "weapon2" | "armor" | "clothing" | "mount";

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon1", "weapon2", "armor", "clothing", "mount"];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon1: "Weapon 1",
  weapon2: "Weapon 2",
  armor: "Armor",
  clothing: "Clothing",
  mount: "Mount",
};

/** Which slots an item kind can occupy. */
export const ITEM_KIND_SLOTS: Record<string, EquipmentSlot[]> = {
  weapon: ["weapon1", "weapon2"],
  armor: ["armor"],
  clothing: ["clothing"],
  mount: ["mount"],
};

export interface ItemStats {
  /** Melee/ranged damage, for weapons. */
  damage: number;
  /** Damage reduction, for armor and clothing. */
  armor: number;
  /** Carry weight in kg. */
  weight: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  /** Short text icon, e.g. an emoji or glyph the caller provides. */
  icon: string;
  /** Tier 1-5. */
  tier: number;
  /** 0-100. */
  condition: number;
  /** weapon | armor | clothing | mount | consumable | trade. Only the first four are equippable. */
  kind: string;
  stats: ItemStats;
}

/** The items currently equipped, by slot. Absent key = empty slot. */
export type Equipment = Partial<Record<EquipmentSlot, InventoryItem>>;

export interface InventoryState {
  items: InventoryItem[];
  equipment: Equipment;
}

export interface InventoryCallbacks {
  /** Click-to-equip: the caller equips the item in the sim and feeds fresh state through update(). */
  onEquip: (itemId: string) => void;
  /** Unequip: the item returns to the inventory grid. */
  onUnequip: (slot: EquipmentSlot) => void;
  onClose?: () => void;
}

export interface DerivedStats {
  attack: number;
  defense: number;
  carryWeight: number;
}

/** Character stats derived from the equipped items. */
export function deriveStats(equipment: Equipment): DerivedStats {
  let attack = 0;
  let defense = 0;
  let carryWeight = 0;
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    attack += item.stats.damage;
    defense += item.stats.armor;
    carryWeight += item.stats.weight;
  }
  return { attack, defense, carryWeight };
}

function conditionLabel(condition: number): string {
  if (condition >= 80) return "Pristine";
  if (condition >= 50) return "Worn";
  if (condition >= 20) return "Damaged";
  return "Ruined";
}

function statsText(item: InventoryItem): string {
  return `Damage ${item.stats.damage} · Armor ${item.stats.armor} · Weight ${item.stats.weight} kg`;
}

/** An item card: icon, name, tier and condition (task 110), with hover tooltip (task 113). */
export function itemCard(item: InventoryItem, onClick?: () => void): HTMLElement {
  const card = h("button", {
    type: "button",
    class: "inventory-card",
    title: `${item.name} — ${statsText(item)}`,
    "aria-label": `${item.name}, tier ${item.tier}, ${conditionLabel(item.condition)}, ${statsText(item)}`,
    "data-item-id": item.id,
  });
  card.append(
    h("span", { class: "inventory-card__icon", "aria-hidden": "true" }, item.icon),
    h("span", { class: "inventory-card__name" }, item.name),
    h("span", { class: "inventory-card__tier" }, `Tier ${item.tier}`),
    h("span", { class: "inventory-card__condition" }, conditionLabel(item.condition)),
  );
  const tip = h("div", { class: "inventory-card__tooltip", role: "tooltip" });
  tip.textContent = statsText(item);
  tip.hidden = true;
  card.append(tip);
  card.addEventListener("mouseenter", () => {
    tip.hidden = false;
  });
  card.addEventListener("mouseleave", () => {
    tip.hidden = true;
  });
  if (onClick) card.addEventListener("click", onClick);
  return card;
}

export function createInventoryPanel(
  initial: InventoryState,
  callbacks: InventoryCallbacks,
): {
  root: HTMLElement;
  update: (state: InventoryState) => void;
  addItems: (items: InventoryItem[]) => void;
  destroy: () => void;
} {
  let state = initial;
  const { root, body } = panel({ title: "Inventory", testId: "inventory-panel" });
  const live = liveRegion();
  root.append(live);

  function render(): void {
    const equippable = state.items.filter((i) => ITEM_KIND_SLOTS[i.kind]);
    const other = state.items.filter((i) => !ITEM_KIND_SLOTS[i.kind]);
    const stats = deriveStats(state.equipment);

    const equipmentSection = h("section", { "data-testid": "equipment-section" });
    equipmentSection.append(sectionHeader("Equipment"));
    const slots = h("div", { class: "inventory-slots" });
    for (const slot of EQUIPMENT_SLOTS) {
      const equipped = state.equipment[slot];
      const slotEl = h("div", { class: "inventory-slot", "data-slot": slot });
      slotEl.append(h("span", { class: "inventory-slot__label" }, EQUIPMENT_SLOT_LABELS[slot]));
      if (equipped) {
        slotEl.append(
          itemCard(equipped, () => {
            callbacks.onUnequip(slot);
          }),
        );
      } else {
        slotEl.append(h("span", { class: "inventory-slot__empty" }, "Empty"));
      }
      slots.append(slotEl);
    }
    equipmentSection.append(slots);

    const statsSection = h("section", { "data-testid": "character-stats" });
    statsSection.append(
      sectionHeader("Character stats"),
      row("Attack", String(stats.attack)),
      row("Defense", String(stats.defense)),
      row("Carry weight", `${stats.carryWeight} kg`),
    );

    const gridSection = h("section", { "data-testid": "inventory-grid" });
    gridSection.append(sectionHeader(`Inventory (${state.items.length})`));
    if (state.items.length === 0) {
      gridSection.append(emptyState("No items", "Your pack is empty."));
    } else {
      const grid = h("div", { class: "inventory-grid" });
      for (const item of equippable) {
        grid.append(
          itemCard(item, () => {
            callbacks.onEquip(item.id);
            announce(live, `Equipping ${item.name}.`);
          }),
        );
      }
      for (const item of other) {
        grid.append(itemCard(item));
      }
      gridSection.append(grid);
    }

    if (callbacks.onClose) {
      gridSection.append(button("Close", callbacks.onClose, { variant: "quiet" }));
    }
    replace(body, equipmentSection, statsSection, gridSection);
  }

  render();

  function update(next: InventoryState): void {
    state = next;
    render();
  }

  function addItems(items: InventoryItem[]): void {
    if (items.length === 0) return;
    announce(live, `Claimed ${items.length} ${items.length === 1 ? "item" : "items"}.`);
    update({ ...state, items: [...state.items, ...items] });
  }

  return {
    root,
    update,
    /** Loot-claim flow (task 114): claimed loot appears in the grid. */
    addItems,
    destroy() {
      root.remove();
    },
  };
}

/**
 * Loot claim view for the battle result screen (task 114).
 * Renders the loot items; the single Claim button fires `onClaimLoot`
 * once, then the caller feeds the items into the inventory panel via
 * `addItems()`.
 */
export function createLootClaim(
  loot: InventoryItem[],
  callbacks: {
    onClaimLoot: (items: InventoryItem[]) => void;
  },
): HTMLElement {
  const { root, body } = panel({ title: "Battle loot", testId: "loot-claim" });
  if (loot.length === 0) {
    body.append(emptyState("No loot", "Nothing worth taking from this field."));
  } else {
    const grid = h("div", { class: "inventory-grid" });
    for (const item of loot) grid.append(itemCard(item));
    body.append(grid);
    const claim = button(`Claim ${loot.length} ${loot.length === 1 ? "item" : "items"}`, () => {
      claim.disabled = true;
      callbacks.onClaimLoot(loot);
    });
    body.append(claim);
    body.append(statusChip("neutral", "Claimed loot appears in your inventory."));
  }
  return root;
}
