/**
 * Dialogue and persuasion UI. MASTER_PLAN.md section 3G (tasks 131-134).
 *
 *  - Dialogue UI (task 131): speaker portraits and branching options.
 *    Options render from the sim's dialogue graph; the caller advances the
 *    graph through `onSelectOption` and feeds the next node via `showNode`.
 *  - Persuasion minigame (task 132): argument points and a progress bar.
 *    Each argument costs points and moves the bar; success or failure comes
 *    from the sim roll returned by `onMakeArgument`.
 *  - Relation change (task 133): after a dialogue ends, the delta renders
 *    inside the dialog with an animated count-up.
 *  - Barter sub-screen (task 134): opened from a dialogue, gold slider plus
 *    goods selection, the provider completes the barter via `onMakeOffer`
 *    and the sim's accept/refuse shows before dismissal.
 *
 * Same pattern as the other UI modules: this module owns no sim connection.
 * The caller injects action callbacks and feeds state via `showNode` /
 * `update`; it renders. Rowan wires the callbacks to the sim API.
 */

import { announce, button, h, liveRegion, replace } from "./dom.js";
import { emptyState, panel, statusChip } from "./kit.js";

/** Portraits staged in the campaign client public dir (Pollinations, modern). */
const PORTRAIT_DIR = "/images/portraits";
const PORTRAITS = ["rifleman_black.jpg", "rifleman_latina.jpg", "medic_asian.jpg", "gunner_white.jpg"];

/**
 * Pick a portrait for a speaker: an explicit portraitUrl wins, otherwise a
 * stable hash of the speaker's name picks one of the four staged portraits
 * so the same speaker always shows the same face.
 */
export function portraitFor(speakerName: string, portraitUrl?: string): string {
  if (portraitUrl) return portraitUrl;
  let hash = 0;
  for (let i = 0; i < speakerName.length; i++) {
    hash = (hash * 31 + speakerName.charCodeAt(i)) >>> 0;
  }
  return `${PORTRAIT_DIR}/${PORTRAITS[hash % PORTRAITS.length]}`;
}

export interface DialogueSpeaker {
  name: string;
  role?: string;
  factionName?: string;
  /** Absolute or site-relative URL. Defaults via portraitFor(). */
  portraitUrl?: string;
}

export interface DialogueOption {
  id: string;
  label: string;
  /** Which node the sim moves to when this option is chosen. */
  nextNodeId: string;
  /** Hint shown under the label, e.g. "[Persuade]" or "[Barter]". */
  hint?: string;
  disabled?: boolean;
  /** When set, selecting routes to a sub-screen instead of the sim graph. */
  opens?: "persuade" | "barter";
}

/** One node of the sim's dialogue graph. */
export interface DialogueNode {
  id: string;
  speaker: DialogueSpeaker;
  text: string;
  options: DialogueOption[];
  /** End nodes carry the relation outcome of the conversation. */
  relationDelta?: number;
  relationWith?: string;
}

/** Outcome delivered when the dialogue closes. */
export interface DialogueEnd {
  relationDelta: number;
  relationWith: string;
}

export interface DialogueCallbacks {
  /** Ask the sim to advance the graph; returns the next node to render. */
  onSelectOption: (nodeId: string, optionId: string) => Promise<DialogueNode>;
  /** Sim-computed persuasion attempt. */
  onMakeArgument?: (argumentId: string) => Promise<PersuasionResult>;
  /** The provider completes the barter; sim accepts or refuses. */
  onMakeOffer?: (offer: BarterOffer) => Promise<BarterResult>;
  /** Persuasion setup comes from the sim (points, arguments, target). */
  fetchPersuasion?: () => Promise<PersuasionState>;
  /** Barter setup comes from the sim/provider. */
  fetchBarter?: () => Promise<BarterState>;
  /** Fired when the player dismisses the dialog. */
  onDismiss?: (end: DialogueEnd | null) => void;
  onClose?: () => void;
  testId?: string;
}

export interface DialogueHandle {
  root: HTMLElement;
  /** Render a node of the dialogue graph. */
  showNode: (node: DialogueNode) => void;
  /** Render the relation delta animation inside the dialog (task 133). */
  showRelationDelta: (withName: string, delta: number) => void;
  destroy: () => void;
}



export function createDialogue(initial: DialogueNode, cb: DialogueCallbacks): DialogueHandle {
  let node = initial;
  const region = liveRegion();
  const { root, body } = panel({
    title: "Dialogue",
    testId: cb.testId ?? "dialogue",
    ...(cb.onClose ? { onClose: cb.onClose } : {}),
  });
  root.appendChild(region);

  function renderNode(): void {
    const speaker = node.speaker;
    const portrait = h("img", {
      class: "dialogue__portrait",
      src: portraitFor(speaker.name, speaker.portraitUrl),
      alt: `Portrait of ${speaker.name}`,
    });
    const header = h(
      "div",
      { class: "dialogue__speaker" },
      portrait,
      h(
        "div",
        { class: "dialogue__who" },
        h("strong", { class: "dialogue__name" }, speaker.name),
        speaker.role ? h("span", { class: "dialogue__role" }, speaker.role) : null,
        speaker.factionName ? h("span", { class: "dialogue__faction" }, speaker.factionName) : null,
      ),
    );
    const text = h("p", { class: "dialogue__text" }, node.text);
    const options =
      node.options.length > 0
        ? h(
            "div",
            { class: "dialogue__options", role: "group", "aria-label": "Dialogue options" },
            node.options.map((opt) =>
              button(opt.label + (opt.hint ? ` ${opt.hint}` : ""), () => void choose(opt), {
                variant: "plain",
                disabled: opt.disabled ?? false,
                testId: `dialogue-option-${opt.id}`,
              }),
            ),
          )
        : h(
            "div",
            { class: "dialogue__end" },
            button("Leave", () => void dismiss(), { variant: "primary", testId: "dialogue-leave" }),
          );
    replace(body, header, text, options);
    announce(region, `${speaker.name}: ${node.text}`);
  }

  async function choose(opt: DialogueOption): Promise<void> {
    if (opt.opens === "persuade") {
      await openPersuade();
      return;
    }
    if (opt.opens === "barter") {
      await openBarter();
      return;
    }
    node = await cb.onSelectOption(node.id, opt.id);

    renderNode();
  }

  async function openPersuade(): Promise<void> {
    if (!cb.fetchPersuasion || !cb.onMakeArgument) return;
    const state = await cb.fetchPersuasion();

    const handle = createPersuasion(state, {
      onMakeArgument: cb.onMakeArgument,
      onConcede: () => {
        renderNode();
      },
    });
    replace(body, handle.root);
    announce(region, "Persuasion. Spend argument points to convince them.");
  }

  async function openBarter(): Promise<void> {
    if (!cb.fetchBarter || !cb.onMakeOffer) return;
    const state = await cb.fetchBarter();

    const handle = createBarter(state, {
      onMakeOffer: cb.onMakeOffer,
      onDone: () => {
        renderNode();
      },
    });
    replace(body, handle.root);
    announce(region, `Bartering with ${state.notableName}.`);
  }

  function dismiss(): void {
    const end: DialogueEnd | null =
      node.relationDelta !== undefined && node.relationWith !== undefined
        ? { relationDelta: node.relationDelta, relationWith: node.relationWith }
        : null;
    if (end) showRelationDelta(end.relationWith, end.relationDelta);
    cb.onDismiss?.(end);
  }

  /** Task 133: relation delta animates inside the dialog. */
  function showRelationDelta(withName: string, delta: number): void {
    const sign = delta >= 0 ? "+" : "-";
    const chip = statusChip(delta >= 0 ? "good" : "critical", `${sign}${Math.abs(delta)} ${withName}`);
    chip.classList.add("dialogue__relation-delta");
    chip.setAttribute("data-testid", "dialogue-relation-delta");
    const target = body.querySelector(".dialogue__end") ?? body;
    target.appendChild(chip);
    // Count-up animation: 0 to delta over ~600ms, test-safe under jsdom.
    const start = performance.now();
    const duration = 600;
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const shown = Math.round(delta * t);
      const label = chip.querySelector(".chip__label");
      if (label) label.textContent = `${shown >= 0 ? "+" : "-"}${Math.abs(shown)} ${withName}`;
      if (t < 1) requestAnimationFrame(step);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
    announce(region, `Relation with ${withName} changed by ${sign}${Math.abs(delta)}.`);
  }

  function destroy(): void {
    root.remove();
  }

  renderNode();
  return { root, showNode: (n) => { node = n; renderNode(); }, showRelationDelta, destroy };
}

// -- Persuasion minigame (task 132) ------------------------------------------

export interface PersuasionArgument {
  id: string;
  label: string;
  /** Points spent to attempt this argument. */
  cost: number;
}

export interface PersuasionState {
  /** Points remaining to spend on arguments. */
  points: number;
  /** Current persuasion progress. */
  progress: number;
  /** Progress needed to win. */
  target: number;
  arguments: PersuasionArgument[];
}

/** The sim's ruling on one argument: progress moves, points are spent. */
export interface PersuasionResult {
  /** True when the sim's roll ended the exchange (win or loss). */
  done: boolean;
  /** True only when the sim ruled the persuasion a success. */
  success: boolean;
  progress: number;
  points: number;
  message: string;
}

export interface PersuasionCallbacks {
  onMakeArgument: (argumentId: string) => Promise<PersuasionResult>;
  onConcede: () => void;
}

export function createPersuasion(initial: PersuasionState, cb: PersuasionCallbacks): {
  root: HTMLElement;
  update: (state: PersuasionState) => void;
  destroy: () => void;
} {
  let state = initial;
  const region = liveRegion();
  const root = h("section", { class: "dialogue__persuade", "data-testid": "persuasion" }, region);

  function progressBar(): HTMLElement {
    const pct = state.target > 0 ? Math.max(0, Math.min(100, (state.progress / state.target) * 100)) : 0;
    return h(
      "div",
      {
        class: "dialogue__progress",
        role: "progressbar",
        "aria-label": `Persuasion progress ${state.progress} of ${state.target}`,
        "aria-valuenow": String(state.progress),
        "aria-valuemin": "0",
        "aria-valuemax": String(state.target),
        "data-testid": "persuasion-progress",
      },
      h("div", { class: "dialogue__progress-fill", style: `width:${pct}%` }),
    );
  }

  function render(): void {
    replace(
      root,
      region,
      h("h3", { class: "dialogue__persuade-title" }, "Persuade"),
      h("p", { class: "dialogue__points data", "data-testid": "persuasion-points" }, `Argument points: ${state.points}`),
      progressBar(),
      state.arguments.length > 0
        ? h(
            "div",
            { class: "dialogue__arguments", role: "group", "aria-label": "Arguments" },
            state.arguments.map((arg) =>
              button(`${arg.label} (${arg.cost} pts)`, () => void attempt(arg), {
                variant: "plain",
                disabled: arg.cost > state.points,
                testId: `persuasion-arg-${arg.id}`,
              }),
            ),
          )
        : emptyState("No arguments left.", "Concede or spend your remaining points."),
      button("Concede", cb.onConcede, { variant: "quiet", testId: "persuasion-concede" }),
    );
  }

  async function attempt(arg: PersuasionArgument): Promise<void> {
    const result = await cb.onMakeArgument(arg.id);
    state = { ...state, progress: result.progress, points: result.points };
    render();
    announce(region, result.message);
    if (result.done) {
      replace(
        root,
        region,
        h("h3", { class: "dialogue__persuade-title" }, result.success ? "Persuaded" : "Failed"),
        h("p", { class: "dialogue__persuade-result", "data-testid": "persuasion-result" }, result.message),
        button("Continue", cb.onConcede, { variant: "primary", testId: "persuasion-continue" }),
      );
      announce(region, result.message);
    }
  }

  render();
  return {
    root,
    update: (s) => {
      state = s;
      render();
    },
    destroy: () => root.remove(),
  };
}

// -- Barter sub-screen (task 134) --------------------------------------------

export interface BarterItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export interface BarterState {
  notableName: string;
  playerGold: number;
  /** Goods the player can offer. */
  playerGoods: BarterItem[];
  /** Goods the notable will part with. */
  notableGoods: BarterItem[];
}

export interface BarterOffer {
  gold: number;
  /** Item ids from the player's goods. */
  itemIds: string[];
}

export interface BarterResult {
  accepted: boolean;
  message: string;
}

export interface BarterCallbacks {
  /** The provider completes the barter; the sim accepts or refuses. */
  onMakeOffer: (offer: BarterOffer) => Promise<BarterResult>;
  onDone: () => void;
}

export function createBarter(initial: BarterState, cb: BarterCallbacks): {
  root: HTMLElement;
  update: (state: BarterState) => void;
  destroy: () => void;
} {
  let state = initial;
  let gold = 0;
  const selected = new Set<string>();
  const region = liveRegion();
  const root = h("section", { class: "dialogue__barter", "data-testid": "barter" }, region);

  function offerValue(): number {
    const items = state.playerGoods.filter((g) => selected.has(g.id)).reduce((sum, g) => sum + g.price, 0);
    return gold + items;
  }

  function askingPrice(): number {
    return state.notableGoods.reduce((sum, g) => sum + g.price, 0);
  }

  function render(): void {
    const slider = h("input", {
      type: "range",
      class: "dialogue__slider",
      min: "0",
      max: String(state.playerGold),
      step: "10",
      value: String(gold),
      "aria-label": "Gold offered",
      "data-testid": "barter-gold",
    }) as HTMLInputElement;
    slider.addEventListener("input", () => {
      gold = Number(slider.value);
      const readout = root.querySelector('[data-testid="barter-gold-readout"]');
      if (readout) readout.textContent = `${gold}g`;
      const total = root.querySelector('[data-testid="barter-total"]');
      if (total) total.textContent = `Offer value: ${offerValue()}g (asking ${askingPrice()}g)`;
    });

    const goods = h(
      "div",
      { class: "dialogue__goods", role: "group", "aria-label": "Your goods" },
      state.playerGoods.length > 0
        ? state.playerGoods.map((g) => {
            const toggle = h(
              "button",
              {
                type: "button",
                class: `dialogue__good${selected.has(g.id) ? " dialogue__good--selected" : ""}`,
                "aria-pressed": selected.has(g.id) ? "true" : "false",
                "data-testid": `barter-good-${g.id}`,
              },
              `${g.name} — ${g.price}g`,
            );
            toggle.addEventListener("click", () => {
              if (selected.has(g.id)) selected.delete(g.id);
              else selected.add(g.id);
              render();
            });
            return toggle;
          })
        : [emptyState("Nothing worth trading.", "You carry nothing the notable wants.")],
    );

    const notable = h(
      "ul",
      { class: "dialogue__notable-goods" },
      state.notableGoods.map((g) => h("li", {}, `${g.name} — ${g.price}g`)),
    );

    replace(
      root,
      region,
      h("h3", { class: "dialogue__barter-title" }, `Barter with ${state.notableName}`),
      h("p", { class: "data", "data-testid": "barter-gold-have" }, `Your gold: ${state.playerGold}g`),
      notable,
      goods,
      h(
        "label",
        { class: "dialogue__slider-row" },
        h("span", {}, "Gold offered: "),
        slider,
        h("output", { class: "data", "data-testid": "barter-gold-readout" }, `${gold}g`),
      ),
      h("p", { class: "data", "data-testid": "barter-total" }, `Offer value: ${offerValue()}g (asking ${askingPrice()}g)`),
      h(
        "div",
        { class: "dialogue__barter-actions" },
        button("Make offer", () => void offer(), { variant: "primary", testId: "barter-offer" }),
        button("Walk away", cb.onDone, { variant: "quiet", testId: "barter-walkaway" }),
      ),
    );
  }

  async function offer(): Promise<void> {
    const result = await cb.onMakeOffer({ gold, itemIds: [...selected] });
    // The sim's accept/refuse shows before any dismissal (task 134).
    replace(
      root,
      region,
      h("h3", { class: "dialogue__barter-title" }, result.accepted ? "Deal" : "Refused"),
      h("p", { class: "dialogue__barter-result", "data-testid": "barter-result" }, result.message),
      button("Continue", cb.onDone, { variant: "primary", testId: "barter-continue" }),
    );
    announce(region, result.message);
  }

  render();
  return {
    root,
    update: (s) => {
      state = s;
      gold = Math.min(gold, s.playerGold);
      render();
    },
    destroy: () => root.remove(),
  };
}
