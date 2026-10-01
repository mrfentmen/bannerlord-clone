/**
 * The active march tracker. `MARCH_AND_WAR.md` section 11, master plan 2H.
 *
 * Once a march is committed the party is on the road. This module shows where
 * the march stands: destination, a progress bar, and an ETA countdown that
 * moves as the sim ticks. It also handles what the road throws back:
 *
 * - interruption alerts (ambush or blocked road) with a "face them" option
 *   that routes into the encounter flow,
 * - cancelling the march, with the partial refund the sim reports.
 *
 * It owns no sim connection. The caller feeds it the party state on each tick
 * (via `update`) and any interruptions the tick carried (via `interrupt`).
 * Cancelling and the encounter option go out through injected callbacks.
 */

import { h } from "./dom.js";
import { emptyState, statusChip } from "./kit.js";
import type {
  CancelMarchResult,
  MarchInterruption,
  PartyState,
  SimulationProvider,
} from "../data/types.js";

export interface MarchTrackerCallbacks {
  /** The player chose to face an interruption: open the encounter flow for it. */
  onFaceInterruption: (interruption: MarchInterruption) => void;
  /** The player dismissed an interruption alert without acting. */
  onDismissInterruption?: (interruption: MarchInterruption) => void;
}

export interface MarchTrackerOptions {
  provider: SimulationProvider;
  callbacks: MarchTrackerCallbacks;
  testId?: string;
}

export interface MarchTrackerHandle {
  root: HTMLElement;
  /** Feed the latest party state (and current day) after every tick or snapshot. */
  update(party: PartyState, day: number): void;
  /** Deliver interruptions that arrived on a tick. */
  interrupt(interruption: MarchInterruption): void;
}

/** Days remaining and total for an active march, from party state. */
export function marchProgress(
  party: PartyState,
  day: number,
): { daysOut: number; daysTotal: number; daysRemaining: number } | null {
  if (!party.destination || party.marchingSinceDay === null) return null;
  const daysTotal = party.destination.daysTotal ?? 1;
  const daysOut = Math.max(0, day - party.marchingSinceDay);
  return { daysOut, daysTotal, daysRemaining: Math.max(0, daysTotal - daysOut) };
}

/** "Arrives in 3 days (day 24)". Plain words, no jargon. */
export function etaLabel(progress: { daysRemaining: number }, arrivalDay: number): string {
  const n = progress.daysRemaining;
  return n <= 0 ? "Arriving now" : `Arrives in ${n} ${n === 1 ? "day" : "days"} (day ${arrivalDay})`;
}

export function createMarchTracker(options: MarchTrackerOptions): MarchTrackerHandle {
  const { root, body } = (() => {
    const r = h("section", { class: "march-tracker", "data-testid": options.testId ?? "march-tracker" });
    const b = h("div", { class: "march-tracker__body" });
    r.appendChild(b);
    return { root: r, body: b };
  })();

  let party: PartyState | null = null;
  let day = 0;
  let cancelling = false;
  let cancelResult: CancelMarchResult | null = null;
  let cancelError: string | null = null;
  const pendingInterruptions: MarchInterruption[] = [];
  const seenInterruptionIds = new Set<string>();

  function render(): void {
    body.replaceChildren();

    // Interruption alerts sit above the march state. Newest first.
    for (const interruption of [...pendingInterruptions].reverse()) {
      body.appendChild(interruptionAlert(interruption));
    }

    if (cancelResult) {
      body.appendChild(refundPanel(cancelResult));
      return;
    }

    const progress = party ? marchProgress(party, day) : null;
    if (!party || !progress || !party.destination) {
      body.appendChild(
        emptyState(
          "No march under way.",
          "Plan a march from the march panel and the column's progress shows here.",
        ),
      );
      return;
    }

    const dest = party.destination;
    const fraction = progress.daysTotal > 0 ? Math.min(1, progress.daysOut / progress.daysTotal) : 0;
    const arrivalDay = (party.marchingSinceDay ?? day) + progress.daysTotal;

    body.appendChild(
      h(
        "div",
        { class: "march-tracker__head" },
        h("p", { class: "label", style: "margin:0" }, "On the march"),
        h("p", { class: "data", style: "margin:0", "data-testid": "march-tracker-destination" }, `To ${dest.name}`),
      ),
    );

    body.appendChild(
      h(
        "div",
        {
          class: "gauge__track",
          role: "meter",
          "aria-label": `March progress to ${dest.name}`,
          "aria-valuemin": "0",
          "aria-valuemax": String(progress.daysTotal),
          "aria-valuenow": String(Math.min(progress.daysOut, progress.daysTotal)),
          "data-testid": "march-tracker-progress",
        },
        h("span", {
          class: "gauge__fill",
          style: `width:${Math.round(fraction * 100)}%;background:var(--status-info-mark)`,
        }),
      ),
    );

    body.appendChild(
      h(
        "div",
        { class: "field-row", style: "margin-top:var(--space-2)" },
        h(
          "p",
          { class: "data", style: "margin:0", "data-testid": "march-tracker-eta" },
          etaLabel(progress, arrivalDay),
        ),
        statusChip(progress.daysRemaining <= 0 ? "good" : "info", `${Math.round(fraction * 100)}% there`, {
          testId: "march-tracker-pct",
        }),
      ),
    );

    const marchId = dest.marchId;
    if (marchId) {
      const cancelBtn = h(
        "button",
        {
          type: "button",
          class: "btn",
          "data-testid": "march-tracker-cancel",
          disabled: cancelling ? "true" : undefined,
          style: "margin-top:var(--space-2);width:100%",
        },
        cancelling ? "Calling it off…" : "Call off the march",
      );
      cancelBtn.addEventListener("click", () => void cancel(marchId));
      body.appendChild(cancelBtn);
      if (cancelError) {
        body.appendChild(h("p", { class: "warning", "data-severity": "critical" }, cancelError));
      }
      body.appendChild(
        h(
          "p",
          { class: "caption" },
          "Calling off a march turns the column around. Supplies already eaten stay eaten; the rest comes back.",
        ),
      );
    }
  }

  function interruptionAlert(interruption: MarchInterruption): HTMLElement {
    const box = h(
      "div",
      {
        class: "march-tracker__alert",
        "data-testid": `march-interruption-${interruption.id}`,
        role: "alert",
      },
      h(
        "p",
        { class: "label", style: "margin:0 0 var(--space-1)" },
        interruption.kind === "ambush" ? "Ambush on the road" : "Road blocked",
      ),
      h("p", { class: "caption", style: "margin:0 0 var(--space-2)" }, interruption.description),
    );
    const row = h("div", { class: "field-row" });
    if (interruption.kind === "ambush") {
      const faceBtn = h(
        "button",
        { type: "button", class: "btn btn--primary", "data-testid": `march-interruption-face-${interruption.id}` },
        "Face them",
      );
      faceBtn.addEventListener("click", () => {
        removeInterruption(interruption.id);
        options.callbacks.onFaceInterruption(interruption);
      });
      row.appendChild(faceBtn);
    }
    const dismissBtn = h(
      "button",
      { type: "button", class: "btn", "data-testid": `march-interruption-dismiss-${interruption.id}` },
      interruption.kind === "ambush" ? "March on" : "Wait it out",
    );
    dismissBtn.addEventListener("click", () => {
      removeInterruption(interruption.id);
      options.callbacks.onDismissInterruption?.(interruption);
    });
    row.appendChild(dismissBtn);
    box.appendChild(row);
    return box;
  }

  function removeInterruption(id: string): void {
    const idx = pendingInterruptions.findIndex((i) => i.id === id);
    if (idx >= 0) pendingInterruptions.splice(idx, 1);
    render();
  }

  function refundPanel(result: CancelMarchResult): HTMLElement {
    const box = h("div", { "data-testid": "march-cancel-result" });
    box.appendChild(
      h("p", { class: "label", style: "margin:0 0 var(--space-1)" }, "March called off"),
    );
    box.appendChild(
      h(
        "p",
        { class: "caption" },
        `The column turned back from the road to ${result.destinationName} with ${result.daysRemaining} of ${result.daysTotal} days still to walk.`,
      ),
    );
    const list = h("ul", { class: "costs" });
    list.append(
      refundCell("Grain back", result.refundedFood.toFixed(1)),
      refundCell("Money back", `$${Math.round(result.refundedMoney).toLocaleString("en-US")}`),
      refundCell("Metal back", result.refundedMetal.toFixed(1)),
    );
    box.appendChild(list);
    const okBtn = h(
      "button",
      { type: "button", class: "btn btn--primary", style: "margin-top:var(--space-2);width:100%" },
      "Understood",
    );
    okBtn.addEventListener("click", () => {
      cancelResult = null;
      render();
    });
    box.appendChild(okBtn);
    return box;
  }

  function refundCell(key: string, value: string): HTMLElement {
    return h(
      "li",
      { class: "cost" },
      h("div", { class: "cost__key" }, key),
      h("div", { class: "data" }, value),
    );
  }

  async function cancel(marchId: string): Promise<void> {
    cancelling = true;
    cancelError = null;
    render();
    try {
      cancelResult = await options.provider.cancelMarch(marchId);
    } catch (err) {
      cancelError = err instanceof Error ? err.message : "The march could not be called off.";
    } finally {
      cancelling = false;
      render();
    }
  }

  render();

  return {
    root,
    update(next: PartyState, nextDay: number) {
      party = next;
      day = nextDay;
      // A finished or cancelled march clears the refund panel on the next tick.
      if (cancelResult && (!next.destination || next.destination.marchId !== cancelResult.marchId)) {
        cancelResult = null;
      }
      render();
    },
    interrupt(interruption: MarchInterruption) {
      if (seenInterruptionIds.has(interruption.id)) return;
      seenInterruptionIds.add(interruption.id);
      pendingInterruptions.push(interruption);
      render();
    },
  };
}
