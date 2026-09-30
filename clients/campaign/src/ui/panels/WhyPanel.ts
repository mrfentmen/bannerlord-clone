/**
 * The Why panel. `UI_UX.md` section 5, `CAUSE_EFFECT.md` section 4.
 *
 * This is the panel the whole project exists for. `README.md` calls traceability the
 * one premise: "one change ripples into ten others, and the player can trace the chain
 * afterward." This panel is where the player does that.
 *
 * The rule that makes it a panel rather than a tooltip: it walks the chain. A single
 * cause, or a generated paragraph that says "because things went badly", is not a Why
 * panel however well it renders. So the panel never invents an order and never invents a
 * reason:
 *
 *  - The graph is the simulation's. `walkCauseChain` rebuilds the tree the simulation
 *    sent by following `causedBy` back from the row the player asked about, in
 *    causal order, and the panel prints that order. Where the graph branches, the
 *    branch is shown; where one write feeds two effects, the second appearance says so
 *    rather than silently deduplicating and hiding a real link.
 *  - Depth is shown by indentation, so the shape of the cascade is visible before a
 *    word is read.
 *  - Every line expands to the exact values, the before and after, the system that
 *    wrote the row, the day and tick, and the cause ids. `UI_UX.md` section 5 asks for
 *    all three and the panel gives them in one press, Papers-Please style
 *    (`ART_DIRECTION.md` section 2, reference R10).
 *  - Cause ids are printed verbatim, in mono, exactly as the log holds them. A player
 *    who wants to check a chain by hand needs the same identifier the log uses.
 *  - The chain is truncated at a readable depth with an explicit "show the full
 *    chain", never silently. If the log has more to say, the panel says so and says
 *    how much.
 *
 * An empty chain is a real answer and gets real copy, not a shrug: the field was true
 * when the survey was taken and no system wrote to it, so there is nothing to walk.
 */

import { clear, h, liveRegion, announce } from "../dom.js";
import { emptyState, errorState, panel, type StatusKind } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import { whySkeletonBody, WHY_LINKS_SHOWN, WHY_RELATED_ROWS } from "./panel-skeletons.js";
import type { CauseRow, SimulationProvider, WhyChain } from "../../data/types.js";
import { SimulationUnavailableError } from "../../data/provider.js";

/**
 * How many times one row may be printed in the same walk.
 *
 * A diamond in the graph is a real fact — one shortage caused two things — and hiding
 * the second edge would make the panel look tidier than the world is. But a graph can
 * also close a loop, and an unbounded walk of a loop is a hang. Two is enough to show
 * both edges of any diamond the systems can produce and short of unbounded.
 */
const MAX_LINKS_PER_ROW = 2;

/** ART_DIRECTION.md section 10.2, verbatim. The two halves are shown as one sentence. */
const NOTHING_CAUSED = "Nothing caused this.";
const NOTHING_CAUSED_DETAIL = "It was true when the survey was taken.";

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

// -- the chain walk -----------------------------------------------------------

/** One printed line: a row, how far back it is, and whether it is a second appearance. */
export interface ChainLink {
  row: CauseRow;
  depth: number;
  /** The same write already printed higher up the chain. */
  repeat: boolean;
  /** The id of the link that caused this one, or `null` for the outcome itself. */
  parentId: string | null;
}

/**
 * Turn the cause rows the simulation sent into the order the player reads.
 *
 * Depth-first from the row that was asked about, following `causedBy` backwards,
 * because a cause chain is a tree and a breadth-first flattening loses the shape that
 * makes the cascade legible. The rules that keep it honest:
 *
 *  - A row is printed at most `MAX_LINKS_PER_ROW` times. After that it is left out
 *    rather than repeated, because a closed loop in the log would otherwise never
 *    terminate the walk.
 *  - The second and later appearances are marked `repeat`, so the panel can say "the
 *    same write as above" instead of pretending to have found two different causes.
 *  - A row already on the *current path* is not followed at all. That is what makes a
 *    cycle terminate: `a` causes `b` and `b` causes `a` is two lines, not an infinite
 *    descent, because the walk refuses to return to a row it is already inside.
 *  - Any row the walk never reached is appended at the end, flat and flagged. The
 *    simulation sent it as part of this chain, so dropping it would be the client
 *    quietly editing the log.
 *
 * The function is pure and exported so the walk itself can be tested against the
 * fixture's real graphs rather than only through the rendered panel.
 */
export function walkCauseChain(rows: CauseRow[]): ChainLink[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const printed = new Map<string, number>();
  const out: ChainLink[] = [];
  const seenEdges = new Set<string>();

  const visit = (id: string, depth: number, parentId: string | null, onPath: Set<string>): void => {
    const row = byId.get(id);
    if (!row) return;
    // A row already above us on this branch is a cycle in the log. Stopping here is
    // what keeps the walk finite, and it is honest: the edge that closes the loop is
    // not shown, because printing it would show the same write as its own cause.
    if (onPath.has(id)) return;
    const times = printed.get(id) ?? 0;
    if (times >= MAX_LINKS_PER_ROW) return;
    // One edge between one pair of rows is one line, however many paths reach it.
    const edge = `${parentId ?? ""}>${id}`;
    if (seenEdges.has(edge)) return;
    seenEdges.add(edge);
    printed.set(id, times + 1);
    out.push({ row, depth, repeat: times > 0, parentId });
    const nextPath = new Set(onPath);
    nextPath.add(id);
    for (const causeId of row.causedBy) {
      visit(causeId, depth + 1, id, nextPath);
    }
  };

  if (rows.length > 0) visit(rows[0]!.id, 0, null, new Set());

  // Anything the walk could not reach, in the order the log gave it.
  const reached = new Set(out.map((l) => l.row.id));
  for (const row of rows.slice(1)) {
    if (!reached.has(row.id)) {
      printed.set(row.id, 1);
      out.push({ row, depth: 0, repeat: false, parentId: null });
    }
  }
  return out;
}

// -- the panel ----------------------------------------------------------------

export function whyPanel(options: WhyPanelOptions): WhyPanelHandle {
  const { root, body } = panel({
    title: "Why",
    testId: "why-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  asBottomSheet(root);
  const announcer = liveRegion("Reading the cause log.");
  root.appendChild(announcer);

  let chain: WhyChain | null = null;
  let links: ChainLink[] = [];
  const expanded = new Set<string>();
  let showAll = false;
  let reloadToken = 0;

  async function load(): Promise<void> {
    const token = ++reloadToken;
    // The skeleton goes up before the request, so there is never a frame with neither
    // data nor placeholder (CONSTITUTION.md section 3.2).
    clear(body);
    body.appendChild(whySkeletonBody());
    announce(announcer, "Reading the cause log.");
    try {
      const result = await options.provider.why(options.entityId, options.field);
      if (token !== reloadToken) return; // A newer request already answered.
      chain = result;
      links = walkCauseChain(result.rows);
      render();
      announce(
        announcer,
        result.rows.length === 0
          ? `${NOTHING_CAUSED} ${NOTHING_CAUSED_DETAIL}`
          : `Reason found. ${result.rows.length} linked cause${result.rows.length === 1 ? "" : "s"}, ${result.totalDepth} deep.`,
      );
    } catch (err) {
      if (token !== reloadToken) return;
      chain = null;
      links = [];
      const message =
        err instanceof SimulationUnavailableError
          ? err.playerMessage
          : "The reason behind that change could not be read.";
      const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
      const retryable = !(err instanceof SimulationUnavailableError) || err.retryable;
      clear(body);
      body.appendChild(
        errorState({
          message,
          detail,
          testId: "why-error",
          // CONSTITUTION.md section 1.3: a message and a way out. When the simulation
          // says the failure is permanent there is nothing honest to offer but a way to
          // close the panel, which the header already carries.
          ...(retryable ? { onRetry: () => void load() } : { secondary: closeAffordance() }),
        }),
      );
      announce(announcer, message);
    }
  }

  /** A way out of a failure that retrying will not fix. */
  function closeAffordance(): HTMLElement {
    const btn = h("button", { type: "button", class: "btn", "data-testid": "why-error-dismiss" }, "Close");
    btn.addEventListener("click", () => options.onClose?.());
    return btn;
  }

  function render(): void {
    clear(body);
    if (!chain || chain.rows.length === 0) {
      // ART_DIRECTION.md section 10.2, and a real answer rather than a failure to find
      // one: the field was set before the survey and no system has written to it since.
      body.appendChild(emptyState(NOTHING_CAUSED, NOTHING_CAUSED_DETAIL));
      return;
    }

    body.appendChild(headBlock(chain));
    body.appendChild(chainBlock());

    // Truncation is stated, never silent. UI_UX.md section 5 asks for a readable depth
    // with an option to expand, and a chain that quietly ends looks like a chain that
    // ended.
    if (links.length > WHY_LINKS_SHOWN) {
      const shown = showAll ? links.length : WHY_LINKS_SHOWN;
      const hidden = links.length - shown;
      if (hidden > 0) {
        body.appendChild(
          h(
            "p",
            { class: "caption", "data-testid": "why-truncation" },
            `Showing ${shown} of ${links.length} links. The chain continues ${hidden} more ` +
              `${hidden === 1 ? "link" : "links"} deep.`,
          ),
        );
      }
    }

    const showMore = h(
      "button",
      {
        type: "button",
        class: "btn why__disclose",
        "data-testid": "why-show-all",
        "aria-expanded": showAll ? "true" : "false",
      },
      showAll ? "Show less" : `Show the full chain (${links.length} links)`,
    );
    showMore.addEventListener("click", () => {
      showAll = !showAll;
      render();
    });
    body.appendChild(showMore);

    if (chain.related.length > 0) body.appendChild(relatedBlock());
  }

  /**
   * What the player asked about.
   *
   * The headline is the *question*, in the panel's own words, and the chain below it is
   * the simulation's answer. Printing the simulation's first summary in both places
   * would say the same sentence twice, which reads as two findings rather than one.
   */
  function headBlock(source: WhyChain): HTMLElement {
    const head = source.rows[0]!;
    const wrap = h("section", { class: "why__head-block" });
    wrap.appendChild(h("h3", { class: "why__headline" }, `Why did ${head.entityName}'s ${humanField(head.field)} change?`));
    wrap.appendChild(
      h(
        "p",
        { class: "why__meta caption" },
        `${head.entityName} · day ${head.day} · tick ${head.tick} · the ${head.system} system wrote this`,
      ),
    );
    return wrap;
  }

  function chainBlock(): HTMLElement {
    const section = h("section", { class: "panel__section why__section" });
    section.appendChild(
      h("h3", { class: "section-header" }, h("span", {}, "Cause chain"), h("hr", { class: "form-rule" })),
    );
    const list = h("ol", { class: "why__chain", "data-testid": "why-chain" });
    // The first row is the result. Everything after it is a cause, so it is drawn at
    // least one step in and carries the "<-" from the shape in UI_UX.md section 5.
    const visible = showAll ? links : links.slice(0, WHY_LINKS_SHOWN);
    for (const link of visible) list.appendChild(linkNode(link));
    section.appendChild(list);
    return section;
  }

  function linkNode(link: ChainLink): HTMLElement {
    const { row, depth } = link;
    const isOpen = expanded.has(row.id);
    const shown = Math.min(depth, 4);
    const detailId = `why-detail-${row.id}`;

    const item = h("li", { class: "why__item" });
    const inner = h("div", {
      class: "why__link",
      "data-depth": String(shown),
      "data-testid": `why-link-depth-${shown}`,
      "data-cause": row.id,
    });
    if (link.repeat) inner.dataset.repeat = "true";

    const toggle = h(
      "button",
      {
        type: "button",
        class: "why__toggle",
        "data-testid": "why-link",
        "aria-expanded": isOpen ? "true" : "false",
        "aria-controls": detailId,
      },
      depth > 0 ? h("span", { class: "why__arrow", "aria-hidden": "true" }, "←") : null,
      h("span", { class: "why__summary" }, row.summary),
      // The line is expanded, so say which line in words rather than relying on the
      // marker alone.
      h("span", { class: "visually-hidden" }, isOpen ? ", open" : ", closed"),
    );
    toggle.addEventListener("click", () => {
      if (expanded.has(row.id)) expanded.delete(row.id);
      else expanded.add(row.id);
      render();
    });
    inner.appendChild(toggle);

    if (link.repeat) {
      inner.appendChild(
        h("p", { class: "why__repeat caption", "data-testid": "why-repeat" },
          "The same write as an earlier line. One cause, two effects."),
      );
    }

    if (isOpen) inner.appendChild(detailBlock(row, detailId));
    else inner.appendChild(h("div", { id: detailId, hidden: true, class: "why__detail-slot" }));

    // A line about another entity is a question about that entity, so it is offered as
    // one. Without it a chain that leaves the town stops at the border.
    if (row.entityId !== options.entityId) {
      const drill = h(
        "button",
        { type: "button", class: "why__disclose", "data-testid": "why-drill" },
        `Ask about ${row.entityName}'s ${humanField(row.field)}`,
      );
      drill.addEventListener("click", () => options.onDrill?.(row.entityId, row.field));
      inner.appendChild(drill);
    }

    item.appendChild(inner);
    return item;
  }

  /**
   * The expand-a-line form. Everything `UI_UX.md` section 5 asks for on one press: the
   * exact values, and the system that wrote them. Plus the identifiers, because a chain
   * the player cannot check against the log is a story rather than a record.
   */
  function detailBlock(row: CauseRow, detailId: string): HTMLElement {
    const detail = h("div", { class: "why__detail", id: detailId, "data-testid": "why-detail" });
    detail.appendChild(
      h(
        "div",
        { class: "why__fieldline" },
        h("span", { class: "label" }, humanField(row.field)),
        h(
          "span",
          { class: "why__change" },
          h("span", { class: "why__before" }, fmt(row.old)),
          h("span", { class: "why__arrow-plain", "aria-hidden": "true" }, " → "),
          h("span", { class: "why__after" }, fmt(row.new)),
        ),
      ),
    );
    detail.appendChild(
      h(
        "p",
        { class: "caption" },
        `System: ${row.system}. Entity: ${row.entityName}. Written on day ${row.day}, tick ${row.tick}.`,
      ),
    );
    detail.appendChild(causeIdLine(row, "why-cause-id"));
    if (row.causedBy.length > 0) {
      const line = h("p", { class: "why__causedby caption" }, "Caused by ");
      for (const [index, id] of row.causedBy.entries()) {
        if (index > 0) line.appendChild(h("span", {}, ", "));
        line.appendChild(h("code", { class: "why__id data-sm" }, id));
      }
      detail.appendChild(line);
    }
    return detail;
  }

  /** A cause id, printed exactly as the log holds it, in mono. */
  function causeIdLine(row: CauseRow, testId: string): HTMLElement {
    return h(
      "p",
      { class: "why__idline" },
      h("span", { class: "label" }, "Cause "),
      h("code", { class: "why__id data-sm", "data-testid": testId }, row.id),
    );
  }

  /** Rows the log holds for this entity that this walk did not link. */
  function relatedBlock(): HTMLElement {
    const section = h("section", { class: "why__related" });
    section.appendChild(h("h4", { class: "section-header" }, "Also changed here"));
    const list = h("ul", { class: "ledger__list" });
    for (const row of (chain?.related ?? []).slice(0, WHY_RELATED_ROWS)) {
      const item = h(
        "li",
        {},
        h(
          "button",
          { type: "button", class: "ledger__item why__drill", "data-testid": "why-related-row" },
          h("span", {}, `${humanField(row.field)} (${row.system})`),
          h("span", { class: "ledger__amount data" }, `${fmt(row.old)} → ${fmt(row.new)}`),
        ),
      );
      item.querySelector("button")?.addEventListener("click", () => options.onDrill?.(row.entityId, row.field));
      list.appendChild(item);
    }
    section.appendChild(list);
    return section;
  }

  void load();
  return { root, reload: load };
}

/** A whole number, or a fraction trimmed of its trailing zeros. Never `NaN`. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "not recorded";
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return v
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}

function humanField(field: string): string {
  return field.replace(/_/g, " ");
}

/** Convenience for the map and the HUD: the status a field currently reads. */
export function statusForWarning(severity: "critical" | "warning"): StatusKind {
  return severity === "critical" ? "critical" : "warning";
}
