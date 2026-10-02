/**
 * Task 85: captured equipment list.
 *
 * Equipment taken off the field is not the same thing as spoils: spoils are what
 * the quartermaster appraises and the player pockets (loot.ts), while captured
 * kit is what the enemy left behind — their arms, their mounts, the stock they
 * abandoned. This module lists it per category with quantities, so the player
 * can see what the field gave up rather than a single line of prose.
 *
 * The shape is deliberately the quartermaster's (`battleflow/loot.ts`): the same
 * categories, the same `quantity`, and the same optional appraisal, so an
 * appraised lot can be handed straight in without a translation step. The
 * categories are that module's, not a second set invented here. `estimatedValue`
 * is optional because a battle can end before the appraisal exists, and a value
 * nobody estimated is not shown as zero.
 */

import { h } from "../ui/dom.js";
import "./reportContent.css";

export type EquipmentCategory = "weapons" | "armor" | "supplies" | "valuables" | "horses";

export interface CapturedEquipment {
  id: string;
  /** What the lot is, e.g. "Lancer javelins". */
  description: string;
  category: EquipmentCategory;
  quantity: number;
  /** Quartermaster's estimate for the whole lot, when there is one. */
  estimatedValue?: number;
}

export interface EquipmentCategoryRollup {
  category: EquipmentCategory;
  quantity: number;
  items: CapturedEquipment[];
}

export interface EquipmentSummary {
  items: CapturedEquipment[];
  /** Capture order: category, then the bigger lot, then name. */
  rollup: EquipmentCategoryRollup[];
  totalQuantity: number;
  /** Sum of the appraised lots only. Zero when nothing has been appraised. */
  estimatedValue: number;
  /** True when at least one lot carries an appraisal. */
  appraised: boolean;
  line: string;
}

const CATEGORY_ORDER: readonly EquipmentCategory[] = ["weapons", "armor", "horses", "supplies", "valuables"];

const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  weapons: "Weapons",
  armor: "Armour",
  horses: "Horses",
  supplies: "Supplies",
  valuables: "Valuables",
};

/**
 * Roll the captured lots up by category. Order is fixed per category so the list
 * reads the same way every battle, then biggest lot first inside a category.
 */
export function equipmentSummary(items: readonly CapturedEquipment[]): EquipmentSummary {
  const kept = items.filter((i) => i.quantity > 0);
  const sorted = kept
    .slice()
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        b.quantity - a.quantity ||
        a.description.localeCompare(b.description),
    );
  const rollup: EquipmentCategoryRollup[] = [];
  for (const item of sorted) {
    const bucket = rollup.find((r) => r.category === item.category);
    // The category total accumulates across every lot in it, not just the first.
    if (bucket) {
      bucket.items.push(item);
      bucket.quantity += item.quantity;
    } else {
      rollup.push({ category: item.category, quantity: item.quantity, items: [item] });
    }
  }
  const totalQuantity = sorted.reduce((sum, i) => sum + i.quantity, 0);
  const appraised = sorted.some((i) => typeof i.estimatedValue === "number");
  const estimatedValue = sorted.reduce((sum, i) => sum + (i.estimatedValue ?? 0), 0);
  const lots = `${sorted.length} lot${sorted.length === 1 ? "" : "s"}`;
  const line = appraised
    ? `${lots} captured, ${totalQuantity} in all — estimated ${estimatedValue}¤.`
    : `${lots} captured, ${totalQuantity} in all.`;
  return { items: sorted, rollup, totalQuantity, estimatedValue, appraised, line };
}

export interface EquipmentPanel {
  root: HTMLElement;
  summary(): EquipmentSummary;
  destroy(): void;
}

/**
 * The captured-equipment list for the report. Hidden when the field gave up
 * nothing, so the caller can mount it unconditionally.
 */
export function createEquipmentPanel(items: readonly CapturedEquipment[]): EquipmentPanel {
  const summary = equipmentSummary(items);
  const root = h("section", { class: "aa-equipment", "data-testid": "aa-equipment", "aria-label": "Captured equipment" });
  root.hidden = summary.items.length === 0;
  if (summary.items.length > 0) {
    root.appendChild(h("h3", { class: "aa-equipment__title" }, "Captured equipment"));
    const list = h("ul", { class: "aa-equipment__list" });
    for (const bucket of summary.rollup) {
      const group = h("li", { class: "aa-equipment__group", "data-category": bucket.category });
      group.appendChild(h("h4", { class: "aa-equipment__category" }, CATEGORY_LABEL[bucket.category]));
      const rows = h("ul", { class: "aa-equipment__items" });
      for (const item of bucket.items) {
        const row = h("li", { class: "aa-equipment__item", "data-equipment-id": item.id });
        row.append(
          h("span", { class: "aa-equipment__label" }, item.description),
          h("span", { class: "aa-equipment__qty mono" }, `${item.quantity}`),
        );
        if (typeof item.estimatedValue === "number") {
          row.appendChild(h("span", { class: "aa-equipment__value mono" }, `${item.estimatedValue}¤`));
        }
        rows.appendChild(row);
      }
      group.appendChild(rows);
      list.appendChild(group);
    }
    root.append(list, h("p", { class: "aa-equipment__line" }, summary.line));
  }
  return {
    root,
    summary: () => summary,
    destroy() {
      root.remove();
    },
  };
}