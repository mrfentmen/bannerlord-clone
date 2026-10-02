/**
 * Loans panel (integration for economy task 79).
 *
 * The working surface for the persistent loan system: borrow from a
 * moneylender, repay with interest, or default and eat the consequences.
 * Everything reads the persisted loan store; the host is not needed.
 */

import { button, h, numberField, row, sectionHeader } from "../dom.js";
import { dataTable, emptyState, panel, type Column } from "../kit.js";
import {
  activeLoans,
  borrow,
  defaultLoan,
  payLoan,
  type LoanRecord,
} from "../../economy/loans.js";

export interface LoansPanelOptions {
  onClose?: () => void;
  testId?: string;
}

export function loansPanel(options: LoansPanelOptions): HTMLElement {
  return buildLoansPanel(options, null);
}

function buildLoansPanel(options: LoansPanelOptions, notice: string | null): HTMLElement {
  const { root, body } = panel({
    title: "Moneylenders",
    testId: options.testId ?? "loans-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  if (notice) {
    body.appendChild(h("p", { class: "caption", "data-testid": "loans-notice" }, notice));
  }

  const rerender = (nextNotice: string | null = null) => {
    root.replaceWith(buildLoansPanel(options, nextNotice));
  };

  body.appendChild(sectionHeader("Outstanding"));
  const active = activeLoans();
  if (active.length === 0) {
    body.appendChild(emptyState("No outstanding loans", "Borrow below. One loan at a time — lenders talk."));
  } else {
    const columns: Column<LoanRecord>[] = [
      { header: "Lender", render: (l) => l.lender },
      { header: "Balance", numeric: true, render: (l) => `${Math.round(l.balance)}` },
      { header: "Rate", numeric: true, render: (l) => `${Math.round(l.rate * 100)}%/season` },
      { header: "Seasons", numeric: true, render: (l) => `${l.seasonsTaken}` },
      {
        header: "Repay",
        render: (l) => {
          const wrap = h("span", { class: "row-actions" });
          const { field, input } = numberField(`repay-${l.id}`, "Amount", 0, {
            min: 1,
          });
          input.setAttribute("data-testid", `loan-repay-amount-${l.id}`);
          const pay = button("Pay", () => {
            const coin = Number(input.value);
            if (!(coin > 0)) return;
            try {
              const { loan, change } = payLoan(l.id, coin);
              rerender(
                loan.repaid
                  ? `Loan repaid in full.${change > 0 ? ` ${Math.round(change)} overpaid — returned.` : ""}`
                  : `Paid ${coin}. Balance: ${Math.round(loan.balance)}.`,
              );
            } catch (err) {
              rerender(err instanceof Error ? err.message : "Repayment failed.");
            }
          }, { testId: `loan-pay-${l.id}` });
          const def = button("Default", () => {
            const { line } = defaultLoan(l.id);
            rerender(line);
          }, { variant: "quiet", testId: `loan-default-${l.id}` });
          wrap.append(field, pay, def);
          return wrap;
        },
      },
    ];
    body.appendChild(dataTable("Outstanding loans", columns, active, "loans-active"));
    body.appendChild(
      h("p", { class: "caption" }, "Defaulting seizes half the principal from your treasury and ruins your credit."),
    );
  }

  body.appendChild(sectionHeader("Borrow"));
  const lenderInput = h("input", {
    type: "text",
    placeholder: "Lender name",
    "aria-label": "Lender name",
    "data-testid": "loan-lender-input",
  }) as HTMLInputElement;
  const { field: principalField, input: principalInput } = numberField("loan-principal", "Principal", 0, { min: 1 });
  principalInput.setAttribute("data-testid", "loan-principal-input");
  const { field: rateField, input: rateInput } = numberField("loan-rate", "Rate %/season", 10, { min: 1 });
  rateInput.setAttribute("data-testid", "loan-rate-input");
  const form = h("div", { class: "form-row" }, lenderInput, principalField, rateField,
    button("Borrow", () => {
      const lender = lenderInput.value.trim();
      const principal = Number(principalInput.value);
      const ratePct = Number(rateInput.value);
      if (!lender || !(principal > 0) || !(ratePct > 0)) {
        rerender("Name a lender, a principal, and a rate.");
        return;
      }
      try {
        const loan = borrow(lender, Math.round(principal), ratePct / 100);
        rerender(`Borrowed ${Math.round(loan.balance)} from ${loan.lender} at ${ratePct}%/season.`);
      } catch (err) {
        rerender(err instanceof Error ? err.message : "Borrowing failed.");
      }
    }, { variant: "primary", testId: "loan-borrow" }),
  );
  body.appendChild(form);
  body.appendChild(row("Note", "Interest accrues each season via the campaign clock."));

  return root;
}
