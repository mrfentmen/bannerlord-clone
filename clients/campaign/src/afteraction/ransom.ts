/**
 * Task 71: ransom negotiation. After a victory with captives, the player
 * haggles with the captor over at most 3 rounds of offers: meet the demand
 * and the prisoners are ransomed; lowball and the captor counters; burn all
 * 3 rounds and the captor walks away. Pure state machine + panel — the
 * campaign layer applies the coin/prisoner consequences.
 */

import { h } from "../ui/dom.js";

/** At most this many offers per negotiation (the task's acceptance). */
export const RANSOM_MAX_ROUNDS = 3;

export type RansomStatus = "open" | "accepted" | "walked";

export interface RansomNegotiation {
  captiveIds: string[];
  /** What the captor wants, total, in the campaign's currency. */
  demand: number;
  round: number;
  offers: number[];
  status: RansomStatus;
  /** The captor's last counter-offer, when waiting on the player. */
  counter: number | null;
}

export function startRansom(captiveIds: string[], demandPerHead: number): RansomNegotiation {
  const demand = Math.max(0, Math.round(demandPerHead)) * captiveIds.length;
  return { captiveIds: [...captiveIds], demand, round: 1, offers: [], status: "open", counter: null };
}

export type OfferResult =
  | { kind: "accepted"; paid: number }
  | { kind: "counter"; counter: number; round: number }
  | { kind: "walked" }
  | { kind: "closed" };

/**
 * Make an offer. Offers must be positive; non-positive input is ignored and
 * does not consume a round.
 */
export function offerRansom(neg: RansomNegotiation, amount: number): OfferResult {
  if (neg.status !== "open") return { kind: "closed" };
  const bid = Math.round(amount);
  if (!(bid > 0)) return { kind: "counter", counter: neg.counter ?? neg.demand, round: neg.round };
  neg.offers.push(bid);
  if (bid >= neg.demand) {
    neg.status = "accepted";
    neg.counter = null;
    return { kind: "accepted", paid: bid };
  }
  if (neg.round >= RANSOM_MAX_ROUNDS) {
    neg.status = "walked";
    neg.counter = null;
    return { kind: "walked" };
  }
  // The captor meets the player partway: halfway between the bid and demand.
  neg.counter = Math.round((bid + neg.demand) / 2);
  neg.round += 1;
  return { kind: "counter", counter: neg.counter, round: neg.round };
}

export interface RansomPanelOptions {
  onAccepted(paid: number): void;
  onWalkedAway(): void;
}

export interface RansomPanel {
  root: HTMLElement;
  destroy(): void;
}

export function createRansomPanel(neg: RansomNegotiation, opts: RansomPanelOptions): RansomPanel {
  const root = h("div", { class: "aa-ransom", "data-testid": "aa-ransom" });
  const status = h("p", { class: "aa-ransom-status" });
  const input = h("input", { class: "aa-ransom-bid", type: "number", min: "1" }) as HTMLInputElement;
  input.setAttribute("aria-label", "Your offer");
  const send = h("button", { class: "btn", type: "button" }, "Make offer");

  const render = (): void => {
    if (neg.status === "accepted") {
      status.textContent = `Ransomed for ${neg.offers[neg.offers.length - 1]}¤. The captives walk free.`;
    } else if (neg.status === "walked") {
      status.textContent = "The captor walks away. The prisoners are gone.";
    } else {
      const counter = neg.counter ?? neg.demand;
      status.textContent =
        `Round ${neg.round} of ${RANSOM_MAX_ROUNDS}. ` +
        `${neg.captiveIds.length} captive${neg.captiveIds.length === 1 ? "" : "s"} — ` +
        `the captor wants ${counter}¤.`;
    }
    const closed = neg.status !== "open";
    input.disabled = closed;
    send.hidden = closed;
  };

  send.addEventListener("click", () => {
    const result = offerRansom(neg, Number(input.value));
    if (result.kind === "accepted") opts.onAccepted(result.paid);
    else if (result.kind === "walked") opts.onWalkedAway();
    render();
  });

  root.append(
    h("h3", {}, "Ransom the captives"),
    status,
    h("div", { class: "aa-ransom-row" }, input, send),
  );
  render();
  return {
    root,
    destroy() {
      root.remove();
    },
  };
}
