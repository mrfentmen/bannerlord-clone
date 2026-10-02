/**
 * Task 70: loot distribution UI (data + panel). After a victory the field
 * yields spoils; the panel lists them with values and Take / Take-all
 * buttons. Taking is a pure state transition here and is reported through
 * `onTakeLoot` — crediting the party's resources/inventory is the campaign
 * (data) layer's job, the same seam endScreens.ts uses for ransom/recruit
 * consequences (the inventory UI and HTTP provider are Pax's lane).
 */

import { h } from "../ui/dom.js";

export type LootKind = "coin" | "goods" | "arms";

export interface LootItem {
  id: string;
  label: string;
  kind: LootKind;
  /** Value in the campaign's currency. */
  value: number;
}

export interface LootState {
  items: LootItem[];
  taken: LootItem[];
}

export function createLoot(items: LootItem[]): LootState {
  return { items: [...items], taken: [] };
}

export function lootTotal(state: LootState): number {
  return state.items.reduce((sum, i) => sum + i.value, 0);
}

/** Take the named items. Unknown ids are ignored; returns what was taken. */
export function takeLoot(state: LootState, ids: readonly string[]): LootItem[] {
  const wanted = new Set(ids);
  const taken = state.items.filter((i) => wanted.has(i.id));
  if (taken.length === 0) return [];
  const takenIds = new Set(taken.map((i) => i.id));
  state.items = state.items.filter((i) => !takenIds.has(i.id));
  state.taken.push(...taken);
  return taken;
}

export function takeAllLoot(state: LootState): LootItem[] {
  return takeLoot(
    state,
    state.items.map((i) => i.id),
  );
}

export interface LootPanelOptions {
  /** Fired with the taken items so the campaign layer can credit inventory. */
  onTakeLoot(items: LootItem[]): void;
}

export interface LootPanel {
  root: HTMLElement;
  destroy(): void;
}

export function createLootPanel(state: LootState, opts: LootPanelOptions): LootPanel {
  const root = h("div", { class: "aa-loot", "data-testid": "aa-loot" });
  const list = h("ul", { class: "aa-loot-list" });
  const summary = h("p", { class: "aa-loot-summary" });
  const takeAll = h("button", { class: "btn", type: "button" }, "Take all");

  const render = (): void => {
    list.replaceChildren();
    for (const item of state.items) {
      const row = h("li", { class: "aa-loot-row", "data-loot-id": item.id });
      row.append(
        h("span", { class: "aa-loot-label" }, item.label),
        h("span", { class: "aa-loot-kind" }, item.kind),
        h("span", { class: "aa-loot-value mono" }, `${item.value}¤`),
      );
      const take = h("button", { class: "btn small", type: "button" }, "Take");
      take.addEventListener("click", () => {
        const got = takeLoot(state, [item.id]);
        if (got.length > 0) opts.onTakeLoot(got);
        render();
      });
      row.append(take);
      list.append(row);
    }
    summary.textContent =
      state.items.length === 0
        ? state.taken.length === 0
          ? "No spoils on this field."
          : `All spoils taken (${state.taken.length} items).`
        : `${state.items.length} items worth ${lootTotal(state)}¤ remain.`;
    takeAll.hidden = state.items.length === 0;
  };

  takeAll.addEventListener("click", () => {
    const got = takeAllLoot(state);
    if (got.length > 0) opts.onTakeLoot(got);
    render();
  });

  root.append(h("h3", {}, "Spoils of war"), list, summary, takeAll);
  render();
  return {
    root,
    destroy() {
      root.remove();
    },
  };
}
