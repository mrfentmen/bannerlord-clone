/**
 * Quest tracker HUD card (MASTER_PLAN task 115).
 *
 * A compact, collapsible card pinned to the HUD: the player's pinned quests
 * with objective progress and live distance. It is deliberately dumb —
 * main.ts owns the `views` supplier and calls `refresh()` on every snapshot
 * tick, so the distances move as the party marches.
 */

import "./questTracker.css";
import { h, clear } from "../ui/dom.js";
import { formatDistance, type PinnedQuestView } from "./tracker.js";

export interface QuestTrackerHudOptions {
  /** Fresh view models on every call. Called on `refresh()` and on toggle. */
  views: () => PinnedQuestView[];
  onUnpin: (id: string) => void;
  onOpenJournal: () => void;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
}

export interface QuestTrackerHudHandle {
  root: HTMLElement;
  /** Rebuild the rows from `options.views()`. Cheap enough for snapshot ticks. */
  refresh(): void;
  /** Collapse or expand the card, keeping state, class, and persistence in sync. */
  setCollapsed(collapsed: boolean): void;
  isCollapsed(): boolean;
  dispose(): void;
}

export function createQuestTrackerHud(options: QuestTrackerHudOptions): QuestTrackerHudHandle {
  let collapsed = options.collapsed;

  const list = h("ul", { class: "qtracker__list", "aria-label": "Pinned quests" });
  const count = h("span", { class: "qtracker__count", "data-testid": "quest-tracker-count" }, "");
  const toggleBtn = h(
    "button",
    {
      type: "button",
      class: "btn btn--quiet qtracker__toggle",
      "aria-expanded": String(!collapsed),
      "data-testid": "quest-tracker-toggle",
    },
    collapsed ? "Show" : "Hide",
  );

  function paintHeader(): void {
    toggleBtn.textContent = collapsed ? "Show" : "Hide";
    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
  }

  function setCollapsed(value: boolean): void {
    collapsed = value;
    paintHeader();
    root.classList.toggle("is-collapsed", collapsed);
    options.onToggleCollapsed(collapsed);
    if (!collapsed) refresh();
  }

  function isCollapsed(): boolean {
    return collapsed;
  }

  toggleBtn.addEventListener("click", () => {
    setCollapsed(!collapsed);
  });

  const header = h(
    "div",
    { class: "qtracker__header" },
    h("h2", { class: "qtracker__title" }, "Quest tracker"),
    count,
    toggleBtn,
  );

  const body = h("div", { class: "qtracker__body", "data-testid": "quest-tracker-body" });
  body.appendChild(list);

  const footer = h(
    "button",
    {
      type: "button",
      class: "btn btn--quiet qtracker__journal",
      "data-testid": "quest-tracker-open-journal",
    },
    "Open journal to pin quests",
  );
  footer.addEventListener("click", () => options.onOpenJournal());

  function refresh(): void {
    const rows = options.views();
    count.textContent = rows.length ? `${rows.length}/3` : "";
    clear(list);
    if (rows.length === 0) {
      list.appendChild(
        h(
          "li",
          { class: "qtracker__empty", "data-testid": "quest-tracker-empty" },
          "No pinned quests. Pin up to 3 active quests from the journal.",
        ),
      );
    } else {
      for (const view of rows) {
        const unpin = h(
          "button",
          {
            type: "button",
            class: "btn btn--quiet qtracker__unpin",
            "aria-label": `Unpin ${view.title}`,
            "data-testid": `quest-tracker-unpin-${view.id}`,
          },
          "Unpin",
        );
        unpin.addEventListener("click", () => options.onUnpin(view.id));
        const progress = `${view.objectivesDone}/${view.objectivesTotal}`;
        const meta = `${view.settlement} · ${progress} objectives${
          view.daysLeft !== null ? ` · ${view.daysLeft}d left` : ""
        }`;
        list.appendChild(
          h(
            "li",
            { class: "qtracker__row", "data-testid": `quest-tracker-row-${view.id}` },
            h("div", { class: "qtracker__main" },
              h("span", { class: "qtracker__name" }, view.title),
              h("span", { class: "qtracker__meta" }, meta),
            ),
            h("span", { class: "qtracker__distance", "data-testid": `quest-tracker-distance-${view.id}` }, formatDistance(view.distanceKm)),
            unpin,
          ),
        );
      }
    }
  }

  const root = h(
    "section",
    {
      class: `qtracker${collapsed ? " is-collapsed" : ""}`,
      "data-testid": "quest-tracker",
      "aria-label": "Quest tracker",
    },
    header,
    body,
    footer,
  );

  function dispose(): void {
    root.remove();
  }

  refresh();
  root.classList.toggle("is-collapsed", collapsed);
  return { root, refresh, setCollapsed, isCollapsed, dispose };
}
