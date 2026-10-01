/**
 * Quest log and map markers UI. MASTER_PLAN.md section 3F (tasks 126-130).
 *
 *  - Quest log panel with active / completed / failed tabs that filter
 *    the quest list correctly (task 126).
 *  - Quest objectives render progress counters ("3/5") driven by world
 *    conditions; the caller feeds fresh sim state through `update()`
 *    on every campaign tick, so counters move with the world
 *    (task 127).
 *  - Quest markers: this module renders a "Track on map" toggle per
 *    active quest and fires `onTrackQuest` / `onUntrackQuest`. Placing
 *    and clearing the actual map pins is the caller's job; completed
 *    or failed quests never offer tracking, so markers clear when a
 *    quest leaves the active list (task 128).
 *  - Quest offers render the rewards preview — gold, XP, relation —
 *    before the player accepts or declines (task 129).
 *  - Failure and expiry warnings: quests expiring within 24 hours get
 *    an "Expiring soon" warning badge, expired quests get a critical
 *    chip, and quests flagged at risk of failing get a critical
 *    failure warning (task 130).
 *
 * Same pattern as the other UI modules: this module owns no sim
 * connection and no fetch. The caller (Rowan's campaign client)
 * injects the action callbacks, wires them to the sim API and the
 * campaign map, and feeds state via `update()`; this module renders.
 */

import { announce, button, h, liveRegion, replace, row, sectionHeader } from "./dom.js";
import { emptyState, panel, statusChip } from "./kit.js";

/** Hours before expiry when the warning badge appears (task 130). */
export const EXPIRY_WARNING_HOURS = 24;

export type QuestStatus = "active" | "completed" | "failed";

export const QUEST_TABS: QuestStatus[] = ["active", "completed", "failed"];

export const QUEST_TAB_LABELS: Record<QuestStatus, string> = {
  active: "Active",
  completed: "Completed",
  failed: "Failed",
};

/** An objective with progress counters driven by world conditions (task 127). */
export interface QuestObjective {
  id: string;
  label: string;
  current: number;
  target: number;
  /** Objective location, used for the map marker (task 128). Absent = no marker. */
  locationName?: string;
}

export interface QuestReward {
  gold: number;
  xp: number;
  /** Relation changes that come with the quest. */
  relations: { entityName: string; value: number }[];
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  giverName: string;
  status: QuestStatus;
  objectives: QuestObjective[];
  rewards: QuestReward;
  /** Hours left before the quest expires. Absent = no expiry. */
  expiresInHours?: number;
  /** True when failure conditions are closing in (task 130). */
  atRisk?: boolean;
  /** Whether the caller currently shows a map marker for this quest. */
  tracked?: boolean;
}

export interface QuestLogState {
  quests: Quest[];
}

export interface QuestLogCallbacks {
  onSelectQuest?: (questId: string) => void;
  /** Place a marker on the campaign map for this quest's objectives. */
  onTrackQuest: (questId: string) => void;
  /** Clear the map marker for this quest. */
  onUntrackQuest: (questId: string) => void;
  onClose?: () => void;
}

export interface QuestOfferCallbacks {
  onAcceptQuest: (questId: string) => void;
  onDeclineQuest: (questId: string) => void;
}

/** Expiry state, for the badges in the log (task 130). */
export type ExpiryKind = "none" | "expiring" | "expired";

export function expiryKind(quest: Quest): ExpiryKind {
  if (quest.expiresInHours === undefined) return "none";
  if (quest.expiresInHours <= 0) return "expired";
  if (quest.expiresInHours <= EXPIRY_WARNING_HOURS) return "expiring";
  return "none";
}

function expiryLabel(quest: Quest): string {
  const hours = Math.floor(quest.expiresInHours ?? 0);
  if (hours <= 0) return "Expired";
  return `Expires in ${hours}h`;
}

/** An objective row with its progress counter and progress bar. */
function objectiveRow(objective: QuestObjective): HTMLElement {
  const percent = objective.target > 0 ? Math.max(0, Math.min(1, objective.current / objective.target)) : 0;
  return h(
    "div",
    { class: "quest-objective", "data-objective-id": objective.id },
    h(
      "div",
      { class: "quest-objective__head" },
      h("span", { class: "quest-objective__label" }, objective.label),
      h("span", { class: "quest-objective__counter data" }, `${objective.current}/${objective.target}`),
    ),
    h(
      "div",
      {
        class: "quest-objective__track",
        role: "progressbar",
        "aria-label": objective.label,
        "aria-valuemin": "0",
        "aria-valuemax": String(objective.target),
        "aria-valuenow": String(objective.current),
      },
      h("span", { class: "quest-objective__fill", style: `width:${percent * 100}%` }),
    ),
    objective.locationName
      ? h("span", { class: "quest-objective__location caption" }, `Marked at ${objective.locationName}`)
      : null,
  );
}

/** The rewards preview, shown before acceptance and in the log (task 129). */
export function rewardsPreview(rewards: QuestReward, testId?: string): HTMLElement {
  const el = h("div", { class: "quest-rewards", "data-testid": testId });
  el.append(sectionHeader("Rewards"));
  el.append(row("Gold", `${rewards.gold}g`));
  el.append(row("XP", `${rewards.xp}`));
  if (rewards.relations.length > 0) {
    el.append(h("span", { class: "label" }, "Relations"));
    const list = h("div", { class: "quest-rewards__relations" });
    for (const relation of rewards.relations) {
      list.append(
        h(
          "div",
          { class: "quest-reward__relation" },
          h("span", {}, relation.entityName),
          statusChip(relation.value >= 0 ? "good" : "critical", relation.value > 0 ? `+${relation.value}` : `${relation.value}`),
        ),
      );
    }
    el.append(list);
  }
  return el;
}

export function createQuestLog(
  initial: QuestLogState,
  callbacks: QuestLogCallbacks,
): {
  root: HTMLElement;
  update: (state: QuestLogState) => void;
  destroy: () => void;
} {
  let state = initial;
  let activeTab: QuestStatus = "active";
  const { root, body } = panel({ title: "Quest log", testId: "quest-log" });
  const live = liveRegion();
  root.append(live);

  function filtered(): Quest[] {
    return state.quests.filter((q) => q.status === activeTab);
  }

  function questCard(quest: Quest): HTMLElement {
    const card = h("div", { class: "quest-card", "data-quest-id": quest.id });

    const titleButton = button(quest.title, () => {
      callbacks.onSelectQuest?.(quest.id);
    });
    titleButton.classList.add("quest-card__title");
    const head = h("div", { class: "quest-card__head" }, titleButton);
    head.append(h("span", { class: "quest-card__giver caption" }, `from ${quest.giverName}`));

    const badges = h("div", { class: "quest-card__badges" });
    const kind = expiryKind(quest);
    if (kind === "expiring") {
      badges.append(statusChip("warning", expiryLabel(quest), { testId: "quest-expiry-warning" }));
    } else if (kind === "expired") {
      badges.append(statusChip("critical", expiryLabel(quest), { testId: "quest-expiry-warning" }));
    }
    if (quest.atRisk && quest.status === "active") {
      badges.append(statusChip("critical", "At risk of failing", { testId: "quest-failure-warning" }));
    }

    card.append(head, badges);
    card.append(h("p", { class: "quest-card__desc" }, quest.description));

    if (quest.objectives.length > 0) {
      const objectives = h("div", { class: "quest-objectives", "data-testid": "quest-objectives" });
      for (const objective of quest.objectives) objectives.append(objectiveRow(objective));
      card.append(objectives);
    }

    card.append(rewardsPreview(quest.rewards));

    // Tracking is only offered while the quest is active; when a quest
    // completes or fails it leaves the active list and its marker goes
    // with it (task 128).
    if (quest.status === "active") {
      const toggle = button(quest.tracked ? "Tracked" : "Track on map", () => {
        if (quest.tracked) {
          callbacks.onUntrackQuest(quest.id);
          announce(live, `Stopped tracking ${quest.title}.`);
        } else {
          callbacks.onTrackQuest(quest.id);
          announce(live, `Tracking ${quest.title} on the map.`);
        }
      });
      toggle.setAttribute("aria-pressed", String(Boolean(quest.tracked)));
      toggle.setAttribute("data-testid", "quest-track-toggle");
      card.append(toggle);
    }

    return card;
  }

  function render(): void {
    const tabs = h("div", { class: "quest-tabs", role: "tablist", "aria-label": "Quest status" });
    for (const tab of QUEST_TABS) {
      const count = state.quests.filter((q) => q.status === tab).length;
      const tabButton = h(
        "button",
        {
          type: "button",
          role: "tab",
          class: `quest-tab${tab === activeTab ? " quest-tab--active" : ""}`,
          "aria-selected": String(tab === activeTab),
          "data-testid": `quest-tab-${tab}`,
        },
        `${QUEST_TAB_LABELS[tab]} (${count})`,
      );
      tabButton.addEventListener("click", () => {
        activeTab = tab;
        render();
      });
      tabs.append(tabButton);
    }

    const list = h("div", { class: "quest-list", role: "tabpanel" });
    const quests = filtered();
    if (quests.length === 0) {
      list.append(emptyState(`No ${activeTab} quests`, `Nothing here under ${QUEST_TAB_LABELS[activeTab].toLowerCase()}.`));
    } else {
      for (const quest of quests) list.append(questCard(quest));
    }

    const content: Node[] = [tabs, list];
    if (callbacks.onClose) {
      content.push(button("Close", callbacks.onClose, { variant: "quiet" }));
    }
    replace(body, ...content);
  }

  render();

  return {
    root,
    update(next: QuestLogState) {
      state = next;
      render();
    },
    destroy() {
      root.remove();
    },
  };
}

/**
 * The quest offer view: rewards preview before acceptance (task 129).
 * Accept fires `onAcceptQuest`; Decline fires `onDeclineQuest`.
 */
export function createQuestOffer(quest: Quest, callbacks: QuestOfferCallbacks): HTMLElement {
  const { root, body } = panel({ title: "New quest", testId: "quest-offer" });
  body.append(h("h3", { class: "quest-offer__title" }, quest.title));
  body.append(h("p", { class: "quest-offer__giver caption" }, `Offered by ${quest.giverName}`));
  body.append(h("p", { class: "quest-offer__desc" }, quest.description));

  if (quest.objectives.length > 0) {
    const objectives = h("div", { class: "quest-objectives" });
    for (const objective of quest.objectives) objectives.append(objectiveRow(objective));
    body.append(objectives);
  }

  body.append(rewardsPreview(quest.rewards, "quest-offer-rewards"));

  const kind = expiryKind(quest);
  if (kind === "expiring") {
    body.append(statusChip("warning", expiryLabel(quest)));
  }

  const actions = h("div", { class: "quest-offer__actions" });
  actions.append(
    button("Accept quest", () => callbacks.onAcceptQuest(quest.id), { variant: "primary", testId: "quest-accept" }),
    button("Decline", () => callbacks.onDeclineQuest(quest.id), { variant: "quiet", testId: "quest-decline" }),
  );
  body.append(actions);
  return root;
}
