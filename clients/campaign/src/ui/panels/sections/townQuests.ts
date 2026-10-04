/**
 * The town quests section (tasks 125-126). Offers the notable has posted, and
 * the quests the party already carries. The simulation owns the offers, the
 * objectives, the deadlines, and the rewards; this section only shows them and
 * sends the accept/abandon orders.
 */
import { h } from "../../dom.js";
import type { Quest, QuestOffer } from "../../../data/types.js";
import type { TownPanelOptions } from "../TownPanel.js";
import { type TownSectionRuntime, type TownSectionSpec } from "../townSections.js";

export interface TownQuestsView {
  offers: QuestOffer[];
  active: Quest[];
}

function questRow(quest: Quest, options: TownPanelOptions, rt: TownSectionRuntime): HTMLElement {
  const card = h("div", { class: "field-row", "data-testid": `quest-${quest.id}`, style: "margin-bottom:var(--space-3)" });
  const head = h("div");
  head.append(h("strong", {}, quest.title));
  const facts = h(
    "p",
    { class: "caption", style: "margin:0" },
    `From ${quest.giverName} \u00b7 $${Math.round(quest.rewardMoney).toLocaleString("en-US")} + ${quest.rewardRenown} renown` +
      (quest.deadlineDay !== null ? ` \u00b7 ${Math.max(0, quest.deadlineDay)} days left` : ""),
  );
  const progress = quest.objectives
    .map((o) => `${o.progress}/${o.target}`)
    .join(", ");
  const detail = h("p", { class: "caption", style: "margin:0" }, `${quest.description} (${progress})`);

  const abandon = h(
    "button",
    { type: "button", class: "btn", "data-testid": `quest-abandon-${quest.id}`, "aria-label": `Abandon ${quest.title}` },
    "Abandon",
  );
  abandon.addEventListener("click", () => {
    abandon.disabled = true;
    void options.onAbandonQuest!(quest.id).then(
      () => {
        rt.say(`Abandoned: ${quest.title}.`);
        rt.reload();
      },
      (err: unknown) => {
        abandon.disabled = false;
        rt.say(err instanceof Error && err.message ? err.message : "The quest could not be abandoned.");
      },
    );
  });

  card.append(head, facts, detail, abandon);
  return card;
}

export const townQuestsSectionSpec: TownSectionSpec<TownQuestsView> = {
  id: "quests",
  header: "Quests",
  enterLabel: "Ask about work",
  loadingLabel: "Asking around...",
  failureLabel: "The quest board could not be read.",
  available: (options) =>
    options.onLoadQuests !== undefined && options.onAcceptQuest !== undefined && options.onAbandonQuest !== undefined,
  load: (options) => options.onLoadQuests!(),
  render: (list, view, rt, options) => {
    if (view.active.length > 0) {
      const carried = h("p", { class: "caption", style: "margin:0 0 var(--space-2)" }, "Carried quests");
      list.appendChild(carried);
      for (const quest of view.active) list.appendChild(questRow(quest, options, rt));
    }

    const offersHead = h("p", { class: "caption", style: "margin:var(--space-3) 0 var(--space-2)" }, "Work on offer");
    list.appendChild(offersHead);
    if (view.offers.length === 0) {
      const none = h("p", { class: "caption", "data-testid": "quests-offers-empty", style: "margin:0" }, "No work posted here tonight.");
      list.appendChild(none);
      return;
    }
    for (const offer of view.offers) {
      const card = h("div", { class: "field-row", "data-testid": `quest-offer-${offer.templateId}`, style: "margin-bottom:var(--space-3)" });
      const head = h("div");
      head.append(h("strong", {}, offer.title));
      const facts = h(
        "p",
        { class: "caption", style: "margin:0" },
        `${offer.description} \u00b7 $${Math.round(offer.rewardMoney).toLocaleString("en-US")} + ${offer.rewardRenown} renown` +
          (offer.deadlineDays !== null ? ` \u00b7 ${offer.deadlineDays} day limit` : ""),
      );
      const accept = h(
        "button",
        { type: "button", class: "btn", "data-testid": `quest-accept-${offer.templateId}`, "aria-label": `Accept ${offer.title}` },
        "Accept",
      );
      accept.addEventListener("click", () => {
        accept.disabled = true;
        void options.onAcceptQuest!(offer.templateId).then(
          () => {
            rt.say(`Taken: ${offer.title}.`);
            rt.reload();
          },
          (err: unknown) => {
            accept.disabled = false;
            rt.say(err instanceof Error && err.message ? err.message : "They gave the work to someone else.");
          },
        );
      });
      card.append(head, facts, accept);
      list.appendChild(card);
    }
  },
};
