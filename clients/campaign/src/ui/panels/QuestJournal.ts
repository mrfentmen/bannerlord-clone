/**
 * Quest journal panel (MASTER_PLAN task 114).
 *
 * Active/completed/failed tabs, a category dropdown, and a free-text search —
 * over the seeded 120-quest roster. Selecting a quest shows its objectives,
 * giver, reward and deadline. The panel reads from a `QuestJournal`; it never
 * mutates quest state itself.
 */

import { h, clear } from "../dom.js";
import { panel, statusChip, emptyState, type StatusKind } from "../kit.js";
import {
  CATEGORY_LABEL,
  EMPTY_FILTERS,
  QUEST_CATEGORIES,
  STATUS_LABEL,
  objectivesDone,
  type JournalFilters,
  type Quest,
  type QuestCategory,
  type QuestJournal,
  type QuestStatus,
} from "../../journal/index.js";

export interface QuestJournalPanelOptions {
  journal: QuestJournal;
  onClose?: () => void;
  testId?: string;
  /** Fired (debounced by the caller if needed) when the user searches. */
  onSearch?: () => void;
  /**
   * Quest tracker pinning (task 115). When present, active quests get a
   * Pin/Unpin button in their detail view. Omitted in tests and wherever the
   * tracker is not wired.
   */
  pinController?: QuestPinController;
}

/**
 * Pin/unpin contract the quest tracker exposes to the journal panel.
 * The panel never learns the pin cap or the storage; it only renders.
 */
export interface QuestPinController {
  isPinned(id: string): boolean;
  /** `"full"` when the tracker already holds its maximum pins. */
  toggle(id: string): "pinned" | "unpinned" | "full";
}

const STATUS_KIND: Record<QuestStatus, StatusKind> = {
  active: "info",
  completed: "good",
  failed: "critical",
};

const STATUS_TABS: ("all" | QuestStatus)[] = ["all", "active", "completed", "failed"];

export function questJournalPanel(options: QuestJournalPanelOptions): HTMLElement {
  const panelOpts = { title: "Quest Journal", testId: options.testId ?? "quest-journal" } as const;
  const { root, body } =
    options.onClose !== undefined
      ? panel({ ...panelOpts, onClose: options.onClose })
      : panel(panelOpts);
  root.classList.add("journal");

  const filters: JournalFilters = { ...EMPTY_FILTERS };
  let selectedId: string | null = null;
  const live = h("p", { class: "journal__live", "aria-live": "polite" });

  const statusTabs = h(
    "div",
    { class: "journal__tabs", role: "tablist", "aria-label": "Filter by status" },
    ...STATUS_TABS.map((s) => {
      const label = s === "all" ? "All" : STATUS_LABEL[s];
      const btn = h(
        "button",
        {
          type: "button",
          class: "btn btn--quiet journal__tab",
          role: "tab",
          "aria-selected": String(s === filters.status),
          "data-testid": `journal-tab-${s}`,
        },
        label,
      );
      btn.addEventListener("click", () => {
        filters.status = s;
        render();
      });
      return btn;
    }),
  );

  const categorySelect = h(
    "select",
    { class: "journal__select", "aria-label": "Filter by category", "data-testid": "journal-category" },
    h("option", { value: "all" }, "All categories"),
    ...QUEST_CATEGORIES.map((c) => h("option", { value: c }, CATEGORY_LABEL[c])),
  );
  categorySelect.addEventListener("change", () => {
    filters.category = categorySelect.value as QuestCategory | "all";
    render();
  });

  const search = h("input", {
    type: "search",
    class: "journal__search",
    placeholder: "Search title, giver, place…",
    "aria-label": "Search quests",
    "data-testid": "journal-search",
  });
  search.addEventListener("input", () => {
    filters.query = search.value;
    render();
    if (search.value.trim().length > 0) options.onSearch?.();
  });

  const filterBar = h("div", { class: "journal__filters" }, statusTabs, categorySelect, search);
  const main = h("div", { class: "journal__main" });
  body.append(filterBar, live, main);

  function questRow(q: Quest): HTMLElement {
    const row = h(
      "button",
      {
        type: "button",
        class: `journal__row${q.id === selectedId ? " is-selected" : ""}`,
        "data-testid": `journal-row-${q.id}`,
        "aria-current": q.id === selectedId ? "true" : "false",
      },
      h("span", { class: "journal__rowtitle" }, q.title),
      h(
        "span",
        { class: "journal__rowmeta" },
        `${q.giver} · ${q.settlement} · ${CATEGORY_LABEL[q.category]}`,
        q.daysLeft !== null && q.status === "active" ? ` · ${q.daysLeft}d left` : "",
      ),
      statusChip(STATUS_KIND[q.status], STATUS_LABEL[q.status]),
    );
    row.addEventListener("click", () => {
      selectedId = q.id;
      render();
    });
    return row;
  }

  function detail(q: Quest): HTMLElement {
    const objectives = h(
      "ul",
      { class: "journal__objectives" },
      ...q.objectives.map((o) =>
        h(
          "li",
          { class: `journal__objective${o.done ? " is-done" : ""}` },
          h("span", { class: "journal__checkmark", "aria-hidden": "true" }, o.done ? "✓" : "○"),
          h("span", {}, o.text),
        ),
      ),
    );
    const pinAction = pinActionRow(q);
    return h(
      "article",
      { class: "journal__detail", "data-testid": "journal-detail", "aria-label": q.title },
      h("h3", { class: "journal__detailtitle" }, q.title),
      h("p", { class: "journal__detailmeta" }, `${q.giver} · ${q.settlement}`),
      ...(pinAction ? [pinAction] : []),
      h("p", {}, q.summary),
      h("h4", { class: "journal__subtitle" }, `Objectives (${objectivesDone(q)}/${q.objectives.length})`),
      objectives,
      h(
        "dl",
        { class: "journal__facts" },
        h("dt", {}, "Reward"),
        h("dd", {}, q.reward),
        h("dt", {}, "Deadline"),
        h("dd", {}, q.daysLeft === null ? "None" : `${q.daysLeft} days`),
        h("dt", {}, "Status"),
        h("dd", {}, statusChip(STATUS_KIND[q.status], STATUS_LABEL[q.status])),
      ),
    );
  }

  /**
   * Pin/Unpin button for the quest detail (task 115). Only active quests can
   * be pinned, and only when the tracker is wired in via `pinController`.
   */
  function pinActionRow(q: Quest): HTMLElement | null {
    const ctl = options.pinController;
    if (!ctl || q.status !== "active") return null;
    const pinned = ctl.isPinned(q.id);
    const btn = h(
      "button",
      {
        type: "button",
        class: "btn btn--quiet",
        "data-testid": `journal-pin-${q.id}`,
        "aria-pressed": String(pinned),
      },
      pinned ? "Unpin from tracker" : "Pin to tracker",
    );
    btn.addEventListener("click", () => {
      const result = ctl.toggle(q.id);
      if (result === "full") {
        live.textContent = "Tracker is full — unpin a quest first (maximum 3).";
      }
      render();
    });
    return h("div", { class: "journal__pinaction" }, btn);
  }

  function render(): void {
    for (const btn of statusTabs.querySelectorAll("button")) {
      const tab = btn.getAttribute("data-testid")?.replace("journal-tab-", "") as "all" | QuestStatus;
      btn.setAttribute("aria-selected", String(tab === filters.status));
      btn.classList.toggle("is-active", tab === filters.status);
    }
    const quests = options.journal.list(filters);
    live.textContent = `${quests.length} quest${quests.length === 1 ? "" : "s"} shown`;
    clear(main);

    const list = h(
      "div",
      { class: "journal__list", role: "listbox", "aria-label": "Quests" },
      quests.length
        ? quests.map(questRow)
        : emptyState("No quests match", "Loosen the filters or clear the search."),
    );
    main.append(list);

    const selected = selectedId ? options.journal.get(selectedId) : undefined;
    if (selected && quests.some((q) => q.id === selected.id)) {
      main.append(detail(selected));
    } else {
      selectedId = null;
      main.append(
        h("p", { class: "journal__prompt" }, quests.length ? "Select a quest for the full brief." : ""),
      );
    }
  }

  render();
  return root;
}
