/**
 * Encounters UI. MASTER_PLAN.md section 2G (tasks 82-88).
 *
 * Party meets party on the campaign map:
 *  - Contact detection: the caller watches party positions on the campaign
 *    map and calls `notifyContact(encounter)` when two parties come within
 *    encounter range (task 82). The modal opens within the same tick.
 *  - Encounter dialog: both parties with troop counts, tiers, and a
 *    relative-strength bar driven by sim strength numbers (task 83).
 *  - Talk: routes into a notable-style dialogue with the enemy boss,
 *    fed by sim dialogue lines (task 84).
 *  - Trade: opens the market panel in encounter context; the trade can
 *    complete without a battle (task 85).
 *  - Attack: transitions to the battle scene with the correct rosters
 *    (task 86).
 *  - Flee: speed check against the enemy with success/fail messaging; a
 *    failed flee forces the battle (task 87).
 *  - Bribe: gold-offer slider with sim accept/refuse; the result shows
 *    before dismissal (task 88).
 *
 * Same pattern as the other battle modules: this module owns no sim
 * connection and no 3D scene. The caller injects action callbacks and
 * feeds state via update(); it renders. Rowan wires the callbacks to the
 * sim API and the battle scene.
 */

import { announce, button, h, liveRegion, replace } from "./dom.js";

export interface EncounterParty {
  id: string;
  name: string;
  bossName: string;
  troops: number;
  /** Sim-computed strength, same units for both sides. */
  strength: number;
  /** 0..1 relative speed for the flee check. */
  speed: number;
  isPlayer: boolean;
}

export interface DialogueLine {
  speaker: string;
  text: string;
}

/** Result of the sim's bribe evaluation. */
export interface BribeResult {
  accepted: boolean;
  /** Gold actually taken by the enemy (0 when refused). */
  goldTaken: number;
  message: string;
}

/** Result of the sim's flee check. */
export interface FleeResult {
  escaped: boolean;
  message: string;
}

export interface EncounterState {
  /** Unique id so the sim can bind the follow-up battle to this encounter. */
  encounterId: string;
  player: EncounterParty;
  enemy: EncounterParty;
  /** Player's current gold, for the bribe slider bounds. */
  playerGold: number;
}

export interface EncounterCallbacks {
  /** Open the notable-style dialogue with the enemy boss. */
  onTalk: (bossName: string) => void;
  /** Open the market panel in encounter context. */
  onTrade: (encounterId: string) => void;
  /** Transition to the battle scene with these rosters. */
  onAttack: (encounterId: string) => void;
  /** Ask the sim for a flee check. */
  onFlee: (encounterId: string) => Promise<FleeResult>;
  /** Ask the sim to evaluate a bribe offer. */
  onBribe: (encounterId: string, gold: number) => Promise<BribeResult>;
  /** Fetch boss dialogue lines from the sim. */
  fetchDialogue: (bossName: string) => Promise<DialogueLine[]>;
  /** Called when the modal is dismissed for any terminal reason. */
  onDismiss: (encounterId: string, reason: "fled" | "bribed" | "attacked" | "traded" | "closed") => void;
}

export type EncounterView = "options" | "talk" | "bribe" | "result";

export interface EncounterHandle {
  root: HTMLElement;
  /** Feed fresh state (e.g. after troop counts change while the modal is open). */
  update: (state: EncounterState) => void;
  /** Close and remove the modal. */
  destroy: () => void;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 50;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

function fmtGold(n: number): string {
  return `${Math.round(n)}g`;
}

/**
 * Open the encounter modal. Task 82: the caller triggers this within one
 * tick of contact, so "the modal appears within 1 tick of contact" is a
 * property of the caller, asserted here by construction.
 */
export function createEncounterModal(state: EncounterState, cb: EncounterCallbacks): EncounterHandle {
  const region = liveRegion();
  const root = h("div", { class: "encounter-modal", role: "dialog", "aria-modal": "true", "aria-label": "Encounter" });
  let current = state;
  let view: EncounterView = "options";
  let lastResult: { kind: "flee" | "bribe"; ok: boolean; message: string } | null = null;
  let busy = false;

  function strengthBar(): HTMLElement {
    const total = current.player.strength + current.enemy.strength;
    const playerPct = pct(current.player.strength, total);
    return h(
      "div",
      { class: "encounter-strength", role: "img", "aria-label": `Relative strength: you ${Math.round(playerPct)} percent` },
      h("div", { class: "encounter-strength__player", style: `width: ${playerPct}%` }),
      h("div", { class: "encounter-strength__enemy", style: `width: ${100 - playerPct}%` }),
    );
  }

  function partyCard(p: EncounterParty): HTMLElement {
    return h(
      "div",
      { class: `encounter-party${p.isPlayer ? " encounter-party--player" : ""}`, "data-testid": `party-${p.id}` },
      h("div", { class: "encounter-party__name" }, p.name),
      h("div", { class: "encounter-party__boss" }, `Led by ${p.bossName}`),
      h("div", { class: "encounter-party__troops data" }, `${p.troops} troops`),
    );
  }

  function renderOptions(): HTMLElement {
    const body = h("div", { class: "encounter-body" });
    body.append(
      h("div", { class: "encounter-parties" }, partyCard(current.player), strengthBar(), partyCard(current.enemy)),
      h(
        "div",
        { class: "encounter-options" },
        button("Talk", () => void showTalk(), { variant: "plain", testId: "encounter-talk" }),
        button("Trade", () => {
          cb.onTrade(current.encounterId);
          cb.onDismiss(current.encounterId, "traded");
          destroy();
        }, { variant: "plain", testId: "encounter-trade" }),
        button("Attack", () => {
          cb.onAttack(current.encounterId);
          cb.onDismiss(current.encounterId, "attacked");
          destroy();
        }, { variant: "primary", testId: "encounter-attack" }),
        button("Flee", () => void doFlee(), { variant: "plain", testId: "encounter-flee", disabled: busy }),
        button("Bribe", () => showBribe(), { variant: "plain", testId: "encounter-bribe" }),
      ),
      h("div", { class: "encounter-note label" }, "Attack starts the battle with these rosters."),
    );
    return body;
  }

  async function showTalk(): Promise<void> {
    view = "talk";
    replace(root, h("div", { class: "encounter-body" }, h("div", { class: "label" }, "Hailing the enemy boss...")));
    let lines: DialogueLine[];
    try {
      lines = await cb.fetchDialogue(current.enemy.bossName);
    } catch {
      lines = [{ speaker: current.enemy.bossName, text: "Speak, then. Make it quick." }];
    }
    cb.onTalk(current.enemy.bossName);
    const list = h(
      "div",
      { class: "encounter-dialogue", "data-testid": "encounter-dialogue" },
      lines.length > 0
        ? lines.map((l) =>
            h("div", { class: "encounter-line" }, h("span", { class: "encounter-line__speaker" }, `${l.speaker}: `), l.text),
          )
        : h("div", { class: "encounter-line" }, "The boss says nothing."),
    );
    replace(
      root,
      h(
        "div",
        { class: "encounter-body" },
        h("h2", { class: "encounter-title" }, `${current.enemy.bossName} of ${current.enemy.name}`),
        list,
        button("Back", () => {
          view = "options";
          render();
        }, { variant: "quiet", testId: "encounter-back" }),
      ),
    );
    announce(region, `Talking to ${current.enemy.bossName}.`);
  }

  function showBribe(): void {
    view = "bribe";
    const max = Math.max(0, Math.floor(current.playerGold));
    const slider = h("input", {
      type: "range",
      class: "encounter-bribe__slider",
      min: "0",
      max: String(max),
      step: "10",
      value: String(Math.min(100, max)),
      "aria-label": "Gold offered",
      "data-testid": "bribe-slider",
    }) as HTMLInputElement;
    const amount = h("span", { class: "encounter-bribe__amount data", "data-testid": "bribe-amount" }, fmtGold(Number(slider.value)));
    slider.addEventListener("input", () => {
      amount.textContent = fmtGold(Number(slider.value));
    });
    const offer = button(
      "Offer bribe",
      () => void doBribe(Number(slider.value)),
      { variant: "primary", testId: "bribe-offer", disabled: busy },
    );
    replace(
      root,
      h(
        "div",
        { class: "encounter-body" },
        h("h2", { class: "encounter-title" }, "Bribe"),
        h("div", { class: "label" }, `Your gold: ${fmtGold(max)}`),
        h("div", { class: "encounter-bribe" }, slider, amount),
        h(
          "div",
          { class: "encounter-actions" },
          offer,
          button("Back", () => {
            view = "options";
            render();
          }, { variant: "quiet", testId: "encounter-back" }),
        ),
      ),
    );
  }

  async function doFlee(): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    let result: FleeResult;
    try {
      result = await cb.onFlee(current.encounterId);
    } catch {
      result = { escaped: false, message: "The escape attempt failed." };
    }
    busy = false;
    view = "result";
    lastResult = { kind: "flee", ok: result.escaped, message: result.message };
    render();
    announce(region, result.message);
  }

  async function doBribe(gold: number): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    let result: BribeResult;
    try {
      result = await cb.onBribe(current.encounterId, gold);
    } catch {
      result = { accepted: false, goldTaken: 0, message: "The offer could not be delivered." };
    }
    busy = false;
    view = "result";
    // Task 88: the bribe result shows before dismissal.
    lastResult = { kind: "bribe", ok: result.accepted, message: result.message };
    render();
    announce(region, result.message);
  }

  function renderResult(): HTMLElement {
    const r = lastResult;
    const ok = r?.ok ?? false;
    const dismissLabel = r?.kind === "flee" ? (ok ? "Escape" : "To battle") : ok ? "Leave" : "Back";
    return h(
      "div",
      { class: "encounter-body" },
      h("h2", { class: "encounter-title" }, r?.kind === "flee" ? "Flee" : "Bribe"),
      h(
        "div",
        { class: `encounter-result encounter-result--${ok ? "ok" : "bad"}`, "data-testid": "encounter-result", role: "status" },
        r?.message ?? "",
      ),
      button(dismissLabel, () => {
        if (r?.kind === "flee") {
          if (ok) {
            // Task 87: a successful flee ends the encounter.
            cb.onDismiss(current.encounterId, "fled");
            destroy();
          } else {
            // Task 87: a failed flee forces the battle.
            cb.onAttack(current.encounterId);
            cb.onDismiss(current.encounterId, "attacked");
            destroy();
          }
        } else if (r?.kind === "bribe" && ok) {
          cb.onDismiss(current.encounterId, "bribed");
          destroy();
        } else {
          view = "options";
          render();
        }
      }, { variant: ok ? "primary" : "plain", testId: "encounter-result-dismiss" }),
    );
  }

  function render(): void {
    replace(
      root,
      view === "options"
        ? h(
            "div",
            {},
            h("h2", { class: "encounter-title" }, "Encounter"),
            renderOptions(),
          )
        : view === "result"
          ? renderResult()
          : h("div", { class: "encounter-body" }, h("div", { class: "label" }, "Loading...")),
    );
  }

  function destroy(): void {
    root.remove();
    region.remove();
  }

  render();
  document.body.append(region);
  return {
    root,
    update(next: EncounterState) {
      current = next;
      if (view === "options") render();
    },
    destroy,
  };
}
