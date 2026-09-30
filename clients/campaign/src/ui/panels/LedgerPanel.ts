/**
 * The daily ledger and resource warnings. `ECONOMY.md` section 10.
 *
 * Every income and expense line, by source, with the net change per day per resource
 * and the warnings that fire *before* a resource reaches zero. Warnings are the
 * reason this panel exists in this form: "you are out of money" is a state, not a
 * warning, and by then it is too late to do anything about.
 */

import { h, sectionHeader } from "../dom.js";
import { emptyState, panel, statusChip, dataTable, type StatusKind } from "../kit.js";
import type { Ledger as LedgerState, LedgerLine, ResourceWarning } from "../../data/types.js";

export interface LedgerPanelOptions {
  ledger: LedgerState;
  warnings: ResourceWarning[];
  onWhy?: (entityId: string, field: string) => void;
  onClose?: () => void;
  testId?: string;
}

const RESOURCE_LABEL: Record<string, string> = {
  money: "Money",
  gold: "Gold",
  food: "Grain",
  metal: "Metal",
  medicine: "Medicine",
};

export function ledgerPanel(options: LedgerPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: `Ledger — day ${options.ledger.day}`,
    testId: options.testId ?? "ledger-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  // -- warnings first. They are the reason to open this panel. ---------------
  if (options.warnings.length > 0) {
    body.appendChild(sectionHeader("Resource warnings"));
    const list = h("ul", { class: "warnings", "data-testid": "ledger-warnings" });
    for (const w of options.warnings) {
      const item = h(
        "li",
        { class: "warning", "data-severity": w.severity, "data-testid": `warning-${w.resource}` },
        h("div", { style: "flex:1 1 auto;min-width:0" },
          h("div", { class: "label" }, statusChip(w.severity === "critical" ? "critical" : "warning", w.headline, { testId: `warning-chip-${w.resource}` })),
          h("p", { class: "caption", style: "margin:var(--space-1) 0 0" }, w.detail),
        ),
      );
      if (options.onWhy) {
        const why = h("button", { type: "button", class: "why__disclose", "data-testid": `warning-why-${w.resource}` }, "Why?");
        why.addEventListener("click", () => options.onWhy?.(w.entityId, w.field));
        item.appendChild(h("div", { style: "flex:0 0 auto" }, why));
      }
      list.appendChild(item);
    }
    body.appendChild(list);
  }

  // -- the net, per resource -------------------------------------------------
  body.appendChild(sectionHeader("Net change per day"));
  const netRows = (Object.entries(options.ledger.netPerDay) as [keyof LedgerState["netPerDay"], number | undefined][])
    .filter(([, v]) => v !== undefined)
    .map(([resource, perDay]) => ({ resource, perDay: perDay as number }));
  body.appendChild(
    dataTable(
      "Net change per day by resource",
      [
        { header: "Resource", render: (r) => RESOURCE_LABEL[r.resource] ?? r.resource },
        {
          header: "Per day",
          numeric: true,
          testId: "ledger-net",
          render: (r) =>
            h(
              "span",
              { style: `color:var(--status-${r.perDay < 0 ? "critical" : "good"})` },
              `${r.perDay >= 0 ? "+" : ""}${formatResource(r.resource, r.perDay)}`,
            ),
        },
        {
          header: "Direction",
          numeric: true,
          render: (r) => statusChip(kindOf(r.perDay), r.perDay < 0 ? "Spending" : "Earning", { testId: `ledger-net-chip-${r.resource}` }),
        },
      ],
      netRows,
      "ledger-net-table",
    ),
  );

  // -- income and expense lines ---------------------------------------------
  const cols = h("div", { class: "ledger__cols triplicate" });
  cols.append(
    lineList("Income", options.ledger.income, "ledger-income", "good"),
    lineList("Expense", options.ledger.expenses, "ledger-expenses", "critical"),
  );
  body.appendChild(sectionHeader("Where it comes from and where it goes"));
  body.appendChild(cols);

  return root;
}

function lineList(
  caption: string,
  lines: LedgerLine[],
  testId: string,
  tone: "good" | "critical",
): HTMLElement {
  const wrap = h("section", {});
  wrap.appendChild(h("h4", { class: "section-header" }, caption));
  if (lines.length === 0) {
    wrap.appendChild(emptyState(`No ${caption.toLowerCase()} lines.`, "Nothing is moving on this account today."));
    return wrap;
  }
  const list = h("ul", { class: "ledger__list", "data-testid": testId });
  for (const line of lines) {
    list.appendChild(
      h(
        "li",
        { class: "ledger__item", "data-sign": line.perDay < 0 ? "negative" : "positive" },
        h("span", {}, line.label),
        h("span", { class: "ledger__amount data" }, `${line.perDay >= 0 ? "+" : "−"}${formatResource(line.resource, Math.abs(line.perDay))}`),
      ),
    );
  }
  void tone;
  wrap.appendChild(list);
  return wrap;
}

function kindOf(perDay: number): StatusKind {
  if (perDay < 0) return "critical";
  if (perDay > 0) return "good";
  return "neutral";
}

function formatResource(resource: string, v: number): string {
  if (resource === "food") return `${v.toFixed(1)} days`;
  if (resource === "medicine") return `${Math.round(v)} doses`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
