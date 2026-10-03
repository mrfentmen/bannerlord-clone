/**
 * The encyclopedia panel (mandate §9).
 *
 * Search, kind filters, and entry detail with clickable links between related
 * entries — character → faction → rulers, settlement → holder → faction. All content
 * comes from the `Encyclopedia` index built from the live snapshot; the panel invents
 * nothing and links only where the index has a real join.
 *
 * Navigation stays inside the panel: selecting a link opens that entry here, with a
 * back button to return. Opening game screens (town panel, ruler panel) from entries
 * is a later slice, deliberately — this one is the knowledge network itself.
 */

import { h } from "../dom.js";
import { emptyState, panel } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import type {
  Encyclopedia,
  EncyclopediaKind,
} from "../../data/encyclopedia.js";
import { searchEncyclopedia } from "../../data/encyclopedia.js";

export interface EncyclopediaPanelOptions {
  encyclopedia: Encyclopedia;
  /** Entry to open directly (a town, ruler or side id). Ignored when unknown. */
  initialEntryId?: string;
  onClose: () => void;
}

const KIND_ORDER: EncyclopediaKind[] = ["settlement", "faction", "character"];
const KIND_LABEL: Record<EncyclopediaKind, string> = {
  settlement: "Settlements",
  faction: "Factions",
  character: "Characters",
};

export function encyclopediaPanel(options: EncyclopediaPanelOptions): { root: HTMLElement } {
  const { root, body } = panel({
    title: "Encyclopedia",
    testId: "encyclopedia-panel",
    onClose: options.onClose,
  });

  let query = "";
  let kinds: Set<EncyclopediaKind> = new Set(KIND_ORDER);
  // A deep link opens the entry directly; an unknown id falls back to search rather
  // than to an empty detail, so a stale link is never a dead end.
  let selectedId: string | null =
    options.initialEntryId && options.encyclopedia.byId.has(options.initialEntryId)
      ? options.initialEntryId
      : null;
  // The trail back through link clicks, so Back walks the player's reading path.
  let trail: string[] = [];

  function render(): void {
    body.replaceChildren();
    if (selectedId) {
      renderDetail(body);
    } else {
      renderSearch(body);
    }
  }

  function renderSearch(parent: HTMLElement): void {
    const search = h("input", {
      type: "search",
      class: "ency__search",
      placeholder: "Search people, places, factions…",
      "aria-label": "Search the encyclopedia",
      value: query,
    }) as HTMLInputElement;
    search.addEventListener("input", () => {
      query = search.value;
      renderList();
    });

    const chips = h(
      "div",
      { class: "ency__kinds", role: "group", "aria-label": "Entry kinds" },
      KIND_ORDER.map((kind) => {
        const chip = h(
          "button",
          {
            type: "button",
            class: "btn",
            "aria-pressed": "true",
          },
          KIND_LABEL[kind],
        );
        chip.addEventListener("click", () => {
          if (kinds.has(kind)) {
            // Keep at least one kind on: an empty filter is a dead panel.
            if (kinds.size > 1) kinds.delete(kind);
          } else {
            kinds.add(kind);
          }
          // Update in place: a full re-render would drop focus from the search box
          // on every toggle, punishing the player for filtering.
          paintChips();
          renderList();
        });
        return chip;
      }),
    );

    function paintChips(): void {
      const buttons = chips.querySelectorAll("button");
      KIND_ORDER.forEach((kind, i) => {
        const button = buttons[i]!;
        const on = kinds.has(kind);
        button.className = `btn ${on ? "btn--primary" : "btn--quiet"}`;
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    paintChips();

    const list = h("div", { class: "ency__list", role: "list" });
    parent.append(search, chips, list);
    renderList();

    function renderList(): void {
      const hits = searchEncyclopedia(options.encyclopedia, query, kinds);
      list.replaceChildren();
      if (hits.length === 0) {
        list.appendChild(
          emptyState(
            "No entries match.",
            "Try a shorter search, or turn a kind filter back on.",
          ),
        );
        return;
      }
      for (const entry of hits) {
        const item = h(
          "button",
          { type: "button", class: "ency__item", role: "listitem" },
          h("span", { class: "ency__name", text: entry.name }),
          h("span", { class: "ency__sub", text: entry.subtitle }),
          h("span", { class: "ency__kind", text: KIND_LABEL[entry.kind].slice(0, -1) }),
        );
        item.addEventListener("click", () => {
          trail = [];
          selectedId = entry.id;
          render();
        });
        list.appendChild(item);
      }
    }
  }

  function renderDetail(parent: HTMLElement): void {
    const entry = options.encyclopedia.byId.get(selectedId!);
    if (!entry) {
      selectedId = null;
      render();
      return;
    }
    const back = h("button", { type: "button", class: "btn btn--quiet" }, "← Back");
    back.addEventListener("click", () => {
      selectedId = trail.pop() ?? null;
      render();
    });
    parent.appendChild(back);
    parent.appendChild(
      h("div", { class: "ency__detail" }, [
        h("h3", { class: "ency__title", text: entry.name }),
        h("div", { class: "ency__sub", text: entry.subtitle }),
        entry.links.length > 0
          ? h(
              "ul",
              { class: "ency__links" },
              entry.links.map((link) => {
                const target = options.encyclopedia.byId.get(link.entryId);
                const linkBtn = h(
                  "button",
                  { type: "button", class: "ency__link" },
                  `${link.label}${target ? ` (${KIND_LABEL[target.kind].slice(0, -1).toLowerCase()})` : ""}`,
                );
                linkBtn.addEventListener("click", () => {
                  if (!options.encyclopedia.byId.has(link.entryId)) return;
                  trail.push(entry.id);
                  selectedId = link.entryId;
                  render();
                });
                return h("li", {}, linkBtn);
              }),
            )
          : h("p", { class: "ency__empty", text: "No recorded connections." }),
      ]),
    );
  }

  render();
  return { root: asBottomSheet(root) };
}
