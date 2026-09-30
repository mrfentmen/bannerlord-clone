/**
 * The Why panel. `UI_UX.md` section 5, `CAUSE_EFFECT.md` section 4.
 *
 * This is the panel the whole project exists for. `README.md` calls traceability the
 * one premise: "one change ripples into ten others, and the player can trace the chain
 * afterward." This panel is where the player does that.
 *
 * The rule that makes it a panel rather than a tooltip: it walks the chain. A single
 * cause, or a generated paragraph that says "because things went badly", is not a Why
 * panel, however well it renders. So:
 *
 *  - The order comes from walking `causedBy`, breadth-first, deduplicated by id. The
 *    panel does not decide the order, the cause log does.
 *  - Depth is shown by indentation, so the shape of the cascade is visible before a
 *    word is read.
 *  - Every link opens to the exact values, the old and the new, and the system that
 *    wrote the row. `UI_UX.md` section 5 requires all three.
 *  - The chain is truncated at a readable depth with an explicit "show more", never
 *    silently. If the log has more to say, the panel says so.
 */

import { clear, h, liveRegion, announce } from "../dom.js";
import { errorState, panel, statusChip, emptyState, type StatusKind } from "../kit.js";
import type { CauseRow, SimulationProvider, WhyChain } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/** How deep the chain shows before asking. `UI_UX.md` section 5 wants a readable depth. */
const COLLAPSED_DEPTH = 4;

export interface WhyPanelOptions {
  entityId: string;
  field: string;
  /** Used in the headline when the log has no human name for the entity. */
  entityName?: string;
  provider: SimulationProvider;
  onClose?: () => void;
  /** Called when the player asks about a field this panel links to. */
  onDrill?: (entityId: string, field: string) => void;
}

export interface WhyPanelHandle {
  root: HTMLElement;
  reload(): Promise<void>;
}

export function whyPanel(options: WhyPanelOptions): WhyPanelHandle {
  const { root, body } = panel({
    title: "Why",
    testId: "why-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  const announcer = liveRegion("Loading the reason for this change.");
  root.appendChild(announcer);

  let chain: WhyChain | null = null;
  let expanded = new Set<string>();
  let showAll = false;
  let reloadToken = 0;

  async function load(): Promise<void> {
    const token = ++reloadToken;
    // The skeleton mirrors the real layout: a headline, a meta line, then four
    // chain links of increasing indent.
    clear(body);
    body.appendChild(skeletonChain("why"));
    try {
      const result = await options.provider.why(options.entityId, options.field);
      if (token !== reloadToken) return; // A newer request already answered.
      chain = result;
      render();
      announce(
        announcer,
        result.rows.length === 0
          ? "Nothing caused this change."
          : `Reason found. ${result.rows.length} linked cause${result.rows.length === 1 ? "" : "s"}, ${result.totalDepth} deep.`,
      );
    } catch (err) {
      if (token !== reloadToken) return;
      clear(body);
      const message =
        err instanceof SimulationUnavailableError
          ? err.playerMessage
          : "The reason behind that change could not be read.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      const retryable = !(err instanceof SimulationUnavailableError) || err.retryable;
      body.appendChild(
        errorState({
          message,
          detail,
          testId: "why-error",
          ...(retryable ? { onRetry: () => void load() } : {}),
        }),
      );
      announce(announcer, message);
    }
  }

  function render(): void {
    clear(body);
    if (!chain || chain.rows.length === 0) {
      body.appendChild(
        emptyState(
          "Nothing caused this.",
          "It was true when the survey was taken. No system wrote to it, so there is no chain to walk.",
        ),
      );
      return;
    }

    const head = chain.rows[0]!;
    body.appendChild(h("h3", { class: "why__headline" }, sentenceFor(head)));
    body.appendChild(
      h(
        "p",
        { class: "why__meta caption" },
        `${head.entityName} · day ${head.day} · written by the ${head.system} system · cause ${head.id}`,
      ),
    );

    const visible = showAll ? chain.rows : chain.rows.slice(0, COLLAPSED_DEPTH + 1);
    const list = h("ol", { class: "why__chain", "data-testid": "why-chain" });
    // The first row is the result. Everything after it is a cause, so it gets the
    // "<-" arrow from the spec in UI_UX.md section 5.
    visible.forEach((row, i) => list.appendChild(linkNode(row, i === 0 ? 0 : i)));
    body.appendChild(list);

    if (chain.rows.length > COLLAPSED_DEPTH + 1) {
      body.appendChild(
        h(
          "p",
          { class: "caption" },
          `Showing ${visible.length} of ${chain.rows.length} links. The chain continues ${chain.rows.length - visible.length} more ${chain.rows.length - visible.length === 1 ? "link" : "links"} deep.`,
        ),
      );
    }

    const showMore = h(
      "button",
      {
        type: "button",
        class: "btn btn--plain why__disclose",
        "data-testid": "why-show-all",
        "aria-expanded": showAll ? "true" : "false",
      },
      showAll ? "Show less" : `Show the full chain (${chain.rows.length} links)`,
    );
    showMore.addEventListener("click", () => {
      showAll = !showAll;
      render();
    });
    body.appendChild(showMore);

    if (chain.related.length > 0) {
      const related = h("section", { class: "why__related" });
      related.appendChild(h("h4", { class: "section-header" }, "Also changed here"));
      const list2 = h("ul", { class: "ledger__list" });
      for (const row of chain.related.slice(0, 8)) {
        const button = h(
          "button",
          { type: "button", class: "ledger__item", style: "width:100%;border:0;background:none;text-align:left" },
          h("span", {}, `${row.field} (${row.system})`),
          h("span", { class: "ledger__amount data" }, `${row.old} → ${row.new}`),
        );
        button.addEventListener("click", () => options.onDrill?.(row.entityId, row.field));
        list2.appendChild(h("li", {}, button));
      }
      related.appendChild(list2);
      body.appendChild(related);
    }
  }

  function linkNode(row: CauseRow, depth: number): HTMLElement {
    const isOpen = expanded.has(row.id);
    const inner = h("div", {
      class: "why__link",
      "data-depth": String(Math.min(depth, 4)),
      "data-testid": `why-link-depth-${Math.min(depth, 4)}`,
    });

    const head = h(
      "button",
      {
        type: "button",
        class: "why__toggle",
        "data-testid": "why-link",
        "aria-expanded": isOpen ? "true" : "false",
      },
      h(
        "span",
        { class: "why__summary" },
        depth > 0 ? h("span", { class: "why__arrow", "aria-hidden": "true" }, "← ") : null,
        row.summary,
      ),
    );
    head.addEventListener("click", () => {
      if (expanded.has(row.id)) expanded.delete(row.id);
      else expanded.add(row.id);
      render();
    });
    inner.appendChild(head);

    if (isOpen) {
      const detail = h("div", { class: "why__detail", "data-testid": "why-detail" });
      detail.appendChild(
        h(
          "p",
          { class: "why__change" },
          h("span", {}, `${row.field}: `),
          h("span", { class: row.new > row.old ? "why__up" : "why__down" }, fmt(row.old)),
          h("span", {}, " → "),
          h("span", { class: row.new > row.old ? "why__up" : "why__down" }, fmt(row.new)),
        ),
      );
      detail.appendChild(h("p", { class: "caption" }, `System: ${row.system}`));
      detail.appendChild(h("p", { class: "caption" }, `Tick ${row.tick}, day ${row.day}`));
      detail.appendChild(h("p", { class: "data-sm" }, `cause ${row.id}`));
      if (row.causedBy.length > 0) {
        detail.appendChild(h("p", { class: "caption" }, `Caused by: ${row.causedBy.join(", ")}`));
      }
      inner.appendChild(detail);
    }

    if (row.field !== options.field || row.entityId !== options.entityId) {
      const drill = h(
        "button",
        { type: "button", class: "why__disclose", "data-testid": "why-drill" },
        `Ask about ${row.entityName}'s ${humanField(row.field)}`,
      );
      drill.addEventListener("click", () => options.onDrill?.(row.entityId, row.field));
      inner.appendChild(drill);
    }
    return h("li", {}, inner);
  }

  void load();
  return { root, reload: load };
}

/** A named skeleton shaped like the chain, not a grey block. */
function skeletonChain(shape: string): HTMLElement {
  const wrap = h("div", { class: `skeleton skeleton--${shape}`, "data-testid": "why-skeleton", "aria-busy": "true", role: "status" });
  wrap.appendChild(h("span", { class: "visually-hidden" }, "Reading the cause log."));
  const depths = [0, 1, 2, 3];
  for (const d of depths) {
    const block = h("div", { class: "skeleton__block skeleton__link", "data-depth": String(d) });
    block.style.marginLeft = `${d * 16}px`;
    block.style.opacity = String(1 - d * 0.14);
    wrap.appendChild(block);
  }
  return wrap;
}

function sentenceFor(row: CauseRow): string {
  return row.summary;
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function humanField(field: string): string {
  return field.replace(/_/g, " ");
}

/** Convenience for the map and the HUD: the status a field currently reads. */
export function statusForWarning(severity: "critical" | "warning"): StatusKind {
  return severity === "critical" ? "critical" : "warning";
}

export { statusChip };
