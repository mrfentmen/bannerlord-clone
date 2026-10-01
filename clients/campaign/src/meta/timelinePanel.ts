/**
 * Campaign timeline panel (MASTER_PLAN task 139).
 *
 * Renders the clan chronicle's recorded deeds as a date-ordered vertical
 * spine: season ticks on the left rail, event dots plotted under their
 * season, kind filter chips above. Pure DOM over meta/timeline.ts — the
 * caller owns the event list (main.ts persists it).
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import {
  ALL_KINDS,
  KIND_META,
  filterTimeline,
  groupTimeline,
  timelineStats,
  seasonLabel,
  type TimelineKind,
} from "./timeline.js";
import "./timeline.css";

export interface TimelinePanelOptions {
  /** All recorded deeds, oldest first. The panel re-reads it on refresh. */
  events: () => Parameters<typeof groupTimeline>[0];
  onClose?: () => void;
}

export interface TimelinePanelHandle {
  root: HTMLElement;
  /** Re-render from the live event list (e.g. after a new deed is recorded). */
  refresh(): void;
}

export function timelinePanel(options: TimelinePanelOptions): TimelinePanelHandle {
  const { root, body } = panel({
    title: "Campaign timeline",
    testId: "timeline-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  const statsLine = h("p", { class: "timeline__stats", "data-testid": "timeline-stats" });
  const filters = h("div", {
    class: "timeline__filters",
    role: "group",
    "aria-label": "Filter by deed kind",
    "data-testid": "timeline-filters",
  });
  const spine = h("ol", { class: "timeline__spine", "data-testid": "timeline-spine" });
  body.append(statsLine, filters, spine);

  const selected = new Set<TimelineKind>(ALL_KINDS);

  function renderFilters(): void {
    filters.textContent = "";
    for (const kind of ALL_KINDS) {
      const on = selected.has(kind);
      const chip = h(
        "button",
        {
          type: "button",
          class: `timeline__chip${on ? " timeline__chip--on" : ""}`,
          "aria-pressed": String(on),
          "data-testid": `timeline-filter-${kind}`,
          title: KIND_META[kind].label,
        },
        `${KIND_META[kind].glyph} ${KIND_META[kind].label}`,
      );
      chip.addEventListener("click", () => {
        if (selected.has(kind)) {
          if (selected.size === 1) return; // keep at least one kind visible
          selected.delete(kind);
        } else {
          selected.add(kind);
        }
        render();
      });
      filters.appendChild(chip);
    }
  }

  function render(): void {
    renderFilters();
    const events = filterTimeline(options.events(), selected);
    const stats = timelineStats(events);
    statsLine.textContent =
      stats.total === 0
        ? "No deeds of these kinds yet."
        : `${stats.total} deed${stats.total === 1 ? "" : "s"}${
            stats.firstSeason !== null && stats.lastSeason !== null
              ? ` · ${seasonLabel(stats.firstSeason)} – ${seasonLabel(stats.lastSeason)}`
              : ""
          }`;
    spine.textContent = "";
    const groups = groupTimeline(events);
    if (groups.length === 0) {
      spine.appendChild(
        h(
          "li",
          { class: "timeline__empty" },
          emptyState(
            "Your reign is unwritten.",
            "Win battles, forge treaties, and raise buildings — every deed lands here, plotted by season.",
          ),
        ),
      );
      return;
    }
    for (const group of groups) {
      const dots = group.entries.map((entry) =>
        h(
          "li",
          { class: "timeline__event", "data-testid": "timeline-event" },
          h("span", { class: `timeline__dot timeline__dot--${entry.kind}`, "aria-hidden": "true" }, KIND_META[entry.kind].glyph),
          h(
            "div",
            { class: "timeline__card" },
            h("p", { class: "timeline__kind" }, KIND_META[entry.kind].label),
            h("p", { class: "timeline__text" }, entry.text),
          ),
        ),
      );
      spine.appendChild(
        h(
          "li",
          { class: "timeline__season", "data-testid": `timeline-season-${group.season}` },
          h("span", { class: "timeline__tick", "aria-hidden": "true" }),
          h("h3", { class: "timeline__season-label" }, group.label),
          h("ol", { class: "timeline__events" }, ...dots),
        ),
      );
    }
  }

  render();
  return { root, refresh: render };
}
