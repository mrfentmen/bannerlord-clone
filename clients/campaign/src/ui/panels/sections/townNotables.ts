/**
 * The notables talk section (tasks 129-133). One card per notable: Talk opens
 * the conversation, the simulation writes every line and decides which actions
 * exist. Gift and favor have real backends (server routes /v1/notables/talk and
 * /v1/notables/relation, provider `talkToNotable`/`improveRelation`); ask-recruits
 * and ask-quest have no execution method anywhere in the contract yet, so the sim
 * lists them with a gate reason and this section shows that text rather than a
 * dead button. A refusal from a real action prints verbatim and re-arms.
 *
 * Doorless on purpose: the roster is already in `options.town.notables` from the
 * snapshot — loading it again would fetch what the panel already holds. The
 * conversation state lives in the spec module per town, so it survives the
 * context node being rebuilt while the same town stays selected (and a gift or
 * favor repainting the panel), and a genuinely different town resets it.
 */
import { h } from "../../dom.js";
import type { ImproveRelationRequest, Notable, TalkToNotableResult, TownState } from "../../../data/types.js";
import type { TownPanelOptions } from "../TownPanel.js";
import { type TownSectionSpec } from "../townSections.js";

/** The conversation currently open, held against the town record it belongs to.
 *  A WeakMap on the town object: any repaint from a fresh snapshot (a day tick,
 *  an order, a gift) is a new object, so the conversation closes with the world
 *  it was held in, and a reselect of the same town in the same snapshot keeps it. */
const openTalks = new WeakMap<object, TalkToNotableResult>();

function talkBody(
  card: HTMLElement,
  result: TalkToNotableResult,
  say: (text: string) => void,
  options: TownPanelOptions,
): void {
  for (const line of result.dialogue) {
    card.append(
      h("p", { class: "caption", style: "margin:var(--space-1) 0 0", "data-testid": "notable-dialogue-line" }, line),
    );
  }

  const actionsWrap = h("div", { style: "display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-3)" });
  for (const action of result.actions) {
    const canExecute = action.id === "gift" || action.id === "favor";
    if (!canExecute) {
      // No execution method exists in the contract for this action. The sim
      // says what it is and why it is closed; print that, no dead button.
      const line = action.detail + (action.reason ? ` — ${action.reason}` : "");
      actionsWrap.append(
        h("p", { class: "caption", style: "margin:0", "data-testid": `notable-action-${action.id}` }, `${action.label}: ${line}`),
      );
      continue;
    }
    if (!action.available) {
      actionsWrap.append(
        h("p", { class: "caption", style: "margin:0", "data-testid": `notable-action-${action.id}` }, `${action.label}: ${action.reason ?? "Not now."}`),
      );
      continue;
    }
    const btn = h(
      "button",
      { type: "button", class: "btn", "data-testid": `notable-action-${action.id}`, "aria-label": action.label },
      action.label,
    );
    btn.addEventListener("click", () => {
      btn.disabled = true;
      const request: ImproveRelationRequest =
        action.id === "gift"
          ? { notableId: result.notableId, action: "gift", amount: 50 }
          : { notableId: result.notableId, action: "favor" };
      void options.onNotableImprove!(request).then(
        (res) => {
          say(res.summary);
          // The handler repaints the panel with the fresh snapshot; drop the
          // stale conversation (the relation just moved under it).
          if (options.town) openTalks.delete(options.town);
        },
        (err: unknown) => {
          btn.disabled = false;
          say(err instanceof Error && err.message ? err.message : "The gesture fell flat.");
        },
      );
    });
    actionsWrap.append(btn);
  }
  card.append(actionsWrap);
}

function renderTalk(
  card: HTMLElement,
  town: TownState,
  notable: Notable,
  say: (text: string) => void,
  options: TownPanelOptions,
): void {
  const open = openTalks.get(town);
  if (open && open.notableId === notable.id) {
    talkBody(card, open, say, options);
    return;
  }
  const btn = h(
    "button",
    { type: "button", class: "btn", "data-testid": `notable-talk-${notable.id}`, "aria-label": `Talk to ${notable.name}` },
    "Talk",
  );
  btn.addEventListener("click", () => {
    btn.disabled = true;
    void options.onNotableTalk!(notable.id).then(
      (result) => {
        openTalks.set(town, result);
        renderTalk(card, town, notable, say, options);
      },
      (err: unknown) => {
        btn.disabled = false;
        say(err instanceof Error && err.message ? err.message : "They walked away before a word.");
      },
    );
  });
  card.append(btn);
}

export const townNotablesSectionSpec: TownSectionSpec<void> = {
  id: "notabletalk",
  header: "Street talk",
  enterLabel: "Step out and talk",
  loadingLabel: "Listening...",
  failureLabel: "Nobody would stop to talk.",
  available: (options) =>
    options.onNotableTalk !== undefined && options.onNotableImprove !== undefined && (options.town?.notables?.length ?? 0) > 0,
  render: (list, _view, _rt, options) => {
    const town = options.town;
    if (!town) return;
    const say = (text: string) => {
      // The pipeline's own status slot for this section (role=status, hidden
      // until spoken into) — same slot every other section refuses through.
      const slot = list.closest("section")?.querySelector("[data-testid='notabletalk-message']");
      if (slot) {
        slot.textContent = text;
        (slot as HTMLElement).style.display = "";
      }
    };
    const notables = town.notables ?? [];
    if (notables.length === 0) {
      list.append(
        h("p", { class: "caption", "data-testid": "notabletalk-empty", style: "margin:0" }, "No notable residents are recorded in this town."),
      );
      return;
    }
    for (const notable of notables) {
      const card = h("div", { class: "field-row", "data-testid": `notabletalk-${notable.id}`, style: "margin-bottom:var(--space-3)" });
      card.append(h("strong", {}, `${notable.name}${notable.title ? ` (${notable.title})` : ""}`));
      renderTalk(card, town, notable, say, options);
      list.append(card);
    }
  },
};
