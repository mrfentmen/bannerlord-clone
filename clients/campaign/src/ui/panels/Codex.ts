/**
 * Codex / encyclopedia panel (MASTER_PLAN task 123).
 *
 * Searchable lore + mechanics reference. The corpus is static and
 * hand-written; this panel only reads, filters, and navigates it.
 */

import { ALL_CODEX_ENTRIES, getEntry, searchCodex } from "../../codex/index.js";
import { CODEX_CATEGORIES, CODEX_CATEGORY_LABEL, type CodexCategory, type CodexEntry } from "../../codex/types.js";
import { panel, emptyState } from "../kit.js";
import { h } from "../dom.js";

export interface CodexPanelOptions {
  onClose?: () => void;
  testId?: string;
}

const CAT_LABEL: Record<CodexCategory, string> = CODEX_CATEGORY_LABEL;
type CategoryFilter = CodexCategory | "all";

export function codexPanel(options: CodexPanelOptions = {}): HTMLElement {
  const { root, body } =
    options.onClose !== undefined
      ? panel({ title: "Codex", onClose: options.onClose, testId: options.testId ?? "codex" })
      : panel({ title: "Codex", testId: options.testId ?? "codex" });
  body.classList.add("codex");
  root.setAttribute("aria-label", "Codex: searchable lore and mechanics reference");

  let category: CategoryFilter = "all";
  let query = "";
  let selected: CodexEntry | null = null;

  const toolbar = h("div", { class: "codex__toolbar" });
  const tabs = h("div", { class: "codex__tabs", role: "tablist", "aria-label": "Codex category" });
  const searchRow = h("div", { class: "codex__search" });
  const live = h("p", { class: "codex__live", "aria-live": "polite", "data-testid": "codex-count" });
  const listCol = h("div", { class: "codex__list" });
  const detailCol = h("div", { class: "codex__detail", "data-testid": "codex-detail" });
  const columns = h("div", { class: "codex__columns" }, listCol, detailCol);
  body.append(toolbar, columns);
  toolbar.append(tabs, searchRow, live);

  const tabBtns: HTMLButtonElement[] = [];
  const makeTab = (value: CategoryFilter, label: string) => {
    const btn = h("button", { type: "button", role: "tab", class: "chip", "data-testid": `codex-tab-${value}` }, label) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      category = value;
      for (const b of tabBtns) {
        b.classList.remove("chip--active");
        b.setAttribute("aria-selected", "false");
      }
      btn.classList.add("chip--active");
      btn.setAttribute("aria-selected", "true");
      selected = null;
      render();
    });
    tabBtns.push(btn);
    tabs.appendChild(btn);
    return btn;
  };
  const allBtn = makeTab("all", "All");
  allBtn.classList.add("chip--active");
  allBtn.setAttribute("aria-selected", "true");
  for (const c of CODEX_CATEGORIES) makeTab(c, CAT_LABEL[c]);

  const searchLabel = h("label", { class: "codex__search-label", for: "codex-search-input" }, "Search the codex");
  const searchInput = h("input", { id: "codex-search-input", type: "search", "data-testid": "codex-search" }) as HTMLInputElement;
  searchInput.setAttribute("aria-label", "Search the codex");
  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    selected = null;
    render();
  });
  searchRow.append(searchLabel, searchInput);

  function visible(): CodexEntry[] {
    const scoped = category === "all" ? ALL_CODEX_ENTRIES : ALL_CODEX_ENTRIES.filter((en) => en.category === category);
    return searchCodex(scoped, query);
  }

  function render(): void {
    const rows = visible();
    listCol.innerHTML = "";
    live.textContent = rows.length === 1 ? "1 entry" : `${rows.length} entries`;
    if (rows.length === 0) {
      listCol.append(emptyState("Nothing in the codex matches.", "Try a shorter search."));
    }
    for (const en of rows) {
      const row = h(
        "button",
        { type: "button", class: "codex__row", "data-testid": `codex-row-${en.id}` },
        h("span", { class: "codex__row-title" }, en.title),
        h("span", { class: "codex__row-cat" }, CAT_LABEL[en.category]),
      ) as HTMLButtonElement;
      row.setAttribute("aria-current", selected?.id === en.id ? "true" : "false");
      row.addEventListener("click", () => {
        selected = en;
        render();
      });
      listCol.appendChild(row);
    }
    renderDetail();
  }

  function renderDetail(): void {
    detailCol.innerHTML = "";
    if (!selected) {
      detailCol.append(h("p", { class: "codex__hint" }, "Select an entry to read it."));
      return;
    }
    const en = selected;
    detailCol.append(
      h("h3", { class: "codex__title" }, en.title),
      h("p", { class: "codex__summary" }, en.summary),
    );
    for (const para of en.body) {
      detailCol.appendChild(h("p", {}, para));
    }
    if (en.related.length > 0) {
      const links = h("div", { class: "codex__related" });
      links.append(h("h4", { class: "codex__related-title" }, "Related"));
      for (const relId of en.related) {
        const target = getEntry(ALL_CODEX_ENTRIES, relId);
        if (!target) continue;
        const link = h("button", { type: "button", class: "codex__rel-link" }, target.title) as HTMLButtonElement;
        link.addEventListener("click", () => {
          selected = target;
          render();
        });
        links.appendChild(link);
      }
      detailCol.appendChild(links);
    }
  }

  render();
  return root;
}
