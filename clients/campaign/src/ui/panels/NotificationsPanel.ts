/**
 * The notification center (mandate §10).
 *
 * The HUD tray shows the five most urgent notices; this panel is the full record:
 * every notification the simulation has sent this campaign, filterable by priority
 * and kind, newest and most urgent first. A notice that names an entity links
 * straight into the Why chain; one that names a settlement also opens the town.
 */

import { h } from "../dom.js";
import { emptyState, panel, statusChip } from "../kit.js";
import type { Notification } from "../../data/types.js";
import { asBottomSheet } from "./narrow.js";

export interface NotificationsPanelOptions {
  notifications: Notification[];
  /** Town ids the client can open, so only resolvable notices offer a jump. */
  townIds: Set<string>;
  onWhy: (entityId: string, field: string) => void;
  /** Called with the notice's town id; the host resolves it to a settlement. */
  onViewSettlement: (townId: string) => void;
  onClose: () => void;
}

type PriorityFilter = "all" | Notification["priority"];
type KindFilter = "all" | "battle" | "siege" | "rebellion" | "other";

const PRIORITY_RANK: Record<Notification["priority"], number> = {
  critical: 0,
  important: 1,
  informational: 2,
};

// The tray's redundancy rule, shared: the glyph is a shape, never colour alone,
// and the word is in the accessible name.
const PRIORITY_GLYPH: Record<Notification["priority"], string> = {
  critical: "◆",
  important: "▲",
  informational: "■",
};
const PRIORITY_WORD: Record<Notification["priority"], string> = {
  critical: "Critical",
  important: "Important",
  informational: "Informational",
};

const KIND_LABEL: Record<Exclude<KindFilter, "all">, string> = {
  battle: "Battle",
  siege: "Siege",
  rebellion: "Rebellion",
  other: "Notice",
};

function kindOf(n: Notification): Exclude<KindFilter, "all"> {
  return n.kind === "battle" || n.kind === "siege" || n.kind === "rebellion" ? n.kind : "other";
}

function sorted(notifications: Notification[]): Notification[] {
  return [...notifications].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.day - a.day,
  );
}

export function notificationsPanel(options: NotificationsPanelOptions): { root: HTMLElement } {
  const { root, body } = panel({
    title: "Notices",
    testId: "notifications-panel",
    onClose: options.onClose,
  });

  let priority: PriorityFilter = "all";
  let kind: KindFilter = "all";

  const filters = h("div", { class: "notices__filters" });
  const prioritySelect = h(
    "select",
    { class: "notices__filter", "data-testid": "notifications-filter-priority", "aria-label": "Filter by priority" },
    ...(["all", "critical", "important", "informational"] as PriorityFilter[]).map((p) =>
      h("option", { value: p, selected: p === priority }, p === "all" ? "All priorities" : PRIORITY_WORD[p]),
    ),
  );
  const kindSelect = h(
    "select",
    { class: "notices__filter", "data-testid": "notifications-filter-kind", "aria-label": "Filter by kind" },
    ...(["all", "battle", "siege", "rebellion", "other"] as KindFilter[]).map((k) =>
      h("option", { value: k, selected: k === kind }, k === "all" ? "All kinds" : KIND_LABEL[k]),
    ),
  );
  prioritySelect.addEventListener("change", () => {
    priority = prioritySelect.value as PriorityFilter;
    renderList();
  });
  kindSelect.addEventListener("change", () => {
    kind = kindSelect.value as KindFilter;
    renderList();
  });
  filters.appendChild(h("label", { class: "notices__label" }, ["Priority ", prioritySelect]));
  filters.appendChild(h("label", { class: "notices__label" }, ["Kind ", kindSelect]));
  body.appendChild(filters);

  const listWrap = h("div", { "data-testid": "notifications-list" });
  body.appendChild(listWrap);

  function renderList(): void {
    listWrap.textContent = "";
    const items = sorted(options.notifications).filter(
      (n) => (priority === "all" || n.priority === priority) && (kind === "all" || kindOf(n) === kind),
    );
    if (items.length === 0) {
      listWrap.appendChild(
        emptyState(
          options.notifications.length === 0 ? "No notices yet." : "Nothing matches those filters.",
          options.notifications.length === 0
            ? "Battles, sieges, shortages and unrest will be listed here as the campaign unfolds."
            : "Try widening the priority or kind filter.",
        ),
      );
      return;
    }
    const list = h("ol", { class: "notices__list" });
    for (const n of items) {
      const head: Node[] = [
        h("span", { class: "notice__priority", "aria-hidden": "true", "data-priority": n.priority }, PRIORITY_GLYPH[n.priority]),
        h("span", { class: "visually-hidden" }, `${PRIORITY_WORD[n.priority]} notice.`),
        statusChip(n.priority === "critical" ? "critical" : n.priority === "important" ? "warning" : "neutral", KIND_LABEL[kindOf(n)]),
        h("span", { class: "notices__day" }, `Day ${n.day}`),
      ];
      const actions: Node[] = [];
      if (n.entityId && n.field) {
        const why = h(
          "button",
          { type: "button", class: "btn btn--quiet", "data-testid": `notice-why-${n.id}` },
          "Why",
        );
        why.addEventListener("click", () => options.onWhy(n.entityId!, n.field!));
        actions.push(why);
      }
      if (n.entityId && options.townIds.has(n.entityId)) {
        const town = h(
          "button",
          { type: "button", class: "btn btn--quiet", "data-testid": `notice-town-${n.id}` },
          "View settlement",
        );
        town.addEventListener("click", () => options.onViewSettlement(n.entityId!));
        actions.push(town);
      }
      list.appendChild(
        h("li", { class: "notices__entry", "data-testid": `notice-center-${n.id}` }, [
          h("div", { class: "notices__head" }, head),
          h("p", { class: "notices__text" }, n.text),
          ...(actions.length > 0 ? [h("div", { class: "notices__actions" }, actions)] : []),
        ]),
      );
    }
    listWrap.appendChild(list);
  }

  renderList();
  return { root: asBottomSheet(root) };
}
