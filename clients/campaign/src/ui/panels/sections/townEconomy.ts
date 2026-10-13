/**
 * The economy/crime cluster (backlog bucket 7), as three doorless sections:
 *
 * - Under the law: the town's outstanding fine (read through the caller), the
 *   three crimes the simulation prices (theft, assault, smuggling), and paying
 *   the fine off. The sim owns the amounts, the crime rating, the security and
 *   the prosperity damage; this section prints its answers verbatim.
 * - Governor: only for a town the player's clan holds. Reads the current
 *   governor through the caller; appoints from the companions the caller
 *   supplies. The sim writes the appointment line, bonus included.
 * - Ransom broker: sells the party's prisoners into the town's broker at the
 *   broker's own price. Quantity is the player's; the cap is the sim's.
 *
 * All three fail verbatim where the simulation refuses, and re-arm.
 */
import { h } from "../../dom.js";
import { type TownSectionSpec } from "../townSections.js";

const CRIMES: { kind: "theft" | "assault" | "smuggling"; label: string }[] = [
  { kind: "theft", label: "Commit theft" },
  { kind: "assault", label: "Commit assault" },
  { kind: "smuggling", label: "Run contraband" },
];

export const townCrimeSectionSpec: TownSectionSpec<void> = {
  id: "crime",
  header: "Under the law",
  enterLabel: "Look into the town's ledgers",
  loadingLabel: "Reading the ledgers...",
  failureLabel: "The ledgers could not be read.",
  available: (options) =>
    options.onCommitCrime !== undefined && options.onPayFine !== undefined && options.onGetOutstandingFine !== undefined,
  render: (list, _view, _rt, options) => {
    const town = options.town;
    if (!town) return;
    const say = (text: string) => {
      const slot = list.closest("section")?.querySelector("[data-testid='crime-message']");
      if (slot) {
        slot.textContent = text;
        (slot as HTMLElement).style.display = "";
      }
    };
    const fineLine = h("p", { class: "caption", "data-testid": "crime-fine", style: "margin:0" }, "Reading the fine ledger...");
    list.append(fineLine);
    void options.onGetOutstandingFine!().then(
      (fine) => {
        fineLine.textContent = fine > 0 ? `Outstanding fine: $${Math.round(fine).toLocaleString("en-US")}.` : "No fines outstanding.";
      },
      () => {
        fineLine.textContent = "The fine ledger could not be read.";
      },
    );

    const actions = h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" });
    for (const c of CRIMES) {
      const btn = h("button", { type: "button", class: "btn", "data-testid": `crime-${c.kind}` }, c.label);
      btn.addEventListener("click", () => {
        btn.disabled = true;
        void options.onCommitCrime!(c.kind).then(
          (r) => {
            btn.disabled = false;
            say(`The deed is done. A fine of $${Math.round(r.fine).toLocaleString("en-US")} is on the books.`);
            options.onWorldChanged?.();
          },
          (err: unknown) => {
            btn.disabled = false;
            say(err instanceof Error && err.message ? err.message : "The deed did not land.");
          },
        );
      });
      actions.append(btn);
    }
    list.append(actions);

    const payBtn = h("button", { type: "button", class: "btn", "data-testid": "crime-pay-fine" }, "Pay the fine");
    payBtn.addEventListener("click", () => {
      payBtn.disabled = true;
      void options.onPayFine!().then(
        (r) => {
          payBtn.disabled = false;
          say(`Paid $${Math.round(r.paid).toLocaleString("en-US")}. The books are clean.`);
          options.onWorldChanged?.();
        },
        (err: unknown) => {
          payBtn.disabled = false;
          say(err instanceof Error && err.message ? err.message : "The payment did not land.");
        },
      );
    });
    list.append(payBtn);
  },
};

export const townGovernorSectionSpec: TownSectionSpec<void> = {
  id: "governor",
  header: "Governor",
  enterLabel: "Ask who governs here",
  loadingLabel: "Asking...",
  failureLabel: "The governor could not be read.",
  available: (options) =>
    options.heldByPlayer === true && options.onGetGovernor !== undefined && options.onAssignGovernor !== undefined,
  render: (list, _view, _rt, options) => {
    const town = options.town;
    if (!town) return;
    const say = (text: string) => {
      const slot = list.closest("section")?.querySelector("[data-testid='governor-message']");
      if (slot) {
        slot.textContent = text;
        (slot as HTMLElement).style.display = "";
      }
    };
    const current = h("p", { class: "caption", "data-testid": "governor-current", style: "margin:0" }, "Reading the appointment rolls...");
    list.append(current);
    void options.onGetGovernor!().then(
      (g) => {
        current.textContent = g ? `Governor: ${g.name}. ${g.line}` : "No governor appointed.";
      },
      () => {
        current.textContent = "The appointment rolls could not be read.";
      },
    );

    const candidates = options.governorCandidates ?? [];
    if (candidates.length === 0) {
      list.append(h("p", { class: "caption", style: "margin:var(--space-2) 0 0" }, "No companion is free to govern here."));
      return;
    }
    const select = h("select", { class: "field__input", "data-testid": "governor-select", "aria-label": "Companion to appoint" },
      ...candidates.map((c) => h("option", { value: c.id }, c.name)),
    );
    const assign = h("button", { type: "button", class: "btn", "data-testid": "governor-assign" }, "Appoint governor");
    assign.addEventListener("click", () => {
      const id = (select as HTMLSelectElement).value;
      if (!id) return;
      assign.disabled = true;
      void options.onAssignGovernor!(id).then(
        (r) => {
          assign.disabled = false;
          say(r.line);
          options.onWorldChanged?.();
        },
        (err: unknown) => {
          assign.disabled = false;
          say(err instanceof Error && err.message ? err.message : "The appointment did not land.");
        },
      );
    });
    list.append(h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" }, select, assign));
  },
};

export const townGarrisonSectionSpec: TownSectionSpec<void> = {
  id: "garrison",
  header: "Garrison",
  enterLabel: "Inspect the garrison",
  loadingLabel: "Counting the garrison...",
  failureLabel: "The garrison could not be read.",
  available: (options) =>
    options.heldByPlayer === true &&
    options.onTransferToGarrison !== undefined &&
    (options.partyTroops?.length ?? 0) > 0,
  render: (list, _view, _rt, options) => {
    const town = options.town;
    if (!town) return;
    const say = (text: string) => {
      const slot = list.closest("section")?.querySelector("[data-testid='garrison-message']");
      if (slot) {
        slot.textContent = text;
        (slot as HTMLElement).style.display = "";
      }
    };
    const current = h("p", { class: "caption", "data-testid": "garrison-current", style: "margin:0" },
      `Garrison: ${Math.round(town.garrison)}.`);
    list.append(current);
    list.append(h("p", { class: "caption", style: "margin:var(--space-1) 0 0" },
      "Leave troops behind to hold the town. Someone has to ride out."));
    for (const t of options.partyTroops ?? []) {
      const card = h("div", { class: "field-row", "data-testid": `garrison-${t.id}`, style: "margin-bottom:var(--space-3)" });
      const qty = h("input", {
        class: "field__input",
        type: "number",
        min: "1",
        max: String(t.count),
        value: String(t.count),
        "aria-label": `How many ${t.name} to garrison`,
        style: "width:5rem",
      });
      const btn = h("button", { type: "button", class: "btn", "data-testid": `garrison-leave-${t.id}` }, `Leave ${t.name} x${t.count}`);
      btn.addEventListener("click", () => {
        const count = Math.floor(Number((qty as HTMLInputElement).value));
        if (!Number.isFinite(count) || count <= 0) {
          say("Choose how many to leave.");
          return;
        }
        btn.disabled = true;
        void options.onTransferToGarrison!(t.id, count).then(
          (r) => {
            btn.disabled = false;
            say(r.line);
            options.onWorldChanged?.();
          },
          (err: unknown) => {
            btn.disabled = false;
            say(err instanceof Error && err.message ? err.message : "The transfer did not land.");
          },
        );
      });
      card.append(btn, qty);
      list.append(card);
    }
  },
};

export const townBrokerSectionSpec: TownSectionSpec<void> = {
  id: "broker",
  header: "Ransom broker",
  enterLabel: "Find the ransom broker",
  loadingLabel: "Looking for the broker...",
  failureLabel: "The broker could not be found.",
  available: (options) =>
    options.onSellPrisonersToBroker !== undefined && (options.prisoners?.length ?? 0) > 0,
  render: (list, _view, _rt, options) => {
    const town = options.town;
    if (!town) return;
    const say = (text: string) => {
      const slot = list.closest("section")?.querySelector("[data-testid='broker-message']");
      if (slot) {
        slot.textContent = text;
        (slot as HTMLElement).style.display = "";
      }
    };
    const prisoners = options.prisoners ?? [];
    for (const p of prisoners) {
      const card = h("div", { class: "field-row", "data-testid": `broker-${p.troopId}`, style: "margin-bottom:var(--space-3)" });
      const qty = h("input", {
        class: "field__input",
        type: "number",
        min: "1",
        max: String(p.count),
        value: String(p.count),
        "aria-label": `How many ${p.name} to sell`,
        style: "width:5rem",
      });
      const sell = h("button", { type: "button", class: "btn", "data-testid": `broker-sell-${p.troopId}` }, `Sell ${p.name} x${p.count} (tier ${p.tier})`);
      sell.addEventListener("click", () => {
        const count = Math.floor(Number((qty as HTMLInputElement).value));
        if (!Number.isFinite(count) || count <= 0) {
          say("How many are you selling?");
          return;
        }
        sell.disabled = true;
        void options.onSellPrisonersToBroker!(p.troopId, count).then(
          (r) => {
            sell.disabled = false;
            say(r.line || `Sold for $${Math.round(r.gold).toLocaleString("en-US")}.`);
            options.onWorldChanged?.();
          },
          (err: unknown) => {
            sell.disabled = false;
            say(err instanceof Error && err.message ? err.message : "The broker walked away.");
          },
        );
      });
      card.append(sell, qty);
      list.append(card);
    }
  },
};
