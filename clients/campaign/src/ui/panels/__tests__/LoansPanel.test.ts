/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loansPanel } from "../LoansPanel.js";

beforeEach(() => localStorage.clear());

describe("loans panel (integration)", () => {
  it("borrows and repays a loan", () => {
    document.body.innerHTML = "";
    document.body.appendChild(loansPanel({}));
    const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement;

    (q("loan-lender-input") as HTMLInputElement).value = "Shylock";
    (q("loan-principal-input") as HTMLInputElement).value = "1000";
    (q("loan-rate-input") as HTMLInputElement).value = "10";
    (q("loan-borrow") as HTMLButtonElement).click();

    expect(document.body.textContent).toContain("Borrowed 1000 from Shylock");
    const table = q("loans-active");
    expect(table.textContent).toContain("Shylock");

    // Second loan refused while one is outstanding.
    (q("loan-lender-input") as HTMLInputElement).value = "Other";
    (q("loan-principal-input") as HTMLInputElement).value = "500";
    (q("loan-rate-input") as HTMLInputElement).value = "10";
    (q("loan-borrow") as HTMLButtonElement).click();
    expect(document.body.textContent).toContain("already have an outstanding loan");

    // Partial repayment.
    const loanId = [...table!.querySelectorAll("[data-testid^='loan-pay-']")][0]!
      .getAttribute("data-testid")!.replace("loan-pay-", "");
    (document.body.querySelector(`[data-testid="loan-repay-amount-${loanId}"]`) as HTMLInputElement).value = "400";
    (q(`loan-pay-${loanId}`) as HTMLButtonElement).click();
    expect(document.body.textContent).toContain("Balance: 600");

    // Full repayment closes the loan.
    (document.body.querySelector(`[data-testid="loan-repay-amount-${loanId}"]`) as HTMLInputElement).value = "600";
    (q(`loan-pay-${loanId}`) as HTMLButtonElement).click();
    expect(document.body.textContent).toContain("repaid in full");
    document.body.innerHTML = "";
  });

  it("defaults with consequences", () => {
    document.body.innerHTML = "";
    document.body.appendChild(loansPanel({}));
    const q = (id: string) => document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    (q("loan-lender-input") as HTMLInputElement).value = "Shylock";
    (q("loan-principal-input") as HTMLInputElement).value = "1000";
    (q("loan-rate-input") as HTMLInputElement).value = "10";
    (q("loan-borrow") as HTMLButtonElement).click();

    const loanId = [...document.body.querySelectorAll("[data-testid^='loan-default-']")][0]!
      .getAttribute("data-testid")!.replace("loan-default-", "");
    (q(`loan-default-${loanId}`) as HTMLButtonElement).click();
    expect(document.body.textContent).toContain("default on Shylock");
    document.body.innerHTML = "";
  });

  it("shows the empty state with no loans", () => {
    const root = loansPanel({});
    expect(root.textContent).toContain("No outstanding loans");
  });
});
